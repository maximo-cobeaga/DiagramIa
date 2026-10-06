import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {applyBatch,emptyDocument,findOverlaps} from '@diagramia/core';
import {anthropicProvider,openAICompatibleProvider,openAIProvider,mockProvider,ProviderError,type Provider,type ProviderRequest} from '@diagramia/providers';
import {createApp} from '../src/server.js';
import {strictSchemaFor} from '../src/assist.js';
import {UsageLedger} from '../src/usage.js';

const architecture=()=>JSON.parse(readFileSync('examples/architecture.diagramia.json','utf8'));
// La zona en la que queda el nodo que agrega una propuesta: el ordenador la restituye con un UPDATE_NODE al final del lote.
const zoneOf=(body:{batch:{actions:{type:string;changes?:{zoneId?:string}}[]}})=>body.batch.actions.find(a=>a.type==='UPDATE_NODE'&&a.changes?.zoneId)?.changes?.zoneId;
const listen=(server:Server)=>new Promise<string>(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
const redis=(id='redis')=>JSON.stringify({summary:'Agrega Redis.',clarification:null,actions:[{type:'ADD_NODE',node:{id,kind:'cache',label:'Redis',position:{x:0,y:0},size:{width:150,height:82}},placement:{inside:'backend',below:'api',gap:60}}]});
const info=(id:string,kind:'remote'|'local'='remote')=>({id,label:id,model:'fake-1',kind,configured:true,missing:null,capabilities:{structuredOutput:false,streaming:false,vision:false,cancellation:true},pricing:{inputPerMTok:4,outputPerMTok:20}});
/** Proveedor guionado: cada llamada consume la siguiente respuesta. Es un doble de prueba, no un modelo. */
function scripted(replies:(string|((request:ProviderRequest)=>Promise<string>))[]){
  const calls:ProviderRequest[]=[];
  const provider:Provider={info:()=>info('fake'),async generate(request){
    calls.push(request);const reply=replies[Math.min(calls.length,replies.length)-1];
    return {text:typeof reply==='string'?reply:await reply(request),model:'fake-1',stopReason:'end_turn',usage:{inputTokens:1000,outputTokens:200},providerRequestId:null};
  }};
  return {provider,calls};
}
async function gateway(providers:Provider[],overrides:{budget?:number;perMinute?:number;timeoutMs?:number;log?:(entry:{event:'http';method:string;path:string;status:number;durationMs:number})=>void}={}){
  const ledger=new UsageLedger({dailyTokenBudget:overrides.budget??1_000_000,dailyUsdBudget:5,requestsPerMinute:overrides.perMinute??100,ledgerPath:null});
  const server=createApp({providers,ledger,productPrompt:'Sos el asistente de Diagramia.',allowedOrigins:['http://127.0.0.1:5173'],token:null,log:overrides.log,config:{maxOutputTokens:2000,maxContextChars:60000,maxRepairs:1,timeoutMs:overrides.timeoutMs??5000}});
  const url=await listen(server);
  const post=(body:object,init:RequestInit={})=>fetch(url+'/v1/assist',{method:'POST',headers:{'content-type':'application/json','x-diagramia-client':'editor'},body:JSON.stringify(body),...init});
  const ask=(extra:object={})=>({requestId:'req-1',providerId:'fake',mode:'edit',prompt:'Agregá Redis debajo de API dentro de Backend',document:architecture(),selectedIds:['api'],...extra});
  return {url,post,ask,ledger,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}

test('an edit request returns a validated proposal with its diff and never mutates anything',async()=>{
  const {provider,calls}=scripted([redis()]),g=await gateway([provider]);
  try{
    const response=await g.post(g.ask()),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.kind,'proposal');
    assert.deepEqual(body.batch.id,'req-1');assert.equal(body.batch.baseRevision,0);assert.deepEqual(body.changes.nodes.added,['redis']);
    assert.match(calls[0].messages[0].content,/"focusNodeIds":\["api"\]/);
    assert.ok(!calls[0].messages[0].content.includes('"id":"user"'),'el contexto de selección no incluye nodos lejanos');
    assert.equal(body.usage.estimatedCostUsd,(1000*4+200*20)/1e6);assert.equal(body.usage.costBasis,'published-price-estimate');
  }finally{await g.close();}
});
test('a non-technical plan comes out designed: tones per zone, shapes by role, icons by meaning and a tour',async()=>{
  const day=(n:number)=>({id:`dia-${n}`,kind:'note',label:n<3?`Día ${n}: playa y paseo`:`Día ${n}: llegada`,zoneId:'itinerario'});
  const graph=JSON.stringify({summary:'Viaje',clarification:null,zones:[{id:'itinerario',label:'Día a día'},{id:'comida',label:'Dónde comer'},{id:'tips',label:'Tips'}],
    nodes:[day(1),day(2),day(3),{id:'parrilla',kind:'note',label:'Parrilla del puerto',zoneId:'comida'},{id:'churros',kind:'note',label:'Churros',zoneId:'comida'},{id:'pizza',kind:'note',label:'Pizza',zoneId:'comida'},
      {id:'tip',kind:'note',label:'Reservá alojamiento con anticipación',zoneId:'tips'},{id:'elegido',kind:'note',label:'Bici',zoneId:'tips',shape:'ribbon',style:{fill:'#ffffff'}}],
    edges:[{from:'dia-1',to:'dia-2'},{from:'dia-2',to:'dia-3'}]});
  const {provider}=scripted([graph]),g=await gateway([provider]);
  try{
    const empty=emptyDocument('viaje','Viaje a la costa'),body=await(await g.post(g.ask({mode:'create',prompt:'Planificá un viaje',document:empty,selectedIds:[]}))).json();
    assert.equal(body.kind,'proposal');
    const result=applyBatch(empty,body.batch),node=(id:string)=>result.nodes.find(n=>n.id===id)!;
    assert.equal(new Set(result.zones.map(z=>z.style.stroke)).size,3,'cada zona tiene su tono');
    assert.equal(node('dia-2').shape,'card');assert.equal(node('dia-2').icon,'umbrella','cada día muestra su actividad');assert.equal(node('dia-3').icon,'calendar','sin actividad reconocible, el día lleva calendario');
    assert.equal(node('parrilla').icon,'food');assert.equal(node('churros').icon,'coffee');assert.equal(node('pizza').shape,'pill');
    assert.equal(node('tip').shape,'sticky','los consejos son notas adhesivas');
    assert.equal(node('elegido').shape,'ribbon');assert.deepEqual(node('elegido').style,{fill:'#ffffff'},'lo que eligió el modelo se respeta');
    assert.ok(result.edges.every(e=>e.style.stroke),'las flechas llevan el color de su zona');
    const tour=result.animations.at(-1)!;
    assert.deepEqual(tour.steps.slice(0,3).map(s=>s.nodeIds),[['dia-1'],['dia-2'],['dia-3']],'el recorrido sigue el día a día');
    assert.deepEqual(findOverlaps(result).filter(i=>!['edge-through-node','label-overlap'].includes(i.type)),[]);
  }finally{await g.close();}
});
test('liveness, readiness and request logs expose no prompt or query string',async()=>{
  const logs:{event:'http';method:string;path:string;status:number;durationMs:number}[]=[];
  const {provider}=scripted([redis()]),g=await gateway([provider],{log:entry=>logs.push(entry)});
  try{
    assert.equal((await(await fetch(g.url+'/health')).json()).status,'ok');
    assert.equal((await(await fetch(g.url+'/ready')).json()).status,'ready');
    const response=await g.post(g.ask({prompt:'clave-privada-en-el-pedido'}));
    assert.equal(response.status,200);
    assert.deepEqual(logs.map(e=>[e.path,e.status]),[['/health',200],['/ready',200],['/v1/assist',200]]);
    assert.ok(!JSON.stringify(logs).includes('clave-privada'));
  }finally{await g.close();}
});
test('an invalid proposal gets one bounded repair with the engine error, then a visible failure',async()=>{
  const broken=JSON.stringify({summary:'',actions:[{type:'ADD_EDGE',edge:{id:'x',from:'api',to:'ghost'}}]});
  const repaired=scripted([broken,redis()]),g=await gateway([repaired.provider]);
  try{
    const ok=await(await g.post(g.ask())).json();
    assert.equal(ok.kind,'proposal');assert.equal(ok.repairs,1);assert.equal(repaired.calls.length,2);
    assert.match(repaired.calls[1].messages[2].content,/sin extremos válidos/);
  }finally{await g.close();}
  const hopeless=scripted([broken]),h=await gateway([hopeless.provider]);
  try{
    const response=await h.post(h.ask()),body=await response.json();
    assert.equal(response.status,422);assert.equal(body.error.code,'PROPOSAL_REJECTED');assert.equal(hopeless.calls.length,2,'no hay un tercer intento');
  }finally{await h.close();}
});
test('malformed new-node geometry is replaced before validation while semantic fields stay strict',async()=>{
  const malformed=JSON.stringify({summary:'Agrega Redis.',actions:[{type:'ADD_NODE',node:{id:'redis',kind:'cache',label:'Redis',position:{'y:50,':60,width:200},size:null},placement:{inside:'backend',below:'api'}}]});
  const {provider,calls}=scripted([malformed]),g=await gateway([provider]);
  try{
    const response=await g.post(g.ask()),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.kind,'proposal');assert.equal(body.repairs,0);assert.equal(calls.length,1);
    assert.deepEqual(body.batch.actions[0].node.size,{width:160,height:80});
    assert.deepEqual(body.batch.actions[0].node.position,{x:0,y:0});
  }finally{await g.close();}
  const invalid=JSON.stringify({summary:'',actions:[{type:'ADD_NODE',node:{id:'redis',kind:'invented',label:'Redis'}}]});
  const broken=scripted([invalid]),h=await gateway([broken.provider]);
  try{
    const response=await h.post(h.ask());
    assert.equal(response.status,422);
    assert.equal(broken.calls.length,2);
  }finally{await h.close();}
});
test('create mode turns a compact graph into canonical actions and lays it out without overlaps',async()=>{
  const graph=JSON.stringify({summary:'Login completo',clarification:null,zones:[{id:'backend',label:'Backend'}],
    nodes:[{id:'user',kind:'actor',label:'Usuario'},{id:'web',kind:'service',label:'Frontend'},{id:'api',kind:'service',label:'API',zoneId:'backend',shape:'component',details:'Autenticación',style:{fill:'#d4f246'}},{id:'db',kind:'database',label:'Usuarios',zoneId:'backend'}],
    edges:[{from:'user',to:'web'},{from:'web',to:'api',line:'straight',endArrow:'triangle'},{from:'api',to:'db'}]});
  const {provider,calls}=scripted([graph]),g=await gateway([provider]);
  try{
    const empty=emptyDocument('login','Login'),response=await g.post(g.ask({mode:'create',prompt:'Creá un login completo',document:empty,selectedIds:[]})),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.kind,'proposal');assert.equal(calls.length,1);
    const result=applyBatch(empty,body.batch);
    assert.equal(result.nodes.length,4);assert.equal(result.edges.length,3);
    assert.deepEqual(result.nodes.filter(n=>['api','db'].includes(n.id)).map(n=>n.zoneId),['backend','backend']);
    assert.equal(result.nodes.find(n=>n.id==='api')?.shape,'component');
    assert.equal(result.nodes.find(n=>n.id==='api')?.style.fill,'#d4f246');
    assert.equal(result.edges.find(e=>e.from==='web')?.line,'straight');
    assert.deepEqual(findOverlaps(result).filter(i=>!['edge-through-node','label-overlap'].includes(i.type)),[]);
  }finally{await g.close();}
});
test('create accepts only known semantic kind aliases and still rejects an unknown kind',async()=>{
  const login={summary:'Inicio de sesión',clarification:null,zones:[],
    nodes:[{id:'user',kind:'user',label:'Usuario'},{id:'web',kind:'frontend',label:'Frontend'},{id:'api',kind:'api',label:'API'},{id:'db',kind:'db',label:'Base de datos'}],
    edges:[{from:'user',to:'web'},{from:'web',to:'api'},{from:'api',to:'db'}]};
  const scriptedLogin=scripted([JSON.stringify(login)]),g=await gateway([scriptedLogin.provider]);
  try{
    const empty=emptyDocument('login-aliases','Login'),response=await g.post(g.ask({requestId:'alias-login',mode:'create',prompt:'Creá un diagrama de inicio de sesión con usuario, frontend, API y base de datos',document:empty,selectedIds:[]})),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.kind,'proposal');assert.equal(scriptedLogin.calls.length,1);
    assert.match(scriptedLogin.calls[0].messages.at(-1)!.content,/kind DEBE ser exactamente uno de/);
    const result=applyBatch(empty,body.batch);
    assert.deepEqual(result.nodes.map((n:{kind:string})=>n.kind),['actor','service','service','database']);
    assert.equal(result.edges.length,3);
    assert.equal(empty.nodes.length,0,'el gateway no cambió el documento de origen');
  }finally{await g.close();}
  const bad=scripted([JSON.stringify({...login,nodes:[{...login.nodes[0],kind:'invented'},...login.nodes.slice(1)]})]),h=await gateway([bad.provider]);
  try{
    const response=await h.post(h.ask({requestId:'unknown-kind',mode:'create',document:emptyDocument('bad-kind','Bad'),selectedIds:[]})),body=await response.json();
    assert.equal(response.status,422);assert.equal(bad.calls.length,2);
    assert.match(body.error.message,/nodes\.0\.kind/);
  }finally{await h.close();}
});
test('retrying the same requestId replays the stored result without a second provider call',async()=>{
  const {provider,calls}=scripted([redis()]),g=await gateway([provider]);
  try{
    const first=await(await g.post(g.ask())).json(),second=await(await g.post(g.ask())).json();
    assert.equal(calls.length,1);assert.equal(second.replayed,true);assert.deepEqual(second.batch,first.batch);
    assert.equal((await g.post(g.ask({prompt:'Otra cosa'}))).status,409,'mismo ID con otro pedido es un conflicto');
    assert.equal(g.ledger.summary().tokens,1200);
  }finally{await g.close();}
});
test('an exhausted budget or rate limit stops the request before any provider call',async()=>{
  const budget=scripted([redis()]),g=await gateway([budget.provider],{budget:1000});
  try{
    const response=await g.post(g.ask()),body=await response.json();
    assert.equal(response.status,402);assert.equal(body.error.code,'BUDGET_EXCEEDED');assert.equal(budget.calls.length,0);
  }finally{await g.close();}
  const rate=scripted([redis()]),r=await gateway([rate.provider],{perMinute:1});
  try{
    assert.equal((await r.post(r.ask())).status,200);
    assert.equal((await r.post(r.ask({requestId:'req-2'}))).status,429);assert.equal(rate.calls.length,1);
  }finally{await r.close();}
});
test('a provider timeout fails once without retry loops; a client cancel aborts the provider call',async()=>{
  const hang=(request:ProviderRequest)=>new Promise<string>((_,reject)=>request.signal.addEventListener('abort',()=>reject(new ProviderError('CANCELLED','abortado'))));
  const slow=scripted([hang]),g=await gateway([slow.provider],{timeoutMs:150});
  try{
    const response=await g.post(g.ask()),body=await response.json();
    assert.equal(response.status,504);assert.equal(body.error.code,'TIMEOUT');assert.equal(slow.calls.length,1);
    assert.equal(g.ledger.summary().recent.at(-1)!.status,'failed');
  }finally{await g.close();}
  const cancelled=scripted([hang]),c=await gateway([cancelled.provider]);
  try{
    const controller=new AbortController(),pending=c.post(c.ask(),{signal:controller.signal}).catch(error=>error.name);
    await new Promise(resolve=>setTimeout(resolve,150));controller.abort();
    assert.equal(await pending,'AbortError');await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(cancelled.calls[0].signal.aborted,true);assert.equal(c.ledger.summary().recent.at(-1)!.status,'cancelled');
    assert.equal(c.ledger.summary().reservedTokens,0);
  }finally{await c.close();}
});
test('explain returns text, review returns findings bound to existing IDs, ambiguity returns a clarification',async()=>{
  const review=JSON.stringify({summary:'ok',findings:[{targetId:'db',severity:'warning',observation:'Sin réplica.',evidence:'Un solo nodo de datos.',suggestion:'Agregar réplica.'}]});
  const clarify=JSON.stringify({summary:'',clarification:'Hay dos zonas Backend: ¿backend o backend-2?',actions:[]});
  const {provider}=scripted(['La API consulta PostgreSQL.',review,clarify]),g=await gateway([provider]);
  try{
    const text=await(await g.post(g.ask({requestId:'r-explain',mode:'explain'}))).json();
    assert.equal(text.kind,'text');assert.equal(text.text,'La API consulta PostgreSQL.');assert.equal(text.batch,undefined);
    const findings=await(await g.post(g.ask({requestId:'r-review',mode:'review'}))).json();
    assert.equal(findings.kind,'review');assert.equal(findings.findings[0].targetId,'db');
    const question=await(await g.post(g.ask({requestId:'r-edit'}))).json();
    assert.equal(question.kind,'clarification');assert.match(question.clarification,/dos zonas/);
  }finally{await g.close();}
});

test('an explicit question wins over invalid drafts in every mode, without staging, repair or duplicate spending',async()=>{
  const question=JSON.stringify({summary:42,clarification:'  ¿Horizontal o vertical?  ',actions:[{type:'INVALID'}],nodes:[{kind:'inventado'}],findings:[{targetId:'missing'}],tour:[{nodeIds:['missing']}]});
  const {provider,calls}=scripted([question]),g=await gateway([provider]);
  try{
    const doc=architecture(),before=structuredClone(doc);
    for(const mode of ['create','edit','transform','animate','explain','review','document']){
      const request=g.ask({requestId:'question-'+mode,mode,document:doc,prompt:'Necesito elegir cómo seguir',selectedIds:[]});
      const response=await g.post(request),body=await response.json();assert.equal(response.status,200);
      assert.equal(body.kind,'clarification');assert.equal(body.clarification,'¿Horizontal o vertical?');assert.equal(body.batch,undefined);assert.equal(body.repairs,0);assert.equal(body.usage.calls,1);
      assert.equal((await(await g.post(request)).json()).replayed,true);
    }
    assert.equal(calls.length,7);assert.deepEqual(doc,before);assert.equal(g.ledger.summary().reservedTokens,0);
    assert.ok(calls.every(call=>call.messages.at(-1)!.content.includes('preguntá antes')));
  }finally{await g.close();}
});

test('answering a creation question uses the current document revision and retains the original request in history',async()=>{
  const {provider,calls}=scripted([JSON.stringify({clarification:'¿Qué destino querés?',nodes:[],zones:[],edges:[]}),JSON.stringify({summary:'Viaje a San Pancho.',clarification:null,zones:[],nodes:[{id:'trip',kind:'note',label:'San Pancho'}],edges:[]})]),g=await gateway([provider]);
  try{
    const first=emptyDocument('trip-doc','Viaje');
    assert.equal((await(await g.post(g.ask({requestId:'trip-question',mode:'create',prompt:'Creá un viaje de 10 días',document:first,selectedIds:[]}))).json()).kind,'clarification');
    const current=applyBatch(first,{id:'manual',baseRevision:0,actions:[{type:'ADD_NODE',node:{id:'my-note',kind:'note',label:'Mi apunte',position:{x:0,y:0},size:{width:160,height:80}}}]});
    const body=await(await g.post(g.ask({requestId:'trip-answer',mode:'create',prompt:'San Pancho',document:current,selectedIds:[],history:[{role:'user',content:'Creá un viaje de 10 días'},{role:'assistant',content:'¿Qué destino querés?'}]}))).json();
    assert.equal(body.kind,'proposal');assert.equal(body.baseRevision,current.revision);assert.equal(body.batch.baseRevision,current.revision);
    assert.ok(calls[1].messages[0].content.includes('10 días'));assert.ok(calls[1].messages.at(-1)!.content.includes('San Pancho'));
    assert.equal(applyBatch(current,body.batch).nodes.find(n=>n.id==='my-note')?.label,'Mi apunte');
  }finally{await g.close();}
});
test('mode "auto" is resolved before the call; an explanation is brief by default and its tour keeps only real IDs',async()=>{
  const tour=JSON.stringify({answer:'El usuario entra por la web y la API guarda los datos.',tour:[
    {caption:'Todo empieza con el usuario.',nodeIds:['user','inventado'],edgeIds:[]},
    {caption:'La web le pide datos a la API.',nodeIds:['frontend','api'],edgeIds:['front-api','no-existe']},
    {caption:'Un paso sin nada real se descarta.',nodeIds:['fantasma'],edgeIds:[]},
    {caption:'La API guarda en la base.',nodeIds:['db'],edgeIds:['api-db']}]});
  const {provider,calls}=scripted([tour,'{"answer":"Más detalle.","tour":[]}']),g=await gateway([provider]);
  try{
    const body=await(await g.post(g.ask({requestId:'auto-1',mode:'auto',prompt:'¿Qué hace este sistema?',selectedIds:[]}))).json();
    assert.equal(body.mode,'explain');assert.equal(body.kind,'text');assert.equal(body.text,'El usuario entra por la web y la API guarda los datos.');
    assert.deepEqual(body.tour,[
      {caption:'Todo empieza con el usuario.',nodeIds:['user'],edgeIds:[]},
      {caption:'La web le pide datos a la API.',nodeIds:['frontend','api'],edgeIds:['front-api']},
      {caption:'La API guarda en la base.',nodeIds:['db'],edgeIds:['api-db']}]);
    assert.match(calls[0].messages[0].content,/MODO: explain/);assert.match(calls[0].messages[0].content,/Respuesta BREVE/);
    assert.equal(calls[0].json,true,'la explicación se pide como JSON');
    const more=await(await g.post(g.ask({requestId:'auto-2',mode:'explain',detail:'expanded',prompt:'Explicá con más detalle',selectedIds:[]}))).json();
    assert.equal(more.text,'Más detalle.');assert.deepEqual(more.tour,[],'un recorrido vacío no se inventa');
    assert.match(calls[1].messages[0].content,/Respuesta AMPLIADA/);
  }finally{await g.close();}
});

test('the gateway rejects foreign origins, missing client header and unconfigured providers; no key is ever listed',async()=>{
  const g=await gateway([anthropicProvider({}),mockProvider()]);
  try{
    assert.equal((await fetch(g.url+'/v1/providers',{headers:{origin:'https://evil.example','x-diagramia-client':'editor'}})).status,403);
    assert.equal((await fetch(g.url+'/v1/providers')).status,400);
    const listing=await(await fetch(g.url+'/v1/providers',{headers:{'x-diagramia-client':'editor'}})).json();
    assert.deepEqual(listing.providers.map((p:{id:string;configured:boolean;kind:string})=>[p.id,p.configured,p.kind]),[['anthropic',false,'remote'],['mock',true,'mock']]);
    assert.ok(!JSON.stringify(listing).toLowerCase().includes('apikey'));
    const response=await g.post(g.ask({providerId:'anthropic'})),body=await response.json();
    assert.equal(response.status,409);assert.match(body.error.message,/ANTHROPIC_API_KEY/);
  }finally{await g.close();}
});

// Pruebas de contrato de los adapters contra servidores HTTP locales que imitan la forma de cada API. No son smoke reales.
test('Anthropic adapter sends the documented request shape and maps usage, refusals and auth errors',async()=>{
  const seen:{headers:Record<string,unknown>;body:Record<string,unknown>}[]=[];let mode:'ok'|'refusal'|'auth'='ok';
  const upstream=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);
    seen.push({headers:req.headers,body:JSON.parse(Buffer.concat(chunks).toString())});
    if(mode==='auth'){res.writeHead(401,{'content-type':'application/json'});return void res.end(JSON.stringify({type:'error',error:{type:'authentication_error',message:'invalid x-api-key'}}));}
    res.writeHead(200,{'content-type':'application/json','request-id':'req_test'});
    res.end(JSON.stringify({id:'msg_1',type:'message',role:'assistant',model:'claude-opus-5-5',content:mode==='refusal'?[]:[{type:'text',text:'hola'}],stop_reason:mode==='refusal'?'refusal':'end_turn',stop_details:mode==='refusal'?{type:'refusal',category:'cyber',explanation:''}:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:90,cache_creation_input_tokens:0}}));
  });
  const baseURL=await listen(upstream),provider=anthropicProvider({apiKey:'test-key',baseURL});
  const request={system:'sistema',messages:[{role:'user' as const,content:'hola'}],maxOutputTokens:500,signal:new AbortController().signal};
  try{
    const result=await provider.generate(request);
    assert.equal(result.text,'hola');assert.deepEqual(result.usage,{inputTokens:100,outputTokens:5});
    const {headers,body}=seen[0];
    assert.equal(headers['x-api-key'],'test-key');assert.match(String(headers['anthropic-beta']),/server-side-fallback-2026-07-01/);
    assert.equal(body.model,'claude-opus-5-5');assert.equal(body.max_tokens,500);assert.equal(body.fallbacks,'default');
    assert.deepEqual(body.output_config,{effort:'medium'});assert.equal(body.thinking,undefined);assert.equal(body.temperature,undefined);
    assert.deepEqual(body.system,[{type:'text',text:'sistema',cache_control:{type:'ephemeral'}}]);
    mode='refusal';await assert.rejects(provider.generate(request),(e:unknown)=>e instanceof ProviderError&&e.code==='REFUSED'&&/cyber/.test(e.message));
    mode='auth';await assert.rejects(provider.generate(request),(e:unknown)=>e instanceof ProviderError&&e.code==='AUTH');
    assert.equal(seen.length,3,'el adapter no reintenta por su cuenta');
  }finally{upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});
test('OpenAI-compatible adapter talks to /chat/completions and reports truncation and connection failures',async()=>{
  let finish='stop';
  const upstream=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(req.url,'/v1/chat/completions');assert.equal(body.messages[0].role,'system');assert.equal(body.stream,false);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({id:'c1',model:body.model,choices:[{finish_reason:finish,message:{role:'assistant',content:'respuesta local'}}],usage:{prompt_tokens:7,completion_tokens:3}}));
  });
  const base=await listen(upstream),provider=openAICompatibleProvider({baseURL:base+'/v1/',model:'qwen'});
  const request={system:'s',messages:[{role:'user' as const,content:'hola'}],maxOutputTokens:100,signal:new AbortController().signal};
  try{
    assert.equal(provider.info().kind,'local');
    assert.deepEqual(await provider.generate(request),{text:'respuesta local',model:'qwen',stopReason:'stop',providerRequestId:'c1',usage:{inputTokens:7,outputTokens:3}});
    finish='length';await assert.rejects(provider.generate(request),(e:unknown)=>e instanceof ProviderError&&e.code==='TRUNCATED'&&e.usage?.inputTokens===7&&e.usage?.outputTokens===3);
  }finally{upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
  await assert.rejects(provider.generate(request),(e:unknown)=>e instanceof ProviderError&&e.code==='UPSTREAM'&&e.retryable);
  assert.equal(openAICompatibleProvider({}).info().configured,false);
});

test('a follow-up turn carries the conversation as text and a malformed history is rejected',async()=>{
  const {provider,calls}=scripted([redis()]),g=await gateway([provider]);
  try{
    const history=[{role:'user',content:'Agregá una caché en Backend'},{role:'assistant',content:'Hay dos zonas Backend: ¿backend o backend-2?'}];
    const body=await(await g.post(g.ask({prompt:'En backend',history}))).json();
    assert.equal(body.kind,'proposal');
    assert.deepEqual(calls[0].messages.map(m=>m.role),['user','assistant','user']);
    assert.equal(calls[0].messages[1].content,history[1].content);
    assert.ok(!calls[0].messages[0].content.includes('CONTEXTO DEL DOCUMENTO'),'el documento sólo viaja en el turno actual');
    assert.match(calls[0].messages[2].content,/PEDIDO DEL USUARIO:\nEn backend/);
    assert.equal((await g.post(g.ask({requestId:'req-bad',history:[{role:'assistant',content:'hola'}]}))).status,400);
    assert.equal(calls.length,1);
  }finally{await g.close();}
});
test('a large document is trimmed to the context budget and the focus survives',async()=>{
  const doc=architecture();
  for(let i=0;i<600;i++){
    doc.nodes.push({id:'n'+i,kind:'service',label:'Servicio número '+i,position:{x:(i%30)*200,y:1000+Math.floor(i/30)*120},size:{width:150,height:82},zoneId:null,subtitle:''});
    if(i)doc.edges.push({id:'e'+i,from:'n'+(i-1),to:'n'+i,label:'',alternative:false});
  }
  const whole=scripted(['Explicación.']),g=await gateway([whole.provider]);
  try{
    const body=await(await g.post(g.ask({mode:'explain',document:doc,selectedIds:[]}))).json();
    assert.equal(body.kind,'text');assert.equal(body.contextTruncated,true);
    assert.ok(whole.calls[0].messages[0].content.length<61_000,'el contexto respeta el presupuesto');
    assert.match(whole.calls[0].messages[0].content,/"total":\{"nodes":604/);
  }finally{await g.close();}
  const focused=scripted(['Explicación.']),h=await gateway([focused.provider]);
  try{
    const body=await(await h.post(h.ask({mode:'explain',document:doc,selectedIds:['n300']}))).json();
    assert.equal(body.contextTruncated,false);
    const sent=focused.calls[0].messages[0].content;
    assert.ok(sent.includes('"id":"n300"')&&sent.includes('"id":"n299"')&&sent.includes('"id":"n301"')&&!sent.includes('"id":"n5"'),'selección y vecinos, sin el resto');
  }finally{await h.close();}
});

test('homonymous zones are disambiguated by code before any provider call; a selection or a written ID resolves it',async()=>{
  const doc=architecture();doc.zones.push({id:'backend-eu',label:'Backend',bounds:{x:480,y:700,width:690,height:300}});
  const queue=JSON.stringify({summary:'Cola.',clarification:null,actions:[{type:'ADD_NODE',node:{id:'cola',kind:'queue',label:'Cola',position:{x:0,y:0},size:{width:150,height:82}},placement:{inside:'backend-eu'}}]});
  // Las tres primeras respuestas usan backend-eu; la cuarta, backend (la zona del nodo seleccionado en el último pedido).
  const {provider,calls}=scripted([queue,queue,queue,queue.replace('backend-eu','backend')]),g=await gateway([provider]);
  const ask=(extra:object)=>g.post(g.ask({prompt:'Agregá una cola dentro de Backend',document:doc,selectedIds:[],...extra}));
  try{
    const question=await(await ask({requestId:'q1'})).json();
    assert.equal(question.kind,'clarification');assert.match(question.clarification,/backend, backend-eu/);assert.equal(calls.length,0);assert.equal(g.ledger.summary().tokens,0);
    assert.equal((await(await ask({requestId:'q2',mode:'explain'})).json()).kind,'text','explicar no necesita elegir zona');
    const bySelection=await(await ask({requestId:'q3',selectedIds:['backend-eu']})).json();assert.equal(bySelection.kind,'proposal');
    const byId=await(await ask({requestId:'q4',prompt:'Agregá una cola dentro de Backend, en backend-eu'})).json();assert.equal(byId.kind,'proposal');
    const byNode=await(await ask({requestId:'q5',selectedIds:['api']})).json();assert.equal(byNode.kind,'proposal','un nodo seleccionado dentro de una de las zonas alcanza');assert.equal(zoneOf(byNode),'backend');
  }finally{await g.close();}
});
test('the local adapter requests native JSON mode only when the answer must be JSON',async()=>{
  const bodies:Record<string,unknown>[]=[];
  const upstream=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}],usage:{}}));
  });
  const provider=openAICompatibleProvider({baseURL:await listen(upstream),model:'m'}),request={system:'s',messages:[{role:'user' as const,content:'x'}],maxOutputTokens:10,signal:new AbortController().signal};
  try{
    await provider.generate({...request,json:true});await provider.generate(request);
    assert.deepEqual(bodies[0].response_format,{type:'json_object'});assert.equal(bodies[1].response_format,undefined);
  }finally{upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});

test('when the user chose one of two homonymous zones, a proposal that uses the other one is rejected and repaired',async()=>{
  const doc=architecture();doc.zones.push({id:'backend-eu',label:'Backend',bounds:{x:480,y:700,width:690,height:300}});
  const queue=(zone:string)=>JSON.stringify({summary:'Cola.',clarification:null,actions:[{type:'ADD_NODE',node:{id:'cola',kind:'queue',label:'Cola',position:{x:0,y:0},size:{width:150,height:82}},placement:{inside:zone}}]});
  const {provider,calls}=scripted([queue('backend'),queue('backend-eu')]),g=await gateway([provider]);
  try{
    const body=await(await g.post(g.ask({prompt:'Agregá una cola dentro de Backend',document:doc,selectedIds:['backend-eu']}))).json();
    assert.equal(body.kind,'proposal');assert.equal(body.repairs,1);assert.equal(zoneOf(body),'backend-eu');
    assert.match(calls[0].messages[0].content,/eligió la zona de ID "backend-eu"/);assert.match(calls[1].messages[2].content,/quedó en "backend"/);
  }finally{await g.close();}
});

test('a local model never consumes the spending budget, but still obeys the rate limit',async()=>{
  const calls:ProviderRequest[]=[];
  const local:Provider={info:()=>({...info('fake','local'),pricing:null}),async generate(request){calls.push(request);return {text:redis('r'+calls.length),model:'local-1',stopReason:'stop',usage:{inputTokens:9000,outputTokens:300},providerRequestId:null};}};
  const g=await gateway([local],{budget:1000,perMinute:2});
  try{
    assert.equal((await g.post(g.ask())).status,200);assert.equal((await g.post(g.ask({requestId:'req-2'}))).status,200);
    assert.equal(g.ledger.summary().tokens,0);assert.equal(g.ledger.summary().recent.length,2);
    assert.equal((await g.post(g.ask({requestId:'req-3'}))).status,429);
  }finally{await g.close();}
});

test('a proposal that leaves a new node unconnected carries a visible warning',async()=>{
  const lonely=JSON.stringify({summary:'Usuario.',clarification:null,actions:[{type:'ADD_NODE',node:{id:'cliente',kind:'actor',label:'Cliente',position:{x:40,y:400},size:{width:150,height:82}}}]});
  const {provider}=scripted([lonely,redis()]),g=await gateway([provider]);
  try{
    assert.deepEqual((await(await g.post(g.ask({selectedIds:[]}))).json()).warnings,['«Cliente» queda sin ninguna conexión.']);
    assert.deepEqual((await(await g.post(g.ask({requestId:'req-2'}))).json()).warnings,['«Redis» queda sin ninguna conexión.']);
  }finally{await g.close();}
});

test('nulls a model writes where a field should be omitted are dropped instead of costing a repair',async()=>{
  const sloppy=JSON.stringify({summary:null,clarification:null,actions:[{type:'ADD_NODE',node:{id:'cola',kind:'queue',label:'Cola',position:{x:0,y:0},size:{width:150,height:82},zoneId:null,subtitle:null,style:null},placement:{inside:null,below:'api',rightOf:null,gap:null}}]});
  const {provider,calls}=scripted([sloppy]),g=await gateway([provider]);
  try{
    const body=await(await g.post(g.ask())).json();
    assert.equal(body.kind,'proposal');assert.equal(body.repairs,0);assert.equal(calls.length,1);
  }finally{await g.close();}
});

/** Servidor que imita /chat/completions de OpenAI: guarda cada pedido y responde con lo que indique `reply`. */
async function fakeOpenAI(reply:(body:Record<string,any>)=>object){
  const requests:{url?:string;auth?:string;body:Record<string,any>}[]=[];
  const upstream=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);
    const body=JSON.parse(Buffer.concat(chunks).toString());requests.push({url:req.url,auth:req.headers.authorization,body});
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply(body)));
  });
  return {base:await listen(upstream)+'/v1',requests,close:()=>{upstream.closeAllConnections();return new Promise(resolve=>upstream.close(resolve));}};
}
const completion=(content:string)=>({id:'chatcmpl-1',model:'gpt-6-luna',choices:[{finish_reason:'stop',message:{role:'assistant',content,refusal:null}}],usage:{prompt_tokens:1000,completion_tokens:300,prompt_tokens_details:{cached_tokens:800}}});

test('GPT-6 Luna adapter sends max_completion_tokens, reasoning effort and a strict schema only when one is given',async()=>{
  const upstream=await fakeOpenAI(()=>completion('{}'));
  const provider=openAIProvider({apiKey:'sk-test',baseURL:upstream.base});
  const request={system:'s',messages:[{role:'user' as const,content:'x'}],maxOutputTokens:500,signal:new AbortController().signal};
  const schema={name:'demo',schema:{type:'object',properties:{a:{type:'string'}},required:['a'],additionalProperties:false}};
  try{
    const info=provider.info();
    assert.equal(info.id,'openai');assert.equal(info.model,'gpt-6-luna');assert.equal(info.kind,'remote');assert.equal(info.capabilities.structuredOutput,true);
    assert.deepEqual(info.pricing,{inputPerMTok:0.10,cachedInputPerMTok:0.01,outputPerMTok:0.50});
    const result=await provider.generate({...request,json:true,schema});
    await provider.generate({...request,json:true});await provider.generate(request);
    const [strict,json,plain]=upstream.requests;
    assert.equal(strict.url,'/v1/chat/completions');assert.equal(strict.auth,'Bearer sk-test');
    assert.equal(strict.body.model,'gpt-6-luna');assert.equal(strict.body.max_completion_tokens,500);assert.equal(strict.body.max_tokens,undefined);
    assert.equal(strict.body.reasoning_effort,'low');
    assert.deepEqual(strict.body.response_format,{type:'json_schema',json_schema:{name:'demo',strict:true,schema:schema.schema}});
    assert.deepEqual(json.body.response_format,{type:'json_object'});assert.equal(plain.body.response_format,undefined);
    assert.deepEqual(result.usage,{inputTokens:1000,outputTokens:300,cachedInputTokens:800});
  }finally{await upstream.close();}
});
test('GPT-6 Luna adapter reports refusals, a missing key and an invalid reasoning effort without calling OpenAI',async()=>{
  const upstream=await fakeOpenAI(()=>({choices:[{finish_reason:'stop',message:{content:null,refusal:'No puedo ayudar con eso.'}}]}));
  const request={system:'s',messages:[{role:'user' as const,content:'x'}],maxOutputTokens:10,signal:new AbortController().signal};
  try{
    await assert.rejects(openAIProvider({apiKey:'k',baseURL:upstream.base}).generate(request),(e:unknown)=>e instanceof ProviderError&&e.code==='REFUSED');
    const keyless=openAIProvider({baseURL:upstream.base}),wrong=openAIProvider({apiKey:'k',baseURL:upstream.base,reasoningEffort:'extreme'});
    assert.equal(keyless.info().configured,false);assert.match(keyless.info().missing!,/OPENAI_API_KEY/);
    assert.equal(wrong.info().configured,false);assert.match(wrong.info().missing!,/REASONING_EFFORT/);
    await assert.rejects(wrong.generate(request),(e:unknown)=>e instanceof ProviderError&&e.code==='NOT_CONFIGURED');
    assert.equal(upstream.requests.length,1,'sólo el pedido con negativa llegó a OpenAI');
  }finally{await upstream.close();}
});
test('strict schemas follow the structured-outputs subset: every property required, no extra properties',()=>{
  const objects:Record<string,any>[]=[];
  const walk=(node:unknown):void=>{
    if(Array.isArray(node))return node.forEach(walk);
    if(!node||typeof node!=='object')return;
    const value=node as Record<string,any>;if(value.type==='object')objects.push(value);
    Object.values(value).forEach(walk);
  };
  for(const mode of ['create','review'] as const){
    const entry=strictSchemaFor(mode);assert.ok(entry,`${mode} tiene schema`);
    assert.equal(entry!.schema.type,'object','la raíz es un objeto, no una unión');walk(entry!.schema);
  }
  assert.ok(objects.length>=8);
  for(const object of objects){
    assert.equal(object.additionalProperties,false);
    assert.deepEqual([...object.required].sort(),Object.keys(object.properties).sort());
  }
  assert.equal(strictSchemaFor('edit'),undefined,'las acciones de Editar no se fuerzan con un schema');
});
test('create through GPT-6 Luna: strict answers with explicit nulls become canonical actions without a repair, priced with cache',async()=>{
  const inventory={summary:'Login.',clarification:null,zones:[{id:'backend',label:'Backend'}],
    nodes:[{id:'user',kind:'actor',label:'Usuario',zoneId:null,shape:null,details:null,style:null},
      {id:'auth',kind:'service',label:'Auth',zoneId:'backend',shape:null,details:null,style:{fill:'#e8f0ff',stroke:null,textColor:null,strokeWidth:null,dash:null,fontSize:null,bold:true,italic:null,align:null}},
      {id:'db',kind:'database',label:'Usuarios',zoneId:'backend',shape:null,details:null,style:null}],
    edges:[{from:'user',to:'auth',label:'credenciales',line:null,startArrow:null,endArrow:null,style:null},{from:'auth',to:'db',label:'consulta',line:'curved',startArrow:null,endArrow:'arrow',style:null}]};
  const upstream=await fakeOpenAI(()=>completion(JSON.stringify(inventory)));
  const g=await gateway([openAIProvider({apiKey:'sk-test',baseURL:upstream.base})]);
  try{
    const response=await g.post(g.ask({providerId:'openai',mode:'create',prompt:'Diagrama de login',document:emptyDocument('login','Login'),selectedIds:[]})),body=await response.json();
    assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.kind,'proposal');assert.equal(body.repairs,0);
    assert.equal(upstream.requests[0].body.response_format.json_schema.name,'diagram_inventory');
    const after=applyBatch(emptyDocument('login','Login'),body.batch);
    assert.deepEqual(after.nodes.map(n=>[n.id,n.kind,n.zoneId]).sort(),[['auth','service','backend'],['db','database','backend'],['user','actor',null]]);
    assert.equal(after.nodes.find(n=>n.id==='auth')!.style.fill,'#e8f0ff');assert.equal(after.edges.length,2);
    assert.equal(body.usage.cachedInputTokens,800);
    assert.ok(Math.abs(body.usage.estimatedCostUsd-(200*0.10+800*0.01+300*0.50)/1e6)<1e-12);
  }finally{await g.close();await upstream.close();}
});
test('a signed-in account only sees and uses the providers of its plan; another provider is refused before reserving credits',async()=>{
  const reserved:string[]=[];
  const accounts:any={readSession:async(token?:string)=>token==='s1'?{userId:'u1',emailVerified:true}:null,creditUsage:async()=>({monthly:0,daily:0}),
    reserveCredits:async(_user:string,requestId:string)=>{reserved.push(requestId);return {replayed:null};},settleCredits:async()=>{},releaseCredits:async()=>{}};
  const free=scripted([redis()]),premium:Provider={info:()=>info('premium'),generate:async()=>{throw new Error('no debe llamarse');}};
  const ledger=new UsageLedger({dailyTokenBudget:1_000_000,dailyUsdBudget:5,requestsPerMinute:100,ledgerPath:null});
  const server=createApp({providers:[premium,free.provider],ledger,productPrompt:'p',allowedOrigins:[],token:null,accounts,accountProviders:['fake'],config:{maxOutputTokens:2000,maxContextChars:60000,maxRepairs:1,timeoutMs:5000}});
  const url=await listen(server),headers={'content-type':'application/json','x-diagramia-client':'editor',cookie:'diagramia_session=s1'};
  const body=(providerId:string,requestId:string)=>JSON.stringify({requestId,providerId,mode:'edit',prompt:'Agregá Redis debajo de API dentro de Backend',document:architecture(),selectedIds:['api']});
  try{
    const listing=await(await fetch(url+'/v1/providers',{headers})).json();
    assert.deepEqual(listing.providers.map((p:{id:string})=>p.id),['fake']);
    const refused=await fetch(url+'/v1/assist',{method:'POST',headers,body:body('premium','r1')});
    assert.equal(refused.status,403);assert.equal((await refused.json()).error.code,'PROVIDER_NOT_IN_PLAN');assert.deepEqual(reserved,[]);
    const allowed=await fetch(url+'/v1/assist',{method:'POST',headers,body:body('fake','r2')});
    assert.equal(allowed.status,200);assert.deepEqual(reserved,['r2']);assert.equal(free.calls.length,1);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

/** Doble del repositorio de telemetría: guarda en memoria lo que el gateway le entrega. */
function telemetrySpy(){
  const batches:{batch:any;userId:string|null}[]=[],server:{event:any;userId:string|null}[]=[];
  return {batches,server,repo:{ingest:async(batch:unknown,userId:string|null)=>{batches.push({batch,userId});return {accepted:(batch as {events:unknown[]}).events.length};},
    record:async(event:unknown,userId:string|null)=>{server.push({event,userId});}} as any};
}
const eventBatch=(events:object[])=>({v:1,anonymousId:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222',
  context:{app:'editor',appVersion:'0.1.0',utmSource:null,utmMedium:null,utmCampaign:null,referrerHost:null,landingPath:'/',device:'desktop',browser:'chrome',os:'windows',language:'es',viewport:{width:1280,height:800}},events});
const undoEvent=(n:number)=>({id:`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`,name:'undo',at:new Date().toISOString(),props:{}});

test('the events endpoint stores valid batches, links a signed-in visitor, and rejects content, floods and missing storage',async()=>{
  const spy=telemetrySpy(),ledger=new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null});
  const accounts:any={readSession:async(token?:string)=>token==='s1'?{userId:'u1'}:null};
  const base={providers:[],ledger,productPrompt:'p',allowedOrigins:['http://127.0.0.1:5173'],token:'gateway-secret',config:{maxOutputTokens:10,maxContextChars:10,maxRepairs:0,timeoutMs:1000}};
  const server=createApp({...base,telemetry:spy.repo,accounts,eventsPerMinute:3}),offline=createApp(base);
  const url=await listen(server),offlineUrl=await listen(offline),headers={'content-type':'application/json','x-diagramia-client':'editor'};
  const post=(target:string,body:object,extra:Record<string,string>={})=>fetch(target+'/v1/events',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  try{
    // Un visitante anónimo no tiene el token del gateway: la ingesta es pública, acotada por origen, header y frecuencia.
    const anonymous=await post(url,eventBatch([undoEvent(1),undoEvent(2)]));
    assert.equal(anonymous.status,202);assert.deepEqual(await anonymous.json(),{accepted:2});
    const signedIn=await post(url,eventBatch([undoEvent(3)]),{cookie:'diagramia_session=s1'});
    assert.equal(signedIn.status,202);assert.deepEqual(spy.batches.map(b=>b.userId),[null,'u1']);
    const content=await post(url,eventBatch([{...undoEvent(4),name:'node_created',props:{count:1,source:'user',label:'Clientes VIP'}}]));
    assert.equal(content.status,400);assert.equal(spy.batches.length,2,'un lote con texto libre no llega a la base');
    assert.equal((await post(url,eventBatch([undoEvent(5)]))).status,429,'cuarto lote del minuto desde la misma IP');
    assert.equal((await fetch(url+'/v1/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(eventBatch([undoEvent(6)]))})).status,400);
    const unavailable=await post(offlineUrl,eventBatch([undoEvent(7)]));
    assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).error.code,'TELEMETRY_UNAVAILABLE');
  }finally{for(const s of [server,offline]){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}}
});
test('every AI request is recorded with outcome, tokens, cost and latency, including failures that already spent tokens',async()=>{
  const spy=telemetrySpy(),broken=JSON.stringify({summary:'',actions:[{type:'ADD_EDGE',edge:{id:'x',from:'api',to:'ghost'}}]});
  const {provider}=scripted([redis(),broken,broken]);
  const ledger=new UsageLedger({dailyTokenBudget:1_000_000,dailyUsdBudget:5,requestsPerMinute:100,ledgerPath:null});
  const server=createApp({providers:[provider],ledger,productPrompt:'p',allowedOrigins:[],token:null,telemetry:spy.repo,config:{maxOutputTokens:2000,maxContextChars:60000,maxRepairs:1,timeoutMs:5000}});
  const url=await listen(server),headers={'content-type':'application/json','x-diagramia-client':'editor'};
  const ask=(requestId:string)=>fetch(url+'/v1/assist',{method:'POST',headers,body:JSON.stringify({requestId,providerId:'fake',mode:'edit',prompt:'Agregá Redis debajo de API dentro de Backend',document:architecture(),selectedIds:['api']})});
  try{
    assert.equal((await ask('ok-1')).status,200);
    assert.equal((await ask('bad-1')).status,422);
    await new Promise(resolve=>setTimeout(resolve,20));
    const [ok,bad]=spy.server.map(s=>s.event);
    assert.equal(ok.name,'ai_request');
    assert.deepEqual({...ok.props,latencyMs:0},{requestId:'ok-1',mode:'edit',provider:'fake',model:'fake-1',outcome:'proposal',errorCode:null,inputTokens:1000,cachedInputTokens:0,outputTokens:200,costUsd:(1000*4+200*20)/1e6,latencyMs:0,calls:1,repairs:0,replayed:false});
    assert.equal(bad.props.outcome,'failed');assert.equal(bad.props.errorCode,'PROPOSAL_REJECTED');
    assert.equal(bad.props.calls,2,'el intento y su reparación');assert.equal(bad.props.inputTokens,2000);assert.ok(bad.props.costUsd>0,'lo gastado en un fallo también se mide');
    assert.ok(!JSON.stringify(spy.server).includes('Redis'),'el pedido del usuario no queda en la telemetría');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('the spending cap counts in-flight requests, adds a monthly cap and alerts once per period, surviving a restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'diagramia-ledger-')),path=join(dir,'ledger.json'),alerts:unknown[]=[];
  let now=Date.UTC(2026,9,2,12);
  const ledger=(monthly?:number)=>new UsageLedger({dailyTokenBudget:1_000_000,dailyUsdBudget:1,monthlyUsdBudget:monthly,requestsPerMinute:100,ledgerPath:path,alertRatio:0.8,onAlert:alert=>alerts.push(alert)},()=>now);
  const settle=(l:UsageLedger,id:string,usd:number)=>l.settle({requestId:id,provider:'openai',model:'gpt-6-luna',status:'completed',billable:true,inputTokens:10,outputTokens:10,costUsd:usd,calls:1});
  try{
    const day=ledger(3);
    assert.equal(day.begin('a','sig-a',100,0.6),null);
    // Con 0,6 USD reservados, otro pedido de peor caso 0,6 superaría el tope diario de 1: se corta sin llamar al proveedor.
    assert.throws(()=>day.begin('b','sig-b',100,0.6),{code:'BUDGET_EXCEEDED'});
    settle(day,'a',0.85);
    assert.deepEqual(alerts,[{event:'alert',kind:'ai_spend',period:'day',key:'2026-10-02',usd:0.85,budget:1,ratio:0.85}]);
    assert.equal(day.begin('c','sig-c',100,0.1),null);settle(day,'c',0.05);
    assert.equal(alerts.length,1,'la alerta diaria no se repite');
    // Reinicio del proceso: el gasto del día y del mes y la alerta ya enviada se conservan.
    const restarted=ledger(3);
    assert.equal(restarted.summary().estimatedUsd,0.9);assert.equal(restarted.summary().monthlyEstimatedUsd,0.9);
    assert.throws(()=>restarted.begin('d','sig-d',100,0.2),{code:'BUDGET_EXCEEDED'});
    // Días siguientes del mismo mes: el diario se renueva, el mensual acumula hasta su tope y avisa al 80 %.
    for(let d=3;d<=5;d++){now=Date.UTC(2026,9,d,12);const l=ledger(3);assert.equal(l.begin(`day-${d}`,'s',100,0.1),null);settle(l,`day-${d}`,0.7);}
    // 0,7 USD por día no cruza el 80 % diario; el mensual llega a 3 de 3 y avisa una sola vez.
    assert.deepEqual(alerts.map(a=>(a as {period:string}).period),['day','month']);
    now=Date.UTC(2026,9,6,12);
    assert.throws(()=>ledger(3).begin('over','s',100,0.1),/mensual/);
    now=Date.UTC(2026,10,1,12);
    assert.equal(ledger(3).begin('next-month','s',100,0.1),null,'el mes nuevo empieza en cero');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('an admin uses the AI without per-minute limits or credits, but only with a verified admin email, and the global budget still applies',async()=>{
  const reserved:{id:string;credits:number}[]=[],receipts=new Map<string,{fingerprint:string;answer?:unknown}>();
  const accounts:any={readSession:async(token?:string)=>token==='admin'?{userId:'boss',email:'Fundador@Example.com',emailVerified:true}:token==='unverified-admin'?{userId:'u9',email:'fundador@example.com',emailVerified:false}:token==='user'?{userId:'u1',email:'otra@example.com',emailVerified:true}:null,
    creditUsage:async()=>({monthly:0,daily:0,dailyLimit:6,monthlyLimit:20}),reserveCredits:async(_user:string,requestId:string,fingerprint:string,credits:number)=>{const prior=receipts.get(requestId);if(prior?.answer)return {replayed:prior.answer};reserved.push({id:requestId,credits});receipts.set(requestId,{fingerprint});return {replayed:null};},settleCredits:async(_user:string,id:string,answer:unknown)=>{receipts.get(id)!.answer=answer;},releaseCredits:async()=>{}};
  const replies=Array.from({length:12},()=>redis()),{provider,calls}=scripted(replies),cheap=scripted([redis()]).provider;
  const ledger=new UsageLedger({dailyTokenBudget:100_000,dailyUsdBudget:5,requestsPerMinute:1,ledgerPath:null});
  const server=createApp({providers:[provider,{...cheap,info:()=>({...cheap.info(),id:'free'})}],ledger,productPrompt:'p',allowedOrigins:[],token:null,accounts,accountProviders:['free'],adminEmails:['fundador@example.com'],aiPerUserPerMinute:1,aiPerIpPerMinute:1,config:{maxOutputTokens:2000,maxContextChars:60000,maxRepairs:1,timeoutMs:5000}});
  const url=await listen(server),headers=(session:string)=>({'content-type':'application/json','x-diagramia-client':'editor',cookie:`diagramia_session=${session}`});
  const ask=(session:string,requestId:string)=>fetch(url+'/v1/assist',{method:'POST',headers:headers(session),body:JSON.stringify({requestId,providerId:'fake',mode:'explain',prompt:'Explicá',document:architecture(),selectedIds:[]})});
  try{
    const listed=await(await fetch(url+'/v1/providers',{headers:headers('admin')})).json();
    assert.equal(listed.admin,true);assert.equal(listed.credits,null);assert.deepEqual(listed.providers.map((p:{id:string})=>p.id),['fake','free'],'un admin ve todos los proveedores');
    for(let i=1;i<=5;i++)assert.equal((await ask('admin','a-'+i)).status,200,`pedido ${i} del admin`);
    assert.equal(reserved.length,5);assert.ok(reserved.every(r=>r.credits===0),'un admin conserva recibos sin gastar créditos');
    assert.equal((await(await ask('admin','a-1')).json()).replayed,true);assert.equal(calls.length,5,'el reintento no repite la llamada');
    assert.equal((await ask('unverified-admin','x-1')).status,403,'sin email verificado no se obtiene la excepción');
    const user=await ask('user','u-1');assert.equal(user.status,429,'la IP ya usó su pedido: el resto de las cuentas sigue limitado');
    // Agotar el presupuesto global sigue deteniendo al admin antes de llamar al proveedor.
    ledger.settle({requestId:'other-spend',provider:'fake',model:'fake-1',status:'completed',billable:true,inputTokens:100_000,outputTokens:0,costUsd:0,calls:1});
    const blocked=await ask('admin','a-6');assert.equal(blocked.status,402);assert.equal((await blocked.json()).error.code,'BUDGET_EXCEEDED');assert.equal(calls.length,5);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('the included AI needs a verified email and per-account and per-IP limits stop floods before credits are reserved',async()=>{
  const reserved:string[]=[];
  const accounts:any={readSession:async(token?:string)=>token==='verified'?{userId:'u1',emailVerified:true}:token==='unverified'?{userId:'u2',emailVerified:false}:token==='other'?{userId:'u3',emailVerified:true}:null,
    creditUsage:async()=>({monthly:0,daily:0}),reserveCredits:async(_user:string,requestId:string)=>{reserved.push(requestId);return {replayed:null};},settleCredits:async()=>{},releaseCredits:async()=>{}};
  const {provider,calls}=scripted([redis()]),spy=telemetrySpy();
  const ledger=new UsageLedger({dailyTokenBudget:1_000_000,dailyUsdBudget:5,requestsPerMinute:100,ledgerPath:null});
  const server=createApp({providers:[provider],ledger,productPrompt:'p',allowedOrigins:[],token:null,accounts,telemetry:spy.repo,aiPerUserPerMinute:2,aiPerIpPerMinute:4,config:{maxOutputTokens:2000,maxContextChars:60000,maxRepairs:1,timeoutMs:5000}});
  const url=await listen(server);
  const ask=(session:string,requestId:string)=>fetch(url+'/v1/assist',{method:'POST',headers:{'content-type':'application/json','x-diagramia-client':'editor',cookie:`diagramia_session=${session}`},
    body:JSON.stringify({requestId,providerId:'fake',mode:'explain',prompt:'Explicá',document:architecture(),selectedIds:[]})});
  try{
    const unverified=await ask('unverified','u-1');
    assert.equal(unverified.status,403);assert.equal((await unverified.json()).error.code,'EMAIL_NOT_VERIFIED');
    assert.equal((await ask('verified','v-1')).status,200);assert.equal((await ask('verified','v-2')).status,200);
    const flood=await ask('verified','v-3');
    assert.equal(flood.status,429,'tercer pedido de la misma cuenta en el minuto');
    assert.equal((await ask('other','o-1')).status,429,'quinto pedido desde la misma IP, aunque sea otra cuenta');
    assert.deepEqual(reserved,['v-1','v-2'],'los pedidos bloqueados no reservan créditos');assert.equal(calls.length,2);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.deepEqual(spy.server.map(s=>[s.event.props.outcome,s.event.props.errorCode]),[['blocked','EMAIL_NOT_VERIFIED'],['text',null],['text',null],['blocked','RATE_LIMITED'],['blocked','RATE_LIMITED']]);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('Crear uses a compact inventory prompt and generated IDs do not collide with drawings or animation names',async()=>{
  const base=applyBatch(emptyDocument('compact','Ideas'),{id:'manual',baseRevision:0,actions:[{type:'ADD_DRAWING',drawing:{id:'edge-1',kind:'line',points:[{x:0,y:0},{x:40,y:0}]}}]});
  const json=JSON.stringify({summary:'Ideas.',nodes:[{id:'recorrido',kind:'note',label:'Objetivo'},{id:'a',kind:'note',label:'Invitar'},{id:'b',kind:'note',label:'Preparar'},{id:'c',kind:'note',label:'Disfrutar'}],edges:[{from:'a',to:'b',label:'después'}]});
  const {provider,calls}=scripted([json,redis()]),g=await gateway([provider]);
  try{
    const result=await(await g.post(g.ask({requestId:'compact',mode:'create',prompt:'Creá una idea con estos pasos',document:base,selectedIds:[]}))).json();
    assert.equal(result.kind,'proposal');
    const after=applyBatch(base,result.batch);assert.deepEqual(after.drawings,base.drawings);assert.ok(after.nodes.some(n=>n.id==='recorrido'));
    assert.ok(after.animations.every(a=>a.id!=='recorrido'));assert.ok(after.edges.every(e=>e.id!=='edge-1'));
    await g.post(g.ask({requestId:'normal-edit'}));
    assert.ok(calls[0].system.length<calls[1].system.length/3,'Crear no necesita el catálogo completo de acciones');
    assert.match(calls[0].messages.at(-1)!.content,/sólo elementos NUEVOS/);
  }finally{await g.close();}
});

test('a truncated compatible response still charges reported tokens and releases its reservation without changes',async()=>{
  const upstream=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:'real-model',choices:[{finish_reason:'length',message:{content:'{"nodes":['}}],usage:{prompt_tokens:5000,completion_tokens:6000,prompt_tokens_details:{cached_tokens:3000}}}));});
  const source=openAICompatibleProvider({id:'fake',baseURL:await listen(upstream),model:'configured-model',kind:'remote',pricing:{inputPerMTok:1,outputPerMTok:2,cachedInputPerMTok:.1}}),g=await gateway([source]);
  try{
    const doc=architecture(),before=structuredClone(doc),response=await g.post(g.ask({requestId:'truncated',document:doc})),body=await response.json();
    assert.equal(response.status,502);assert.equal(body.error.code,'TRUNCATED');assert.deepEqual(doc,before);
    const usage=g.ledger.summary();assert.equal(usage.tokens,11000);assert.equal(usage.reservedTokens,0);assert.equal(usage.recent.length,1);assert.equal(usage.recent[0].model,'real-model');assert.equal(usage.recent[0].status,'failed');
  }finally{await g.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}
});
