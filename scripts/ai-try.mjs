// Prueba suelta de un pedido contra el gateway: muestra qué propone el modelo y si el engine lo acepta.
//   node scripts/ai-try.mjs "Agregá un usuario que consuma React" [proveedor] [repeticiones] [ejemplo]
import {readFileSync} from 'node:fs';
import {applyBatch} from '../packages/core/dist/index.js';
const [prompt='Agregá un usuario que consuma React',providerId='local',times='1',example='architecture']=process.argv.slice(2);
const GATEWAY=process.env.DIAGRAMIA_API_URL??'http://127.0.0.1:8787',document=JSON.parse(readFileSync(new URL(`../examples/${example}.diagramia.json`,import.meta.url),'utf8'));
for(let i=0;i<Number(times);i++){
  const started=Date.now(),response=await fetch(GATEWAY+'/v1/assist',{method:'POST',headers:{'content-type':'application/json','x-diagramia-client':'editor'},body:JSON.stringify({requestId:`try-${Date.now().toString(36)}-${i}`,providerId,mode:'edit',prompt,document,selectedIds:[]})});
  const data=await response.json(),seconds=((Date.now()-started)/1000).toFixed(1);
  if(!response.ok){console.log(`${i+1}. ERROR ${data.error?.code}: ${data.error?.message} · ${seconds}s`);continue;}
  if(data.kind!=='proposal'){console.log(`${i+1}. ${data.kind}: ${data.clarification??data.text??''} · ${data.repairs} reparación(es) · ${seconds}s`);continue;}
  const after=applyBatch(document,data.batch),added=after.nodes.filter(n=>!document.nodes.some(b=>b.id===n.id)),edges=after.edges.filter(e=>!document.edges.some(b=>b.id===e.id));
  console.log(`${i+1}. propuesta: +${added.map(n=>`${n.label} [${n.kind}] (${n.position.x},${n.position.y})`).join(', ')||'ningún nodo'} · conexiones: ${edges.map(e=>e.from+'→'+e.to).join(', ')||'ninguna'} · ${data.repairs} reparación(es) · ${seconds}s`);
}
