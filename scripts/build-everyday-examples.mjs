import {writeFileSync} from 'node:fs';
import {applyBatch,emptyDocument,tourOf} from '../packages/core/dist/index.js';
const specs=[
 {id:'explain-idea',title:'Explicar una idea',file:'explain-idea',labels:['Mi idea','A quién ayuda','El primer paso'],details:['Contá tu idea con una frase.','¿Qué problema resuelve?','Elegí una acción pequeña para empezar.'],icons:['idea','users','flag']},
 {id:'plan-task',title:'Planificar una tarea',file:'plan-task',labels:['Lo que quiero lograr','Lo que necesito','Manos a la obra','Revisar y compartir'],details:['Escribí un resultado concreto.','Personas, materiales o tiempo.','Dividí el trabajo en pasos pequeños.','¿Está listo? Mostralo y pedí una opinión.'],icons:['target','check','pencil','chat']}
];
for(const spec of specs){
 let doc=emptyDocument(spec.id,spec.title);
 const colors=['#eef9c4','#e5ecff','#ffe4d6','#ece6ff'];
 const actions=spec.labels.map((label,i)=>({type:'ADD_NODE',node:{id:`${spec.file}-${i+1}`,kind:'note',shape:'card',label,details:spec.details[i],icon:spec.icons[i],position:{x:(i%2)*320,y:Math.floor(i/2)*190},size:{width:250,height:130},style:{fill:colors[i],stroke:'#606975',fontSize:17}}}));
 for(let i=1;i<spec.labels.length;i++)actions.push({type:'ADD_EDGE',edge:{id:`${spec.file}-edge-${i}`,from:`${spec.file}-${i}`,to:`${spec.file}-${i+1}`,label:'',line:'curved'}});
 doc=applyBatch(doc,{id:`${spec.file}-build`,baseRevision:doc.revision,actions});
 const tour=tourOf(doc,`${spec.file}-tour`,'Contar mi idea');if(tour)doc=applyBatch(doc,{id:`${spec.file}-motion`,baseRevision:doc.revision,actions:[tour]});
 writeFileSync(`examples/${spec.file}.diagramia.json`,JSON.stringify(doc,null,2)+'\n');
 console.log(`${spec.title}: ${doc.nodes.length} elementos editables`);
}
