// Mide las operaciones del core con documentos sintéticos de 100, 500 y 2000 nodos (P8.2).
// Uso: npm run perf:core. Resultados en consola y en state/perf/core-<fecha>.json (no versionado).
import {mkdirSync,writeFileSync} from 'node:fs';
import {cpus,totalmem} from 'node:os';
import {applyBatch,findOverlaps,getContext,previewBatch,routeEdge,tidyBatch,validateDocument} from '../packages/core/dist/index.js';

/** Documento con zonas de 20 nodos en grilla, una cadena de conexiones y un cruce cada tres nodos (≈1,3 conexiones por nodo). */
function synthetic(count){
  const perZone=20,zones=[],nodes=[],edges=[];
  for(let z=0;z<Math.ceil(count/perZone);z++){
    const zx=(z%10)*1100,zy=Math.floor(z/10)*700;
    zones.push({id:`zone-${z}`,label:`Zona ${z}`,bounds:{x:zx,y:zy,width:1040,height:640}});
    for(let i=0;i<perZone&&nodes.length<count;i++){
      const n=nodes.length;
      nodes.push({id:`n-${n}`,kind:'service',label:`Servicio ${n}`,position:{x:zx+40+(i%5)*200,y:zy+60+Math.floor(i/5)*140},size:{width:160,height:80},zoneId:`zone-${z}`});
    }
  }
  for(let n=1;n<count;n++)edges.push({id:`e-${n}`,from:`n-${n-1}`,to:`n-${n}`,label:'llama'});
  for(let n=3;n<count;n+=3)edges.push({id:`x-${n}`,from:`n-${n}`,to:`n-${(n*7)%count}`,label:''});
  return validateDocument({schemaVersion:'1.6.0',id:`perf-${count}`,title:`Perf ${count}`,revision:0,nodes,edges,zones,groups:[],frames:[],drawings:[],animations:[],assets:[],annotations:[],appliedBatches:[]});
}
function time(fn,runs=3){
  const samples=[];let result;
  for(let i=0;i<runs;i++){const start=performance.now();result=fn();samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);
  return {ms:Number(samples[Math.floor(samples.length/2)].toFixed(1)),result};
}

const rows=[];
// 1999 y no 2000: el documento admite hasta 2000 nodos y la medición agrega uno.
for(const count of [100,500,1999]){
  const doc=synthetic(count),json=JSON.stringify(doc),mid=`n-${Math.floor(count/2)}`;
  const add={id:`b-${count}`,baseRevision:doc.revision,actions:[{type:'ADD_NODE',node:{id:'nuevo',kind:'cache',label:'Caché',position:{x:0,y:0},size:{width:160,height:80}},placement:{below:mid,gap:60}}]};
  const row={nodes:doc.nodes.length,edges:doc.edges.length,zones:doc.zones.length,kb:Math.round(json.length/1024)};
  row.parseAndValidate=time(()=>validateDocument(JSON.parse(json))).ms;
  row.applyOneAction=time(()=>applyBatch(doc,add)).ms;
  row.preview=time(()=>previewBatch(doc,add)).ms;
  row.tidyOneAction=time(()=>tidyBatch(doc,add)).ms;
  // routeEdge calcula todas las rutas del documento: es el costo de dibujar todas las conexiones.
  row.routeAllEdges=time(()=>routeEdge(doc.edges[0],doc),1).ms;
  row.findOverlaps=time(()=>findOverlaps(doc)).ms;
  const context=time(()=>getContext(doc,[mid],{scope:'selection'}));
  row.selectionContext=context.ms;row.contextKb=Math.round(JSON.stringify(context.result).length/1024);
  rows.push(row);
}
console.table(rows);
const report={at:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,cores:cpus().length,memoryGb:Math.round(totalmem()/2**30),results:rows};
mkdirSync('state/perf',{recursive:true});
writeFileSync(`state/perf/core-${report.at.slice(0,10)}.json`,JSON.stringify(report,null,2));
console.log(`Equipo: ${report.cpu} · ${report.cores} núcleos · ${report.memoryGb} GB · Node ${report.node}`);
