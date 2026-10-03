import type {DiagramAnimation,DiagramDocument,DiagramStep} from './schema.js';
import {documentBounds,inflate,type Rect} from './geometry.js';

/** Duración del viaje de cámara hacia cada paso, en ms. */
export const TRANSITION_MS={smooth:900,slow:1800,cut:0} as const;
// Parte del diagrama que se ve, como mínimo, alrededor de lo resaltado en cada nivel de enfoque.
const CONTEXT={close:0,medium:.3,wide:.5,auto:.5} as const;

/** Encuadre centrado en `box` que no baja de `share` del diagrama en cada eje, ni sale de él. */
function around(box:Rect,all:Rect,share:number):Rect{
  const width=Math.min(all.width,Math.max(box.width,all.width*share)),height=Math.min(all.height,Math.max(box.height,all.height*share));
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  return {x:Math.max(all.x,Math.min(all.x+all.width-width,cx-width/2)),y:Math.max(all.y,Math.min(all.y+all.height-height,cy-height/2)),width,height};
}

/**
 * Encuadre al que va la cámara en el paso `index` y cuánto tarda en llegar: guía la vista hacia lo que el paso resalta.
 * Manda un frame (de una pista de cámara o del paso); si no hay, el enfoque del paso decide la distancia:
 * `close` lo resaltado casi solo, `medium` y `wide` con más contexto, `overview` todo el diagrama y `stay` lo del paso anterior.
 * Lo resaltado incluye las pistas de resaltado del paso. Sin nada resaltado, se ve todo el diagrama.
 */
export function stepCamera(doc:DiagramDocument,animation:DiagramAnimation,index:number):{bounds:Rect|null;transitionMs:number}{
  const all=documentBounds(doc,[...doc.nodes,...doc.edges,...doc.drawings,...doc.zones].map(x=>x.id));
  const step=animation.steps[Math.max(0,Math.min(animation.steps.length-1,index))]!;
  const target=(i:number):Rect|null=>{
    const s=animation.steps[i];if(!s)return all;
    const clips=animation.tracks.flatMap(track=>track.clips.filter(clip=>clip.stepId===s.id).map(clip=>({track,clip})));
    const frameId=clips.filter(x=>x.track.kind==='camera'&&x.clip.frameId).at(-1)?.clip.frameId??s.frameId;
    const frame=frameId?doc.frames.find(f=>f.id===frameId):undefined;
    if(frame)return frame.bounds;
    // «Mantener» toma el encuadre del paso anterior; el primer paso parte de todo el diagrama.
    if(s.focus==='stay')return i>0?target(i-1):all;
    if(s.focus==='overview')return all;
    const ids=[...s.nodeIds,...s.edgeIds,...clips.filter(x=>x.track.kind==='highlight').flatMap(x=>[...x.clip.nodeIds,...x.clip.edgeIds])];
    const box=ids.length?documentBounds(doc,ids):null;
    if(!box)return all;
    if(!all)return inflate(box,24);
    // De cerca, un margen fijo para que lo resaltado no toque los bordes; con contexto, una parte del diagrama alrededor.
    return s.focus==='close'?inflate(box,24):around(inflate(box,24),all,CONTEXT[s.focus]);
  };
  return {bounds:target(animation.steps.indexOf(step)),transitionMs:TRANSITION_MS[step.transition]};
}

/**
 * Enfoque razonable para un paso armado automáticamente (recorridos y explicaciones): pocos elementos se ven con su
 * contexto, un grupo grande de cerca (su caja ya es amplia) y casi todo el diagrama, completo.
 */
export function autoFocus(doc:DiagramDocument,nodeIds:string[],edgeIds:string[]):DiagramStep['focus']{
  const nodes=new Set(nodeIds);for(const e of doc.edges)if(edgeIds.includes(e.id)){nodes.add(e.from);nodes.add(e.to);}
  if(doc.nodes.length&&nodes.size>=doc.nodes.length*.6)return 'overview';
  return nodes.size<=3?'medium':'close';
}
