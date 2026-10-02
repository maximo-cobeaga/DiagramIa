import {useState} from 'react';
import type {DiagramAnnotation,DiagramDocument} from '@diagramia/core';
import {newId,transact} from '../store/documentStore';
import {select} from '../store/selectionStore';
import {TextField} from '../ui';

export const SEVERITY_LABELS:Record<DiagramAnnotation['severity'],string>={info:'Info',warning:'Atención',risk:'Riesgo'};
const SEVERITIES=Object.keys(SEVERITY_LABELS) as DiagramAnnotation['severity'][];

/**
 * Anotaciones del elemento seleccionado, o todas las del documento si `targetId` es undefined.
 * Son contenido del documento: se guardan, se exportan en JSON y Markdown y viajan en el contexto para la IA.
 */
export function Annotations({doc,targetId}:{doc:DiagramDocument;targetId?:string}){
  const [text,setText]=useState(''),[severity,setSeverity]=useState<DiagramAnnotation['severity']>('info');
  const notes=targetId===undefined?doc.annotations:doc.annotations.filter(note=>note.targetId===targetId),open=notes.filter(note=>!note.resolved).length;
  const add=()=>{if(transact([{type:'ADD_ANNOTATION',annotation:{id:newId('note'),targetId:targetId??null,severity,text:text.trim(),source:'user'}}],'Anotación agregada'))setText('');};
  return <fieldset className="choice annotations"><legend>Anotaciones{notes.length?` · ${open} abierta(s) de ${notes.length}`:''}</legend>
    {notes.length===0&&<p className="inline-note">{targetId===undefined?'El documento no tiene anotaciones. Podés escribir una o guardar las observaciones de una revisión de IA.':'Este elemento no tiene anotaciones.'}</p>}
    {notes.map(note=><div key={note.id} className={'annotation'+(note.resolved?' resolved':'')}>
      <div className="annotation-head">
        <span className={`severity ${note.severity}`}>{SEVERITY_LABELS[note.severity]}</span>
        <span className="mono">{note.source==='ai'?'IA':'Usuario'}{note.resolved?' · resuelta':''}</span>
        {targetId===undefined&&(note.targetId?<button className="quiet" onClick={()=>select([note.targetId!])}>{note.targetId}</button>:<span className="mono">documento</span>)}
      </div>
      <TextField label="Texto" value={note.text} multiline maxLength={1000} onCommit={value=>transact([{type:'UPDATE_ANNOTATION',id:note.id,changes:{text:value}}],'Anotación editada')}/>
      {note.suggestion&&<p className="inline-note">Sugerencia: {note.suggestion}</p>}
      <div className="button-grid two">
        <button onClick={()=>transact([{type:'UPDATE_ANNOTATION',id:note.id,changes:{resolved:!note.resolved}}],note.resolved?'Anotación reabierta':'Anotación resuelta')}>{note.resolved?'Reabrir':'Resolver'}</button>
        <button onClick={()=>transact([{type:'DELETE_ANNOTATION',id:note.id}],'Anotación eliminada')}>Eliminar</button>
      </div>
    </div>)}
    <div className="field"><label htmlFor="new-annotation">Nueva anotación{targetId===undefined?' del documento':''}</label>
      <textarea id="new-annotation" rows={2} maxLength={1000} value={text} onChange={e=>setText(e.target.value)}/></div>
    <div className="button-grid two">
      <select aria-label="Severidad" value={severity} onChange={e=>setSeverity(e.target.value as DiagramAnnotation['severity'])}>{SEVERITIES.map(s=><option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}</select>
      <button disabled={!text.trim()} onClick={add}>Agregar</button>
    </div>
  </fieldset>;
}
