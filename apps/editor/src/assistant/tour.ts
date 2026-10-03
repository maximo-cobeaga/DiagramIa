import {autoFocus,previewBatch,type ActionInput,type DiagramDocument} from '@diagramia/core';
import {commit,documentStore,newId,notify} from '../store/documentStore';
import {playbackStore} from '../store/playbackStore';
import {viewStore} from '../store/viewStore';

export type TourStep={caption:string;nodeIds:string[];edgeIds:string[]};

/** Tiempo de lectura de un paso: alcanza para leer la frase y ver el resaltado, sin que el recorrido se arrastre. */
const durationOf=(caption:string)=>Math.max(2600,Math.min(7000,1600+caption.length*55));

/**
 * El recorrido de una explicación como animación del documento. Se vuelve a filtrar contra el documento actual:
 * si el usuario borró un elemento después de la respuesta, ese paso pierde la referencia y, vacío, se omite.
 */
export function tourAction(doc:DiagramDocument,steps:TourStep[],label:string):Extract<ActionInput,{type:'CREATE_ANIMATION'}>|null{
  const nodes=new Set(doc.nodes.map(n=>n.id)),edges=new Set(doc.edges.map(e=>e.id));
  const kept=steps.map(step=>({...step,nodeIds:step.nodeIds.filter(id=>nodes.has(id)),edgeIds:step.edgeIds.filter(id=>edges.has(id))})).filter(step=>step.nodeIds.length||step.edgeIds.length);
  if(kept.length<2)return null;
  return {type:'CREATE_ANIMATION',animation:{id:newId('tour'),label:label.slice(0,200),scenarios:[],tracks:[],
    steps:kept.map((step,i)=>({id:newId('step'),caption:step.caption.slice(0,500),durationMs:durationOf(step.caption),nodeIds:step.nodeIds,edgeIds:step.edgeIds,tone:'normal' as const,frameId:null,scenarioIds:[],states:[],
      focus:autoFocus(doc,step.nodeIds,step.edgeIds),transition:i===0?'slow' as const:'smooth' as const}))}};
}

/**
 * Reproduce el recorrido en modo presentación sobre una copia del documento: ver una explicación no la guarda
 * ni crea historial. Al salir, la presentación vuelve a la animación que estaba elegida.
 */
export function playTour(steps:TourStep[],label:string){
  const {doc}=documentStore.get(),action=tourAction(doc,steps,label);
  if(!action){notify('Los elementos de esta explicación ya no están en el diagrama.','warn');return false;}
  const preview=previewBatch(doc,{id:newId('tour-preview'),baseRevision:doc.revision,actions:[action]}).document;
  viewStore.set({tour:{doc:preview,previousAnimationId:playbackStore.get().animationId},presenting:true});
  playbackStore.set({animationId:action.animation.id,scenarioId:'',time:0,playing:true});
  return true;
}

/** Guarda el recorrido como una animación más: queda editable en la línea de tiempo y se puede presentar después. */
export function saveTour(steps:TourStep[],label:string){
  const {doc}=documentStore.get(),action=tourAction(doc,steps,label);
  if(!action){notify('Los elementos de esta explicación ya no están en el diagrama.','warn');return false;}
  const saved=commit({id:newId('ui'),baseRevision:doc.revision,actions:[action]},'Explicación guardada como animación','ai');
  if(saved)playbackStore.set({animationId:action.animation.id,scenarioId:'',time:0,playing:false});
  return saved;
}
