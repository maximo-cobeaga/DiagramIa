// Smoke REAL de la IA: llama a un proveedor de verdad a través del gateway y comprueba con el engine lo que devuelve.
// Consume tokens (o tiempo de un modelo local). Requiere `npm run api` con un proveedor configurado en .env.
//   npm run smoke:ai              → primer proveedor configurado que no sea la demostración
//   npm run smoke:ai -- local     → un proveedor concreto (anthropic | local)
import {readFileSync} from 'node:fs';
import {applyBatch,emptyDocument,findOverlaps,validateDocument} from '../packages/core/dist/index.js';

const GATEWAY=process.env.DIAGRAMIA_API_URL??'http://127.0.0.1:8787';
const headers={'content-type':'application/json','x-diagramia-client':'editor'};
const architecture=()=>validateDocument(JSON.parse(readFileSync(new URL('../examples/architecture.diagramia.json',import.meta.url),'utf8')));

let listing;
try{listing=await(await fetch(GATEWAY+'/v1/providers',{headers})).json();}
catch{console.error(`No hay gateway en ${GATEWAY}. Inicialo con «npm run api».`);process.exit(2);}
const wanted=process.argv[2],provider=listing.providers.find(p=>wanted?p.id===wanted:p.configured&&p.kind!=='mock');
if(!provider?.configured){
  console.error(wanted?`El proveedor «${wanted}» no está configurado: ${provider?.missing??'no existe'}`:'Ningún proveedor real está configurado.');
  for(const p of listing.providers)console.error(`  ${p.id}: ${p.configured?'listo':p.missing}`);
  process.exit(2);
}
if(provider.kind==='mock'){console.error('La demostración no es un modelo: este smoke necesita un proveedor real.');process.exit(2);}
console.log(`Proveedor: ${provider.label} · ${provider.model} (${provider.kind})\n`);

const run=Date.now().toString(36),totals={inputTokens:0,outputTokens:0,usd:0};
async function ask(name,body){
  const started=Date.now(),response=await fetch(GATEWAY+'/v1/assist',{method:'POST',headers,body:JSON.stringify({providerId:provider.id,selectedIds:[],...body,requestId:`smoke-${run}-${name}`})});
  const data=await response.json(),seconds=((Date.now()-started)/1000).toFixed(1);
  if(response.ok&&!data.replayed){totals.inputTokens+=data.usage.inputTokens;totals.outputTokens+=data.usage.outputTokens;totals.usd+=data.usage.estimatedCostUsd??0;}
  return {ok:response.ok,status:response.status,data,seconds};
}
const results=[];
async function check(name,required,fn){
  try{const detail=await fn();results.push({name,ok:true,required});console.log(`ok   ${name} — ${detail}`);}
  catch(e){results.push({name,ok:false,required});console.log(`${required?'FAIL':'NOTA'} ${name} — ${e.message}`);}
}
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
const failure=r=>`${r.status} ${r.data?.error?.code}: ${r.data?.error?.message}`;

const redisRequest={mode:'edit',prompt:'Agregá Redis como caché dentro de Backend, debajo de la API, y conectalo con la API.',document:architecture(),selectedIds:['api']};
await check('Editar: agrega Redis dentro de Backend, debajo de la API, sin tocar el resto',true,async()=>{
  const r=await ask('redis',redisRequest);expect(r.ok,failure(r));
  expect(r.data.kind==='proposal',`se esperaba una propuesta y llegó «${r.data.kind}»: ${r.data.clarification??''}`);
  const before=architecture(),after=applyBatch(before,r.data.batch),api=after.nodes.find(n=>n.id==='api');
  const added=after.nodes.filter(n=>!before.nodes.some(b=>b.id===n.id));
  expect(added.length===1,`agregó ${added.length} nodos`);
  const [node]=added;
  expect(node.zoneId==='backend',`el nodo nuevo quedó en la zona ${node.zoneId}`);
  expect(node.position.y>=api.position.y+api.size.height,`no quedó debajo de la API: ${JSON.stringify(node.position)}`);
  expect(after.edges.some(e=>[e.from,e.to].includes('api')&&[e.from,e.to].includes(node.id)),'no lo conectó con la API');
  expect(before.nodes.every(b=>JSON.stringify(after.nodes.find(n=>n.id===b.id))===JSON.stringify(b)),'modificó nodos que no se pidieron');
  return `${node.label} (${node.kind}) en ${JSON.stringify(node.position)} · ${r.data.batch.actions.length} acciones · ${r.data.repairs} reparación(es) · ${r.seconds}s`;
});
await check('Reintentar el mismo pedido no vuelve a llamar al proveedor',true,async()=>{
  // Sólo un pedido completado se recuerda: si el anterior falló, este reintento es legítimamente una llamada nueva.
  if(!results[0].ok)return 'OMITIDO: el pedido anterior no se completó';
  const r=await ask('redis',redisRequest);expect(r.ok,failure(r));
  expect(r.data.replayed===true,'el gateway volvió a llamar al proveedor');
  return `resultado recuperado en ${r.seconds}s`;
});
await check('Explicar: devuelve texto y ninguna acción',true,async()=>{
  const r=await ask('explain',{mode:'explain',prompt:'Explicá en tres oraciones qué hace este sistema.',document:architecture()});expect(r.ok,failure(r));
  expect(r.data.kind==='text'&&r.data.text.length>40&&!r.data.batch,`respuesta: ${JSON.stringify(r.data).slice(0,200)}`);
  return `${r.data.text.replace(/\s+/g,' ').slice(0,110)}… · ${r.seconds}s`;
});
await check('Revisar: observaciones ligadas a elementos existentes',true,async()=>{
  const r=await ask('review',{mode:'review',prompt:'Revisá la arquitectura y señalá hasta tres riesgos.',document:architecture()});expect(r.ok,failure(r));
  expect(r.data.kind==='review'&&r.data.findings.length>0,`sin observaciones: ${JSON.stringify(r.data).slice(0,200)}`);
  return `${r.data.findings.length} observación(es): ${r.data.findings.map(f=>`[${f.severity}] ${f.targetId}`).join(', ')} · ${r.seconds}s`;
});
const twin=applyBatch(architecture(),{id:'twin',baseRevision:0,actions:[{type:'CREATE_ZONE',zone:{id:'backend-eu',label:'Backend',bounds:{x:480,y:700,width:690,height:300}}}]});
await check('Ambigüedad: con dos zonas «Backend» el gateway pide aclaración sin llamar al modelo',true,async()=>{
  const r=await ask('ambiguous',{mode:'edit',prompt:'Agregá una cola de mensajes dentro de Backend.',document:twin});expect(r.ok,failure(r));
  expect(r.data.kind==='clarification'&&r.data.usage.calls===0,`respuesta: ${r.data.kind} con ${r.data.usage.calls} llamadas`);
  return r.data.clarification.slice(0,110);
});
// Depende del criterio del modelo: se informa, pero no hace fallar el smoke.
await check('Con la zona seleccionada, la cola queda en esa zona y no en su homónima',false,async()=>{
  const r=await ask('chosen',{mode:'edit',prompt:'Agregá una cola de mensajes dentro de Backend.',document:twin,selectedIds:['backend-eu']});expect(r.ok,failure(r));
  expect(r.data.kind==='proposal',`llegó «${r.data.kind}»: ${r.data.clarification??''}`);
  const added=applyBatch(twin,r.data.batch).nodes.filter(n=>!twin.nodes.some(b=>b.id===n.id));
  expect(added.length===1&&added[0].zoneId==='backend-eu',`quedó en ${added.map(n=>n.zoneId).join(', ')}`);
  return `${added[0].label} en backend-eu · ${r.seconds}s`;
});

// El modelo decide el contenido; el engine garantiza que el resultado no tenga nada superpuesto.
await check('Crear: un diagrama completo desde cero, sin nada superpuesto',true,async()=>{
  const empty=emptyDocument('login','Inicio de sesión');
  const r=await ask('create',{mode:'create',prompt:'Creá un diagrama de inicio de sesión: un usuario, un frontend, una API de autenticación y una base de usuarios dentro de una zona Backend, con las conexiones entre ellos.',document:empty});expect(r.ok,failure(r));
  expect(r.data.kind==='proposal',`llegó «${r.data.kind}»: ${r.data.clarification??''}`);
  const result=applyBatch(empty,r.data.batch),overlapIssues=findOverlaps(result);
  expect(overlapIssues.length===0,`superposiciones: ${overlapIssues.map(i=>i.message).join(' ')}`);
  expect(result.nodes.length>=4&&result.edges.length>=3,`incompleto: ${result.nodes.length} nodos, ${result.edges.length} conexiones`);
  const loose=result.nodes.filter(n=>!result.edges.some(e=>e.from===n.id||e.to===n.id));
  expect(loose.length===0,`sin conectar: ${loose.map(n=>n.label).join(', ')}`);
  const user=result.nodes.find(n=>n.kind==='actor'||/usuario/i.test(n.label));
  const frontend=result.nodes.find(n=>/front|web/i.test(n.label));
  const api=result.nodes.find(n=>/api|autentic/i.test(n.label)&&n!==frontend);
  const database=result.nodes.find(n=>n.kind==='database'||/base|datos/i.test(n.label));
  const backend=result.zones.find(z=>/backend/i.test(z.label));
  expect(user&&frontend&&api&&database&&backend,'faltan usuario, frontend, API, base de usuarios o zona Backend');
  expect(api.zoneId===backend.id&&database.zoneId===backend.id,'la API y la base deben estar dentro de Backend');
  const linked=(from,to)=>result.edges.some(e=>e.from===from.id&&e.to===to.id);
  expect(linked(user,frontend)&&linked(frontend,api)&&linked(api,database),'faltan conexiones usuario → frontend → API → base');
  return `${result.nodes.length} nodos, ${result.edges.length} conexiones, ${result.zones.length} zona(s), 0 superposiciones · ${r.seconds}s`;
});

console.log(`\nConsumo: ${totals.inputTokens.toLocaleString('es')} tokens de entrada, ${totals.outputTokens.toLocaleString('es')} de salida${provider.pricing?` · USD ${totals.usd.toFixed(4)} estimados con la tarifa publicada`:provider.kind==='local'?' · modelo local, sin cargo':''}`);
const failed=results.filter(r=>!r.ok&&r.required).length,notes=results.filter(r=>!r.ok&&!r.required).length;
console.log(`${results.filter(r=>r.ok).length}/${results.length} comprobaciones aprobadas${notes?`, ${notes} nota(s) sobre el comportamiento del modelo`:''}.`);
process.exit(failed?1:0);
