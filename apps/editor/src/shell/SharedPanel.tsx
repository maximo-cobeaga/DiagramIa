import {useEffect,useState} from 'react';
import {useStore} from '../store/createStore';
import {documentStore} from '../store/documentStore';
import {createSharedDocument,detachSharedDocument,listSharedDocuments,openSharedDocument,recoverShared,retryShared,sharedStore,type SharedMode} from '../store/sharedStore';

type Entry={id:string;title:string;revision:number};
type Account={session:{email:string|null;projectId:string};storage:{documents:number;bytes:number;maxDocuments:number;maxBytes:number;maxDocumentBytes:number}};
const authHeaders={'x-diagramia-client':'editor'};
const mb=(bytes:number)=>(bytes/1_000_000).toFixed(1)+' MB';

export function SharedPanel(){
  const {activeId,doc}=useStore(documentStore),shared=useStore(sharedStore);
  const [local,setLocal]=useState<Entry[]>([]),[cloud,setCloud]=useState<Entry[]>([]),[account,setAccount]=useState<Account|null>(null),[auth,setAuth]=useState<'loading'|'unavailable'|'guest'|'signed-in'>('loading'),[loading,setLoading]=useState(false);
  const attached=shared.tabId===activeId,bodyBytes=new TextEncoder().encode(JSON.stringify(doc)).length;
  const refresh=async()=>{
    setLoading(true);
    const status=await fetch('/api/v1/auth/status',{headers:authHeaders}).then(r=>r.ok?r.json():null).catch(()=>null);
    if(status?.configured){
      const response=await fetch('/api/v1/auth/me',{headers:authHeaders}).catch(()=>null);
      if(response?.ok){const data=await response.json() as Account;setAccount(data);setAuth('signed-in');setCloud(await listSharedDocuments('cloud'));}
      else{setAccount(null);setCloud([]);setAuth('guest');}
    }else{setAccount(null);setCloud([]);setAuth('unavailable');}
    setLocal(await listSharedDocuments('local'));
    setLoading(false);
  };
  useEffect(()=>{void refresh();},[]);
  const share=async(mode:SharedMode)=>{await createSharedDocument(mode);await refresh();};
  const open=async(id:string,mode:SharedMode)=>{await openSharedDocument(id,mode);await refresh();};
  const signOut=async()=>{
    if(attached&&shared.mode==='cloud'&&shared.pending)return;
    await fetch('/api/v1/auth/logout',{method:'POST',headers:authHeaders});
    if(attached&&shared.mode==='cloud')detachSharedDocument();
    await refresh();
  };
  const list=(items:Entry[],mode:SharedMode)=>items.length?<ul className="shared-documents">{items.map(item=><li key={item.id}><button onClick={()=>void open(item.id,mode)} title={item.id}>{item.title}<small>r{item.revision} · {item.id}</small></button></li>)}</ul>:<p className="inline-note">Todavía no hay diagramas guardados.</p>;
  return <section className="shared-panel" aria-label="Guardado y espacios compartidos">
    <h3>Cuenta y nube</h3>
    {auth==='loading'&&<p className="inline-note">Comprobando la sesión…</p>}
    {auth==='unavailable'&&<p className="inline-note">La cuenta aún no está configurada en este servidor. Podés seguir con el borrador local y exportar el JSON.</p>}
    {auth==='guest'&&<div className="step-actions"><p className="inline-note">Iniciá sesión para guardar en la nube.</p><button onClick={()=>window.location.assign('/api/v1/auth/login')}>Iniciar sesión</button></div>}
    {account&&<>
      <p className="inline-note">{account.session.email??'Cuenta activa'} · {account.storage.documents}/{account.storage.maxDocuments} diagramas · {mb(account.storage.bytes)}/{mb(account.storage.maxBytes)} usados.</p>
      <p className="inline-note">Esta pestaña ocupa {mb(bodyBytes)}; el máximo por diagrama, incluidas sus versiones, es {mb(account.storage.maxDocumentBytes)}.</p>
      <div className="step-actions"><button disabled={account.storage.documents>=account.storage.maxDocuments||bodyBytes>account.storage.maxDocumentBytes||attached} onClick={()=>void share('cloud')}>Guardar esta pestaña en la nube</button><button disabled={attached&&shared.mode==='cloud'&&shared.pending>0} onClick={()=>void signOut()}>Cerrar sesión</button></div>
      <div className="shared-list-head"><strong>Mis diagramas</strong><button className="quiet" disabled={loading} onClick={()=>void refresh()}>Actualizar</button></div>
      {list(cloud,'cloud')}
    </>}
    <h3>Espacio compartido local</h3>
    <p className="inline-note">Con PostgreSQL local, MCP puede editar el mismo documento. Esta opción no crea una cuenta ni publica el archivo.</p>
    <div className="step-actions">
      {!attached&&<button onClick={()=>void share('local')}>Compartir esta pestaña</button>}
      {attached&&<button onClick={()=>detachSharedDocument()}>Dejar de compartir</button>}
      {attached&&shared.phase==='offline'&&<button onClick={retryShared}>Reintentar guardado</button>}
      {attached&&shared.phase==='conflict'&&<button onClick={()=>void recoverShared()}>Descargar copia y cargar servidor</button>}
    </div>
    <p className="inline-note" role="status">{attached?shared.message:'Esta pestaña se guarda en el navegador.'}</p>
    {attached&&<small>{shared.pending} cambio(s) pendiente(s). Revisión guardada: {shared.serverRevision??'—'}.</small>}
    <div className="shared-list-head"><strong>Documentos locales del servidor</strong><button className="quiet" disabled={loading} onClick={()=>void refresh()}>{loading?'Cargando…':'Actualizar'}</button></div>
    {local.length?list(local,'local'):<p className="inline-note">Para habilitarlo, iniciá PostgreSQL y el gateway con DIAGRAMIA_LOCAL_WORKSPACE=1.</p>}
  </section>;
}
