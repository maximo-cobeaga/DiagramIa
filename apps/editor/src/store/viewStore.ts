import {documentBounds,type DiagramDocument,type DiagramNode,type Rect} from '@diagramia/core';
import {trackThrottled} from '../telemetry';
import {createStore} from './createStore';

export type Camera={x:number;y:number;zoom:number};
export type Tool='select'|'pan'|'node'|'connect'|'line'|'arrow'|'freehand'|'zone'|'frame';
export type Panel='inspector'|'assistant'|'library'|'history';
export type Theme='light'|'dark';
/** Copia del documento con una propuesta aplicada (total o hasta cierto paso). Se dibuja en el canvas sin tocar el documento real. */
export type Staging={doc:DiagramDocument;changed:string[];step:number;total:number};
/** Lo que crea la herramienta Nodo: qué es (kind), cómo se dibuja (shape), su tamaño inicial y su nombre. */
/** Resaltado pasajero de elementos (por ejemplo, los que señala la IA). Es sólo de la vista: no selecciona ni cambia nada. */
export type Flash={ids:string[];tone:'info'|'warning'|'risk';key:number};
export type NodeTemplate={kind:DiagramNode['kind'];shape:DiagramNode['shape'];label:string;size:{width:number;height:number};icon?:DiagramNode['icon'];style?:DiagramNode['style'];details?:string};
export const MIN_ZOOM=.1,MAX_ZOOM=4,GRID=8;
// Por debajo de este zoom los labels dejan de leerse: encuadrar no reduce más allá y deja el resto para recorrer con pan.
export const LEGIBLE_ZOOM=.45;

const THEME_KEY='diagramia.theme';
function initialTheme():Theme{
  try{const saved=localStorage.getItem(THEME_KEY);if(saved==='light'||saved==='dark')return saved;}catch{/* sin almacenamiento se usa la preferencia del sistema */}
  return typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}

// Estado de interfaz: nunca forma parte del documento ni del historial de cambios.
export const viewStore=createStore({
  camera:{x:-40,y:-20,zoom:1} as Camera,viewport:{width:1000,height:600},
  tool:'select' as Tool,template:{kind:'service',shape:null,label:'Nuevo componente',size:{width:160,height:80}} as NodeTemplate,snap:true,
  // El panel lateral abre en IA: es el primer recorrido del producto.
  panel:'assistant' as Panel,sideOpen:true,timelineOpen:true,presenting:false,tutorial:false,theme:initialTheme(),
  labelFocus:0,editingId:null as string|null,staging:null as Staging|null,flash:null as Flash|null,
  // Recorrido de una explicación que se está presentando: una copia del documento con la animación, nunca guardada.
  tour:null as {doc:DiagramDocument;previousAnimationId:string}|null,
  // Plantilla que se está arrastrando desde la paleta: el canvas la dibuja bajo el cursor antes de soltarla.
  dragTemplate:null as NodeTemplate|null
});

export function setTheme(theme:Theme){
  viewStore.set({theme});
  try{localStorage.setItem(THEME_KEY,theme);}catch{/* la preferencia vale para esta sesión */}
}
// El tema se aplica al documento entero para que también cambien el fondo de página y los controles nativos.
const applyTheme=()=>{if(typeof document!=='undefined')document.documentElement.dataset.theme=viewStore.get().theme;};
applyTheme();viewStore.subscribe(applyTheme);

export const clampZoom=(zoom:number)=>Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoom));
/** Zoom que mantiene fijo el punto de pantalla (sx, sy), medido desde la esquina del canvas. */
export function zoomAt(sx:number,sy:number,zoom:number){
  const {camera}=viewStore.get(),next=clampZoom(zoom);
  trackThrottled('zoom',{});
  viewStore.set({camera:{zoom:next,x:camera.x+sx/camera.zoom-sx/next,y:camera.y+sy/camera.zoom-sy/next}});
}
export function zoomBy(factor:number){const {camera,viewport}=viewStore.get();zoomAt(viewport.width/2,viewport.height/2,camera.zoom*factor);}
export function cameraFor(bounds:Rect,viewport:{width:number;height:number},padding=56,maxZoom=1.25):Camera{
  const zoom=clampZoom(Math.min(maxZoom,(viewport.width-padding*2)/bounds.width,(viewport.height-padding*2)/bounds.height));
  return {zoom,x:bounds.x+bounds.width/2-viewport.width/zoom/2,y:bounds.y+bounds.height/2-viewport.height/zoom/2};
}
/**
 * Encuadra los límites dados sin bajar del zoom legible. Devuelve false si a ese zoom no entra todo:
 * en ese caso la vista arranca en la esquina superior izquierda del contenido.
 */
export function fit(bounds:Rect|null):boolean{
  if(!bounds){viewStore.set({camera:{x:-40,y:-20,zoom:1}});return true;}
  const {viewport}=viewStore.get(),camera=cameraFor(bounds,viewport);
  if(camera.zoom>=LEGIBLE_ZOOM){viewStore.set({camera});return true;}
  viewStore.set({camera:{zoom:LEGIBLE_ZOOM,x:bounds.x-24/LEGIBLE_ZOOM,y:bounds.y-24/LEGIBLE_ZOOM}});
  return false;
}
export const snap=(value:number)=>viewStore.get().snap?Math.round(value/GRID)*GRID:Math.round(value);

const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
let cameraTween=0;
/** Lleva la cámara a `goal` con un viaje corto; con reduced-motion salta directo. */
export function moveCamera(goal:Camera,ms=450){
  cancelAnimationFrame(cameraTween);
  const from=viewStore.get().camera;
  if(reducedMotion()){viewStore.set({camera:goal});return;}
  const started=performance.now(),ease=(t:number)=>1-Math.pow(1-t,3);
  const tick=(now:number)=>{
    const t=Math.min(1,(now-started)/ms),k=ease(t);
    viewStore.set({camera:{x:from.x+(goal.x-from.x)*k,y:from.y+(goal.y-from.y)*k,zoom:from.zoom+(goal.zoom-from.zoom)*k}});
    if(t<1)cameraTween=requestAnimationFrame(tick);
  };
  cameraTween=requestAnimationFrame(tick);
}
let flashTimer:ReturnType<typeof setTimeout>|undefined;
/**
 * Enfoca un elemento y lo resalta unos segundos con el color de la gravedad. Un grupo se enfoca por sus miembros.
 * Devuelve false si el elemento ya no existe.
 */
export function focusOn(doc:DiagramDocument,id:string,tone:Flash['tone']='info'){
  const inGroup=(groupId:string|null):boolean=>groupId===id||Boolean(groupId&&inGroup(doc.groups.find(g=>g.id===groupId)?.parentId??null));
  const ids=doc.groups.some(g=>g.id===id)?doc.nodes.filter(n=>inGroup(n.groupId)).map(n=>n.id):[id];
  const bounds=documentBounds(doc,ids);
  if(!bounds)return false;
  // Margen generoso: el elemento se ve con su contexto, no aislado.
  const {viewport}=viewStore.get(),pad=Math.max(80,Math.min(viewport.width,viewport.height)*.18);
  moveCamera(cameraFor(bounds,viewport,pad,1.25));
  clearTimeout(flashTimer);
  viewStore.set({flash:{ids,tone,key:Date.now()}});
  flashTimer=setTimeout(()=>viewStore.set({flash:null}),2600);
  return true;
}
