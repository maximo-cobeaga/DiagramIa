import {useState} from 'react';
import {describeError,errorCode,getContext,previewBatch,type DiagramDocument} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {commit,documentStore,newId,notify} from '../store/documentStore';
import {selectionStore} from '../store/selectionStore';
import {saveFile} from '../ui';

type Preview=ReturnType<typeof previewBatch>;
const COLLECTION_LABELS:Record<keyof Preview['changes'],string>={nodes:'Nodos',edges:'Conexiones',drawings:'Trazos',zones:'Zonas',groups:'Grupos',frames:'Frames',animations:'Animaciones',assets:'Imágenes',annotations:'Anotaciones'};

function redisExample(doc:DiagramDocument,selected:string[]){
  const anchor=doc.nodes.find(n=>n.id===selected[0])??doc.nodes.find(n=>n.id==='api')??doc.nodes[0];
  const id=doc.nodes.some(n=>n.id==='redis')?newId('redis'):'redis';
  return {id:newId('proposal'),baseRevision:doc.revision,actions:[
    {type:'ADD_NODE',node:{id,kind:'cache',label:'Redis',position:{x:0,y:0},size:{width:150,height:82},subtitle:'CACHE'},...(anchor?{placement:{...(anchor.zoneId?{inside:anchor.zoneId}:{}),below:anchor.id,gap:60}}:{})},
    ...(anchor?[{type:'ADD_EDGE',edge:{id:`${anchor.id}-${id}`.slice(0,80),from:anchor.id,to:id,label:'Cache'}}]:[])
  ]};
}

/**
 * Canal manual para otra IA (por MCP o copiando y pegando): se entrega un lote de acciones, se valida sobre una copia
 * y recién al aceptar se aplica. El chat integrado vive en Chat.tsx.
 */
export function ManualChannel(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore);
  const [raw,setRaw]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[problem,setProblem]=useState(''),[scope,setScope]=useState<'document'|'selection'>('document');
  const edit=(text:string)=>{setRaw(text);setPreview(null);setProblem('');};
  // Un diff calculado contra otra revisión ya no describe lo que pasaría: se descarta en vez de mostrarlo como vigente.
  const current=preview&&preview.beforeRevision===doc.revision?preview:null;

  async function copyContext(){
    const body=JSON.stringify(getContext(doc,ids,{scope}),null,2);
    try{await navigator.clipboard.writeText(body);notify(scope==='selection'&&ids.length?'Contexto de la selección y sus vecinos copiado.':'Contexto del documento copiado.');}
    catch{saveFile('diagramia-context.json',body,'application/json');notify('No se pudo usar el portapapeles: el contexto se descargó como archivo.','warn');}
  }
  function inspect(){
    try{setPreview(previewBatch(doc,JSON.parse(raw)));setProblem('');}
    catch(e){setPreview(null);setProblem(errorCode(e)==='REVISION_CONFLICT'?`El lote se armó para otra revisión y no se aplica sobre trabajo más nuevo. ${describeError(e)}`:describeError(e));}
  }
  function accept(){
    try{if(commit(JSON.parse(raw),'Propuesta aplicada'))edit('');}
    catch(e){setProblem(describeError(e));}
  }
  return <div className="manual-channel">
    <details className="manual"><summary>Usar otra IA: copiar contexto y pegar un lote</summary>
    <div className="panel-stack">
    <p className="inline-note">Copiá el contexto, pedile a tu IA un lote de acciones y pegalo acá.</p>
    <fieldset className="choice"><legend>Qué contexto copiar</legend>
      <label className="check"><input type="radio" name="scope" checked={scope==='document'} onChange={()=>setScope('document')}/>Documento completo</label>
      <label className="check"><input type="radio" name="scope" checked={scope==='selection'} onChange={()=>setScope('selection')}/>Selección y vecinos ({ids.length})</label>
    </fieldset>
    <button onClick={copyContext}>Copiar contexto · r{doc.revision}</button>
    <div className="proposal-heading"><label htmlFor="proposal">Propuesta (lote de acciones JSON)</label><button className="quiet" disabled={!doc.nodes.length} onClick={()=>edit(JSON.stringify(redisExample(doc,ids),null,2))}>Ejemplo: agregar Redis</button></div>
    <textarea id="proposal" value={raw} spellCheck={false} placeholder='{"id":"proposal-1","baseRevision":0,"actions":[...]}' onChange={e=>edit(e.target.value)}/>
    <button disabled={!raw.trim()} onClick={inspect}>Validar y ver cambios</button>
    {problem&&<p className="inline-note error" role="alert">✕ {problem}</p>}
    {preview&&!current&&<p className="inline-note warn" role="alert">⚠ El documento cambió después de validar. Volvé a validar para ver el diff vigente.</p>}
    {current&&<div className="diff">
      <span className="eyebrow">REVISIÓN {current.beforeRevision} → {current.afterRevision}</span>
      {(Object.keys(COLLECTION_LABELS) as (keyof Preview['changes'])[]).filter(key=>{const c=current.changes[key];return c.added.length+c.updated.length+c.removed.length>0;}).map(key=>{
        const c=current.changes[key];
        return <p key={key}><strong>{COLLECTION_LABELS[key]}</strong>{c.added.length>0&&<><br/>+ agrega: {c.added.join(', ')}</>}{c.updated.length>0&&<><br/>~ modifica: {c.updated.join(', ')}</>}{c.removed.length>0&&<><br/>− elimina: {c.removed.join(', ')}</>}</p>;
      })}
      {current.prunedReferences.length>0&&<p>⚠ Pasos de animación que pierden referencias: {current.prunedReferences.map(p=>`${p.stepId} (${p.removed.join(', ')})`).join('; ')}. Revisá sus textos después de aplicar.</p>}
    </div>}
    <div className="button-grid two">
      <button className="primary" disabled={!current} onClick={accept}>Aceptar y aplicar</button>
      <button disabled={!raw} onClick={()=>{edit('');notify('Propuesta descartada. El documento no cambió.');}}>Rechazar</button>
    </div>
    </div></details>
  </div>;
}
