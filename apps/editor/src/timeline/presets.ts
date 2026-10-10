import {autoFocus,type DiagramDocument,type DiagramNode,type DiagramStep} from '@diagramia/core';
const newId=(prefix:string)=>prefix+'-'+crypto.randomUUID().slice(0,8);

/**
 * Estilos de animación de un toque. Todos son deterministas: parten de la estructura del diagrama (conexiones, zonas,
 * posiciones) y generan pasos comunes y editables. No hay nada oculto: lo que se crea es una animación normal.
 */
export type PresetKind='walk'|'build'|'edges'|'zones'|'spotlight';
export type Preset={kind:PresetKind;name:string;title:string;description:string;/** Pista visual del resultado, en una línea. */sketch:string};

export const PRESETS:Preset[]=[
  {kind:'walk',name:'Recorrido',title:'Seguir el camino',description:'Avanza por las conexiones, de a una etapa por vez.',sketch:'A → B → C'},
  {kind:'build',name:'Aparecer de a uno',title:'Ir sumando piezas',description:'Cada paso agrega lo nuevo y deja lo anterior resaltado. Ideal para presentar.',sketch:'A · A+B · A+B+C'},
  {kind:'edges',name:'Conexión por conexión',title:'Explicar cada relación',description:'Un paso por flecha: de dónde sale, adónde llega y qué dice.',sketch:'A→B · B→C · C→D'},
  {kind:'zones',name:'Por zonas',title:'Recorrer cada zona',description:'Un paso por zona, y un cierre con todo junto.',sketch:'Zona 1 · Zona 2 · Todo'},
  {kind:'spotlight',name:'Pieza por pieza',title:'Mostrar una pieza a la vez',description:'Pone el foco en cada elemento, con la cámara cerca.',sketch:'A · B · C · D'}
];

const MAX_STEPS=60;
const blank=(extra:Pick<DiagramStep,'caption'|'nodeIds'|'edgeIds'>&Partial<DiagramStep>):DiagramStep=>({id:newId('step'),durationMs:1800,tone:'normal',frameId:null,scenarioIds:[],states:[],focus:'auto',transition:'smooth',...extra});
const caption=(node:DiagramNode)=>{
  const first=node.details?.split('\n').map(line=>line.trim()).find(Boolean);
  return (first?`${node.label}: ${first.slice(0,110)}`:node.label).slice(0,500);
};

/** Los elementos con los que se trabaja: la selección si tiene al menos dos nodos, y si no, todo el diagrama. */
function scope(doc:DiagramDocument,ids:string[]){
  const chosen=doc.nodes.filter(n=>ids.includes(n.id)),nodes=chosen.length>1?chosen:doc.nodes,inside=new Set(nodes.map(n=>n.id));
  const edges=doc.edges.filter(e=>inside.has(e.from)&&inside.has(e.to)&&e.from!==e.to);
  return {nodes,edges,inside};
}
/** Capas desde los nodos sin entradas: la primera es el origen y cada una siguiente, lo que alcanza a partir de la anterior. */
function layers(nodes:DiagramNode[],edges:DiagramDocument['edges']){
  const visited=new Set<string>(),out:string[][]=[];
  let frontier=nodes.filter(n=>!edges.some(e=>e.to===n.id)).map(n=>n.id);
  if(!frontier.length&&nodes.length)frontier=[nodes[0]!.id];
  while(frontier.length&&out.length<MAX_STEPS){
    frontier.forEach(id=>visited.add(id));out.push(frontier);
    frontier=[...new Set(edges.filter(e=>frontier.includes(e.from)).map(e=>e.to))].filter(id=>!visited.has(id));
  }
  // Lo que quedó sin alcanzar (ciclos o piezas sueltas) se agrega al final para que ningún elemento falte.
  const rest=nodes.filter(n=>!visited.has(n.id)).map(n=>n.id);
  if(rest.length&&out.length<MAX_STEPS)out.push(rest);
  return out;
}
const reading=(nodes:DiagramNode[])=>[...nodes].sort((a,b)=>(a.position.y-b.position.y)||(a.position.x-b.position.x));

/** Pasos del estilo elegido. Una lista vacía significa que el diagrama no alcanza para ese estilo (el motivo va en `reason`). */
export function buildPreset(kind:PresetKind,doc:DiagramDocument,ids:string[]):{steps:DiagramStep[];reason?:string}{
  const {nodes,edges}=scope(doc,ids);
  if(!nodes.length)return {steps:[],reason:'Agregá elementos antes de crear una animación.'};
  const label=new Map(nodes.map(n=>[n.id,n.label])),names=(list:string[])=>list.map(id=>label.get(id)??id).join(', ');
  const focusOf=(nodeIds:string[],edgeIds:string[])=>autoFocus(doc,nodeIds.slice(0,100),edgeIds.slice(0,100));
  const steps:DiagramStep[]=[];

  if(kind==='walk'||kind==='build'){
    const list=layers(nodes,edges),seen:string[]=[];
    list.forEach((frontier,index)=>{
      const out=edges.filter(e=>frontier.includes(e.from)),targets=[...new Set(out.map(e=>e.to))].filter(id=>!frontier.includes(id));
      seen.push(...frontier);
      const nodeIds=(kind==='build'?seen:frontier).slice(0,100),edgeIds=(kind==='build'?edges.filter(e=>seen.includes(e.from)&&seen.includes(e.to)):out).map(e=>e.id).slice(0,100);
      const text=kind==='build'?(index===0?`Empezamos con ${names(frontier)}`:`Se suma ${names(frontier)}`):(targets.length?`${names(frontier)} → ${names(targets)}`:names(frontier));
      steps.push(blank({caption:text.slice(0,500),nodeIds,edgeIds,focus:kind==='build'?'overview':focusOf(nodeIds,edgeIds),transition:index?'smooth':'slow'}));
    });
  }else if(kind==='edges'){
    if(!edges.length)return {steps:[],reason:'Este diagrama no tiene conexiones para explicar. Probá «Pieza por pieza».'};
    const order=new Map<string,number>();
    layers(nodes,edges).forEach((frontier,index)=>frontier.forEach(id=>order.set(id,index)));
    const sorted=[...edges].sort((a,b)=>(order.get(a.from)??0)-(order.get(b.from)??0));
    sorted.slice(0,MAX_STEPS).forEach((edge,index)=>{
      const text=`${label.get(edge.from)??edge.from} → ${label.get(edge.to)??edge.to}${edge.label?`: ${edge.label}`:''}`;
      steps.push(blank({caption:text.slice(0,500),nodeIds:[edge.from,edge.to],edgeIds:[edge.id],focus:focusOf([edge.from,edge.to],[edge.id]),transition:index?'smooth':'slow'}));
    });
  }else if(kind==='zones'){
    const zones=doc.zones.filter(zone=>nodes.some(n=>n.zoneId===zone.id));
    if(!zones.length)return {steps:[],reason:'Este diagrama no tiene zonas. Probá «Seguir el camino» o «Pieza por pieza».'};
    zones.slice(0,MAX_STEPS-1).forEach((zone,index)=>{
      const inZone=nodes.filter(n=>n.zoneId===zone.id).map(n=>n.id),inner=edges.filter(e=>inZone.includes(e.from)&&inZone.includes(e.to)).map(e=>e.id);
      steps.push(blank({caption:`${zone.label}: ${names(inZone.slice(0,4))}${inZone.length>4?` y ${inZone.length-4} más`:''}`.slice(0,500),nodeIds:inZone.slice(0,100),edgeIds:inner.slice(0,100),focus:focusOf(inZone,inner),transition:index?'smooth':'slow'}));
    });
    steps.push(blank({caption:'Todo junto',nodeIds:nodes.map(n=>n.id).slice(0,100),edgeIds:edges.map(e=>e.id).slice(0,100),focus:'overview',durationMs:2600}));
  }else{
    reading(nodes).slice(0,MAX_STEPS).forEach((node,index)=>{
      const around=edges.filter(e=>e.from===node.id||e.to===node.id).map(e=>e.id);
      steps.push(blank({caption:caption(node),nodeIds:[node.id],edgeIds:around.slice(0,100),focus:'close',transition:index?'smooth':'slow'}));
    });
  }
  return {steps};
}
