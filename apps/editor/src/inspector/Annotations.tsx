import {useState} from 'react';
import type {DiagramAnnotation,DiagramDocument} from '@diagramia/core';
import {newId,transact} from '../store/documentStore';
import {select} from '../store/selectionStore';
import {TextField} from '../ui';
import {t} from '../i18n';

export const SEVERITY_LABELS:Record<DiagramAnnotation['severity'],string>={info:t('Info'),warning:t('Atención'),risk:t('Riesgo')};
const SEVERITIES=Object.keys(SEVERITY_LABELS) as DiagramAnnotation['severity'][];

/**
 * Anotaciones del elemento seleccionado, o todas las del documento si `targetId` es undefined.
 * Son contenido del documento: se guardan, se exportan en JSON y Markdown y viajan en el contexto para la IA.
 */
export function Annotations({doc,targetId}:{doc:DiagramDocument;targetId?:string}){
  const [text,setText]=useState(''),[severity,setSeverity]=useState<DiagramAnnotation['severity']>('info');
  const notes=targetId===undefined?doc.annotations:doc.annotations.filter(note=>note.targetId===targetId),open=notes.filter(note=>!note.resolved).length;
  const add=()=>{if(transact([{type:'ADD_ANNOTATION',annotation:{id:newId('note'),targetId:targetId??null,severity,text:text.trim(),source:'user'}}],t('Anotación agregada')))setText('');};
  return <fieldset className="choice annotations"><legend>{t('Anotaciones')}{notes.length?t(' · {0} abierta(s) de {1}',open,notes.length):''}</legend>
    {notes.length===0&&<p className="inline-note">{targetId===undefined?t('El documento no tiene anotaciones. Podés escribir una o guardar las observaciones de una revisión de IA.'):t('Este elemento no tiene anotaciones.')}</p>}
    {notes.map(note=><div key={note.id} className={'annotation'+(note.resolved?' resolved':'')}>
      <div className="annotation-head">
        <span className={`severity ${note.severity}`}>{SEVERITY_LABELS[note.severity]}</span>
        <span className="mono">{note.source==='ai'?t('IA'):t('Usuario')}{note.resolved?t(' · resuelta'):''}</span>
        {targetId===undefined&&(note.targetId?<button className="quiet" onClick={()=>select([note.targetId!])}>{note.targetId}</button>:<span className="mono">{t('documento')}</span>)}
      </div>
      <TextField label={t('Texto')} value={note.text} multiline maxLength={1000} onCommit={value=>transact([{type:'UPDATE_ANNOTATION',id:note.id,changes:{text:value}}],t('Anotación editada'))}/>
      {note.suggestion&&<p className="inline-note">{t('Sugerencia:')} {note.suggestion}</p>}
      <div className="button-grid two">
        <button onClick={()=>transact([{type:'UPDATE_ANNOTATION',id:note.id,changes:{resolved:!note.resolved}}],note.resolved?t('Anotación reabierta'):t('Anotación resuelta'))}>{note.resolved?t('Reabrir'):t('Resolver')}</button>
        <button onClick={()=>transact([{type:'DELETE_ANNOTATION',id:note.id}],t('Anotación eliminada'))}>{t('Eliminar')}</button>
      </div>
    </div>)}
    <div className="field"><label htmlFor="new-annotation">{t('Nueva anotación')}{targetId===undefined?t(' del documento'):''}</label>
      <textarea id="new-annotation" rows={2} maxLength={1000} value={text} onChange={e=>setText(e.target.value)}/></div>
    <div className="button-grid two">
      <select aria-label={t('Severidad')} value={severity} onChange={e=>setSeverity(e.target.value as DiagramAnnotation['severity'])}>{SEVERITIES.map(s=><option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}</select>
      <button disabled={!text.trim()} onClick={add}>{t('Agregar')}</button>
    </div>
  </fieldset>;
}
