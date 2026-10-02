import {documentBounds,groupMembers,instantiateComponent,nodeRect,resolveMembership,rootGroupId,type ActionInput,type DiagramComponent,type DiagramDocument,type DiagramEdge,type DiagramNode} from '@diagramia/core';
import {documentStore,newId,notify,transact} from './store/documentStore';
import {select,selectionStore} from './store/selectionStore';
import {fit,viewStore} from './store/viewStore';

const state=()=>({doc:documentStore.get().doc,ids:selectionStore.get().ids});
const selectedNodes=(doc:DiagramDocument,ids:string[])=>doc.nodes.filter(n=>ids.includes(n.id));

/** Un clic sobre un nodo agrupado selecciona el grupo más externo completo. */
export function selectionUnit(doc:DiagramDocument,nodeId:string):string[]{
  const root=rootGroupId(doc,nodeId);
  return root?groupMembers(doc,root):[nodeId];
}

/** Mover nodos reevalúa la pertenencia a zonas: el nodo queda en la zona que contiene su centro, o libre. */
export function moveActions(doc:DiagramDocument,ids:string[],dx:number,dy:number):ActionInput[]{
  return selectedNodes(doc,ids).map(n=>{
    const target=resolveMembership(doc,{...nodeRect(n),x:n.position.x+dx,y:n.position.y+dy});
    return {type:'UPDATE_NODE',id:n.id,changes:{position:target.position,...(target.zoneId!==n.zoneId?{zoneId:target.zoneId}:{})}};
  });
}

export function nudge(dx:number,dy:number){
  const {doc,ids}=state();
  const actions:ActionInput[]=[
    ...moveActions(doc,ids.filter(id=>{const n=doc.nodes.find(x=>x.id===id);return n&&!(n.zoneId&&ids.includes(n.zoneId));}),dx,dy),
    ...doc.zones.filter(z=>ids.includes(z.id)).map(z=>({type:'MOVE_ZONE' as const,id:z.id,position:{x:z.bounds.x+dx,y:z.bounds.y+dy}})),
    ...doc.frames.filter(f=>ids.includes(f.id)).map(f=>({type:'UPDATE_FRAME' as const,id:f.id,changes:{bounds:{...f.bounds,x:f.bounds.x+dx,y:f.bounds.y+dy}}}))
  ];
  transact(actions,'Selección movida');
}

export function deleteSelection(){
  const {doc,ids}=state(),nodes=new Set(selectedNodes(doc,ids).map(n=>n.id));
  const actions:ActionInput[]=[
    // Las conexiones de un nodo eliminado ya se van con él; pedirlas de nuevo fallaría.
    ...doc.edges.filter(e=>ids.includes(e.id)&&!nodes.has(e.from)&&!nodes.has(e.to)).map(e=>({type:'DELETE_EDGE' as const,id:e.id})),
    ...doc.drawings.filter(d=>ids.includes(d.id)).map(d=>({type:'DELETE_DRAWING' as const,id:d.id})),
    ...[...nodes].map(id=>({type:'DELETE_NODE' as const,id})),
    ...doc.zones.filter(z=>ids.includes(z.id)).map(z=>({type:'DELETE_ZONE' as const,id:z.id,members:'release' as const})),
    ...doc.frames.filter(f=>ids.includes(f.id)).map(f=>({type:'DELETE_FRAME' as const,id:f.id}))
  ];
  transact(actions,`${actions.length} elemento(s) eliminado(s)`);
}

export function selectAll(){const {doc}=state();select([...doc.nodes,...doc.edges,...doc.drawings].map(x=>x.id));}

type Clip={nodes:DiagramNode[];edges:DiagramEdge[]};
let clipboard:Clip|null=null,pastes=0;
function capture():Clip|null{
  const {doc,ids}=state(),nodes=selectedNodes(doc,ids),inside=new Set(nodes.map(n=>n.id));
  return nodes.length?{nodes,edges:doc.edges.filter(e=>inside.has(e.from)&&inside.has(e.to))}:null;
}
function insert(clip:Clip,offset:number,label:string){
  const {doc}=state(),rename=new Map(clip.nodes.map(n=>[n.id,newId('node')]));
  const actions:ActionInput[]=[
    ...clip.nodes.map(n=>{
      const target=resolveMembership(doc,{...nodeRect(n),x:n.position.x+offset,y:n.position.y+offset});
      return {type:'ADD_NODE' as const,node:{...n,id:rename.get(n.id)!,groupId:null,zoneId:target.zoneId,position:target.position}};
    }),
    ...clip.edges.map(({points:_route,...e})=>({type:'ADD_EDGE' as const,edge:{...e,id:newId('edge'),from:rename.get(e.from)!,to:rename.get(e.to)!}}))
  ];
  if(transact(actions,label))select([...rename.values()]);
}
export function copy(){
  const clip=capture();
  if(!clip){notify('Seleccioná al menos un nodo para copiar.','warn');return false;}
  clipboard=clip;pastes=0;notify(`${clip.nodes.length} nodo(s) copiados.`);return true;
}
export function paste(){if(!clipboard){notify('No hay nada copiado en esta sesión.','warn');return;}pastes++;insert(clipboard,24*pastes,'Elementos pegados');}
export function cut(){if(copy())deleteSelection();}
export function duplicate(){const clip=capture();if(clip)insert(clip,24,'Selección duplicada');}

export function group(){
  const {doc,ids}=state(),nodes=selectedNodes(doc,ids);
  if(nodes.length<2){notify('Agrupar necesita al menos dos nodos seleccionados.','warn');return;}
  transact([{type:'CREATE_GROUP',group:{id:newId('group')},nodeIds:nodes.map(n=>n.id)}],'Grupo creado');
}
export function ungroup(){
  const {doc,ids}=state(),roots=[...new Set(selectedNodes(doc,ids).map(n=>rootGroupId(doc,n.id)).filter((id):id is string=>Boolean(id)))];
  if(!roots.length){notify('La selección no pertenece a ningún grupo.','warn');return;}
  transact(roots.map(id=>({type:'DELETE_GROUP' as const,id})),'Grupo disuelto');
}

type Arrange=Extract<ActionInput,{type:'ALIGN_NODES'|'DISTRIBUTE_NODES'|'LAYOUT_NODES'}>;
type ArrangeSpec=Arrange extends infer A?A extends {ids:unknown}?Omit<A,'ids'>:never:never;
/** Ordena sólo los nodos seleccionados (o todos si no hay selección de nodos). Nunca mueve elementos externos. */
export function arrange(spec:ArrangeSpec){
  const {doc,ids}=state(),chosen=selectedNodes(doc,ids),targets=chosen.length?chosen:spec.type==='LAYOUT_NODES'?doc.nodes:[];
  if(!targets.length){notify('Seleccioná los nodos que querés ordenar.','warn');return;}
  transact([{...spec,ids:targets.map(n=>n.id)} as ActionInput],'Selección ordenada');
}

export function insertComponent(component:DiagramComponent){
  const {doc}=state(),{camera,viewport}=viewStore.get();
  // Se ubica debajo del contenido existente para no pisarlo; en un documento vacío, en el centro de la vista.
  const bounds=documentBounds(doc),at=bounds?{x:bounds.x,y:bounds.y+bounds.height+64}:{x:camera.x+viewport.width/camera.zoom/2-200,y:camera.y+viewport.height/camera.zoom/2-100};
  const {actions,nodeIds}=instantiateComponent(doc,component,at);
  if(transact(actions,`Componente «${component.label}» insertado`)){select(nodeIds);fit(documentBounds(documentStore.get().doc));}
}
export function fitAll(quiet=false){
  if(!fit(documentBounds(documentStore.get().doc))&&!quiet)notify('El diagrama no entra completo a un tamaño legible: se muestra desde su esquina. Recorrelo con la mano (H) o alejá con −.','warn');
}
