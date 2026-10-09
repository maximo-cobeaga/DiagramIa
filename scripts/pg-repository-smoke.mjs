// Prueba integración y recuperación real sobre dos proyectos Docker efímeros. No toca la base de desarrollo.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {migrateDocuments,PostgresDocumentRepository} from '../apps/api/dist/repositories/postgres.js';
import {createApp} from '../apps/api/dist/server.js';
import {UsageLedger} from '../apps/api/dist/usage.js';
import {emptyDocument,applyBatch} from '../packages/core/dist/index.js';
import {remoteDocumentBackend} from '../apps/mcp/dist/remote.js';
import {AccountRepository} from '../apps/api/dist/repositories/accounts.js';
import {TelemetryRepository} from '../apps/api/dist/repositories/telemetry.js';
import {BillingRepository} from '../apps/api/dist/repositories/billing.js';
import {ContactRepository} from '../apps/api/dist/repositories/contact.js';
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
  const server=createApp({providers:[mockProvider(1)],ledger:new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:100,ledgerPath:null}),productPrompt:'Prueba',token:null,allowedOrigins:['http://127.0.0.1:5173'],documents:reopened,documentToken:'private-test-token',localWorkspace:true,accounts,telemetry:new TelemetryRepository(sourcePool),
    // Este recorrido prueba créditos e idempotencia con pedidos seguidos; los límites por minuto tienen su propia prueba en gateway.test.ts.
    billing:{repository:new BillingRepository(sourcePool),paddle:{env:'sandbox',apiKey:'pdl_sdbx_smoke',webhookSecret:'smoke-webhook-secret',priceId:'pri_smoke_pro'}},
    contact:{repository:new ContactRepository(sourcePool)},
    adminEmails:['admin@example.test'],aiPerUserPerMinute:100,aiPerIpPerMinute:100,config:{maxOutputTokens:1000,maxContextChars:1000,maxRepairs:0,timeoutMs:1000}});
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
    const admin=await accounts.signIn({issuer:'https://oidc.example',subject:'admin',email:'admin@example.test',emailVerified:true});
    // El formulario es público; los datos comerciales sólo se leen con una sesión admin verificada.
    const inquiry={name:'Ana de pruebas',email:'ana@empresa.test',company:'Equipo de pruebas',teamSize:'11-50',message:'Queremos explicar nuestro proceso de compras. <script>no ejecutar</script>'};
    const contactUrl=`${origin}/v1/contact`,inboxUrl=`${origin}/v1/admin/contacts`;
    assert.equal((await fetch(contactUrl,{method:'OPTIONS',headers:{origin:browserHeaders.origin,'access-control-request-method':'POST','access-control-request-headers':'content-type,x-diagramia-client'}})).status,204,'el formulario admite preflight desde la landing permitida');
    assert.equal((await fetch(contactUrl,{method:'POST',headers:{...browserHeaders,origin:'https://evil.test'},body:JSON.stringify(inquiry)})).status,403,'un origen ajeno no guarda consultas');
    assert.equal((await fetch(contactUrl,{method:'POST',headers:browserHeaders,body:JSON.stringify(inquiry)})).status,202,'la consulta se guarda sin exigir login');
    assert.equal((await fetch(inboxUrl,{headers:browserHeaders})).status,403,'un visitante no lee datos comerciales');
    assert.equal((await fetch(inboxUrl,{headers:as(alice.token)})).status,403,'una cuenta normal tampoco');
    const unverifiedAdmin=await accounts.signIn({issuer:'https://oidc.example',subject:'unverified-admin',email:'admin@example.test',emailVerified:false});
    assert.equal((await fetch(inboxUrl,{headers:as(unverifiedAdmin.token)})).status,403,'el email del admin debe estar verificado');
    const inbox=await(await fetch(inboxUrl,{headers:as(admin.token)})).json(),contact=inbox.contacts[0];
    assert.equal(contact.company,inquiry.company);assert.equal(contact.message,inquiry.message);assert.equal(contact.status,'new');
    assert.equal((await fetch(inboxUrl,{method:'PATCH',headers:as(alice.token),body:JSON.stringify({id:contact.id,status:'answered'})})).status,403);
    assert.equal((await fetch(inboxUrl,{method:'PATCH',headers:as(admin.token),body:JSON.stringify({id:randomUUID(),status:'answered'})})).status,404);
    assert.equal((await fetch(inboxUrl,{method:'PATCH',headers:as(admin.token),body:JSON.stringify({id:contact.id,status:'answered'})})).status,200);
    assert.equal((await new ContactRepository(sourcePool).list())[0].status,'answered');
    assert.equal((await sourcePool.query('SELECT count(*)::int AS n FROM telemetry_events WHERE props::text LIKE $1',['%Equipo de pruebas%'])).rows[0].n,0,'las consultas no son telemetría');
    for(let i=0;i<8;i++)assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(admin.token),body:JSON.stringify(aiBody(i))})).status,200,'un admin supera la cuota Free');
    assert.equal((await accounts.creditUsage(admin.session.userId)).daily,0,'los recibos admin no consumen créditos');
    const adminReceipts=await sourcePool.query('SELECT request_id,fingerprint,credits FROM ai_credit_receipts WHERE user_id=$1',[admin.session.userId]);
    assert.equal(adminReceipts.rowCount,8);assert.ok(adminReceipts.rows.every(r=>r.credits===0));
    const reopenedAccounts=new AccountRepository(sourcePool);
    const firstAdmin=adminReceipts.rows.find(r=>r.request_id===aiBody(0).requestId);
    assert.ok((await reopenedAccounts.reserveCredits(admin.session.userId,firstAdmin.request_id,firstAdmin.fingerprint,0)).replayed,'el recibo admin sobrevive a la instancia del repositorio');
    assert.equal((await(await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(admin.token),body:JSON.stringify(aiBody(0))})).json()).replayed,true);
    assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(admin.token),body:JSON.stringify({...aiBody(0),prompt:'Otro pedido admin'})})).status,409);
    const bobAi=await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(bob.token),body:JSON.stringify(aiBody(0))});
    assert.equal(bobAi.status,200,'la cuota de Bob es independiente');
    assert.equal((await bobAi.json()).replayed,false,'Bob no recibe el resultado cacheado de Alice por usar el mismo requestId');
    const charlie=await accounts.signIn({issuer:'https://oidc.example',subject:'charlie',email:null});
    const unverified=await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(charlie.token),body:JSON.stringify({...aiBody(0),requestId:'charlie-1'})});
    assert.equal(unverified.status,403,'sin email verificado no hay IA');assert.equal((await unverified.json()).error.code,'EMAIL_NOT_VERIFIED');
    const year=new Date().getUTCFullYear(),month=new Date().getUTCMonth();
    for(let i=0;i<20;i++){
      const at=new Date(Date.UTC(year,month,20+Math.floor(i/5),12));
      assert.deepEqual(await accounts.reserveCredits(charlie.session.userId,`monthly-${i}`,`fingerprint-${i}`,1,at),{replayed:null});
      await accounts.settleCredits(charlie.session.userId,`monthly-${i}`,{ok:true});
    }
    const nextDay=new Date(Date.UTC(year,month,24,12));
    assert.equal((await accounts.creditUsage(charlie.session.userId,nextDay)).monthly,20);
    await assert.rejects(accounts.reserveCredits(charlie.session.userId,'monthly-20','fingerprint-20',1,nextDay),{code:'CREDIT_LIMIT'});
    // Suscripción Pro (ADR 089): avisos firmados, sin duplicados ni desorden, y límites que suben y bajan sin borrar nada.
    const subEvent=(eventId,type,status,occurredAt,extra={})=>JSON.stringify({event_id:eventId,event_type:type,occurred_at:occurredAt,data:{id:'sub_smoke_alice',status,customer_id:'ctm_smoke',
      custom_data:{diagramia_user_id:alice.session.userId},items:[{price:{id:'pri_smoke_pro'},quantity:1}],current_billing_period:{ends_at:new Date(Date.now()+30*864e5).toISOString()},
      scheduled_change:null,management_urls:{update_payment_method:'https://pay.example/update',cancel:'https://pay.example/cancel'},...extra}});
    const hook=(body,secret='smoke-webhook-secret')=>{const ts=Math.floor(Date.now()/1000);return fetch(`${origin}/v1/billing/webhook`,{method:'POST',headers:{'content-type':'application/json','paddle-signature':`ts=${ts};h1=${createHmac('sha256',secret).update(`${ts}:${body}`).digest('hex')}`},body});};
    const me=async()=>(await fetch(`${origin}/v1/auth/me`,{headers:as(alice.token)})).json();
    assert.equal((await me()).billing.plan,'free');assert.equal((await me()).storage.maxDocuments,3);
    assert.equal((await fetch(`${origin}/v1/billing/checkout`,{method:'POST',headers:browserHeaders})).status,401,'el pago exige cuenta');
    const t0=new Date(Date.now()-60_000).toISOString(),t1=new Date(Date.now()-30_000).toISOString(),t2=new Date(Date.now()-10_000).toISOString();
    assert.equal((await hook(subEvent('evt-bad','subscription.activated','active',t0),'otro-secreto')).status,400,'firma inválida');
    assert.equal((await me()).billing.plan,'free','un aviso sin firma válida no concede Pro');
    {const r=await hook(subEvent('evt-1','subscription.activated','active',t1));const b=await r.json();assert.equal(b.result,'applied',r.status+' '+JSON.stringify(b));}
    assert.equal((await(await hook(subEvent('evt-1','subscription.activated','active',t1))).json()).result,'duplicate','el reenvío no cambia nada');
    const pro=await me();
    assert.equal(pro.billing.plan,'pro');assert.equal(pro.billing.cancelUrl,'https://pay.example/cancel');assert.equal(pro.storage.maxDocuments,100);assert.equal(pro.credits.dailyLimit,40);assert.equal(pro.credits.monthlyLimit,400);
    assert.equal((await fetch(`${origin}/v1/billing/checkout`,{method:'POST',headers:as(alice.token)})).status,409,'quien ya es Pro no paga dos veces');
    assert.equal((await fetch(`${origin}/v1/auth/delete-account`,{method:'POST',headers:as(alice.token),body:JSON.stringify({confirm:'ELIMINAR'})})).status,409,'no se elimina una cuenta con cobro activo');
    assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(alice.token),body:JSON.stringify(aiBody(6))})).status,200,'con Pro, el séptimo crédito del día pasa');
    const fourth=`cloud-${suffix}-4`;
    assert.equal((await fetch(cloud,{method:'POST',headers:as(alice.token),body:JSON.stringify(emptyDocument(fourth,'Cuarto, sólo con Pro'))})).status,201,'con Pro se guarda el cuarto diagrama');
    assert.equal((await(await hook(subEvent('evt-old','subscription.canceled','canceled',t0))).json()).result,'stale','un aviso viejo que llega tarde no pisa al nuevo');
    assert.equal((await me()).billing.plan,'pro');
    assert.equal((await(await hook(subEvent('evt-ghost','subscription.activated','active',t1,{custom_data:{diagramia_user_id:'user-que-no-existe'}}))).json()).result,'unknown-user');
    assert.equal((await(await hook(subEvent('evt-other','subscription.activated','active',t1,{items:[{price:{id:'pri_otro'}}]}))).json()).ignored,true,'otro producto no concede nada');
    assert.equal((await(await hook(subEvent('evt-2','subscription.canceled','canceled',t2))).json()).result,'applied');
    const free=await me();
    assert.equal(free.billing.plan,'free');assert.equal(free.storage.maxDocuments,3);assert.equal(free.storage.documents,4,'al bajar a Free no se borra nada');
    const edit=(id,n)=>fetch(`${cloud}/${id}/batches`,{method:'POST',headers:as(alice.token),body:JSON.stringify({id:n,baseRevision:0,actions:[{type:'UPDATE_DOCUMENT',changes:{title:'Editado'}}]})});
    assert.equal((await fetch(`${cloud}/${fourth}`,{headers:as(alice.token)})).status,200,'el diagrama excedente se puede leer');
    const blocked=await edit(fourth,'ro-edit');
    assert.equal(blocked.status,409);assert.equal((await blocked.json()).error.code,'PLAN_READ_ONLY','el diagrama excedente queda en sólo lectura');
    assert.equal((await edit(cloudId,'ok-edit')).status,200,'los tres primeros siguen editables');
    assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(alice.token),body:JSON.stringify(aiBody(7))})).status,429,'de vuelta en Free rige el tope diario');
    assert.equal((await fetch(cloud,{method:'POST',headers:as(alice.token),body:JSON.stringify(emptyDocument(`cloud-${suffix}-5`,'Quinto'))})).status,409);
    console.log('  suscripción Pro: firma, duplicados, desorden, subida y bajada de límites OK');
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
    // Retención: a las 24 h se borra la respuesta guardada de la IA y un reintento ya no puede volver a llamar gratis al proveedor.
    const purgeAt=new Date(Date.now()+2*86_400_000),purged=await accounts.purgeExpired(purgeAt);
    assert.ok(purged.responses>=7,`se esperaban respuestas purgadas, hubo ${purged.responses}`);
    assert.equal((await sourcePool.query("SELECT count(*)::int AS n FROM ai_credit_receipts WHERE response IS NOT NULL AND created_at < $1::timestamptz - interval '24 hours'",[purgeAt])).rows[0].n,0,'ninguna respuesta de más de 24 h queda guardada');
    const stale=await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(bob.token),body:JSON.stringify(aiBody(0))});
    assert.equal(stale.status,409,'un pedido completado sin respuesta guardada no se repite gratis');
    // Eliminar la cuenta: se va todo lo de Dave y nada de los demás, aunque compartan el ID semántico del documento.
    const dave=await accounts.signIn({issuer:'https://oidc.example',subject:'dave',email:'dave@example.test'});
    assert.equal((await fetch(cloud,{method:'POST',headers:as(dave.token),body:JSON.stringify(emptyDocument(cloudId,'De Dave'))})).status,201);
    assert.equal((await fetch(`${cloud}/${cloudId}/batches`,{method:'POST',headers:as(dave.token),body:JSON.stringify({id:'dave-edit',baseRevision:0,actions:[{type:'UPDATE_DOCUMENT',changes:{title:'De Dave, editado'}}]})})).status,200);
    assert.equal((await fetch(`${origin}/v1/assist`,{method:'POST',headers:as(dave.token),body:JSON.stringify({...aiBody(0),requestId:'dave-ai'})})).status,200);
    assert.equal((await sendEvents(telemetryBatch([{id:eventId(90),name:'export',at:new Date().toISOString(),props:{format:'png1'}}]),dave.token)).status,202);
    const daveDocument=(await sourcePool.query('SELECT document_id FROM cloud_documents WHERE project_id=$1',[dave.session.projectId])).rows[0].document_id;
    const before=(await sourcePool.query('SELECT count(*)::int AS n FROM telemetry_events')).rows[0].n;
    assert.equal((await fetch(`${origin}/v1/auth/delete-account`,{method:'POST',headers:as(dave.token),body:JSON.stringify({})})).status,400,'sin confirmación no se borra nada');
    const deleted=await fetch(`${origin}/v1/auth/delete-account`,{method:'POST',headers:as(dave.token),body:JSON.stringify({confirm:'ELIMINAR'})});
    assert.equal(deleted.status,200);assert.deepEqual(await deleted.json(),{deleted:true,documents:1});
    assert.match(deleted.headers.get('set-cookie')??'',/diagramia_session=;.*Max-Age=0/,'la cookie de sesión se borra');
    const left=async(sql,params)=>(await sourcePool.query(sql,params)).rows[0].n;
    for(const [sql,params,what] of [
      ['SELECT count(*)::int AS n FROM users WHERE id=$1',[dave.session.userId],'usuario'],
      ['SELECT count(*)::int AS n FROM projects WHERE owner_id=$1',[dave.session.userId],'proyecto'],
      ['SELECT count(*)::int AS n FROM documents WHERE id=$1',[daveDocument],'documento'],
      ['SELECT count(*)::int AS n FROM document_versions WHERE document_id=$1',[daveDocument],'versiones'],
      ['SELECT count(*)::int AS n FROM document_audit WHERE document_id=$1',[daveDocument],'auditoría'],
      ['SELECT count(*)::int AS n FROM ai_credit_receipts WHERE user_id=$1',[dave.session.userId],'recibos'],
      ['SELECT count(*)::int AS n FROM auth_sessions WHERE user_id=$1',[dave.session.userId],'sesiones'],
      ['SELECT count(*)::int AS n FROM telemetry_events WHERE user_id=$1',[dave.session.userId],'eventos con cuenta'],
      ['SELECT count(*)::int AS n FROM telemetry_identities WHERE user_id=$1',[dave.session.userId],'vínculo de telemetría']])assert.equal(await left(sql,params),0,`quedó ${what} de Dave`);
    assert.equal(await left('SELECT count(*)::int AS n FROM telemetry_events',[]),before,'los eventos quedan, desvinculados de la cuenta');
    assert.equal((await fetch(`${cloud}/${cloudId}`,{headers:as(alice.token)})).status,200,'el documento de Alice con el mismo ID sigue');
    assert.equal((await fetch(`${cloud}/${cloudId}`,{headers:as(bob.token)})).status,200,'el de Bob también');
    assert.equal((await fetch(`${origin}/v1/auth/me`,{headers:as(dave.token)})).status,401,'la sesión de Dave ya no existe');
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
  assert.equal((await new AccountRepository(targetPool).listDocuments(alice.session.projectId)).length,4,'los cuatro diagramas de Alice, incluido el que excede el plan Free, sobreviven al respaldo');
  assert.equal((await recovered.getVersion(id,2)).nodes.length,2);
  assert.equal((await recovered.versions(id)).length,105);
  assert.equal((await recovered.audit(id)).length,105);
  assert.ok((await targetPool.query('SELECT count(*)::int AS n FROM telemetry_events')).rows[0].n>=10,'la telemetría viaja en el respaldo');
  const recoveredInquiry=(await new ContactRepository(targetPool).list())[0];
  assert.equal(recoveredInquiry.company,'Equipo de pruebas');assert.equal(recoveredInquiry.status,'answered','la bandeja y su estado sobreviven al respaldo');
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
