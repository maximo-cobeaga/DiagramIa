import {alignSelectionActions,captureSelection,cloneSelectionActions,selectionMoveActions,designDocument,describeError,fitSize,previewBatch,tidyBatch,tourOf,documentBounds,groupMembers,instantiateComponent,rootGroupId,type ActionInput,type DiagramComponent,type DiagramDocument,type SelectionAlign,type SelectionClipboard} from '@diagramia/core';
import {commit,documentStore,newId,notify,transact} from './store/documentStore';
import {select,selectionStore} from './store/selectionStore';
import {track} from './telemetry';
import {fit,viewStore} from './store/viewStore';
import {createStore} from './store/createStore';

const state=()=>({doc:documentStore.get().doc,ids:selectionStore.get().ids});
const selectedNodes=(doc:DiagramDocument,ids:string[])=>doc.nodes.filter(n=>ids.includes(n.id));

/** Un clic sobre un nodo agrupado selecciona el grupo más externo completo. */
export function selectionUnit(doc:DiagramDocument,nodeId:string):string[]{
  const root=rootGroupId(doc,nodeId);
  return root?groupMembers(doc,root):[nodeId];
}

/** Mover nodos reevalúa la pertenencia a zonas: el nodo queda en la zona que contiene su centro, o libre. */
export function moveActions(doc:DiagramDocument,ids:string[],dx:number,dy:number):ActionInput[]{
  return selectionMoveActions(doc,ids,dx,dy);
}

export function nudge(dx:number,dy:number){
  const {doc,ids}=state();
  const actions=moveActions(doc,ids,dx,dy);
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

export const clipboardStore=createStore({clip:null as SelectionClipboard|null});
let pastes=0;
function capture(){const {doc,ids}=state();return captureSelection(doc,ids);}
function insert(clip:SelectionClipboard,offset:number,label:string){const {actions,ids}=cloneSelectionActions(documentStore.get().doc,clip,offset,newId);if(transact(actions,label))select(ids);}
export function copy(){
  const clip=capture();
  if(!clip){notify('Seleccioná lo que querés copiar.','warn');return false;}
  const count=clip.nodes.length+clip.drawings.length+clip.zones.length+clip.frames.length;
  clipboardStore.set({clip});pastes=0;notify(`${count} elemento(s) copiados.`);track('copy',{count});return true;
}
export function paste(){const {clip}=clipboardStore.get();if(!clip){notify('No hay nada copiado en esta sesión.','warn');return;}track('paste',{count:clip.nodes.length+clip.drawings.length});pastes++;insert(clip,24*pastes,'Elementos pegados');}
export function cut(){if(copy())deleteSelection();}
export function duplicate(){const clip=capture();if(clip)insert(clip,24,'Selección duplicada');}

/** Une el origen elegido en la barra contextual con un destino real, con mouse o teclado. */
export function connectTo(to:string|null,toAnchor:{x:number;y:number}|null=null){
  const {doc}=state(),from=viewStore.get().connectFromId;if(!from)return;
  if(!doc.nodes.some(n=>n.id===from)){viewStore.set({connectFromId:null,tool:'select'});notify('El elemento de origen ya no está. Elegí otro para unir.','warn');return;}
  if(!to||to===from||!doc.nodes.some(n=>n.id===to)){notify('Elegí otro elemento para unirlo con el seleccionado.');return;}
  const id=newId('edge');
  if(transact([{type:'ADD_EDGE',edge:{id,from,to,label:'',fromAnchor:viewStore.get().connectFromAnchor,toAnchor}}],'Elementos unidos')){select([id]);viewStore.set({connectFromId:null,connectFromAnchor:null,tool:'select'});}
}

export function group(){
  const {doc,ids}=state(),nodes=selectedNodes(doc,ids),drawings=doc.drawings.filter(d=>ids.includes(d.id));
  if(nodes.length+drawings.length<2){notify('Seleccioná al menos dos figuras o dibujos para agrupar.','warn');return;}
  if(transact([{type:'CREATE_GROUP',group:{id:newId('group')},nodeIds:nodes.map(n=>n.id),drawingIds:drawings.map(d=>d.id)}],'Pieza agrupada'))select([...nodes,...drawings].map(n=>n.id));
}
export function ungroup(){
  const {doc,ids}=state(),roots=[...new Set(ids.map(id=>rootGroupId(doc,id)).filter((id):id is string=>Boolean(id)))];
  if(!roots.length){notify('La selección no pertenece a ningún grupo.','warn');return;}
  transact(roots.map(id=>({type:'DELETE_GROUP' as const,id})),'Grupo disuelto');
}

export function alignSelection(mode:SelectionAlign){const {doc,ids}=state();const actions=alignSelectionActions(doc,ids,mode);if(actions.length)transact(actions,mode==='horizontal'||mode==='vertical'?'Separación uniforme aplicada':'Piezas alineadas');}

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
  // Un elemento propio se mueve como una pieza: se inserta agrupado y se puede desagrupar para editarlo por partes.
  const grouped=component.category==='custom'&&nodeIds.length>1?[{type:'CREATE_GROUP' as const,group:{id:newId('group'),label:component.label},nodeIds}]:[];
  if(transact([...actions,...grouped],`«${component.label}» insertado`)){select(nodeIds);fit(documentBounds(documentStore.get().doc));}
}
/**
 * Le da diseño al diagrama en un paso: tonos por zona, formas por rol, iconos por significado y flechas de color,
 * sólo donde no hay una elección propia. Si no tiene animaciones, suma un recorrido. Después reacomoda todo para que se lea
 * de un vistazo (un paso de deshacer).
 */
export function designAll(){
  const {doc}=documentStore.get(),{actions}=designDocument(doc),tour=doc.animations.length?null:tourOf(doc,newId('recorrido'),'Recorrido: '+doc.title.slice(0,180));
  if(!actions.length&&!tour){notify('Este diagrama ya tiene su propio diseño. Para cambiarlo, usá los estilos rápidos en Propiedades.');return;}
  try{
    // Las formas nuevas cambian lo que ocupa cada texto: primero se ajustan los tamaños y después se reacomoda todo.
    const styled=previewBatch(doc,{id:newId('design-preview'),baseRevision:doc.revision,actions}).document;
    const sizes=styled.nodes.flatMap(n=>{const need=fitSize(n);return need.width>n.size.width||need.height>n.size.height?[{type:'RESIZE_NODE' as const,id:n.id,size:{width:Math.max(n.size.width,need.width),height:Math.max(n.size.height,need.height)}}]:[];});
    const arrange=doc.nodes.length>1?[{type:'ARRANGE_DOCUMENT' as const,direction:'right' as const}]:[];
    const {batch}=tidyBatch(doc,{id:newId('design'),baseRevision:doc.revision,actions:[...actions,...sizes,...arrange,...(tour?[tour]:[])]});
    if(commit(batch,(tour?'Diseño aplicado y recorrido creado':'Diseño aplicado')+'; Ctrl + Z lo deshace'))fit(documentBounds(documentStore.get().doc));
  }catch(e){notify('No se pudo aplicar el diseño: '+describeError(e),'error');}
}
export function fitAll(quiet=false){
  if(!fit(documentBounds(documentStore.get().doc))&&!quiet)notify('El diagrama no entra completo a un tamaño legible: se muestra desde su esquina. Recorrelo con la mano (H) o alejá con −.','warn');
}
