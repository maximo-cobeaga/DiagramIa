import {useEffect,useRef,useState} from 'react';
import {autoFocus,animationDuration,sampleAnimation,sampleTrackEffects,type ActionInput,type DiagramAnimation,type DiagramDocument,type DiagramStep} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,newId,notify,transact} from '../store/documentStore';
import {currentAnimation,playbackStore,rawAnimation,seek,seekStep,stepBy,togglePlay} from '../store/playbackStore';
import {select,selectionStore} from '../store/selectionStore';
import {viewStore} from '../store/viewStore';
import {NumberField,SelectField,TextField} from '../ui';
import {TracksEditor} from './TracksEditor';
import {ResizeHandle} from './ResizeHandle';

const FOCUS_OPTIONS=[['auto','Automático'],['close','De cerca'],['medium','Con contexto'],['wide','Amplio'],['overview','Todo el diagrama'],['stay','Mantener la vista']] as const;
const TRANSITION_OPTIONS=[['smooth','Suave'],['slow','Lenta'],['cut','Corte']] as const;
const clock=(ms:number)=>`${Math.floor(ms/60000)}:${(ms%60000/1000).toFixed(1).padStart(4,'0')}`;
const fresh=()=>documentStore.get().doc;
const blank=(extra:Partial<DiagramStep>&Pick<DiagramStep,'caption'|'nodeIds'|'edgeIds'>):DiagramStep=>({id:newId('step'),durationMs:1800,tone:'normal',frameId:null,scenarioIds:[],states:[],focus:'auto',transition:'smooth',...extra});

/**
 * Recorrido automático: avanza por las conexiones desde los nodos sin entradas, una capa por paso.
 * Es determinista y sólo describe la topología; los textos quedan para que el usuario los ajuste.
 */
function walkthrough(doc:DiagramDocument,ids:string[]):DiagramStep[]{
  const chosen=doc.nodes.filter(n=>ids.includes(n.id)),nodes=chosen.length>1?chosen:doc.nodes,inside=new Set(nodes.map(n=>n.id));
  const edges=doc.edges.filter(e=>inside.has(e.from)&&inside.has(e.to)&&e.from!==e.to),label=new Map(nodes.map(n=>[n.id,n.label]));
  const visited=new Set<string>(),steps:DiagramStep[]=[];
  let frontier=nodes.filter(n=>!edges.some(e=>e.to===n.id)).map(n=>n.id);
  if(!frontier.length&&nodes.length)frontier=[nodes[0].id];
  while(frontier.length&&steps.length<200){
    frontier.forEach(id=>visited.add(id));
    const out=edges.filter(e=>frontier.includes(e.from)),targets=[...new Set(out.map(e=>e.to))];
    const names=(list:string[])=>list.map(id=>label.get(id)).join(', ');
    const nodeIds=frontier.slice(0,100),edgeIds=out.map(e=>e.id).slice(0,100);
    steps.push(blank({caption:(targets.length?`${names(frontier)} → ${names(targets)}`:names(frontier)).slice(0,500),nodeIds,edgeIds,focus:autoFocus(doc,nodeIds,edgeIds),transition:steps.length?'smooth':'slow'}));
    frontier=targets.filter(id=>!visited.has(id));
  }
  return steps;
}

function createAnimation(doc:DiagramDocument,ids:string[],automatic:boolean){
  const id=newId('anim');
  const steps=automatic?walkthrough(doc,ids):[blank({caption:'Primer paso',nodeIds:doc.nodes.filter(n=>ids.includes(n.id)).map(n=>n.id),edgeIds:doc.edges.filter(e=>ids.includes(e.id)).map(e=>e.id)})];
  if(!steps.length){notify('Agregá nodos antes de generar un recorrido.','warn');return;}
  if(transact([{type:'CREATE_ANIMATION',animation:{id,label:`${automatic?'Recorrido':'Animación'} ${doc.animations.length+1}`,steps}}],automatic?`Recorrido generado con ${steps.length} pasos`:'Animación creada')){playbackStore.set({animationId:id,scenarioId:'',time:0,playing:false});viewStore.set({timelineOpen:true});}
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
    <div className="step-fields">
      <TextField label={`Texto del paso ${index+1}`} value={step.caption} multiline allowEmpty maxLength={500} onCommit={caption=>update({caption},'Texto del paso cambiado')}/>
      <NumberField label="Duración (segundos)" value={step.durationMs/1000} min={.1} max={30} step={.5} onCommit={seconds=>update({durationMs:Math.round(seconds*1000)},'Duración cambiada')}/>
      <SelectField label="Enfoque de la cámara" value={step.focus} options={FOCUS_OPTIONS} onChange={focus=>update({focus},'Enfoque cambiado')}/>
      <SelectField label="Transición" value={step.transition} options={TRANSITION_OPTIONS} onChange={transition=>update({transition},'Transición cambiada')}/>
    </div>
    <div className="step-actions simple-step-actions">
      <button disabled={!nodeIds.length&&!edgeIds.length} onClick={()=>update({nodeIds:nodeIds.slice(0,100),edgeIds:edgeIds.slice(0,100)},'Elementos del paso reemplazados por la selección')}>Resaltar lo seleccionado</button>
      <button onClick={()=>act({type:'ADD_STEP',animationId:raw.id,index:fullIndex(index)+1,step:{...step,id:newId('step')}},'Paso duplicado',index+1)}>Duplicar</button>
      <button disabled={index===0} onClick={()=>act({type:'MOVE_STEP',animationId:raw.id,stepId:step.id,index:fullIndex(index-1)},'Paso movido',index-1)} aria-label="Mover paso antes">← Antes</button>
      <button disabled={index===last} onClick={()=>act({type:'MOVE_STEP',animationId:raw.id,stepId:step.id,index:fullIndex(index+1)},'Paso movido',index+1)} aria-label="Mover paso después">Después →</button>
    </div>
    <details className="step-advanced"><summary>Opciones avanzadas de este paso</summary>
    <div className="step-fields">
      <SelectField label="Tono" value={step.tone} options={[['normal','Normal'],['failure','Falla']] as const} onChange={tone=>update({tone},'Tono cambiado')}/>
      <SelectField label="Frame (manda sobre el enfoque)" value={step.frameId??''} options={[['','Ninguno'],...doc.frames.map(f=>[f.id,f.label] as const)]} onChange={frameId=>update({frameId:frameId||null},'Encuadre cambiado')}/>
    </div>
    {raw.scenarios.length>0&&<fieldset className="choice row"><legend>Escenarios en los que ocurre este paso (ninguno marcado = común a todos)</legend>
      {raw.scenarios.map(s=><label className="check" key={s.id}><input type="checkbox" checked={step.scenarioIds.includes(s.id)} onChange={e=>update({scenarioIds:e.target.checked?[...step.scenarioIds,s.id]:step.scenarioIds.filter(id=>id!==s.id)},'Escenarios del paso cambiados')}/>{s.label}</label>)}
    </fieldset>}
    <fieldset className="choice row"><legend>Estados que este paso deja en los nodos (se mantienen hasta que otro paso los cambie)</legend>
      {step.states.map(state=><span className="chip" key={state.nodeId}>{name(state.nodeId)}: {state.tone==='failure'?'✕ ':''}{state.label}<button className="quiet" aria-label={`Quitar estado de ${name(state.nodeId)}`} onClick={()=>update({states:step.states.filter(s=>s.nodeId!==state.nodeId)},'Estado quitado')}>×</button></span>)}
      <span className="state-adder">
        <input aria-label="Nuevo estado" placeholder={target?`Estado de ${target.label}`:'Seleccioná un nodo'} value={stateLabel} maxLength={40} disabled={!target} onChange={e=>setStateLabel(e.target.value)}/>
        <select aria-label="Tono del estado" value={stateTone} disabled={!target} onChange={e=>setStateTone(e.target.value as 'normal'|'failure')}><option value="normal">Normal</option><option value="failure">Falla</option></select>
        <button disabled={!target||!stateLabel.trim()} onClick={()=>{update({states:[...step.states.filter(s=>s.nodeId!==target!.id),{nodeId:target!.id,label:stateLabel.trim(),tone:stateTone}]},'Estado asignado');setStateLabel('');}}>Asignar estado</button>
      </span>
    </fieldset>
    <div className="step-actions">
      <span className="inline-note">Resalta {step.nodeIds.length} nodo(s) y recorre {step.edgeIds.length} conexión(es).</span>
      <button disabled={!nodeIds.length&&!edgeIds.length} onClick={()=>update({nodeIds:nodeIds.slice(0,100),edgeIds:edgeIds.slice(0,100)},'Elementos del paso reemplazados por la selección')}>Usar selección actual</button>
      <button disabled={!step.nodeIds.length&&!step.edgeIds.length} onClick={()=>select([...step.nodeIds,...step.edgeIds])}>Seleccionar sus elementos</button>
      <button onClick={()=>act({type:'ADD_STEP',animationId:raw.id,index:fullIndex(index)+1,step:blank({caption:'',nodeIds,edgeIds,frameId:step.frameId,scenarioIds:scenarioId?[scenarioId]:step.scenarioIds})},'Paso agregado',index+1)}>Agregar paso</button>
      <button disabled={raw.steps.length===1} onClick={()=>act({type:'DELETE_STEP',animationId:raw.id,stepId:step.id},'Paso eliminado',Math.max(0,Math.min(index,last-1)))}>Eliminar paso</button>
    </div>
    </details>
  </div>;
}

function Scenarios({raw}:{raw:DiagramAnimation}){
  return <fieldset className="choice"><legend>Escenarios (ramas) de «{raw.label}»</legend>
    {raw.scenarios.length===0&&<p className="inline-note">Sin escenarios, todos los pasos forman un único recorrido. Agregá uno para separar ramas: por ejemplo «aprobado» y «rechazado».</p>}
    {raw.scenarios.map(s=><div className="scenario-row" key={s.id}>
      <TextField label={`Escenario · ${s.id}`} value={s.label} maxLength={200} onCommit={label=>transact([{type:'UPDATE_SCENARIO',animationId:raw.id,scenarioId:s.id,changes:{label}}],'Escenario renombrado')}/>
      <button onClick={()=>{
        const exclusive=raw.steps.filter(step=>step.scenarioIds.length===1&&step.scenarioIds[0]===s.id).length;
        if(confirm(`Se elimina el escenario «${s.label}»${exclusive?` y sus ${exclusive} paso(s) exclusivos`:''}. Podés deshacerlo.`)&&transact([{type:'DELETE_SCENARIO',animationId:raw.id,scenarioId:s.id}],'Escenario eliminado'))playbackStore.set({scenarioId:'',time:0,playing:false});
      }}>Eliminar</button>
    </div>)}
    <button onClick={()=>{const id=newId('scenario');if(transact([{type:'ADD_SCENARIO',animationId:raw.id,scenario:{id,label:`Escenario ${raw.scenarios.length+1}`}}],'Escenario agregado. Marcá en cada paso a qué escenarios pertenece.'))playbackStore.set({scenarioId:id,time:0,playing:false});}}>Agregar escenario</button>
  </fieldset>;
}

export function Timeline(){
  const [tracksOpen,setTracksOpen]=useState(false);
  const stepsRef=useRef<HTMLOListElement>(null);
  const {doc}=useStore(documentStore),{animationId,scenarioId,time,playing,loop,follow}=useStore(playbackStore),{ids}=useStore(selectionStore),{timelineOpen,timelineHeight}=useStore(viewStore);
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
    const step=blank({caption:'Nuevo paso',nodeIds:ids.filter(id=>doc.nodes.some(n=>n.id===id)),edgeIds:ids.filter(id=>doc.edges.some(e=>e.id===id)),scenarioIds:scenarioId?[scenarioId]:[]});
    if(transact([{type:'ADD_STEP',animationId:raw.id,step,index:raw.steps.findIndex(s=>s.id===sampled.step.id)+1}],'Paso agregado'))seekStep(fresh(),sampled.index+1);
  };
  return <section className={'timeline'+(timelineOpen?' expanded':' collapsed')} aria-label="Timeline de animación" style={timelineOpen?{height:timelineHeight}:undefined}>
    {timelineOpen&&<ResizeHandle height={timelineHeight}/>}
    <div className="timeline-bar">
      <div className="motion-summary"><span className="motion-icon" aria-hidden="true">▷</span><div>
        <strong>{raw?'Dale movimiento':'Tus ideas, en movimiento'}</strong>
        <p className="caption" aria-live="polite">{sampled&&animation?<><span className="step-counter">{sampled.index+1}/{animation.steps.length}</span> {sampled.step.caption||'Sin texto'}{effects?.captions.map((caption,i)=><span key={i}> · {caption}</span>)}</>:'Mostrá tu diagrama paso a paso.'}</p>
      </div></div>
      {raw&&raw.scenarios.length>0&&<select aria-label="Recorrido" value={raw.scenarios.some(s=>s.id===scenarioId)?scenarioId:''} onChange={e=>playbackStore.set({scenarioId:e.target.value,time:0,playing:false})}>
        <option value="">Todos los pasos</option>{raw.scenarios.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}
      </select>}
      {raw?<><div className="transport">
        <button disabled={!animation} onClick={()=>stepBy(doc,-1)} aria-label="Paso anterior" title="Paso anterior">‹</button>
        <button className="primary play-button" disabled={!animation} data-playing={playing} onClick={()=>togglePlay(doc)}>{playing?'Pausar':'Reproducir'}</button>
        <button disabled={!animation} onClick={()=>stepBy(doc,1)} aria-label="Paso siguiente" title="Paso siguiente">›</button>
      </div><button className="edit-motion" aria-expanded={timelineOpen} aria-controls="motion-editor" onClick={togglePanel}>{timelineOpen?'↓ Bajar panel':'Editar pasos'}</button></>:<button className="primary" disabled={!doc.nodes.length} onClick={()=>createAnimation(doc,ids,true)}>Crear recorrido</button>}
    </div>
    {timelineOpen&&raw&&animation&&sampled&&<div className="motion-editor" id="motion-editor" onFocusCapture={()=>{if(playbackStore.get().playing)playbackStore.set({playing:false});}}>
      <div className="motion-editor-heading"><div><strong>Tu recorrido, paso a paso</strong><p>Elegí un paso y contá lo que querés mostrar.</p></div>
        <button onClick={addStep}>+ Agregar paso</button>
      </div>
      <div className="motion-settings">
        <select aria-label="Animación" value={raw.id} onChange={e=>playbackStore.set({animationId:e.target.value,scenarioId:'',time:0,playing:false})}>
          {doc.animations.map(a=><option value={a.id} key={a.id}>{a.label}</option>)}
        </select>
        <label className="check" title="La vista acompaña lo que mostrás en cada paso"><input type="checkbox" checked={follow} onChange={e=>playbackStore.set({follow:e.target.checked})}/>Seguir con la cámara</label>
        <button className="quiet" onClick={()=>seek(0)}>Reiniciar</button>
        <span className="mono timecode">{clock(Math.min(time,duration))} / {clock(duration)}</span>
      </div>
      <input className="scrubber" type="range" aria-label="Posición de la timeline" min="0" max={duration} value={Math.min(time,duration)} step="20" onChange={e=>seek(+e.target.value)}/>
      <ol className="steps" ref={stepsRef}>{animation.steps.map((s,i)=><li key={s.id}>
        <button className={(i===sampled.index?'current ':'')+(s.tone==='failure'?'failure ':'')+(s.scenarioIds.length?'branch':'')} aria-current={i===sampled.index?'step':undefined} onClick={()=>seekStep(doc,i)} title={s.caption}>
          <span className="step-number">{i+1}</span><span className="step-card-copy"><span className="step-caption">{s.tone==='failure'?'✕ ':''}{s.caption||'Sin texto'}</span><small>{(s.durationMs/1000).toLocaleString('es-AR')} segundos{s.scenarioIds.length?' · Variante':''}</small></span>
        </button>
      </li>)}</ol>
      <StepEditor key={raw.id+'/'+sampled.step.id} doc={doc} raw={raw} animation={animation} step={sampled.step} index={sampled.index} selection={ids} scenarioId={raw.scenarios.some(s=>s.id===scenarioId)?scenarioId:''}/>
      <details className="timeline-edit">
        <summary>Opciones avanzadas del recorrido</summary>
        <p className="inline-note">Para combinar efectos o mostrar distintas versiones de una historia.</p>
        <div className="motion-settings">
          <label className="check"><input type="checkbox" checked={loop} onChange={e=>playbackStore.set({loop:e.target.checked})}/>Repetir</label>
          <button aria-expanded={tracksOpen} onClick={()=>setTracksOpen(!tracksOpen)}>Pistas ({raw.tracks.length}) {tracksOpen?'▴':'▾'}</button>
          <button onClick={()=>createAnimation(doc,ids,false)}>Crear animación</button>
          <button onClick={()=>createAnimation(doc,ids,true)}>Crear recorrido</button>
        </div>
        {tracksOpen&&<TracksEditor key={raw.id+'/tracks'} doc={doc} raw={raw} animation={animation} step={sampled.step} selection={ids}/>}
        <Scenarios key={raw.id+'/scenarios'} raw={raw}/>
        <div className="step-actions">
          <TextField key={raw.id} label="Nombre de la animación" value={raw.label} maxLength={200} onCommit={label=>transact([{type:'UPDATE_ANIMATION',id:raw.id,changes:{label}}],'Animación renombrada')}/>
          <button onClick={()=>{if(confirm('Se elimina la animación «'+raw.label+'». Podés deshacerlo.')&&transact([{type:'DELETE_ANIMATION',id:raw.id}],'Animación eliminada'))playbackStore.set({animationId:'',scenarioId:'',time:0,playing:false});}}>Eliminar animación</button>
        </div>
      </details>
    </div>}
  </section>;
}
