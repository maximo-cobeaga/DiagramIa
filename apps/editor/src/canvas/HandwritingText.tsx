import {useEffect,useRef,useState} from 'react';
import {documentBounds,fitSize,type DiagramDocument,type DiagramDrawing} from '@diagramia/core';
import {documentStore,newId,notify,transact} from '../store/documentStore';
import {select} from '../store/selectionStore';
import {deviceHandwriting,recognizeHandwriting} from './handwriting';
import {t} from '../i18n';

/** El texto reconocido siempre se revisa: original intacto hasta confirmar, y reemplazo atómico con undo. */
export function HandwritingText({doc,drawings,onClose}:{doc:DiagramDocument;drawings:DiagramDrawing[];onClose:()=>void}){
  const [text,setText]=useState(''),[message,setMessage]=useState(t('Leyendo tu escritura…')),[pending,setPending]=useState(true),ref=useRef<HTMLInputElement>(null);
  const source=useRef({doc,drawings}).current;
  useEffect(()=>{
    let active=true;void recognizeHandwriting(drawings.map(d=>d.points),deviceHandwriting()).then(result=>{
      if(!active)return;setPending(false);setText(result.text);
      setMessage(result.status==='recognized'?t('Revisá el texto antes de reemplazar los trazos.'):result.status==='unavailable'?t('Este navegador no reconoce escritura. Podés escribir el texto acá.'):t('No pude reconocer la escritura en español. Podés escribir o corregir el texto acá.'));ref.current?.focus();
    });return()=>{active=false;};
  },[]);
  const confirm=()=>{
    const current=documentStore.get().doc;
    if(current!==source.doc){notify(t('El documento cambió. Cerrá y volvé a seleccionar los trazos para convertirlos.'),'warn');onClose();return;}
    const label=text.replace(/\s+/g,' ').trim();if(!label)return;
    const bounds=documentBounds(doc,drawings.map(d=>d.id))!,style={textColor:drawings[0].style.stroke,fontSize:Math.max(15,Math.min(40,bounds.height)),align:'left' as const};
    const node={id:newId('node'),kind:'text' as const,shape:'text' as const,label,subtitle:'',details:'',assetId:null,icon:null,position:{x:bounds.x,y:bounds.y},size:{width:Math.min(4000,Math.max(24,bounds.width)),height:Math.min(4000,Math.max(24,bounds.height))},style};
    const need=fitSize(node);node.size={width:Math.min(4000,Math.max(node.size.width,need.width)),height:Math.min(4000,Math.max(node.size.height,need.height))};
    if(transact([...drawings.map(d=>({type:'DELETE_DRAWING' as const,id:d.id})),{type:'ADD_NODE',node}],t('Escritura convertida en texto'))){select([node.id]);onClose();}
  };
  return <form className="handwriting-text" aria-label={t('Convertir escritura en texto')} onSubmit={e=>{e.preventDefault();confirm();}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}}}>
    <p role="status">{message}</p><label>{t('Tu texto')}<input ref={ref} autoFocus value={text} maxLength={200} onChange={e=>setText(e.target.value)}/></label>
    <div className="row"><button type="submit" disabled={pending||!text.trim()}>{t('Reemplazar por texto')}</button><button type="button" onClick={onClose}>{t('Cancelar')}</button></div><small>{t('Deshacer recupera los trazos originales.')}</small>
  </form>;
}
