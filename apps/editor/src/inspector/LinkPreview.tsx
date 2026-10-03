import {useEffect,useState} from 'react';
import {describeError,tidyBatch,type DiagramNode} from '@diagramia/core';
import {commit,documentStore,newId,notify} from '../store/documentStore';

type Preview={url:string;title:string|null;description:string|null;site:string|null};
type State={status:'idle'}|{status:'loading'}|{status:'error';message:string}|{status:'done';preview:Preview};

/**
 * Trae el título y la descripción de la página enlazada, sólo cuando se pide. El servidor visita la página (con
 * protección contra redes internas) y devuelve texto plano; se aplica como nombre y detalle editables, en un paso.
 */
export function LinkPreview({node}:{node:DiagramNode}){
  const [state,setState]=useState<State>({status:'idle'});
  useEffect(()=>setState({status:'idle'}),[node.id,node.link]);
  if(!node.link)return null;
  const load=async()=>{
    setState({status:'loading'});
    try{
      const response=await fetch('/api/v1/link-preview',{method:'POST',headers:{'content-type':'application/json','x-diagramia-client':'editor'},credentials:'same-origin',body:JSON.stringify({url:node.link})});
      const body=await response.json().catch(()=>null) as (Preview&{error?:{message?:string}})|null;
      if(!response.ok||!body)return setState({status:'error',message:body?.error?.message??'No se pudo traer la vista previa. Probá de nuevo más tarde.'});
      if(!body.title&&!body.description)return setState({status:'error',message:'La página no tiene título ni descripción para mostrar.'});
      setState({status:'done',preview:body});
    }catch{setState({status:'error',message:'No hay conexión con el servidor de Diagramia.'});}
  };
  const apply=(preview:Preview)=>{
    const changes={...(preview.title?{label:preview.title}:{}),...(preview.description?{details:preview.description}:{})};
    // El ordenador agranda el nodo si el título nuevo no entra y le hace lugar sin pisar a los vecinos.
    const {doc}=documentStore.get();
    try{commit(tidyBatch(doc,{id:newId('link'),baseRevision:doc.revision,actions:[{type:'UPDATE_NODE',id:node.id,changes}]}).batch,'Datos de la página aplicados');}
    catch(e){notify('No se pudieron aplicar los datos: '+describeError(e),'error');}
    setState({status:'idle'});
  };
  return <div className="link-preview">
    {state.status!=='done'&&<button onClick={load} disabled={state.status==='loading'} title="El servidor de Diagramia visita la página y trae su título y descripción">
      {state.status==='loading'?'Buscando la página…':'Traer título y descripción de la página'}</button>}
    {state.status==='error'&&<p className="inline-note" role="alert">{state.message}</p>}
    {state.status==='done'&&<div className="link-preview-card" aria-live="polite">
      {state.preview.site&&<small>{state.preview.site}</small>}
      {state.preview.title&&<strong>{state.preview.title}</strong>}
      {state.preview.description&&<p>{state.preview.description}</p>}
      <div className="row">
        <button className="primary" onClick={()=>apply(state.preview)}>Usar como {state.preview.title&&state.preview.description?'nombre y detalle':state.preview.title?'nombre':'detalle'}</button>
        <button onClick={()=>setState({status:'idle'})}>Descartar</button>
      </div>
    </div>}
  </div>;
}
