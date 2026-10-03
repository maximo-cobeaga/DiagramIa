import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';

export type Identity={issuer:string;subject:string;email:string|null};
export type Session={userId:string;email:string|null;projectId:string;role:'owner'|'editor'|'viewer';expiresAt:Date};
export class CreditError extends Error{constructor(readonly code:'CREDIT_LIMIT'|'CREDIT_IN_PROGRESS'|'IDEMPOTENCY_CONFLICT',message:string){super(message);this.name='CreditError';}}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const days=30;
const period=(at:Date)=>({day:new Date(Date.UTC(at.getUTCFullYear(),at.getUTCMonth(),at.getUTCDate())),month:new Date(Date.UTC(at.getUTCFullYear(),at.getUTCMonth(),1))});

async function tx<T>(pool:Pool,work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

/** Las identidades vienen exclusivamente de un ID Token validado por openid-client. */
export class AccountRepository{
  constructor(private readonly pool:Pool){}

  /** `created` indica una cuenta nueva: la usa la telemetría para distinguir registro de inicio de sesión. */
  async signIn(identity:Identity):Promise<{token:string;session:Session;created:boolean}>{
    if(!identity.issuer||!identity.subject)throw new Error('La identidad OIDC no tiene issuer o subject.');
    const token=randomBytes(32).toString('base64url'),tokenHash=hash(token),expiresAt=new Date(Date.now()+days*86_400_000);
    const session=await tx(this.pool,async client=>{
      // xmax=0 sólo en la fila recién insertada: distingue un alta de un ON CONFLICT DO UPDATE.
      const user=await client.query<{id:string;email:string|null;created:boolean}>(
        'INSERT INTO users (id,issuer,subject,email) VALUES ($1,$2,$3,$4) ON CONFLICT (issuer,subject) DO UPDATE SET email=EXCLUDED.email RETURNING id,email,(xmax=0) AS created',
        [`user-${randomUUID()}`,identity.issuer,identity.subject,identity.email]);
      const userId=user.rows[0]!.id;
      await client.query('INSERT INTO projects (id,name,owner_id) VALUES ($1,$2,$3) ON CONFLICT (owner_id) DO NOTHING',[`project-${randomUUID()}`,'Mi espacio',userId]);
      const project=await client.query<{id:string}>('SELECT id FROM projects WHERE owner_id=$1',[userId]);
      await client.query('INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[project.rows[0]!.id,userId,'owner']);
      await client.query('INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)',[tokenHash,userId,expiresAt]);
      return {session:{userId,email:user.rows[0]!.email,projectId:project.rows[0]!.id,role:'owner' as const,expiresAt},created:user.rows[0]!.created};
    });
    return {token,session:session.session,created:session.created};
  }

  async readSession(token:string|undefined):Promise<Session|null>{
    if(!token||token.length>256)return null;
    const found=await this.pool.query<{user_id:string;email:string|null;project_id:string;role:Session['role'];expires_at:Date}>(
      `SELECT s.user_id,u.email,m.project_id,m.role,s.expires_at FROM auth_sessions s
       JOIN users u ON u.id=s.user_id JOIN project_memberships m ON m.user_id=s.user_id
       JOIN projects p ON p.id=m.project_id AND p.owner_id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now() ORDER BY p.created_at LIMIT 1`,[hash(token)]);
    const row=found.rows[0];
    return row?{userId:row.user_id,email:row.email,projectId:row.project_id,role:row.role,expiresAt:row.expires_at}:null;
  }

  /** Vincula un access token OAuth verificado a una cuenta ya creada; no crea usuarios desde MCP. */
  async lookupIdentity(issuer:string,subject:string):Promise<Pick<Session,'userId'|'projectId'|'role'>|null>{
    const found=await this.pool.query<{user_id:string;project_id:string;role:Session['role']}>(
      `SELECT u.id AS user_id,m.project_id,m.role FROM users u
       JOIN project_memberships m ON m.user_id=u.id JOIN projects p ON p.id=m.project_id AND p.owner_id=u.id
       WHERE u.issuer=$1 AND u.subject=$2 ORDER BY p.created_at LIMIT 1`,[issuer,subject]);
    const row=found.rows[0];return row?{userId:row.user_id,projectId:row.project_id,role:row.role}:null;
  }

  async endSession(token:string|undefined){if(token&&token.length<=256)await this.pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hash(token)]);}

  async listDocuments(projectId:string){
    const found=await this.pool.query<{id:string;revision:number;body:{title?:unknown};updated_at:Date}>(
      'SELECT c.public_id AS id,d.revision,d.body,d.updated_at FROM documents d JOIN cloud_documents c ON c.document_id=d.id WHERE c.project_id=$1 ORDER BY d.updated_at DESC',[projectId]);
    return found.rows.map(row=>({id:row.id,title:typeof row.body.title==='string'?row.body.title:row.id,revision:row.revision,updatedAt:row.updated_at}));
  }

  async ownsDocument(projectId:string,documentId:string):Promise<boolean>{
    const found=await this.pool.query('SELECT 1 FROM cloud_documents WHERE project_id=$1 AND public_id=$2',[projectId,documentId]);
    return !!found.rows.length;
  }

  async storage(projectId:string){
    const found=await this.pool.query<{documents:string;bytes:string}>(
      `SELECT count(DISTINCT c.document_id)::text AS documents,coalesce(sum(octet_length(v.body::text)),0)::text AS bytes
       FROM cloud_documents c LEFT JOIN document_versions v ON v.document_id=c.document_id WHERE c.project_id=$1`,[projectId]);
    return {documents:Number(found.rows[0]!.documents),bytes:Number(found.rows[0]!.bytes),maxDocuments:3,maxDocumentBytes:10_000_000,maxBytes:30_000_000};
  }

  /** Reserva de créditos bajo lock de usuario; una segunda petición con el mismo ID recupera el recibo durable. */
  async reserveCredits(userId:string,requestId:string,fingerprint:string,credits:1|2,at=new Date()):Promise<{replayed:unknown|null}>{
    return tx(this.pool,async client=>{
      const {day,month}=period(at),expiresAt=new Date(at.getTime()+900_000);
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
      const prior=await client.query<{fingerprint:string;credits:number;status:string;response:unknown;expires_at:Date}>(
        'SELECT fingerprint,credits,status,response,expires_at FROM ai_credit_receipts WHERE user_id=$1 AND request_id=$2',[userId,requestId]);
      const old=prior.rows[0];
      if(old){
        if(old.fingerprint!==fingerprint||old.credits!==credits)throw new CreditError('IDEMPOTENCY_CONFLICT','El ID del pedido ya se usó con otro contenido.');
        if(old.status==='committed')return {replayed:old.response};
        if(old.status==='reserved'&&old.expires_at.getTime()>at.getTime())throw new CreditError('CREDIT_IN_PROGRESS','Este pedido de IA todavía se está procesando.');
      }
      const usage=await client.query<{daily:string;monthly:string}>(
        `SELECT coalesce(sum(credits) FILTER (WHERE created_at >= $2 AND created_at <= $4),0)::text AS daily,
                coalesce(sum(credits) FILTER (WHERE created_at >= $3 AND created_at <= $4),0)::text AS monthly
         FROM ai_credit_receipts WHERE user_id=$1 AND status<>'released'`,[userId,day,month,at]);
      const {daily,monthly}=usage.rows[0]!;
      if(Number(daily)+credits>6||Number(monthly)+credits>20)throw new CreditError('CREDIT_LIMIT','Se agotaron los créditos de IA: máximo 6 por día y 20 por mes.');
      if(old)await client.query("UPDATE ai_credit_receipts SET status='reserved',response=NULL,created_at=$3,expires_at=$4 WHERE user_id=$1 AND request_id=$2",[userId,requestId,at,expiresAt]);
      else await client.query("INSERT INTO ai_credit_receipts (user_id,request_id,fingerprint,credits,status,created_at,expires_at) VALUES ($1,$2,$3,$4,'reserved',$5,$6)",[userId,requestId,fingerprint,credits,at,expiresAt]);
      return {replayed:null};
    });
  }

  async settleCredits(userId:string,requestId:string,response:unknown){
    await this.pool.query("UPDATE ai_credit_receipts SET status='committed',response=$3,expires_at=now()+interval '90 days' WHERE user_id=$1 AND request_id=$2 AND status='reserved'",[userId,requestId,JSON.stringify(response)]);
  }
  async releaseCredits(userId:string,requestId:string){
    await this.pool.query("UPDATE ai_credit_receipts SET status='released',expires_at=now() WHERE user_id=$1 AND request_id=$2 AND status='reserved'",[userId,requestId]);
  }
  async creditUsage(userId:string,at=new Date()){
    const {day,month}=period(at);
    const found=await this.pool.query<{daily:string;monthly:string}>(
      `SELECT coalesce(sum(credits) FILTER (WHERE created_at >= $2 AND created_at <= $4),0)::text AS daily,
              coalesce(sum(credits) FILTER (WHERE created_at >= $3 AND created_at <= $4),0)::text AS monthly
       FROM ai_credit_receipts WHERE user_id=$1 AND status<>'released'`,[userId,day,month,at]);
    return {daily:Number(found.rows[0]!.daily),monthly:Number(found.rows[0]!.monthly),dailyLimit:6,monthlyLimit:20};
  }
}
