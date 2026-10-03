import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool,type PoolClient} from 'pg';
import {BatchSchema,Id,DiagramError,applyBatch,canonical,emptyDocument,openDocument,validateDocument,type ActionBatch,type DiagramDocument} from '@diagramia/core';

const migrationUrls=[new URL('../../migrations/001_documents.sql',import.meta.url),new URL('../../migrations/002_accounts.sql',import.meta.url),new URL('../../migrations/003_telemetry.sql',import.meta.url),new URL('../../migrations/004_email_verified.sql',import.meta.url)];
const checksum=(value:string)=>createHash('sha256').update(value).digest('hex');
const fingerprint=(value:unknown)=>checksum(canonical(value));

export class RepositoryError extends Error{
  constructor(public readonly code:'NOT_FOUND'|'ALREADY_EXISTS'|'REVISION_CONFLICT'|'IDEMPOTENCY_CONFLICT'|'CORRUPT_DOCUMENT',message:string){super(message);this.name='RepositoryError';}
}

export async function migrateDocuments(pool:Pool):Promise<void>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1358469633)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for(const url of migrationUrls){
      const name=url.pathname.split('/').at(-1)!,sql=await readFile(url,'utf8'),hash=checksum(sql);
      const found=await client.query<{checksum:string}>('SELECT checksum FROM schema_migrations WHERE name=$1',[name]);
      if(found.rows.length){if(found.rows[0]!.checksum!==hash)throw new Error(`La migración ${name} cambió después de aplicarse.`);}
      else{
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1,$2)',[name,hash]);
      }
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function transaction<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

type Stored={revision:number;body:unknown};
type Receipt={fingerprint:string;applied_revision:number;operation:'batch'|'restore'};
function fromStored(row:Stored):DiagramDocument{
  try{
    const doc=openDocument(row.body).document;
    if(doc.revision!==row.revision)throw new Error('Revisión de fila y contenido diferentes.');
    return doc;
  }catch{throw new RepositoryError('CORRUPT_DOCUMENT','El documento almacenado no pasó la validación del core.');}
}
async function lockedDocument(client:PoolClient,id:string):Promise<DiagramDocument>{
  const found=await client.query<Stored>('SELECT revision,body FROM documents WHERE id=$1 FOR UPDATE',[id]);
  if(!found.rows.length)throw new RepositoryError('NOT_FOUND',`No existe el documento ${id}.`);
  return fromStored(found.rows[0]!);
}
async function getReceipt(client:PoolClient,id:string,operationId:string,hash:string,kind:Receipt['operation']):Promise<Receipt|null>{
  const found=await client.query<Receipt>('SELECT fingerprint,applied_revision,operation FROM document_receipts WHERE document_id=$1 AND operation_id=$2',[id,operationId]);
  const receipt=found.rows[0];
  if(!receipt)return null;
  if(receipt.fingerprint!==hash||receipt.operation!==kind)throw new RepositoryError('IDEMPOTENCY_CONFLICT','El ID de operación ya se usó con otro contenido.');
  return receipt;
}
async function commitVersion(client:PoolClient,storageId:string,current:DiagramDocument,next:DiagramDocument,kind:'batch'|'restore',operationId:string,hash:string,sourceRevision:number|null,actorId:string|null){
  const updated=await client.query('UPDATE documents SET revision=$2,body=$3,updated_at=now() WHERE id=$1 AND revision=$4',[storageId,next.revision,JSON.stringify(next),current.revision]);
  if(updated.rowCount!==1)throw new RepositoryError('REVISION_CONFLICT','El documento cambió durante la operación.');
  await client.query('INSERT INTO document_versions (document_id,revision,body,operation,operation_id) VALUES ($1,$2,$3,$4,$5)',[storageId,next.revision,JSON.stringify(next),kind,operationId]);
  await client.query('INSERT INTO document_receipts (document_id,operation_id,fingerprint,applied_revision,operation) VALUES ($1,$2,$3,$4,$5)',[storageId,operationId,hash,next.revision,kind]);
  await client.query('INSERT INTO document_audit (document_id,revision,operation,operation_id,actor_id,source_revision) VALUES ($1,$2,$3,$4,$5,$6)',[storageId,next.revision,kind,operationId,actorId,sourceRevision]);
}

/** Sólo persiste cambios calculados por packages/core. P4.1 agregará scoping por proyecto/miembro. */
export class PostgresDocumentRepository{
  constructor(private readonly pool:Pool){}

  async create(id:string,title:string,actorId:string|null=null):Promise<DiagramDocument>{
    return this.createFrom(emptyDocument(id,title),actorId);
  }

  /** Adopta un documento local íntegro sin cambiar sus IDs ni su revisión. */
  async createFrom(input:unknown,actorId:string|null=null,projectId:string|null=null):Promise<DiagramDocument>{
    const doc=validateDocument(input);
    return transaction(this.pool,async client=>{
      const storageId=projectId?`cloud-${randomUUID()}`:doc.id;
      if(projectId){
        const project=await client.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId]);
        if(!project.rows.length)throw new RepositoryError('NOT_FOUND','No existe el proyecto.');
        const count=await client.query<{total:string}>('SELECT count(*)::text AS total FROM cloud_documents WHERE project_id=$1',[projectId]);
        if(Number(count.rows[0]!.total)>=3)throw new RepositoryError('REVISION_CONFLICT','El plan gratuito admite hasta 3 diagramas en la nube.');
        const size=Buffer.byteLength(JSON.stringify(doc));
        if(size>10_000_000)throw new RepositoryError('REVISION_CONFLICT','El documento supera 10 MB.');
        const total=await client.query<{size:string}>('SELECT coalesce(sum(octet_length(v.body::text)),0)::text AS size FROM document_versions v JOIN cloud_documents c ON c.document_id=v.document_id WHERE c.project_id=$1',[projectId]);
        if(Number(total.rows[0]!.size)+size>30_000_000)throw new RepositoryError('REVISION_CONFLICT','La cuenta alcanzó el límite de 30 MB.');
      }
      if(projectId){
        const duplicate=await client.query('SELECT 1 FROM cloud_documents WHERE project_id=$1 AND public_id=$2',[projectId,doc.id]);
        if(duplicate.rows.length)throw new RepositoryError('ALREADY_EXISTS',`Ya existe el documento ${doc.id} en este proyecto.`);
      }
      const inserted=await client.query('INSERT INTO documents (id,revision,body) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[storageId,doc.revision,JSON.stringify(doc)]);
      if(inserted.rowCount!==1)throw new RepositoryError('ALREADY_EXISTS',`Ya existe el documento ${doc.id}.`);
      if(projectId)await client.query('INSERT INTO cloud_documents (document_id,project_id,public_id) VALUES ($1,$2,$3)',[storageId,projectId,doc.id]);
      await client.query('INSERT INTO document_versions (document_id,revision,body,operation) VALUES ($1,$2,$3,$4)',[storageId,doc.revision,JSON.stringify(doc),'create']);
      await client.query('INSERT INTO document_audit (document_id,revision,operation,actor_id) VALUES ($1,$2,$3,$4)',[storageId,doc.revision,'create',actorId]);
      return doc;
    });
  }

  async list():Promise<{id:string;title:string;revision:number;updatedAt:Date}[]>{
    const found=await this.pool.query<{id:string;revision:number;body:{title?:unknown};updated_at:Date}>('SELECT d.id,d.revision,d.body,d.updated_at FROM documents d WHERE NOT EXISTS (SELECT 1 FROM cloud_documents c WHERE c.document_id=d.id) ORDER BY d.updated_at DESC LIMIT 100');
    return found.rows.map(row=>({id:row.id,title:typeof row.body.title==='string'?row.body.title:row.id,revision:row.revision,updatedAt:row.updated_at}));
  }

  /** El espacio local nunca debe exponer un ID de almacenamiento de una cuenta. */
  async isLocal(id:string):Promise<boolean>{
    Id.parse(id);
    const found=await this.pool.query('SELECT 1 FROM documents d WHERE d.id=$1 AND NOT EXISTS (SELECT 1 FROM cloud_documents c WHERE c.document_id=d.id)',[id]);
    return found.rows.length>0;
  }

  async head(id:string):Promise<number>{
    Id.parse(id);
    const found=await this.pool.query<{revision:number}>('SELECT revision FROM documents WHERE id=$1',[id]);
    if(!found.rows.length)throw new RepositoryError('NOT_FOUND',`No existe el documento ${id}.`);
    return found.rows[0]!.revision;
  }

  async get(id:string,projectId:string|null=null):Promise<DiagramDocument>{
    Id.parse(id);
    const found=await this.pool.query<Stored>(projectId?'SELECT d.revision,d.body FROM documents d JOIN cloud_documents c ON c.document_id=d.id WHERE c.public_id=$1 AND c.project_id=$2':'SELECT revision,body FROM documents WHERE id=$1',projectId?[id,projectId]:[id]);
    if(!found.rows.length)throw new RepositoryError('NOT_FOUND',`No existe el documento ${id}.`);
    return fromStored(found.rows[0]!);
  }

  async getVersion(id:string,revision:number):Promise<DiagramDocument>{
    Id.parse(id);
    if(!Number.isSafeInteger(revision)||revision<0)throw new RepositoryError('NOT_FOUND','Revisión inválida.');
    const found=await this.pool.query<Stored>('SELECT revision,body FROM document_versions WHERE document_id=$1 AND revision=$2',[id,revision]);
    if(!found.rows.length)throw new RepositoryError('NOT_FOUND',`No existe la revisión ${revision} de ${id}.`);
    return fromStored(found.rows[0]!);
  }

  async versions(id:string){
    Id.parse(id);
    const found=await this.pool.query<{revision:number;operation:string;operation_id:string|null;created_at:Date}>('SELECT revision,operation,operation_id,created_at FROM document_versions WHERE document_id=$1 ORDER BY revision',[id]);
    return found.rows;
  }

  async audit(id:string){
    Id.parse(id);
    const found=await this.pool.query<{revision:number;operation:string;operation_id:string|null;actor_id:string|null;source_revision:number|null;created_at:Date}>('SELECT revision,operation,operation_id,actor_id,source_revision,created_at FROM document_audit WHERE document_id=$1 ORDER BY id',[id]);
    return found.rows;
  }

  async apply(id:string,input:unknown,actorId:string|null=null,projectId:string|null=null):Promise<{document:DiagramDocument;appliedRevision:number;replayed:boolean}>{
    Id.parse(id);
    const batch:ActionBatch=BatchSchema.parse(input),hash=fingerprint(batch);
    return transaction(this.pool,async client=>{
      let storageId=id;
      if(projectId){
        await client.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId]);
        const access=await client.query<{document_id:string}>('SELECT document_id FROM cloud_documents WHERE public_id=$1 AND project_id=$2',[id,projectId]);
        if(!access.rows.length)throw new RepositoryError('NOT_FOUND','No existe el documento en este proyecto.');
        storageId=access.rows[0]!.document_id;
      }
      const current=await lockedDocument(client,storageId);
      const receipt=await getReceipt(client,storageId,batch.id,hash,'batch');
      if(receipt)return {document:current,appliedRevision:receipt.applied_revision,replayed:true};
      if(current.revision!==batch.baseRevision)throw new RepositoryError('REVISION_CONFLICT',`Esperada ${batch.baseRevision}; actual ${current.revision}. Volvé a leer el documento.`);
      const next=applyBatch(current,batch);
      if(next.revision!==current.revision+1)throw new DiagramError('IDEMPOTENCY_CONFLICT','El lote ya consta en el documento sin recibo durable.');
      if(projectId)await this.checkCloudQuota(client,storageId,projectId,next);
      await commitVersion(client,storageId,current,next,'batch',batch.id,hash,null,actorId);
      return {document:next,appliedRevision:next.revision,replayed:false};
    });
  }

  private async checkCloudQuota(client:PoolClient,id:string,projectId:string,next:DiagramDocument){
    const nextBytes=Buffer.byteLength(JSON.stringify(next));
    const perDoc=await client.query<{size:string}>('SELECT coalesce(sum(octet_length(v.body::text)),0)::text AS size FROM document_versions v WHERE v.document_id=$1',[id]);
    const total=await client.query<{size:string}>('SELECT coalesce(sum(octet_length(v.body::text)),0)::text AS size FROM document_versions v JOIN cloud_documents c ON c.document_id=v.document_id WHERE c.project_id=$1',[projectId]);
    if(Number(perDoc.rows[0]!.size)+nextBytes>10_000_000)throw new RepositoryError('REVISION_CONFLICT','El diagrama alcanzó el límite de 10 MB incluyendo versiones. Exportá o borrá versiones antes de seguir.');
    if(Number(total.rows[0]!.size)+nextBytes>30_000_000)throw new RepositoryError('REVISION_CONFLICT','La cuenta alcanzó el límite de 30 MB de versiones.');
  }

  async restore(id:string,sourceRevision:number,baseRevision:number,operationId:string,actorId:string|null=null,projectId:string|null=null):Promise<{document:DiagramDocument;appliedRevision:number;replayed:boolean}>{
    Id.parse(id);Id.parse(operationId);
    if(!Number.isSafeInteger(sourceRevision)||sourceRevision<0||!Number.isSafeInteger(baseRevision)||baseRevision<0)throw new RepositoryError('NOT_FOUND','Revisión inválida.');
    const hash=fingerprint({sourceRevision,baseRevision});
    return transaction(this.pool,async client=>{
      let storageId=id;
      if(projectId){
        await client.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId]);
        const access=await client.query<{document_id:string}>('SELECT document_id FROM cloud_documents WHERE public_id=$1 AND project_id=$2',[id,projectId]);
        if(!access.rows.length)throw new RepositoryError('NOT_FOUND','No existe el documento en este proyecto.');
        storageId=access.rows[0]!.document_id;
      }
      const current=await lockedDocument(client,storageId),receipt=await getReceipt(client,storageId,operationId,hash,'restore');
      if(receipt)return {document:current,appliedRevision:receipt.applied_revision,replayed:true};
      if(current.revision!==baseRevision)throw new RepositoryError('REVISION_CONFLICT',`Esperada ${baseRevision}; actual ${current.revision}. Volvé a leer el documento.`);
      const source=await client.query<Stored>('SELECT revision,body FROM document_versions WHERE document_id=$1 AND revision=$2',[storageId,sourceRevision]);
      if(!source.rows.length)throw new RepositoryError('NOT_FOUND',`No existe la revisión ${sourceRevision} de ${id}.`);
      const old=fromStored(source.rows[0]!);
      // Restaurar produce una versión nueva, nunca reescribe la historia ni retrocede el contador.
      const next=openDocument({...old,revision:current.revision+1,appliedBatches:current.appliedBatches}).document;
      if(projectId)await this.checkCloudQuota(client,storageId,projectId,next);
      await commitVersion(client,storageId,current,next,'restore',operationId,hash,sourceRevision,actorId);
      return {document:next,appliedRevision:next.revision,replayed:false};
    });
  }
}
