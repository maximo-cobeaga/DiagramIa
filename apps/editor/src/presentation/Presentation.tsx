import {useEffect,useRef,useState} from 'react';
import {documentBounds,sampleAnimation,sampleTrackEffects,statesAt,type Rect} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore} from '../store/documentStore';
import {currentAnimation,playbackStore,rawAnimation,seek,seekStep,stepBy,togglePlay} from '../store/playbackStore';
import {cameraFor,viewStore,type Camera} from '../store/viewStore';
import {DiagramLayer} from '../canvas/DiagramLayer';

const MOVE_MS=700;
const ease=(t:number)=>1-Math.pow(1-t,4);
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Modo presentación. Usa su propia cámara y sólo lee el documento: entrar, navegar y salir no generan
 * acciones ni cambian la vista del editor. Sin animaciones, los frames funcionan como diapositivas.
 */
export function Presentation(){
  const {doc}=useStore(documentStore),{animationId,time,playing,scenarioId}=useStore(playbackStore),scenarios=rawAnimation(doc,animationId)?.scenarios??[];
  const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight}),[camera,setCamera]=useState<Camera|null>(null),[frameIndex,setFrameIndex]=useState(0);
  const rootRef=useRef<HTMLDivElement>(null),stageRef=useRef<HTMLDivElement>(null),cameraRef=useRef<Camera|null>(null);
  const animation=currentAnimation(doc,animationId),sampled=animation?sampleAnimation(animation,time):null,effects=animation?sampleTrackEffects(animation,time):null;
  const slides=animation?animation.steps.length:doc.frames.length,index=animation?sampled!.index:Math.min(frameIndex,Math.max(0,doc.frames.length-1));
  const focusId=animation?effects?.frameId??sampled!.step.frameId:doc.frames[index]?.id??null;
  const everything=documentBounds(doc,[...doc.nodes,...doc.edges,...doc.zones].map(x=>x.id)),target:Rect=doc.frames.find(f=>f.id===focusId)?.bounds??everything??{x:0,y:0,width:800,height:500};
  const key=`${target.x},${target.y},${target.width},${target.height},${viewport.width},${viewport.height}`;

  useEffect(()=>{
    const stage=stageRef.current!,observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width&&height)setViewport({width,height});});
    observer.observe(stage);rootRef.current?.focus();
    return()=>observer.disconnect();
  },[]);
  // La cámara viaja hacia el encuadre del paso; con reduced-motion salta sin animar.
  useEffect(()=>{
    const goal=cameraFor(target,viewport,64,2.5),from=cameraRef.current;
    const apply=(next:Camera)=>{cameraRef.current=next;setCamera(next);};
    if(!from||reducedMotion()){apply(goal);return;}
    let frame=0;const started=performance.now();
    const tick=(now:number)=>{
      const t=Math.min(1,(now-started)/MOVE_MS),k=ease(t);
      apply({x:from.x+(goal.x-from.x)*k,y:from.y+(goal.y-from.y)*k,zoom:from.zoom+(goal.zoom-from.zoom)*k});
      if(t<1)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  // `key` resume el encuadre y el viewport: recalcular en cada render reiniciaría el viaje de cámara.
  },[key]);

  const exit=()=>{playbackStore.set({playing:false});if(document.fullscreenElement)void document.exitFullscreen();viewStore.set({presenting:false});};
  const go=(delta:number)=>animation?stepBy(doc,delta):setFrameIndex(i=>Math.max(0,Math.min(doc.frames.length-1,i+delta)));
  const restart=()=>animation?seek(0):setFrameIndex(0);
  function keys(e:React.KeyboardEvent){
    const handled:Record<string,()=>void>={ArrowRight:()=>go(1),PageDown:()=>go(1),ArrowLeft:()=>go(-1),PageUp:()=>go(-1),Home:restart,Escape:exit,k:()=>togglePlay(doc),K:()=>togglePlay(doc)};
    // Espacio sobre un botón debe activar ese botón, no además alternar la reproducción.
    if(e.key===' '&&!(e.target instanceof HTMLButtonElement))handled[' ']=()=>togglePlay(doc);
    const run=handled[e.key];if(run){e.preventDefault();e.stopPropagation();run();}
  }
  const showing=sampled&&time>0,caption=animation?[sampled!.step.caption,...(effects?.captions??[])].filter(Boolean).join(' · '):doc.frames[index]?.label??'';
  return <div className="presentation" role="dialog" aria-modal="true" aria-label={`Presentación: ${doc.title}`} tabIndex={-1} ref={rootRef} onKeyDown={keys}>
    <div className="presentation-stage" ref={stageRef}>
      {camera&&<svg viewBox={`${camera.x} ${camera.y} ${viewport.width/camera.zoom} ${viewport.height/camera.zoom}`} role="img" aria-label={caption||doc.title}>
        <DiagramLayer doc={doc} showFrames={false} states={showing?statesAt(animation!,sampled.index):undefined} activeNodes={showing?new Set([...sampled.step.nodeIds,...(effects?.nodeIds??[])]):undefined} activeEdges={showing?new Set([...sampled.step.edgeIds,...(effects?.edgeIds??[])]):undefined}
          failed={sampled?.step.tone==='failure'} progress={showing?sampled.progress:null}/>
      </svg>}
    </div>
    <div className="presentation-bar">
      <p className="presentation-caption" aria-live="polite">
        <span className="mono">{slides?`${index+1} / ${slides}`:doc.title}{sampled?.step.tone==='failure'?' · FALLA':''}</span>
        {caption||(slides?'':'Sin animaciones ni frames: se muestra el diagrama completo.')}
      </p>
      <div className="transport">
        {scenarios.length>0&&<select aria-label="Escenario" value={scenarioId} onChange={e=>playbackStore.set({scenarioId:e.target.value,time:0,playing:false})}><option value="">Todos los pasos</option>{scenarios.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>}
        <button disabled={!slides||index===0} onClick={()=>go(-1)}>← Anterior</button>
        {animation&&<button className="primary" onClick={()=>togglePlay(doc)}>{playing?'Pausar':'Reproducir'}</button>}
        <button disabled={!slides||index>=slides-1} onClick={()=>go(1)}>Siguiente →</button>
        <button disabled={!slides} onClick={restart}>Reiniciar</button>
        {animation&&<button onClick={()=>seekStep(doc,index)} title="Vuelve al inicio del paso actual">Repetir paso</button>}
        {document.fullscreenEnabled&&<button onClick={()=>void(document.fullscreenElement?document.exitFullscreen():rootRef.current?.requestFullscreen())}>Pantalla completa</button>}
        <button onClick={exit}>Salir (Esc)</button>
      </div>
    </div>
  </div>;
}
