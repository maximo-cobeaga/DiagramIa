import {nodeRect,unionRects,validateLibrary,describeError,type DiagramComponent,type DiagramLibrary} from '@diagramia/core';
import {createStore} from '../store/createStore';
import {documentStore,newId,notify} from '../store/documentStore';
import {selectionStore} from '../store/selectionStore';
import {ownElementsLimit} from '../store/accountStore';
import {t} from '../i18n';

const STORAGE='diagramia.library';
const emptyLibrary=():DiagramLibrary=>({libraryVersion:'1.0.0',id:'mi-biblioteca',label:t('Mis elementos'),components:[]});
function loadLibrary():DiagramLibrary{
  try{const raw=localStorage.getItem(STORAGE);return raw?validateLibrary(JSON.parse(raw)):emptyLibrary();}catch{return emptyLibrary();}
}

/** Biblioteca propia del usuario, compartida entre la pestaña Biblioteca y Propiedades. Vive en este navegador. */
export const ownLibrary=createStore({library:loadLibrary()});

export function storeLibrary(next:DiagramLibrary){
  ownLibrary.set({library:next});
  try{localStorage.setItem(STORAGE,JSON.stringify(next));}catch{notify(t('La biblioteca no se pudo guardar en este navegador. Exportala para conservarla.'),'error');}
}

/**
 * Guarda los nodos seleccionados como un elemento propio: con sus formas, iconos, estilos y las conexiones entre ellos,
 * superpuestos o no. Sin zonas, grupos ni imágenes del documento de origen, con coordenadas desde su esquina.
 */
export function saveSelection(name?:string):DiagramComponent|null{
  const {doc}=documentStore.get(),{ids}=selectionStore.get(),{library}=ownLibrary.get();
  const nodes=doc.nodes.filter(n=>ids.includes(n.id)),inside=new Set(nodes.map(n=>n.id));
  if(!nodes.length){notify(t('Seleccioná los elementos que forman tu elemento propio.'),'warn');return null;}
  const limit=ownElementsLimit();
  if(library.components.length>=limit){notify(t('Tu plan permite {0} elementos propios. Con Pro podés guardar hasta 200.',limit),'warn');return null;}
  const box=unionRects(nodes.map(nodeRect))!;
  const label=(name?.trim()||(nodes.length===1?nodes[0].label:`${nodes[0].label} + ${nodes.length-1}`)).slice(0,200);
  const component:DiagramComponent={id:newId('element'),label,category:'custom',description:t('Guardado desde «{0}».',doc.title),zones:[],
    nodes:nodes.map(n=>({...n,zoneId:null,groupId:null,assetId:null,position:{x:n.position.x-box.x,y:n.position.y-box.y}})),
    edges:doc.edges.filter(e=>inside.has(e.from)&&inside.has(e.to)).map(({points:_route,...e})=>e)};
  try{storeLibrary(validateLibrary({...library,components:[...library.components,component]}));}
  catch(e){notify(describeError(e),'error');return null;}
  notify(t('«{0}» quedó en Biblioteca → Mis elementos.',component.label));
  return component;
}
