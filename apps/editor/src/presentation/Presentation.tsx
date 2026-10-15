import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {documentBounds,sampleAnimation,sampleTrackEffects,statesAt,stepCamera,TRANSITION_MS,type Rect} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore} from '../store/documentStore';
import {currentAnimation,playbackStore,rawAnimation,seek,seekStep,stepBy,togglePlay} from '../store/playbackStore';
import {cameraAt,cameraFor,easeCamera,viewStore,type Camera} from '../store/viewStore';
import {track} from '../telemetry';
import {DiagramLayer} from '../canvas/DiagramLayer';
import {t} from '../i18n';

const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Modo presentación. Usa su propia cámara y sólo lee el documento: entrar, navegar y salir no generan
 * acciones ni cambian la vista del editor. Sin animaciones, los frames funcionan como diapositivas.
 * Con `shared` es la página de un enlace compartido (ADR 106): no hay editor al que volver y arriba va lo que se le pase.
 */
export function Presentation({shared}:{shared?:ReactNode}={}){
  const {doc:saved}=useStore(documentStore),{tour}=useStore(viewStore),doc=tour?.doc??saved,{animationId,time,playing,scenarioId,cue}=useStore(playbackStore),scenarios=rawAnimation(doc,animationId)?.scenarios??[];
  const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight}),[camera,setCamera]=useState<Camera|null>(null),[frameIndex,setFrameIndex]=useState(0);
  const rootRef=useRef<HTMLDivElement>(null),stageRef=useRef<HTMLDivElement>(null),cameraRef=useRef<Camera|null>(null);
  const animation=currentAnimation(doc,animationId),sampled=animation?sampleAnimation(animation,time):null,effects=animation?sampleTrackEffects(animation,time):null;
  const slides=animation?animation.steps.length:doc.frames.length,index=animation?sampled!.index:Math.min(frameIndex,Math.max(0,doc.frames.length-1));
  const everything=documentBounds(doc,[...doc.nodes,...doc.edges,...doc.drawings,...doc.zones].map(x=>x.id));
  const showing=sampled;
  // Con una animación en curso, la cámara sigue el enfoque de cada paso (core: stepCamera); sin animación, los frames son diapositivas.
  const shot=useMemo(()=>animation&&sampled?stepCamera(doc,animation,sampled.index):{bounds:doc.frames[index]?.bounds??null,transitionMs:TRANSITION_MS.smooth},[doc,animationId,scenarioId,sampled?.index,index]);
  const target:Rect=shot.bounds??everything??{x:0,y:0,width:800,height:500};
  const key=`${animationId}/${scenarioId}/${index}/${shot.transitionMs}/${target.x},${target.y},${target.width},${target.height},${viewport.width},${viewport.height}`;
  const lastCamera=useRef({key:'',cue:-1});

  useEffect(()=>{
    const previous=lastCamera.current;lastCamera.current={key,cue};
    if(key===previous.key&&cue===previous.cue&&!playing)return;
    const stage=stageRef.current!,observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width&&height)setViewport({width,height});});
    observer.observe(stage);rootRef.current?.focus();
    if(!shared)track('presentation_started',{steps:slides});
    return()=>observer.disconnect();
  },[]);
  // La cámara viaja hacia el encuadre del paso; con reduced-motion salta sin animar.
  useEffect(()=>{
    const goal=cameraFor(target,viewport,64,2.5),from=cameraRef.current;
    const apply=(next:Camera)=>{cameraRef.current=next;setCamera(next);};
    if(!from||reducedMotion()||!shot.transitionMs){apply(goal);return;}
    let frame=0;const started=performance.now();
    const tick=(now:number)=>{
      const t=Math.min(1,(now-started)/shot.transitionMs);
      apply(t<1?cameraAt(from,goal,viewport,easeCamera(t)):goal);
      if(t<1)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  // `key` resume el encuadre y el viewport: recalcular en cada render reiniciaría el viaje de cámara.
  },[key,cue,playing]);

  const exit=()=>{
    playbackStore.set({playing:false});if(document.fullscreenElement)void document.exitFullscreen();
    // Un recorrido no queda en el documento: al salir se descarta y vuelve la animación que estaba elegida.
    if(tour)playbackStore.set({animationId:tour.previousAnimationId,time:0});
    viewStore.set({presenting:false,tour:null});
  };
  const go=(delta:number)=>animation?stepBy(doc,delta):setFrameIndex(i=>Math.max(0,Math.min(doc.frames.length-1,i+delta)));
  const restart=()=>animation?seek(0):setFrameIndex(0);
  function keys(e:React.KeyboardEvent){
    const handled:Record<string,()=>void>={ArrowRight:()=>go(1),PageDown:()=>go(1),ArrowLeft:()=>go(-1),PageUp:()=>go(-1),Home:restart,...(shared?{}:{Escape:exit}),k:()=>togglePlay(doc),K:()=>togglePlay(doc)};
    // Espacio sobre un botón debe activar ese botón, no además alternar la reproducción.
    if(e.key===' '&&!(e.target instanceof HTMLButtonElement))handled[' ']=()=>togglePlay(doc);
    const run=handled[e.key];if(run){e.preventDefault();e.stopPropagation();run();}
  }
  const caption=animation?[sampled!.step.caption,...(effects?.captions??[])].filter(Boolean).join(' · '):doc.frames[index]?.label??'';
  return <div className={'presentation'+(shared?' shared-view':'')} role={shared?'main':'dialog'} aria-modal={shared?undefined:true} aria-label={t('Presentación: {0}',doc.title)} tabIndex={-1} ref={rootRef} onKeyDown={keys}>
    {shared}
    <div className="presentation-stage" ref={stageRef}>
      {camera&&<svg viewBox={`${camera.x} ${camera.y} ${viewport.width/camera.zoom} ${viewport.height/camera.zoom}`} role="img" aria-label={caption||doc.title}>
        <DiagramLayer doc={doc} showFrames={false} states={showing?statesAt(animation!,sampled.index):undefined} activeNodes={showing?new Set([...sampled.step.nodeIds,...(effects?.nodeIds??[])]):undefined} activeEdges={showing?new Set([...sampled.step.edgeIds,...(effects?.edgeIds??[])]):undefined}
          failed={sampled?.step.tone==='failure'} progress={showing?sampled.progress:null}/>
      </svg>}
    </div>
    <div className="presentation-bar">
      <p className="presentation-caption" aria-live="polite">
        <span className="mono">{slides?`${index+1} / ${slides}`:doc.title}{sampled?.step.tone==='failure'?t(' · FALLA'):''}</span>
        {caption||(slides?'':t('Sin animaciones ni frames: se muestra el diagrama completo.'))}
      </p>
      <div className="transport">
        {scenarios.length>0&&<select aria-label={t('Escenario')} value={scenarioId} onChange={e=>playbackStore.set({scenarioId:e.target.value,time:0,playing:false})}><option value="">{t('Todos los pasos')}</option>{scenarios.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select>}
        <button disabled={!slides||index===0} onClick={()=>go(-1)}>{t('← Anterior')}</button>
        {animation&&<button className="primary" onClick={()=>togglePlay(doc)}>{playing?t('Pausar'):t('Reproducir')}</button>}
        <button disabled={!slides||index>=slides-1} onClick={()=>go(1)}>{t('Siguiente →')}</button>
        <button disabled={!slides} onClick={restart}>{t('Reiniciar')}</button>
        {animation&&<button onClick={()=>seekStep(doc,index)} title={t('Vuelve al inicio del paso actual')}>{t('Repetir paso')}</button>}
        {document.fullscreenEnabled&&<button onClick={()=>void(document.fullscreenElement?document.exitFullscreen():rootRef.current?.requestFullscreen())}>{t('Pantalla completa')}</button>}
        {!shared&&<button onClick={exit}>{t('Salir (Esc)')}</button>}
      </div>
    </div>
  </div>;
}
