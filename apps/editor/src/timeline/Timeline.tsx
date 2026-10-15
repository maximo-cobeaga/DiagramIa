import {useEffect,useRef,useState} from 'react';
import {animationDuration,sampleAnimation,sampleTrackEffects,type ActionInput,type DiagramAnimation,type DiagramDocument,type DiagramStep} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,newId,notify,transact} from '../store/documentStore';
import {currentAnimation,playbackStore,rawAnimation,seek,seekStep,stepBy,togglePlay} from '../store/playbackStore';
import {select,selectionStore} from '../store/selectionStore';
import {viewStore} from '../store/viewStore';
import {NumberField,SelectField,TextField} from '../ui';
import {TracksEditor} from './TracksEditor';
import {ResizeHandle} from './ResizeHandle';
import {PRESETS,buildPreset,type PresetKind} from './presets';
import {track} from '../telemetry';
import {t} from '../i18n';

const FOCUS_OPTIONS=[['auto',t('Automático')],['close',t('De cerca')],['medium',t('Con contexto')],['wide',t('Amplio')],['overview',t('Todo el diagrama')],['stay',t('Mantener la vista')]] as const;
const TRANSITION_OPTIONS=[['smooth',t('Suave')],['slow',t('Lenta')],['cut',t('Corte')]] as const;
const clock=(ms:number)=>`${Math.floor(ms/60000)}:${(ms%60000/1000).toFixed(1).padStart(4,'0')}`;
const fresh=()=>documentStore.get().doc;
const blank=(extra:Partial<DiagramStep>&Pick<DiagramStep,'caption'|'nodeIds'|'edgeIds'>):DiagramStep=>({id:newId('step'),durationMs:1800,tone:'normal',frameId:null,scenarioIds:[],states:[],focus:'auto',transition:'smooth',...extra});

/** Crea una animación con el estilo elegido (o vacía, con un paso) y la deja lista para reproducir. */
function createAnimation(doc:DiagramDocument,ids:string[],kind:PresetKind|'blank'){
  const id=newId('anim');
  let steps:DiagramStep[],name=t('Animación');
  if(kind==='blank'){
    steps=[blank({caption:t('Primer paso'),nodeIds:doc.nodes.filter(n=>ids.includes(n.id)).map(n=>n.id),edgeIds:doc.edges.filter(e=>ids.includes(e.id)).map(e=>e.id)})];
  }else{
    const built=buildPreset(kind,doc,ids);
    if(!built.steps.length){notify(built.reason??t('No se pudo crear la animación.'),'warn');return false;}
    steps=built.steps;name=PRESETS.find(p=>p.kind===kind)!.name;
  }
  if(transact([{type:'CREATE_ANIMATION',animation:{id,label:`${name} ${doc.animations.length+1}`,steps}}],kind==='blank'?t('Animación creada'):t('Animación creada con {0} pasos',steps.length))){
    track('animation_created',{origin:kind,steps:steps.length});
    playbackStore.set({animationId:id,scenarioId:'',time:0,playing:false});viewStore.set({timelineOpen:true});return true;
  }
  return false;
}

/** Galería de estilos: la persona elige cómo quiere contar su diagrama y la animación aparece lista, editable después. */
function StylePicker({doc,ids,onDone,onCancel}:{doc:DiagramDocument;ids:string[];onDone:()=>void;onCancel?:()=>void}){
  const scoped=doc.nodes.filter(n=>ids.includes(n.id)).length>1;
  return <section className="style-picker" aria-label={t('Elegí cómo animar tu diagrama')}>
    <div className="style-picker-head"><div><strong>{t('¿Cómo querés contarlo?')}</strong><p>{t('Elegí un estilo y se arma solo. Después podés cambiar los textos y el orden.')}{scoped?t(' Se usa lo que tenés seleccionado.'):''}</p></div>
      {onCancel&&<button className="quiet" onClick={onCancel}>{t('Cerrar')}</button>}</div>
    <div className="style-grid">{PRESETS.map(preset=><button key={preset.kind} className="style-card" onClick={()=>{if(createAnimation(doc,ids,preset.kind))onDone();}}>
      <strong>{preset.title}</strong><span>{preset.description}</span><em className="mono" aria-hidden="true">{preset.sketch}</em></button>)}</div>
    <button className="quiet style-blank" onClick={()=>{if(createAnimation(doc,ids,'blank'))onDone();}}>{t('Empezar en blanco, paso a paso')}</button>
  </section>;
}

type EditorProps={doc:DiagramDocument;raw:DiagramAnimation;animation:DiagramAnimation;step:DiagramStep;index:number;selection:string[];scenarioId:string};
function StepEditor({doc,raw,animation,step,index,selection,scenarioId}:EditorProps){
  const [stateLabel,setStateLabel]=useState(''),[stateTone,setStateTone]=useState<'normal'|'failure'>('normal');
  const act=(action:ActionInput,label:string,nextIndex=index)=>{if(transact([action],label))seekStep(fresh(),nextIndex);};
  const update=(changes:Extract<ActionInput,{type:'UPDATE_STEP'}>['changes'],label:string)=>act({type:'UPDATE_STEP',animationId:raw.id,stepId:step.id,changes},label);
  const nodeIds=doc.nodes.filter(n=>selection.includes(n.id)).map(n=>n.id),edgeIds=doc.edges.filter(e=>selection.includes(e.id)).map(e=>e.id);
  // La vista puede mostrar sólo una rama: las posiciones se traducen al orden completo de la animación.
  const last=animation.steps.length-1,fullIndex=(resolved:number)=>raw.steps.findIndex(s=>s.id===animation.steps[resolved].id);
  const target=nodeIds.length===1?doc.nodes.find(n=>n.id===nodeIds[0])!:null,name=(id:string)=>doc.nodes.find(n=>n.id===id)?.label??id;
  return <div className="step-editor">
    <div className="step-fields simple">
      <TextField label={t('Qué se cuenta en el paso {0}',index+1)} value={step.caption} multiline allowEmpty maxLength={500} onCommit={caption=>update({caption},t('Texto del paso cambiado'))}/>
      <NumberField label={t('Duración (segundos)')} value={step.durationMs/1000} min={.1} max={30} step={.5} onCommit={seconds=>update({durationMs:Math.round(seconds*1000)},t('Duración cambiada'))}/>
    </div>
    <div className="step-actions simple-step-actions">
      <button disabled={!nodeIds.length&&!edgeIds.length} title={t('Elegí piezas en el lienzo y tocá para que este paso las resalte')} onClick={()=>update({nodeIds:nodeIds.slice(0,100),edgeIds:edgeIds.slice(0,100)},t('Elementos del paso reemplazados por la selección'))}>{t('Resaltar lo seleccionado')}</button>
      <button onClick={()=>act({type:'ADD_STEP',animationId:raw.id,index:fullIndex(index)+1,step:blank({caption:'',nodeIds,edgeIds,frameId:step.frameId,scenarioIds:scenarioId?[scenarioId]:step.scenarioIds})},t('Paso agregado'),index+1)}>{t('+ Paso nuevo')}</button>
      <button disabled={raw.steps.length===1} onClick={()=>act({type:'DELETE_STEP',animationId:raw.id,stepId:step.id},t('Paso eliminado'),Math.max(0,Math.min(index,last-1)))}>{t('Quitar paso')}</button>
    </div>
    <p className="inline-note">{t('Este paso resalta')} {step.nodeIds.length} {t('pieza(s) y')} {step.edgeIds.length} {t('conexión(es).')}</p>
    <details className="step-advanced"><summary>{t('Más opciones de este paso')}</summary>
    <div className="step-fields">
      <SelectField label={t('Hacia dónde mira la cámara')} value={step.focus} options={FOCUS_OPTIONS} onChange={focus=>update({focus},t('Enfoque cambiado'))}/>
      <SelectField label={t('Cómo llega la cámara')} value={step.transition} options={TRANSITION_OPTIONS} onChange={transition=>update({transition},t('Transición cambiada'))}/>
      <SelectField label={t('Tono')} value={step.tone} options={[['normal',t('Normal')],['failure',t('Falla')]] as const} onChange={tone=>update({tone},t('Tono cambiado'))}/>
      <SelectField label={t('Encuadre guardado (manda sobre la cámara)')} value={step.frameId??''} options={[['',t('Ninguno')],...doc.frames.map(f=>[f.id,f.label] as const)]} onChange={frameId=>update({frameId:frameId||null},t('Encuadre cambiado'))}/>
    </div>
    <div className="step-actions">
      <button onClick={()=>act({type:'ADD_STEP',animationId:raw.id,index:fullIndex(index)+1,step:{...step,id:newId('step')}},t('Paso duplicado'),index+1)}>{t('Duplicar')}</button>
      <button disabled={index===0} onClick={()=>act({type:'MOVE_STEP',animationId:raw.id,stepId:step.id,index:fullIndex(index-1)},t('Paso movido'),index-1)} aria-label={t('Mover paso antes')}>{t('← Mover antes')}</button>
      <button disabled={index===last} onClick={()=>act({type:'MOVE_STEP',animationId:raw.id,stepId:step.id,index:fullIndex(index+1)},t('Paso movido'),index+1)} aria-label={t('Mover paso después')}>{t('Mover después →')}</button>
      <button disabled={!step.nodeIds.length&&!step.edgeIds.length} onClick={()=>select([...step.nodeIds,...step.edgeIds])}>{t('Seleccionar sus elementos')}</button>
    </div>
    {raw.scenarios.length>0&&<fieldset className="choice row"><legend>{t('Versiones en las que ocurre este paso (ninguna marcada = todas)')}</legend>
      {raw.scenarios.map(s=><label className="check" key={s.id}><input type="checkbox" checked={step.scenarioIds.includes(s.id)} onChange={e=>update({scenarioIds:e.target.checked?[...step.scenarioIds,s.id]:step.scenarioIds.filter(id=>id!==s.id)},t('Escenarios del paso cambiados'))}/>{s.label}</label>)}
    </fieldset>}
    <fieldset className="choice row"><legend>{t('Etiquetas de estado que este paso deja en las piezas')}</legend>
      {step.states.map(state=><span className="chip" key={state.nodeId}>{name(state.nodeId)}: {state.tone==='failure'?'✕ ':''}{state.label}<button className="quiet" aria-label={t('Quitar estado de {0}',name(state.nodeId))} onClick={()=>update({states:step.states.filter(s=>s.nodeId!==state.nodeId)},t('Estado quitado'))}>×</button></span>)}
      <span className="state-adder">
        <input aria-label={t('Nuevo estado')} placeholder={target?t('Estado de {0}',target.label):t('Seleccioná una pieza')} value={stateLabel} maxLength={40} disabled={!target} onChange={e=>setStateLabel(e.target.value)}/>
        <select aria-label={t('Tono del estado')} value={stateTone} disabled={!target} onChange={e=>setStateTone(e.target.value as 'normal'|'failure')}><option value="normal">{t('Normal')}</option><option value="failure">{t('Falla')}</option></select>
        <button disabled={!target||!stateLabel.trim()} onClick={()=>{update({states:[...step.states.filter(s=>s.nodeId!==target!.id),{nodeId:target!.id,label:stateLabel.trim(),tone:stateTone}]},t('Estado asignado'));setStateLabel('');}}>{t('Asignar estado')}</button>
      </span>
    </fieldset>
    </details>
  </div>;
}

function Scenarios({raw}:{raw:DiagramAnimation}){
  return <fieldset className="choice"><legend>{t('Escenarios (ramas) de «')}{raw.label}»</legend>
    {raw.scenarios.length===0&&<p className="inline-note">{t('Sin escenarios, todos los pasos forman un único recorrido. Agregá uno para separar ramas: por ejemplo «aprobado» y «rechazado».')}</p>}
    {raw.scenarios.map(s=><div className="scenario-row" key={s.id}>
      <TextField label={t('Escenario · {0}',s.id)} value={s.label} maxLength={200} onCommit={label=>transact([{type:'UPDATE_SCENARIO',animationId:raw.id,scenarioId:s.id,changes:{label}}],t('Escenario renombrado'))}/>
      <button onClick={()=>{
        const exclusive=raw.steps.filter(step=>step.scenarioIds.length===1&&step.scenarioIds[0]===s.id).length;
        if(confirm(t('Se elimina el escenario «{0}»{1}. Podés deshacerlo.',s.label,exclusive?t(' y sus {0} paso(s) exclusivos',exclusive):''))&&transact([{type:'DELETE_SCENARIO',animationId:raw.id,scenarioId:s.id}],t('Escenario eliminado')))playbackStore.set({scenarioId:'',time:0,playing:false});
      }}>{t('Eliminar')}</button>
    </div>)}
    <button onClick={()=>{const id=newId('scenario');if(transact([{type:'ADD_SCENARIO',animationId:raw.id,scenario:{id,label:t('Escenario {0}',raw.scenarios.length+1)}}],t('Escenario agregado. Marcá en cada paso a qué escenarios pertenece.')))playbackStore.set({scenarioId:id,time:0,playing:false});}}>{t('Agregar escenario')}</button>
  </fieldset>;
}

export function Timeline(){
  const [tracksOpen,setTracksOpen]=useState(false),[picking,setPicking]=useState(false);
  const stepsRef=useRef<HTMLOListElement>(null);
  const {doc}=useStore(documentStore),{animationId,scenarioId,time,playing,loop,follow}=useStore(playbackStore),{ids}=useStore(selectionStore),{timelineOpen:savedOpen,timelineHeight,focusMode}=useStore(viewStore),timelineOpen=savedOpen&&!focusMode;
  const raw=rawAnimation(doc,animationId),animation=currentAnimation(doc,animationId),sampled=animation?sampleAnimation(animation,time):null,duration=animation?animationDuration(animation):0,effects=animation?sampleTrackEffects(animation,time):null;
  useEffect(()=>{
    const list=stepsRef.current,active=list?.querySelector<HTMLElement>('[aria-current="step"]');if(!list||!active)return;
    const box=list.getBoundingClientRect(),card=active.getBoundingClientRect();
    if(card.left<box.left)list.scrollLeft-=box.left-card.left+3;
    else if(card.right>box.right)list.scrollLeft+=card.right-box.right+3;
  },[sampled?.step.id,timelineOpen]);
  const togglePanel=()=>viewStore.set({timelineOpen:!timelineOpen});
  const addStep=()=>{
    if(!raw||!sampled)return;
    const step=blank({caption:t('Nuevo paso'),nodeIds:ids.filter(id=>doc.nodes.some(n=>n.id===id)),edgeIds:ids.filter(id=>doc.edges.some(e=>e.id===id)),scenarioIds:scenarioId?[scenarioId]:[]});
    if(transact([{type:'ADD_STEP',animationId:raw.id,step,index:raw.steps.findIndex(s=>s.id===sampled.step.id)+1}],t('Paso agregado')))seekStep(fresh(),sampled.index+1);
  };
  return <section className={'timeline'+(timelineOpen?' expanded':' collapsed')} aria-label={t('Timeline de animación')} style={timelineOpen?{height:timelineHeight}:undefined}>
    {timelineOpen&&<ResizeHandle height={timelineHeight}/>}
    <div className="timeline-bar">
      <div className="motion-summary"><span className="motion-icon" aria-hidden="true">▷</span><div>
        <strong>{raw?t('Dale movimiento'):t('Tus ideas, en movimiento')}</strong>
        <p className="caption" aria-live="polite">{sampled&&animation?<><span className="step-counter">{sampled.index+1}/{animation.steps.length}</span> {sampled.step.caption||t('Sin texto')}{effects?.captions.map((caption,i)=><span key={i}> · {caption}</span>)}</>:t('Mostrá tu diagrama paso a paso.')}</p>
      </div></div>
      {raw&&raw.scenarios.length>0&&<select aria-label={t('Recorrido')} value={raw.scenarios.some(s=>s.id===scenarioId)?scenarioId:''} onChange={e=>playbackStore.set({scenarioId:e.target.value,time:0,playing:false})}>
        <option value="">{t('Todos los pasos')}</option>{raw.scenarios.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}
      </select>}
      {raw?<><div className="transport">
        <button disabled={!animation} onClick={()=>stepBy(doc,-1)} aria-label={t('Paso anterior')} title={t('Paso anterior')}>‹</button>
        <button className="primary play-button" disabled={!animation} data-playing={playing} onClick={()=>togglePlay(doc)}>{playing?t('Pausar'):t('Reproducir')}</button>
        <button disabled={!animation} onClick={()=>stepBy(doc,1)} aria-label={t('Paso siguiente')} title={t('Paso siguiente')}>›</button>
      </div><button className="edit-motion" aria-expanded={timelineOpen} aria-controls="motion-editor" onClick={togglePanel}>{timelineOpen?t('↓ Bajar panel'):t('Editar pasos')}</button></>:<button className="primary" disabled={!doc.nodes.length} onClick={()=>{viewStore.set({timelineOpen:true});setPicking(true);}}>{t('Animar mi diagrama')}</button>}
    </div>
    {timelineOpen&&(picking||!raw)&&<div className="motion-editor" id="motion-editor"><StylePicker doc={doc} ids={ids} onDone={()=>setPicking(false)} onCancel={raw?()=>setPicking(false):undefined}/></div>}
    {timelineOpen&&!picking&&raw&&animation&&sampled&&<div className="motion-editor" id="motion-editor" onFocusCapture={()=>{if(playbackStore.get().playing)playbackStore.set({playing:false});}}>
      <div className="motion-editor-heading"><div><strong>{t('Tu recorrido, paso a paso')}</strong><p>{t('Elegí un paso y contá lo que querés mostrar.')}</p></div>
        <span className="motion-editor-buttons"><button onClick={addStep}>{t('+ Agregar paso')}</button><button onClick={()=>setPicking(true)}>{t('Otra animación…')}</button></span>
      </div>
      <div className="motion-settings">
        <select aria-label={t('Animación')} value={raw.id} onChange={e=>playbackStore.set({animationId:e.target.value,scenarioId:'',time:0,playing:false})}>
          {doc.animations.map(a=><option value={a.id} key={a.id}>{a.label}</option>)}
        </select>
        <label className="check" title={t('La vista acompaña lo que mostrás en cada paso')}><input type="checkbox" checked={follow} onChange={e=>playbackStore.set({follow:e.target.checked})}/>{t('Seguir con la cámara')}</label>
        <button className="quiet" onClick={()=>seek(0)}>{t('Reiniciar')}</button>
        <span className="mono timecode">{clock(Math.min(time,duration))} / {clock(duration)}</span>
      </div>
      <input className="scrubber" type="range" aria-label={t('Posición de la timeline')} min="0" max={duration} value={Math.min(time,duration)} step="20" onChange={e=>seek(+e.target.value)}/>
      <ol className="steps" ref={stepsRef}>{animation.steps.map((s,i)=><li key={s.id}>
        <button className={(i===sampled.index?'current ':'')+(s.tone==='failure'?'failure ':'')+(s.scenarioIds.length?'branch':'')} aria-current={i===sampled.index?'step':undefined} onClick={()=>seekStep(doc,i)} title={s.caption}>
          <span className="step-number">{i+1}</span><span className="step-card-copy"><span className="step-caption">{s.tone==='failure'?'✕ ':''}{s.caption||t('Sin texto')}</span><small>{(s.durationMs/1000).toLocaleString('es-AR')} {t('segundos')}{s.scenarioIds.length?t(' · Variante'):''}</small></span>
        </button>
      </li>)}</ol>
      <StepEditor key={raw.id+'/'+sampled.step.id} doc={doc} raw={raw} animation={animation} step={sampled.step} index={sampled.index} selection={ids} scenarioId={raw.scenarios.some(s=>s.id===scenarioId)?scenarioId:''}/>
      <details className="timeline-edit">
        <summary>{t('Opciones avanzadas del recorrido')}</summary>
        <p className="inline-note">{t('Para combinar efectos o mostrar distintas versiones de una historia.')}</p>
        <div className="motion-settings">
          <label className="check"><input type="checkbox" checked={loop} onChange={e=>playbackStore.set({loop:e.target.checked})}/>{t('Repetir')}</label>
          <button aria-expanded={tracksOpen} onClick={()=>setTracksOpen(!tracksOpen)}>{t('Pistas (')}{raw.tracks.length}) {tracksOpen?'▴':'▾'}</button>
        </div>
        {tracksOpen&&<TracksEditor key={raw.id+'/tracks'} doc={doc} raw={raw} animation={animation} step={sampled.step} selection={ids}/>}
        <Scenarios key={raw.id+'/scenarios'} raw={raw}/>
        <div className="step-actions">
          <TextField key={raw.id} label={t('Nombre de la animación')} value={raw.label} maxLength={200} onCommit={label=>transact([{type:'UPDATE_ANIMATION',id:raw.id,changes:{label}}],t('Animación renombrada'))}/>
          <button onClick={()=>{if(confirm(t('Se elimina la animación «')+raw.label+t('». Podés deshacerlo.'))&&transact([{type:'DELETE_ANIMATION',id:raw.id}],t('Animación eliminada')))playbackStore.set({animationId:'',scenarioId:'',time:0,playing:false});}}>{t('Eliminar animación')}</button>
        </div>
      </details>
    </div>}
  </section>;
}
