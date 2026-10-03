import {useEffect} from 'react';
import {animationDuration,resolveScenario,stepStarts,sampleAnimation,type DiagramDocument} from '@diagramia/core';
import {createStore,useStore} from './createStore';
import {documentStore} from './documentStore';
import {viewStore} from './viewStore';

// El playhead es estado de interfaz: undo/redo y las ediciones no lo reinician.
export const playbackStore=createStore({animationId:'',scenarioId:'',time:0,playing:false,loop:false});

/** La animación tal como está guardada, con todos sus pasos y escenarios. */
export const rawAnimation=(d:DiagramDocument,animationId:string)=>d.animations.find(a=>a.id===animationId)??d.animations[0];
/** La animación que se reproduce: sólo los pasos del escenario elegido. */
export function currentAnimation(d:DiagramDocument,animationId:string){
  const animation=rawAnimation(d,animationId);
  return animation&&resolveScenario(animation,playbackStore.get().scenarioId);
}
export function seek(time:number){playbackStore.set({time:Math.max(0,time),playing:false});}
export function seekStep(d:DiagramDocument,index:number){
  const animation=currentAnimation(d,playbackStore.get().animationId);if(!animation)return;
  const starts=stepStarts(animation);
  seek(starts[Math.max(0,Math.min(starts.length-1,index))]);
}
export function stepBy(d:DiagramDocument,delta:number){
  const {animationId,time}=playbackStore.get(),animation=currentAnimation(d,animationId);if(!animation)return;
  seekStep(d,sampleAnimation(animation,time).index+delta);
}
export function togglePlay(d:DiagramDocument){
  const {animationId,time,playing}=playbackStore.get(),animation=currentAnimation(d,animationId);if(!animation)return;
  playbackStore.set({playing:!playing,time:!playing&&time>=animationDuration(animation)?0:time});
}

/** Reloj de reproducción. Se monta una sola vez; avanza el tiempo sin tocar el documento. */
export function usePlaybackClock(){
  // Mientras se presenta el recorrido de una explicación, el reloj mide esa copia y no el documento.
  const {playing,animationId,loop,scenarioId}=useStore(playbackStore),{doc:saved}=useStore(documentStore),{tour}=useStore(viewStore),doc=tour?.doc??saved;
  const animation=currentAnimation(doc,animationId),duration=animation?animationDuration(animation):0;
  useEffect(()=>{
    if(!playing||!duration)return;
    let last:number|undefined,frame=requestAnimationFrame(function tick(stamp){
      if(last!==undefined){
        const next=playbackStore.get().time+stamp-last;
        if(next>=duration)playbackStore.set(loop?{time:next%duration}:{time:duration,playing:false});else playbackStore.set({time:next});
      }
      last=stamp;if(playbackStore.get().playing)frame=requestAnimationFrame(tick);
    });
    return()=>cancelAnimationFrame(frame);
  },[playing,duration,loop,scenarioId]);
  // Si la animación se acortó o desapareció, el playhead se ajusta a un valor válido.
  useEffect(()=>{const {time}=playbackStore.get();if(time>duration)playbackStore.set({time:duration,playing:false});},[duration]);
}
