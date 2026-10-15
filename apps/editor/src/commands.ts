import {alignSelectionActions,captureSelection,cloneSelectionActions,selectionMoveActions,designDocument,describeError,fitSize,previewBatch,tidyBatch,tourOf,documentBounds,groupMembers,instantiateComponent,rootGroupId,type ActionInput,type DiagramComponent,type DiagramDocument,type SelectionAlign,type SelectionClipboard} from '@diagramia/core';
import {commit,documentStore,newId,notify,transact} from './store/documentStore';
import {select,selectionStore} from './store/selectionStore';
import {track} from './telemetry';
import {fit,moveCamera,viewStore} from './store/viewStore';
import {createStore} from './store/createStore';
import {playbackStore} from './store/playbackStore';
import {t} from './i18n';

const state=()=>({doc:documentStore.get().doc,ids:selectionStore.get().ids});
const selectedNodes=(doc:DiagramDocument,ids:string[])=>doc.nodes.filter(n=>ids.includes(n.id));

/** Acerca la selección sin tocar sus IDs, contenido ni historial. */
export function fitSelection(){
  const {doc,ids}=state(),bounds=documentBounds(doc,ids);if(!ids.length||!bounds)return;
  playbackStore.set({playing:false});
  const before=viewStore.get().camera;
  const fits=fit(bounds);viewStore.set({navigationBack:before});
  notify(fits?t('Vista acercada a la selección.'):t('Selección grande: acercamos el inicio para que se pueda leer. Usá la mano para recorrerla.'));
}
export function goBackToView(){const {navigationBack}=viewStore.get();if(!navigationBack)return;const {playing}=playbackStore.get();playbackStore.set({playing:false});viewStore.set({navigationBack:null,flash:null});moveCamera(navigationBack,playing?0:450);}
export function openCanvasSearch(){playbackStore.set({playing:false});viewStore.set({searchOpen:true,tool:'select',connectFromId:null});}

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
  transact(actions,t('Selección movida'));
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
  transact(actions,t('{0} elemento(s) eliminado(s)',actions.length));
}

export function selectAll(){const {doc}=state();select([...doc.nodes,...doc.edges,...doc.drawings].map(x=>x.id));}

export const clipboardStore=createStore({clip:null as SelectionClipboard|null});
let pastes=0;
function capture(){const {doc,ids}=state();return captureSelection(doc,ids);}
function insert(clip:SelectionClipboard,offset:number,label:string){const {actions,ids}=cloneSelectionActions(documentStore.get().doc,clip,offset,newId);if(transact(actions,label))select(ids);}
export function copy(){
  const clip=capture();
  if(!clip){notify(t('Seleccioná lo que querés copiar.'),'warn');return false;}
  const count=clip.nodes.length+clip.drawings.length+clip.zones.length+clip.frames.length;
  clipboardStore.set({clip});pastes=0;notify(t('{0} elemento(s) copiados.',count));track('copy',{count});return true;
}
export function paste(){const {clip}=clipboardStore.get();if(!clip){notify(t('No hay nada copiado en esta sesión.'),'warn');return;}track('paste',{count:clip.nodes.length+clip.drawings.length});pastes++;insert(clip,24*pastes,t('Elementos pegados'));}
export function cut(){if(copy())deleteSelection();}
export function duplicate(){const clip=capture();if(clip)insert(clip,24,t('Selección duplicada'));}

/** Une el origen elegido en la barra contextual con un destino real, con mouse o teclado. */
export function connectTo(to:string|null,toAnchor:{x:number;y:number}|null=null){
  const {doc}=state(),from=viewStore.get().connectFromId;if(!from)return;
  if(!doc.nodes.some(n=>n.id===from)){viewStore.set({connectFromId:null,tool:'select'});notify(t('El elemento de origen ya no está. Elegí otro para unir.'),'warn');return;}
  if(!to||to===from||!doc.nodes.some(n=>n.id===to)){notify(t('Elegí otro elemento para unirlo con el seleccionado.'));return;}
  const id=newId('edge');
  if(transact([{type:'ADD_EDGE',edge:{id,from,to,label:'',fromAnchor:viewStore.get().connectFromAnchor,toAnchor}}],t('Elementos unidos'))){select([id]);viewStore.set({connectFromId:null,connectFromAnchor:null,tool:'select'});}
}

export function group(){
  const {doc,ids}=state(),nodes=selectedNodes(doc,ids),drawings=doc.drawings.filter(d=>ids.includes(d.id));
  if(nodes.length+drawings.length<2){notify(t('Seleccioná al menos dos figuras o dibujos para agrupar.'),'warn');return;}
  if(transact([{type:'CREATE_GROUP',group:{id:newId('group')},nodeIds:nodes.map(n=>n.id),drawingIds:drawings.map(d=>d.id)}],t('Pieza agrupada')))select([...nodes,...drawings].map(n=>n.id));
}
export function ungroup(){
  const {doc,ids}=state(),roots=[...new Set(ids.map(id=>rootGroupId(doc,id)).filter((id):id is string=>Boolean(id)))];
  if(!roots.length){notify(t('La selección no pertenece a ningún grupo.'),'warn');return;}
  transact(roots.map(id=>({type:'DELETE_GROUP' as const,id})),t('Grupo disuelto'));
}

export function alignSelection(mode:SelectionAlign){const {doc,ids}=state();const actions=alignSelectionActions(doc,ids,mode);if(actions.length)transact(actions,mode==='horizontal'||mode==='vertical'?t('Separación uniforme aplicada'):t('Piezas alineadas'));}

type Arrange=Extract<ActionInput,{type:'ALIGN_NODES'|'DISTRIBUTE_NODES'|'LAYOUT_NODES'}>;
type ArrangeSpec=Arrange extends infer A?A extends {ids:unknown}?Omit<A,'ids'>:never:never;
/** Ordena sólo los nodos seleccionados (o todos si no hay selección de nodos). Nunca mueve elementos externos. */
export function arrange(spec:ArrangeSpec){
  const {doc,ids}=state(),chosen=selectedNodes(doc,ids),targets=chosen.length?chosen:spec.type==='LAYOUT_NODES'?doc.nodes:[];
  if(!targets.length){notify(t('Seleccioná los nodos que querés ordenar.'),'warn');return;}
  transact([{...spec,ids:targets.map(n=>n.id)} as ActionInput],t('Selección ordenada'));
}

export function insertComponent(component:DiagramComponent){
  const {doc}=state(),{camera,viewport}=viewStore.get();
  // Se ubica debajo del contenido existente para no pisarlo; en un documento vacío, en el centro de la vista.
  const bounds=documentBounds(doc),at=bounds?{x:bounds.x,y:bounds.y+bounds.height+64}:{x:camera.x+viewport.width/camera.zoom/2-200,y:camera.y+viewport.height/camera.zoom/2-100};
  const {actions,nodeIds}=instantiateComponent(doc,component,at);
  // Un elemento propio se mueve como una pieza: se inserta agrupado y se puede desagrupar para editarlo por partes.
  const grouped=component.category==='custom'&&nodeIds.length>1?[{type:'CREATE_GROUP' as const,group:{id:newId('group'),label:component.label},nodeIds}]:[];
  if(transact([...actions,...grouped],t('«{0}» insertado',component.label))){select(nodeIds);fit(documentBounds(documentStore.get().doc));}
}
/**
 * Le da diseño al diagrama en un paso: tonos por zona, formas por rol, iconos por significado y flechas de color,
 * sólo donde no hay una elección propia. Si no tiene animaciones, suma un recorrido. Después reacomoda todo para que se lea
 * de un vistazo (un paso de deshacer).
 */
export function designAll(){
  const {doc}=documentStore.get(),{actions}=designDocument(doc),tour=doc.animations.length?null:tourOf(doc,newId('recorrido'),t('Recorrido: ')+doc.title.slice(0,180));
  if(!actions.length&&!tour){notify(t('Este diagrama ya tiene su propio diseño. Para cambiarlo, usá los estilos rápidos en Propiedades.'));return;}
  try{
    // Las formas nuevas cambian lo que ocupa cada texto: primero se ajustan los tamaños y después se reacomoda todo.
    const styled=previewBatch(doc,{id:newId('design-preview'),baseRevision:doc.revision,actions}).document;
    const sizes=styled.nodes.flatMap(n=>{const need=fitSize(n);return need.width>n.size.width||need.height>n.size.height?[{type:'RESIZE_NODE' as const,id:n.id,size:{width:Math.max(n.size.width,need.width),height:Math.max(n.size.height,need.height)}}]:[];});
    const arrange=doc.nodes.length>1?[{type:'ARRANGE_DOCUMENT' as const,direction:'right' as const}]:[];
    const {batch}=tidyBatch(doc,{id:newId('design'),baseRevision:doc.revision,actions:[...actions,...sizes,...arrange,...(tour?[tour]:[])]});
    if(commit(batch,(tour?t('Diseño aplicado y recorrido creado'):t('Diseño aplicado'))+t('; Ctrl + Z lo deshace')))fit(documentBounds(documentStore.get().doc));
  }catch(e){notify(t('No se pudo aplicar el diseño: ')+describeError(e),'error');}
}
export function fitAll(quiet=false){
  if(!fit(documentBounds(documentStore.get().doc))&&!quiet)notify(t('El diagrama no entra completo a un tamaño legible: se muestra desde su esquina. Recorrelo con la mano (H) o alejá con −.'),'warn');
}
