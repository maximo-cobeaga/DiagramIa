import {useState} from 'react';
import {stepStarts,type ActionInput,type DiagramAnimation,type DiagramDocument,type DiagramStep,type DiagramTrack} from '@diagramia/core';
import {newId,transact} from '../store/documentStore';
import {seek} from '../store/playbackStore';
import {select} from '../store/selectionStore';
import {SelectField,TextField} from '../ui';

const NAMES:Record<DiagramTrack['kind'],string>={highlight:'Resaltado',caption:'Texto',camera:'Cámara'};
type Props={doc:DiagramDocument;raw:DiagramAnimation;animation:DiagramAnimation;step:DiagramStep;selection:string[]};

/** Una columna por paso: todas las pistas comparten el mismo reloj y siguen las ramas de sus pasos. */
export function TracksEditor({doc,raw,animation,step,selection}:Props){
  const [kind,setKind]=useState<DiagramTrack['kind']>('highlight'),[chosen,setChosen]=useState<{trackId:string;stepId:string}|null>(null);
  const columns=`minmax(130px,170px) ${animation.steps.map(s=>`minmax(80px,${Math.max(1,s.durationMs)}fr)`).join(' ')}`;
  const selectedTrack=raw.tracks.find(t=>t.id===chosen?.trackId),selectedClip=selectedTrack?.clips.find(c=>c.stepId===chosen?.stepId);
  const selectedStep=animation.steps.find(s=>s.id===chosen?.stepId);
  const currentSelected=doc.nodes.filter(n=>selection.includes(n.id)).map(n=>n.id),edgeSelected=doc.edges.filter(e=>selection.includes(e.id)).map(e=>e.id);
  const update=(changes:Extract<ActionInput,{type:'UPDATE_TRACK_CLIP'}>['changes'],label:string)=>{
    if(selectedTrack&&selectedClip)transact([{type:'UPDATE_TRACK_CLIP',animationId:raw.id,trackId:selectedTrack.id,clipId:selectedClip.id,changes}],label);
  };
  const addTrack=()=>{
    const id=newId('track');
    if(transact([{type:'ADD_TRACK',animationId:raw.id,track:{id,label:`${NAMES[kind]} ${raw.tracks.filter(t=>t.kind===kind).length+1}`,kind,clips:[]}}],`Pista de ${NAMES[kind].toLowerCase()} creada`))setChosen(null);
  };
  const cell=(track:DiagramTrack,s:DiagramStep)=>{
    const clip=track.clips.find(c=>c.stepId===s.id),active=chosen?.trackId===track.id&&chosen.stepId===s.id;
    const summary=clip?(track.kind==='caption'?clip.caption:track.kind==='camera'?doc.frames.find(f=>f.id===clip.frameId)?.label??'Sin encuadre':`${clip.nodeIds.length} nodos · ${clip.edgeIds.length} conexiones`):'+ Efecto';
    const disabled=!clip&&track.kind==='camera'&&!doc.frames.length;
    return <button key={s.id} className={'track-cell'+(clip?' filled':'')+(active?' chosen':'')} disabled={disabled} aria-pressed={active} title={`${track.label} · paso ${animation.steps.indexOf(s)+1}: ${summary}`} onClick={()=>{
      const show=()=>seek(stepStarts(animation)[animation.steps.indexOf(s)]+1);
      if(clip){setChosen({trackId:track.id,stepId:s.id});show();return;}
      const id=newId('clip'),nodeIds=currentSelected.length?currentSelected:s.nodeIds,edgeIds=edgeSelected.length?edgeSelected:s.edgeIds;
      const fresh={id,stepId:s.id,nodeIds:track.kind==='highlight'?nodeIds:[],edgeIds:track.kind==='highlight'?edgeIds:[],caption:track.kind==='caption'?'Nueva nota':'',frameId:track.kind==='camera'?doc.frames[0]?.id??null:null};
      if(transact([{type:'ADD_TRACK_CLIP',animationId:raw.id,trackId:track.id,clip:fresh}],`Efecto agregado a ${track.label}`)){setChosen({trackId:track.id,stepId:s.id});show();}
    }}>{summary}</button>;
  };
  return <section className="tracks-editor" aria-label="Pistas sincronizadas">
    <div className="tracks-heading"><div><strong>Pistas sincronizadas</strong><p className="inline-note">Cada columna es un paso. Los efectos de varias pistas se muestran al mismo tiempo.</p></div>
      <div className="track-add"><select aria-label="Tipo de pista" value={kind} onChange={e=>setKind(e.target.value as DiagramTrack['kind'])}><option value="highlight">Resaltar elementos</option><option value="caption">Texto adicional</option><option value="camera">Cambiar encuadre</option></select><button disabled={raw.tracks.length>=12} onClick={addTrack}>+ Agregar pista</button></div>
    </div>
    {raw.tracks.length===0?<p className="inline-note">Agregá una pista para resaltar elementos, mostrar texto o cambiar la cámara en pasos concretos.</p>:<div className="tracks-scroll"><div className="tracks-grid" style={{minWidth:Math.max(480,170+animation.steps.length*88)}}>
      <div className="track-row track-header" style={{gridTemplateColumns:columns}}><span>Pista / paso</span>{animation.steps.map((s,i)=><span key={s.id} aria-current={s.id===step.id?'step':undefined}>{i+1} · {(s.durationMs/1000).toFixed(1)} s</span>)}</div>
      {raw.tracks.map(track=><div className="track-row" style={{gridTemplateColumns:columns}} key={track.id}>
        <div className="track-label"><span>{NAMES[track.kind]}</span><strong title={track.label}>{track.label}</strong></div>
        {animation.steps.map(s=>cell(track,s))}
      </div>)}
    </div></div>}
    {selectedTrack&&selectedClip&&selectedStep&&<div className="track-properties" key={selectedClip.id}>
      <strong>{selectedTrack.label} · paso {animation.steps.indexOf(selectedStep)+1}</strong>
      <TextField label="Nombre de la pista" value={selectedTrack.label} maxLength={200} onCommit={label=>transact([{type:'UPDATE_TRACK',animationId:raw.id,trackId:selectedTrack.id,changes:{label}}],'Pista renombrada')}/>
      {selectedTrack.kind==='highlight'&&<div className="step-actions"><span className="inline-note">{selectedClip.nodeIds.length} nodo(s), {selectedClip.edgeIds.length} conexión(es).</span><button disabled={!currentSelected.length&&!edgeSelected.length} onClick={()=>update({nodeIds:currentSelected,edgeIds:edgeSelected},'Resaltado actualizado desde la selección')}>Usar selección actual</button><button disabled={!selectedClip.nodeIds.length&&!selectedClip.edgeIds.length} onClick={()=>select([...selectedClip.nodeIds,...selectedClip.edgeIds])}>Seleccionar elementos</button></div>}
      {selectedTrack.kind==='caption'&&<TextField label="Texto visible en este paso" value={selectedClip.caption} allowEmpty multiline maxLength={500} onCommit={caption=>update({caption},'Texto de pista cambiado')}/>}
      {selectedTrack.kind==='camera'&&<SelectField label="Encuadre visible en este paso" value={selectedClip.frameId??''} options={[['','Todo el diagrama'],...doc.frames.map(f=>[f.id,f.label] as const)]} onChange={frameId=>update({frameId:frameId||null},'Encuadre de pista cambiado')}/>}
      <div className="step-actions"><button onClick={()=>{if(transact([{type:'DELETE_TRACK_CLIP',animationId:raw.id,trackId:selectedTrack.id,clipId:selectedClip.id}],'Efecto eliminado'))setChosen(null);}}>Quitar efecto del paso</button><button onClick={()=>{if(confirm(`Se elimina la pista «${selectedTrack.label}» con sus ${selectedTrack.clips.length} efecto(s). Podés deshacerlo.`)&&transact([{type:'DELETE_TRACK',animationId:raw.id,trackId:selectedTrack.id}],'Pista eliminada'))setChosen(null);}}>Eliminar pista</button></div>
    </div>}
  </section>;
}
