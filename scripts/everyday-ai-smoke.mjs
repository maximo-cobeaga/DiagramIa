// Prueba acotada con un modelo real ya configurado. Consume tokens; no modifica documentos del usuario.
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {providersFromEnv} from '../packages/providers/dist/index.js';
import {assist} from '../apps/api/dist/assist.js';
import {UsageLedger} from '../apps/api/dist/usage.js';
import {emptyDocument,applyBatch,findOverlaps} from '../packages/core/dist/index.js';

if(existsSync('.env'))process.loadEnvFile('.env');
const wanted=process.argv[2]??'compatible',source=providersFromEnv(process.env).find(p=>p.info().id===wanted);
if(!source?.info().configured||source.info().kind==='mock')throw new Error('Hace falta un proveedor real configurado.');
const info=source.info(),run=Date.now().toString(36),limit=6;
let calls=0;
const provider={info:()=>info,generate:async request=>{if(++calls>limit)throw new Error('Tope de seis llamadas alcanzado.');const result=await source.generate(request);writeFileSync(`state/everyday-ai/raw-${calls}.json`,JSON.stringify({text:result.text,usage:result.usage},null,2));return result;}};
const ledger=new UsageLedger({dailyTokenBudget:160_000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null});
const deps={providers:[provider],ledger,system:'',config:{maxOutputTokens:6000,maxContextChars:80_000,maxRepairs:1,timeoutMs:120_000}};
// Misma construcción del sistema que usa el gateway, sin sesiones, DB ni webhooks del entorno habitual.
const {systemPrompt}=await import('../apps/api/dist/assist.js');
deps.system=systemPrompt(readFileSync('prompts/06_SYSTEM_PROMPT_PRODUCTO.md','utf8').split('\n').slice(1).join('\n'));
deps.createSystem=systemPrompt(readFileSync('prompts/06_SYSTEM_PROMPT_PRODUCTO.md','utf8').split('\n').slice(1).join('\n'),true);
mkdirSync('state/everyday-ai',{recursive:true});
const records=process.argv.includes('--resume')?JSON.parse(readFileSync('state/everyday-ai/results.json','utf8')).records:[];
calls=records.reduce((sum,record)=>sum+(record.answer?.usage.calls??0),0);
const ask=async(name,prompt,document,history=[])=>{
  const recorded=records.find(record=>record.name===name&&record.answer);
  if(recorded){console.log(`${name}: respuesta real previamente registrada, sin nueva llamada`);return recorded.answer;}
  const started=Date.now();
  let answer;
  try{answer=await assist({requestId:`everyday-${run}-${name}`,providerId:info.id,mode:'create',prompt,document,selectedIds:[],history},deps,AbortSignal.timeout(150_000));}
  catch(error){records.push({name,error:{code:error.code,message:error.message,usage:error.usage},seconds:(Date.now()-started)/1000});writeFileSync('state/everyday-ai/results.json',JSON.stringify({provider:{id:info.id,model:info.model},calls,records},null,2));throw error;}
  records.push({name,seconds:(Date.now()-started)/1000,answer});
  writeFileSync('state/everyday-ai/results.json',JSON.stringify({provider:{id:info.id,model:info.model},calls,records},null,2));
  console.log(`${name}: ${answer.kind}, ${answer.usage.inputTokens}+${answer.usage.outputTokens} tokens, ${answer.repairs} reparaciones`);
  return answer;
};
const accept=(name,before,answer)=>{
  if(answer.kind!=='proposal')throw new Error(`${name}: no produjo una propuesta (${answer.kind}).`);
  const after=applyBatch(before,answer.batch),issues=findOverlaps(after),prior=findOverlaps(before);
  const introduced=issues.filter(issue=>!prior.some(old=>old.type===issue.type&&JSON.stringify(old.ids)===JSON.stringify(issue.ids)));
  if(introduced.some(i=>['node-overlap','zone-intrusion','zone-label','zone-overlap','text-overflow'].includes(i.type)))throw new Error(`${name}: hay superposiciones bloqueantes nuevas.`);
  writeFileSync(`state/everyday-ai/${name}.diagramia.json`,JSON.stringify(after,null,2));
  console.log(`${name}: ${after.nodes.length} piezas, ${after.edges.length} conexiones, ${issues.length} avisos visuales`);
  return after;
};
const trip=emptyDocument('everyday-trip','Viaje a San Pancho'),original='Quiero un viaje de 10 días desde Mar del Plata. Todavía no elegí destino: preguntame eso antes de armarlo. Es un boceto conceptual, sin precios, reservas ni información en tiempo real.';
const question=await ask('viaje-pregunta',original,trip);
if(question.kind!=='clarification'||question.batch)throw new Error('El modelo debía preguntar antes de proponer el viaje.');
const current=applyBatch(trip,{id:`manual-${run}`,baseRevision:0,actions:[{type:'ADD_NODE',node:{id:'my-note',kind:'note',label:'Mi apunte: descansar',position:{x:0,y:0},size:{width:180,height:90}}}]});
const answer=await ask('viaje-respuesta','San Francisco / San Pancho, Nayarit, México. Diez días para dos adultos, descanso y playa; sin fechas ni presupuesto definidos. Armá una secuencia de los diez días y preparativos generales, sin vuelos, lugares comerciales ni precios inventados. Conservá mi apunte.',current,[{role:'user',content:original},{role:'assistant',content:question.clarification}]);
const after=accept('viaje',current,answer);
if(!after.nodes.some(n=>n.id==='my-note'&&n.label==='Mi apunte: descansar')||answer.batch.baseRevision!==current.revision)throw new Error('La respuesta perdió el apunte o la revisión actual.');
accept('tareas',emptyDocument('everyday-tasks','Preparar una mudanza'),await ask('tareas','Organizá una mudanza en tres etapas: antes, día de mudanza y después. Incluí embalar, etiquetar cajas, transporte, limpieza y revisar servicios, con conexiones de orden y notas cortas. Es una lista general sin fechas ni proveedores; resolvé el diseño vos.',emptyDocument('everyday-tasks','Preparar una mudanza')));
accept('idea',emptyDocument('everyday-idea','Feria del barrio'),await ask('idea','Convertí la idea de una feria del barrio en un diagrama: objetivo, actividades (comida, juegos, música), equipo (organizar, invitar, preparar), y próximos pasos. Boceto con tareas concretas y relaciones útiles, sin costos ni fechas ni requisitos legales; elegí vos el diseño.',emptyDocument('everyday-idea','Feria del barrio')));
console.log(`Prueba real terminada: ${calls}/${limit} llamadas como máximo. Artefactos en state/everyday-ai/. El costo estimado puede ser desconocido; el cobro real lo informa el proveedor.`);
