import {useState} from 'react';
import {autoFocus,animationDuration,sampleAnimation,sampleTrackEffects,type ActionInput,type DiagramAnimation,type DiagramDocument,type DiagramStep} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {documentStore,newId,notify,transact} from '../store/documentStore';
import {currentAnimation,playbackStore,rawAnimation,seek,seekStep,stepBy,togglePlay} from '../store/playbackStore';
import {select,selectionStore} from '../store/selectionStore';
import {viewStore} from '../store/viewStore';
import {NumberField,SelectField,TextField} from '../ui';
import {TracksEditor} from './TracksEditor';

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
  if(transact([{type:'CREATE_ANIMATION',animation:{id,label:`${automatic?'Recorrido':'Animación'} ${doc.animations.length+1}`,steps}}],automatic?`Recorrido generado con ${steps.length} pasos`:'Animación creada'))playbackStore.set({animationId:id,scenarioId:'',time:0,playing:false});
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
      <NumberField label="Duración (ms)" value={step.durationMs} min={100} max={30000} step={100} onCommit={durationMs=>update({durationMs:Math.round(durationMs)},'Duración cambiada')}/>
      <SelectField label="Tono" value={step.tone} options={[['normal','Normal'],['failure','Falla']] as const} onChange={tone=>update({tone},'Tono cambiado')}/>
      <SelectField label="Enfoque de la cámara" value={step.focus} options={FOCUS_OPTIONS} onChange={focus=>update({focus},'Enfoque cambiado')}/>
      <SelectField label="Transición" value={step.transition} options={TRANSITION_OPTIONS} onChange={transition=>update({transition},'Transición cambiada')}/>
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
      <button disabled={index===0} onClick={()=>act({type:'MOVE_STEP',animationId:raw.id,stepId:step.id,index:fullIndex(index-1)},'Paso movido',index-1)} aria-label="Mover paso antes">← Mover</button>
      <button disabled={index===last} onClick={()=>act({type:'MOVE_STEP',animationId:raw.id,stepId:step.id,index:fullIndex(index+1)},'Paso movido',index+1)} aria-label="Mover paso después">Mover →</button>
      <button onClick={()=>act({type:'ADD_STEP',animationId:raw.id,index:fullIndex(index)+1,step:blank({caption:'',nodeIds,edgeIds,frameId:step.frameId,scenarioIds:scenarioId?[scenarioId]:step.scenarioIds})},'Paso agregado',index+1)}>Agregar paso</button>
      <button onClick={()=>act({type:'ADD_STEP',animationId:raw.id,index:fullIndex(index)+1,step:{...step,id:newId('step')}},'Paso duplicado',index+1)}>Duplicar</button>
      <button disabled={raw.steps.length===1} onClick={()=>act({type:'DELETE_STEP',animationId:raw.id,stepId:step.id},'Paso eliminado',Math.max(0,Math.min(index,last-1)))}>Eliminar paso</button>
    </div>
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
  const {doc}=useStore(documentStore),{animationId,scenarioId,time,playing,loop,follow}=useStore(playbackStore),{ids}=useStore(selectionStore),{timelineOpen}=useStore(viewStore);
  const raw=rawAnimation(doc,animationId),animation=currentAnimation(doc,animationId),sampled=animation?sampleAnimation(animation,time):null,duration=animation?animationDuration(animation):0,effects=animation?sampleTrackEffects(animation,time):null;
  const branch=(step:DiagramStep)=>step.scenarioIds.map(id=>raw.scenarios.find(s=>s.id===id)?.label??id).join(' · ');
  return <section className={'timeline'+(timelineOpen?'':' collapsed')+(tracksOpen?' tracks-expanded':'')} aria-label="Timeline de animación">
    <div className="timeline-bar">
      <button className="quiet" aria-expanded={timelineOpen} onClick={()=>viewStore.set({timelineOpen:!timelineOpen})}>{timelineOpen?'▾':'▸'} <span className="eyebrow">ANIMACIÓN</span></button>
      <select aria-label="Animación" value={raw?.id??''} disabled={!raw} onChange={e=>playbackStore.set({animationId:e.target.value,scenarioId:'',time:0,playing:false})}>
        {raw?doc.animations.map(a=><option value={a.id} key={a.id}>{a.label}</option>):<option value="">Sin animaciones</option>}
      </select>
      {raw&&raw.scenarios.length>0&&<select aria-label="Recorrido" value={raw.scenarios.some(s=>s.id===scenarioId)?scenarioId:''} onChange={e=>playbackStore.set({scenarioId:e.target.value,time:0,playing:false})}>
        <option value="">Todos los pasos</option>{raw.scenarios.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}
      </select>}
      <div className="transport">
        <button disabled={!animation} onClick={()=>stepBy(doc,-1)} aria-label="Paso anterior">⏮</button>
        <button className="primary" disabled={!animation} onClick={()=>togglePlay(doc)}>{playing?'Pausar':'Reproducir'}</button>
        <button disabled={!animation} onClick={()=>stepBy(doc,1)} aria-label="Paso siguiente">⏭</button>
        <button disabled={!animation} onClick={()=>seek(0)}>Reiniciar</button>
      </div>
      <label className="check"><input type="checkbox" checked={loop} onChange={e=>playbackStore.set({loop:e.target.checked})}/>Repetir</label>
      <label className="check" title="En cada paso, la vista viaja hacia lo que el paso resalta"><input type="checkbox" checked={follow} onChange={e=>playbackStore.set({follow:e.target.checked})}/>Seguir con la cámara</label>
      <span className="mono timecode">{clock(Math.min(time,duration))} / {clock(duration)}</span>
      {raw&&<button aria-expanded={tracksOpen} onClick={()=>{setTracksOpen(!tracksOpen);if(!timelineOpen)viewStore.set({timelineOpen:true});}}>Pistas ({raw.tracks.length}) {tracksOpen?'▴':'▾'}</button>}
      <div className="timeline-new">
        <button onClick={()=>createAnimation(doc,ids,false)}>Crear animación</button>
        <button onClick={()=>createAnimation(doc,ids,true)} title="Crea pasos siguiendo las conexiones de la selección, o de todo el diagrama">Crear recorrido</button>
      </div>
    </div>
    {timelineOpen&&raw&&animation&&sampled&&<>
      <input className="scrubber" type="range" aria-label="Posición de la timeline" min="0" max={duration} value={Math.min(time,duration)} step="20" onChange={e=>seek(+e.target.value)}/>
      {tracksOpen&&<TracksEditor key={raw.id} doc={doc} raw={raw} animation={animation} step={sampled.step} selection={ids}/>}
      <ol className="steps">{animation.steps.map((s,i)=><li key={s.id} style={{flexGrow:s.durationMs}}>
        <button className={(i===sampled.index?'current ':'')+(s.tone==='failure'?'failure ':'')+(s.scenarioIds.length?'branch':'')} aria-current={i===sampled.index?'step':undefined} onClick={()=>seekStep(doc,i)} title={s.caption+(s.scenarioIds.length?`\nSólo en: ${branch(s)}`:'')}>
          <span className="mono">{i+1}{s.tone==='failure'?' ✕':''}{s.scenarioIds.length?' ↳':''} · {(s.durationMs/1000).toFixed(1)}s</span><span className="step-caption">{s.caption||'Sin texto'}</span>
        </button>
      </li>)}</ol>
      <p className="caption" aria-live="polite">{sampled.index+1}/{animation.steps.length} · {sampled.step.caption||'Sin texto'}{effects?.captions.map((caption,i)=><span key={i}> · {caption}</span>)}{sampled.step.scenarioIds.length>0&&<span className="mono"> · ↳ {branch(sampled.step)}</span>}</p>
      <button onClick={()=>{const step=blank({caption:'',nodeIds:ids.filter(id=>doc.nodes.some(n=>n.id===id)),edgeIds:ids.filter(id=>doc.edges.some(e=>e.id===id)),scenarioIds:scenarioId?[scenarioId]:[]});if(transact([{type:'ADD_STEP',animationId:raw.id,step,index:raw.steps.findIndex(s=>s.id===sampled.step.id)+1}],'Paso agregado'))seekStep(fresh(),sampled.index+1);}}>+ Agregar paso</button>
      <details className="timeline-edit">
        <summary>Ajustes del paso: duración, cámara, estados y ramas</summary>
        <StepEditor key={raw.id+'/'+sampled.step.id} doc={doc} raw={raw} animation={animation} step={sampled.step} index={sampled.index} selection={ids} scenarioId={raw.scenarios.some(s=>s.id===scenarioId)?scenarioId:''}/>
        <Scenarios key={raw.id} raw={raw}/>
        <div className="step-actions">
          <TextField key={raw.id} label="Nombre de la animación" value={raw.label} maxLength={200} onCommit={label=>transact([{type:'UPDATE_ANIMATION',id:raw.id,changes:{label}}],'Animación renombrada')}/>
          <button onClick={()=>{if(confirm(`Se elimina la animación «${raw.label}». Podés deshacerlo.`)&&transact([{type:'DELETE_ANIMATION',id:raw.id}],'Animación eliminada'))playbackStore.set({animationId:'',scenarioId:'',time:0,playing:false});}}>Eliminar animación</button>
        </div>
      </details>
    </>}
    {timelineOpen&&!raw&&<p className="caption">Una animación muestra el diagrama por pasos. Elegí elementos y creá una animación, o generá un recorrido desde las conexiones.</p>}
  </section>;
}
