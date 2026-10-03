// Prueba integración y recuperación real sobre dos proyectos Docker efímeros. No toca la base de desarrollo.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {migrateDocuments,PostgresDocumentRepository} from '../apps/api/dist/repositories/postgres.js';
import {createApp} from '../apps/api/dist/server.js';
import {UsageLedger} from '../apps/api/dist/usage.js';
import {emptyDocument,applyBatch} from '../packages/core/dist/index.js';
import {remoteDocumentBackend} from '../apps/mcp/dist/remote.js';
import {AccountRepository} from '../apps/api/dist/repositories/accounts.js';
import {TelemetryRepository} from '../apps/api/dist/repositories/telemetry.js';
import {mockProvider} from '../packages/providers/dist/index.js';

const compose=fileURLToPath(new URL('../infra/compose.dev.yml',import.meta.url));
const suffix=randomUUID().slice(0,8),source=`diagramia-repo-source-${suffix}`,target=`diagramia-repo-target-${suffix}`;
const password=`diagramia-repo-${suffix}`,env={...process.env,DIAGRAMIA_DB_PORT:'0',DIAGRAMIA_DB_PASSWORD:password};
const docker=(project,args,input)=>execFileSync('docker',['compose','-f',compose,'-p',project,...args],{
  env,input,maxBuffer:32*1024*1024,timeout:240_000,stdio:['pipe','pipe','pipe']
});
const poolFor=project=>{
  const address=docker(project,['port','db','5432']).toString().trim(),port=Number(address.match(/:(\d+)$/)?.[1]);
  if(!port)throw new Error(`Puerto PostgreSQL inválido: ${address}`);
  return new pg.Pool({host:'127.0.0.1',port,user:'diagramia',database:'diagramia',password,max:5});
};
let sourcePool,targetPool,failure=null;
try{
  docker(source,['up','-d','--wait','--wait-timeout','120','db']);
  sourcePool=poolFor(source);
  await Promise.all([migrateDocuments(sourcePool),migrateDocuments(sourcePool)]);
  const repo=new PostgresDocumentRepository(sourcePool),id=`smoke-${suffix}`;
  const initial=await repo.create(id,'Prueba durable','test-user');
  assert.equal(initial.revision,0);
  const node=n=>({id:n,kind:'service',label:n,position:{x:40,y:40},size:{width:150,height:80}});
  const first={id:'batch-first',baseRevision:0,actions:[{type:'ADD_NODE',node:node('first')}]};
  const second={id:'batch-second',baseRevision:0,actions:[{type:'ADD_NODE',node:node('second')}]};
  const races=await Promise.allSettled([repo.apply(id,first),repo.apply(id,second)]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1,'exactamente un writer debe ganar');
  assert.equal(races.filter(r=>r.status==='rejected').length,1);
  assert.equal(races.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');
  const winner=races[0].status==='fulfilled'?first:second;
  const loser=winner===first?second:first;
  assert.equal((await repo.get(id)).nodes.length,1);
  assert.equal((await repo.getVersion(id,0)).nodes.length,0);
  assert.equal((await repo.getVersion(id,1)).nodes[0].id,winner.actions[0].node.id);
  assert.equal((await repo.versions(id)).length,2);
  await assert.rejects(repo.apply(id,{...winner,actions:loser.actions}),{code:'IDEMPOTENCY_CONFLICT'});

  // Nuevo Pool = nuevo proceso lógico: el recibo sobrevive y no aplica la acción dos veces.
  await sourcePool.end();sourcePool=poolFor(source);
  const reopened=new PostgresDocumentRepository(sourcePool);
  const retry=await reopened.apply(id,winner);
  assert.equal(retry.replayed,true);assert.equal(retry.appliedRevision,1);assert.equal(retry.document.revision,1);
  const later=await reopened.apply(id,{...loser,baseRevision:1});
  assert.equal(later.document.revision,2);
  await assert.rejects(reopened.apply(id,{id:'invalid-batch',baseRevision:2,actions:[{type:'DELETE_NODE',id:'missing'}]}));
  assert.equal((await reopened.get(id)).revision,2,'un lote fallido no modifica el documento');
  assert.equal((await reopened.versions(id)).length,3,'un lote fallido no crea versión');
  const restored=await reopened.restore(id,0,2,'restore-empty','test-user');
  assert.equal(restored.document.revision,3);assert.equal(restored.document.nodes.length,0);
  assert.equal((await reopened.getVersion(id,2)).nodes.length,2,'restaurar no debe perder versiones');
  assert.equal((await reopened.audit(id)).length,4);
  assert.equal((await reopened.restore(id,0,2,'restore-empty')).replayed,true);
  await assert.rejects(reopened.restore(id,1,2,'restore-empty'),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(reopened.restore(id,0,2,'restore-conflict'),{code:'REVISION_CONFLICT'});
  // El core conserva sólo 100 IDs recientes; el recibo de PostgreSQL debe sobrevivir esa ventana.
  for(let i=0;i<101;i++)await reopened.apply(id,{id:`title-${i}`,baseRevision:i+3,actions:[{type:'UPDATE_DOCUMENT',changes:{title:`Estado ${i}`}}]});
  assert.equal((await reopened.get(id)).appliedBatches.some(b=>b.id===winner.id),false);
  assert.equal((await reopened.apply(id,winner)).replayed,true);

  const accounts=new AccountRepository(sourcePool),alice=await accounts.signIn({issuer:'https://oidc.example',subject:'alice',email:'alice@example.test'}),bob=await accounts.signIn({issuer:'https://oidc.example',subject:'bob',email:'bob@example.test'});
  assert.notEqual(alice.session.projectId,bob.session.projectId);
  const server=createApp({providers:[mockProvider(1)],ledger:new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:100,ledgerPath:null}),productPrompt:'Prueba',token:null,allowedOrigins:['http://127.0.0.1:5173'],documents:reopened,documentToken:'private-test-token',localWorkspace:true,accounts,telemetry:new TelemetryRepository(sourcePool),config:{maxOutputTokens:1000,maxContextChars:1000,maxRepairs:0,timeoutMs:1000}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/v1/documents`,headers={'x-diagramia-client':'editor',authorization:'Bearer private-test-token','content-type':'application/json'};
    const apiId=`api-${suffix}`;
    assert.equal((await fetch(`${url}/${id}`,{headers:{'x-diagramia-client':'editor'}})).status,401);
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({id:apiId,title:'Desde API'})})).status,201);
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({id:apiId,title:'Duplicado'})})).status,409);
    const applied=await fetch(`${url}/${apiId}/batches`,{method:'POST',headers,body:JSON.stringify({id:'api-batch',baseRevision:0,actions:[{type:'ADD_NODE',node:node('api-node')}]})});
    assert.equal(applied.status,200);assert.equal((await applied.json()).document.revision,1);
    assert.equal((await(await fetch(`${url}/${apiId}/versions/0`,{headers})).json()).document.nodes.length,0);
    assert.equal((await(await fetch(`${url}/${apiId}/audit`,{headers})).json()).events.length,2);

    // El navegador usa el puente local sin recibir el token. MCP usa el token del proceso host.
    const origin=`http://127.0.0.1:${server.address().port}`,local=`${origin}/v1/local/documents`;
    const browserHeaders={'x-diagramia-client':'editor','content-type':'application/json',origin:'http://127.0.0.1:5173'};
    const sharedId=`shared-${suffix}`,seed=emptyDocument(sharedId,'Compartido');
    const imported=applyBatch(seed,{id:'before-sharing',baseRevision:0,actions:[{type:'ADD_NODE',node:node('original')}]});
    assert.equal((await fetch(local,{method:'POST',headers:{...browserHeaders,origin:'http://evil.test'},body:JSON.stringify(imported)})).status,403);
    assert.equal((await fetch(local,{method:'POST',headers:browserHeaders,body:JSON.stringify(imported)})).status,201);
    assert.equal((await reopened.get(sharedId)).revision,1,'el documento se importa con revisión e IDs estables');
    assert.equal((await(await fetch(`${local}/${sharedId}/head`,{headers:browserHeaders})).json()).revision,1);
    const remote=remoteDocumentBackend(origin,sharedId,'private-test-token');
    assert.equal((await remote.load()).nodes[0].id,'original');
    const mcpResult=await remote.apply({id:'from-mcp',baseRevision:1,actions:[{type:'ADD_NODE',node:node('mcp-node')}]});
    assert.equal(mcpResult.revision,2);
    assert.equal((await(await fetch(`${local}/${sharedId}`,{headers:browserHeaders})).json()).document.nodes.length,2,'el editor ve el cambio MCP');
    const uiBatch={id:'from-ui',baseRevision:2,actions:[{type:'ADD_NODE',node:node('ui-node')}]};
    assert.equal((await fetch(`${local}/${sharedId}/batches`,{method:'POST',headers:browserHeaders,body:JSON.stringify(uiBatch)})).status,200);
    assert.equal((await remote.load()).nodes.length,3,'MCP lee el cambio de UI');
    assert.equal((await fetch(`${local}/${sharedId}/batches`,{method:'POST',headers:browserHeaders,body:JSON.stringify({...uiBatch,id:'stale-ui'})})).status,409,'la revisión vencida no pisa un cambio remoto');
    assert.equal((await(await fetch(`${local}/${sharedId}/batches`,{method:'POST',headers:browserHeaders,body:JSON.stringify(uiBatch)})).json()).replayed,true,'el reintento conserva el recibo');

    const cloud=`${origin}/v1/cloud/documents`,as=token=>({...browserHeaders,cookie:`diagramia_session=${token}`});
    const cloudId=`cloud-${suffix}`;
    assert.equal((await fetch(cloud,{method:'POST',headers:as(alice.token),body:JSON.stringify(emptyDocument(cloudId,'Privado de Alice'))})).status,201);
    const cloudStorage=(await sourcePool.query('SELECT document_id FROM cloud_documents WHERE project_id=$1 AND public_id=$2',[alice.session.projectId,cloudId])).rows[0].document_id;
    assert.ok(!(await(await fetch(local,{headers:browserHeaders})).json()).documents.some(item=>item.id===cloudStorage),'el listado local no revela IDs de cuenta');
    assert.equal((await fetch(`${local}/${cloudStorage}`,{headers:browserHeaders})).status,404,'el espacio local no lee documentos de cuenta por ID de almacenamiento');
    assert.equal((await fetch(`${local}/${cloudStorage}/batches`,{method:'POST',headers:browserHeaders,body:JSON.stringify({id:'local-intrusion',baseRevision:0,actions:[]})})).status,404,'el espacio local no escribe documentos de cuenta');
    assert.equal((await fetch(`${cloud}/${cloudId}`,{headers:as(bob.token)})).status,404,'Bob no puede leer el documento de Alice');
    assert.equal((await fetch(`${cloud}/${cloudId}/batches`,{method:'POST',headers:as(bob.token),body:JSON.stringify({id:'bob-write',baseRevision:0,actions:[{type:'UPDATE_DOCUMENT',changes:{title:'Intrusión'}}]})})).status,404,'Bob no puede editar el documento de Alice');
    assert.equal((await fetch(`${cloud}/${cloudId}`,{headers:as(alice.token)})).status,200);
    assert.equal((await fetch(cloud,{method:'POST',headers:as(bob.token),body:JSON.stringify(emptyDocument(cloudId,'Mismo ID, otro dueño'))})).status,201,'ambos proyectos pueden conservar el mismo ID semántico');
    assert.equal((await(await fetch(`${cloud}/${cloudId}`,{headers:as(bob.token)})).json()).document.title,'Mismo ID, otro dueño');
    assert.equal((await(await fetch(`${cloud}/${cloudId}`,{headers:as(alice.token)})).json()).document.title,'Privado de Alice');
    assert.equal((await fetch(`${origin}/v1/auth/me`,{headers:as(alice.token)})).status,200);
    for(let i=2;i<=3;i++)assert.equal((await fetch(cloud,{method:'POST',headers:as(alice.token),body:JSON.stringify(emptyDocument(`cloud-${suffix}-${i}`,'Otro'))})).status,201);
    assert.equal((await fetch(cloud,{method:'POST',headers:as(alice.token),body:JSON.stringify(emptyDocument(`cloud-${suffix}-4`,'Exceso'))})).status,409,'cuarto documento bloqueado');
    assert.equal((await(await fetch(`${origin}/v1/cloud/usage`,{headers:as(alice.token)})).json()).documents,3);
    const aiBody=n=>({requestId:`credit-${n}`,providerId:'mock',mode:'explain',prompt:'Explicá el diagrama',document:emptyDocument('credits','Para explicar'),selectedIds:[]});
    assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:browserHeaders,body:JSON.stringify(aiBody(0))})).status,401,'la IA pide cuenta');
    for(let i=0;i<6;i++)assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(alice.token),body:JSON.stringify(aiBody(i))})).status,200,`crédito ${i} no pasó`);
    assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(alice.token),body:JSON.stringify(aiBody(6))})).status,429,'seis créditos diarios detienen el proveedor');
    assert.equal((await(await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(alice.token),body:JSON.stringify(aiBody(0))})).json()).replayed,true,'reintento no descuenta ni repite');
    assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(alice.token),body:JSON.stringify({...aiBody(0),prompt:'Otro pedido'})})).status,409,'ID reutilizado con contenido distinto');
    assert.equal((await(await fetch(`${origin}/v1/auth/me`,{headers:as(alice.token)})).json()).credits.daily,6);
    const bobAi=await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(bob.token),body:JSON.stringify(aiBody(0))});
    assert.equal(bobAi.status,200,'la cuota de Bob es independiente');
    assert.equal((await bobAi.json()).replayed,false,'Bob no recibe el resultado cacheado de Alice por usar el mismo requestId');
    const charlie=await accounts.signIn({issuer:'https://oidc.example',subject:'charlie',email:null});
    const year=new Date().getUTCFullYear(),month=new Date().getUTCMonth();
    for(let i=0;i<20;i++){
      const at=new Date(Date.UTC(year,month,20+Math.floor(i/5),12));
      assert.deepEqual(await accounts.reserveCredits(charlie.session.userId,`monthly-${i}`,`fingerprint-${i}`,1,at),{replayed:null});
      await accounts.settleCredits(charlie.session.userId,`monthly-${i}`,{ok:true});
    }
    const nextDay=new Date(Date.UTC(year,month,24,12));
    assert.equal((await accounts.creditUsage(charlie.session.userId,nextDay)).monthly,20);
    await assert.rejects(accounts.reserveCredits(charlie.session.userId,'monthly-20','fingerprint-20',1,nextDay),{code:'CREDIT_LIMIT'});
    // Telemetría (P7.1): ingesta idempotente, vínculo anónimo → cuenta, reloj desfasado y pedidos de IA medidos sin su texto.
    const anonymousId=randomUUID(),eventId=n=>`${suffix.padEnd(8,'0').slice(0,8)}-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const telemetryBatch=events=>({v:1,anonymousId,sessionId:randomUUID(),context:{app:'editor',appVersion:'smoke',utmSource:'smoke',utmMedium:null,utmCampaign:null,referrerHost:null,landingPath:'/',device:'desktop',browser:'chrome',os:'linux',language:'es',viewport:{width:1280,height:800}},events});
    const sendEvents=(body,cookie)=>fetch(`${origin}/v1/events`,{method:'POST',headers:{'content-type':'application/json','x-diagramia-client':'editor',...(cookie?{cookie:`diagramia_session=${cookie}`}:{})},body:JSON.stringify(body)});
    const firstBatch=telemetryBatch([{id:eventId(1),name:'board_opened',at:new Date().toISOString(),props:{returning:false,fromLanding:true}},{id:eventId(2),name:'node_created',at:'2001-01-01T00:00:00.000Z',props:{count:2,source:'user'}}]);
    assert.deepEqual(await(await sendEvents(firstBatch)).json(),{accepted:2});
    assert.deepEqual(await(await sendEvents(firstBatch,alice.token)).json(),{accepted:0},'un reintento del mismo lote no duplica eventos');
    assert.equal((await sendEvents(telemetryBatch([{id:eventId(3),name:'export',at:new Date().toISOString(),props:{format:'svg'}}]),alice.token)).status,202);
    const linked=await sourcePool.query('SELECT user_id FROM telemetry_identities WHERE anonymous_id=$1',[anonymousId]);
    assert.equal(linked.rows[0]?.user_id,alice.session.userId,'el visitante anónimo quedó vinculado a la cuenta');
    const skewed=await sourcePool.query('SELECT occurred_at,received_at FROM telemetry_events WHERE id=$1',[eventId(2)]);
    assert.equal(skewed.rows[0].occurred_at.getTime(),skewed.rows[0].received_at.getTime(),'un reloj desfasado no se cree');
    const aiRows=await sourcePool.query("SELECT props FROM telemetry_events WHERE origin='server' AND name='ai_request' AND user_id=$1",[alice.session.userId]);
    assert.ok(aiRows.rows.length>=7,`se esperaban los pedidos de IA de Alice medidos, hubo ${aiRows.rows.length}`);
    assert.ok(aiRows.rows.some(r=>r.props.outcome==='text')&&aiRows.rows.some(r=>r.props.errorCode==='CREDIT_LIMIT'),'éxitos y cortes por cuota quedan registrados');
    assert.ok(!JSON.stringify(aiRows.rows).includes('Explicá el diagrama'),'el texto del pedido no se guarda');
    await sourcePool.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[alice.session.userId]);
    assert.equal((await fetch(`${origin}/v1/auth/me`,{headers:as(alice.token)})).status,401,'sesión vencida rechazada');
  }finally{await new Promise(resolve=>server.close(resolve));}

  const archive=docker(source,['exec','-T','db','pg_dump','-Fc','--no-owner','--no-privileges','-U','diagramia','-d','diagramia']);
  assert.equal(archive.subarray(0,5).toString(),'PGDMP');
  docker(target,['up','-d','--wait','--wait-timeout','120','db']);
  docker(target,['exec','-T','db','pg_restore','--exit-on-error','--no-owner','--no-privileges','-U','diagramia','-d','diagramia'],archive);
  targetPool=poolFor(target);
  await migrateDocuments(targetPool);
  const recovered=new PostgresDocumentRepository(targetPool);
  assert.equal((await recovered.get(id)).revision,104);
  assert.equal((await recovered.get(`api-${suffix}`)).revision,1);
  assert.equal((await recovered.get(`shared-${suffix}`)).revision,3);
  assert.equal((await new AccountRepository(targetPool).listDocuments(alice.session.projectId)).length,3);
  assert.equal((await recovered.getVersion(id,2)).nodes.length,2);
  assert.equal((await recovered.versions(id)).length,105);
  assert.equal((await recovered.audit(id)).length,105);
  assert.ok((await targetPool.query('SELECT count(*)::int AS n FROM telemetry_events')).rows[0].n>=10,'la telemetría viaja en el respaldo');
  assert.equal((await recovered.apply(id,winner)).replayed,true);
  assert.equal((await recovered.restore(id,0,2,'restore-empty')).replayed,true);
  assert.equal((await recovered.get(id)).revision,104,'los reintentos no alteran el documento recuperado');
  console.log('Repositorio PostgreSQL: CAS, editor ↔ MCP, sesiones/proyectos aislados, cuota de 3 documentos y backup/restore aprobados.');
}catch(error){failure=error;
}finally{
  for(const pool of [targetPool,sourcePool])if(pool)try{await pool.end();}catch(error){failure??=error;}
  for(const project of [target,source])try{docker(project,['down','--volumes','--remove-orphans']);}catch(error){failure??=error;}
}
if(failure)throw failure;
