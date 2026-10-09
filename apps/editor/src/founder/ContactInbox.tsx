import {useCallback,useEffect,useState} from 'react';

type Inquiry={id:string;createdAt:string;name:string;email:string;company:string;teamSize:string|null;message:string;status:'new'|'answered'};
const headers={'x-diagramia-client':'editor','content-type':'application/json'};

/** Los mensajes comerciales viven en una bandeja privada, separada de las métricas de uso. */
export function ContactInbox(){
  const [contacts,setContacts]=useState<Inquiry[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[working,setWorking]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/v1/admin/contacts',{headers});
      if(!response.ok)throw new Error(response.status===403?'La bandeja es sólo para administradores.':'No se pudo cargar la bandeja.');
      setContacts((await response.json()).contacts);
    }catch(failure){setError(failure instanceof Error?failure.message:'No se pudo cargar la bandeja.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const mark=async(id:string)=>{
    setWorking(id);setError('');
    try{
      const response=await fetch('/api/v1/admin/contacts',{method:'PATCH',headers,body:JSON.stringify({id,status:'answered'})});
      if(!response.ok)throw new Error('No se pudo actualizar la consulta.');
      setContacts(items=>items.map(item=>item.id===id?{...item,status:'answered'}:item));
    }catch(failure){setError(failure instanceof Error?failure.message:'No se pudo actualizar la consulta.');}
    finally{setWorking(null);}
  };
  return <section className="contact-inbox" aria-label="Consultas de empresas">
    <div className="step-actions"><h2 className="founder-section">Consultas de empresas</h2><button disabled={loading} onClick={()=>void refresh()}>Actualizar consultas</button></div>
    <p className="inline-note">Últimas 100 consultas. Respondé por email y marcá la consulta cuando hayas enviado la respuesta.</p>
    {error&&<p role="alert" className="inline-note warn">{error}</p>}
    {loading&&<p role="status">Cargando consultas…</p>}
    {!loading&&!error&&!contacts.length&&<p className="empty-state">Todavía no hay consultas.</p>}
    {contacts.map(item=><article key={item.id} className="founder-tile inquiry">
      <div className="inquiry-heading"><h3>{item.company}</h3><span className="plan-badge">{item.status==='new'?'Nueva':'Respondida'}</span></div>
      <p>{item.name} · {item.email}{item.teamSize?` · ${item.teamSize} personas`:''}</p>
      <small>{new Date(item.createdAt).toLocaleString('es-AR')}</small>
      <p className="inquiry-message">{item.message}</p>
      <div className="step-actions"><a className="button" href={`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent('Tu consulta sobre Diagramia para empresas')}`}>Responder por email</a>
        {item.status==='new'&&<button disabled={working===item.id} onClick={()=>void mark(item.id)}>{working===item.id?'Guardando…':'Marcar como respondida'}</button>}</div>
    </article>)}
  </section>;
}
