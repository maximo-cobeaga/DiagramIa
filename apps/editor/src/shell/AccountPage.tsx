import {useEffect,useRef,useState} from 'react';
import {useStore} from '../store/createStore';
import {documentStore} from '../store/documentStore';
import {cancelCameraMove,viewStore,type AccountSection} from '../store/viewStore';
import {playbackStore} from '../store/playbackStore';
import {accountStore,refreshAccount,signIn,type Account} from '../store/accountStore';
import {createSharedDocument,detachSharedDocument,listSharedDocuments,openSharedDocument,recoverShared,retryShared,sharedStore} from '../store/sharedStore';
import {browserOptOut,flush as flushTelemetry,setTelemetryEnabled,telemetryEnabled} from '../telemetry';
import {PlanBox,ProBenefits} from './PlanBox';
import {startCheckout} from './checkout';

type Entry={id:string;title:string;revision:number};
const authHeaders={'x-diagramia-client':'editor'};
const mb=(bytes:number)=>(bytes/1_000_000).toFixed(1)+' MB';
const close=()=>viewStore.set({accountOpen:false});

/** La verificación del email sólo llega con el inicio de sesión: volver a pasar por el proveedor la actualiza, y con su sesión abierta no pide la contraseña. */
export function ReauthButton(){
  return <button className="quiet" onClick={()=>void flushTelemetry(true).finally(()=>window.location.assign('/api/v1/auth/login'))}>Ya lo verifiqué</button>;
}

function Meter({label,used,max,format=String}:{label:string;used:number;max:number;format?:(n:number)=>string}){
  const ratio=max>0?Math.min(1,used/max):0;
  return <div className="meter"><div className="meter-head"><span>{label}</span><strong>{format(used)} / {format(max)}</strong></div>
    <div className="meter-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(used,max)}><i className={ratio>=1?'full':ratio>=.8?'high':''} style={{width:`${ratio*100}%`}}/></div></div>;
}


function UpgradeCard({account}:{account:Account}){
  const [working,setWorking]=useState(false),[error,setError]=useState('');
  if(!account.billing.available||account.billing.plan==='pro')return null;
  return <section className="upgrade-card" aria-label="Plan Pro">
    <div><span className="eyebrow">DIAGRAMIA PRO</span><h3>Más IA, más diagramas, sin frenarte.</h3>
      <p className="price"><strong>USD {account.billing.prices?.monthlyUsd??10}</strong> por mes{account.billing.prices?.yearlyUsd?` o USD ${account.billing.prices.yearlyUsd} por año`:''} · cancelás cuando quieras</p></div>
    <ProBenefits/>
    <button className="primary big" disabled={working} onClick={async()=>{setWorking(true);setError('');const failure=await startCheckout();if(failure){setWorking(false);setError(failure);}}}>{working?'Abriendo el pago…':'Pasar a Pro'}</button>
    <small>Si pasan menos de 48 horas desde el pago, te lo devolvemos. <a href="https://diagramia.app/reembolsos.html" target="_blank" rel="noopener noreferrer">Condiciones</a></small>
    {error&&<p className="inline-note warn" role="alert">{error}</p>}
  </section>;
}

function Summary({account}:{account:Account}){
  const {credits,storage,billing}=account,pro=billing.plan==='pro',email=account.session.email;
  return <>
    <div className="account-hero"><span className="avatar big" aria-hidden="true">{(email??'?').slice(0,1).toUpperCase()}</span>
      <div><h2>{email??'Mi cuenta'}</h2><span className={'plan-badge'+(pro?' pro':'')}>{pro?'Plan Pro':'Plan Free'}</span></div></div>
    {!account.session.emailVerified&&<p className="inline-note warn" role="status">⚠ Tu email todavía no está verificado: la IA se habilita cuando lo confirmes desde el correo que te enviamos. <ReauthButton/></p>}
    <section aria-label="Uso del plan"><h3>Tu uso</h3>
      <Meter label="Créditos de IA este mes" used={credits.monthly} max={credits.monthlyLimit}/>
      <Meter label="Créditos de IA hoy" used={credits.daily} max={credits.dailyLimit}/>
      <Meter label="Diagramas en la nube" used={storage.documents} max={storage.maxDocuments}/>
      <Meter label="Almacenamiento" used={storage.bytes} max={storage.maxBytes} format={mb}/></section>
    <UpgradeCard account={account}/>
  </>;
}

function Diagrams({account,cloud,loading,refresh}:{account:Account;cloud:Entry[];loading:boolean;refresh:()=>Promise<void>}){
  const {activeId,doc}=useStore(documentStore),shared=useStore(sharedStore),attached=shared.tabId===activeId;
  const bodyBytes=new TextEncoder().encode(JSON.stringify(doc)).length,full=account.storage.documents>=account.storage.maxDocuments;
  const open=async(id:string)=>{if(await openSharedDocument(id,'cloud')){await refresh();close();}};
  return <>
    <h2>Mis diagramas</h2>
    <p className="inline-note">{account.storage.documents} de {account.storage.maxDocuments} diagramas · {mb(account.storage.bytes)} de {mb(account.storage.maxBytes)}</p>
    <div className="step-actions">
      {!attached&&<button className="primary" disabled={full||bodyBytes>account.storage.maxDocumentBytes} onClick={async()=>{await createSharedDocument('cloud');await refresh();}}>Guardar el diagrama abierto en la nube</button>}
      {attached&&<button disabled={shared.pending>0||shared.phase==='sending'} onClick={()=>detachSharedDocument()}>Dejar de sincronizar el diagrama abierto</button>}
      {attached&&shared.phase==='offline'&&<button onClick={retryShared}>Reintentar guardado</button>}
      {attached&&shared.phase==='conflict'&&<button onClick={()=>void recoverShared()}>Descargar copia y cargar servidor</button>}
      <button className="quiet" disabled={loading} onClick={()=>void refresh()}>{loading?'Cargando…':'Actualizar'}</button>
    </div>
    {full&&account.billing.available&&account.billing.plan==='free'&&<p className="inline-note warn" role="status">Llegaste al límite de diagramas de Free. Con Pro guardás hasta 100.</p>}
    <p className="inline-note" role="status">{shared.message}{attached?` ${shared.pending} cambio(s) pendiente(s).`:''}</p>
    {bodyBytes>account.storage.maxDocumentBytes&&!attached&&<p className="inline-note warn" role="status">Este diagrama supera el tamaño permitido por tu plan. Podés exportarlo para conservarlo.</p>}
    {loading?<p role="status">Cargando tus diagramas…</p>:cloud.length?<ul className="shared-documents big">{cloud.map(item=><li key={item.id}><button onClick={()=>void open(item.id)} title={item.id}>{item.title}<small>r{item.revision}</small></button></li>)}</ul>
      :<p className="empty-state">Todavía no guardaste ningún diagrama en la nube. Guardá el que tenés abierto y lo vas a encontrar acá desde cualquier dispositivo.</p>}
  </>;
}

function Settings({account,onChange}:{account:Account;onChange:()=>Promise<void>}){
  const shared=useStore(sharedStore);
  const [enabled,setEnabled]=useState(telemetryEnabled()),blocked=browserOptOut();
  const [deleting,setDeleting]=useState<'closed'|'open'|'working'>('closed'),[confirmation,setConfirmation]=useState(''),[deleteError,setDeleteError]=useState(''),[signOutError,setSignOutError]=useState('');
  const pendingCloud=shared.mode==='cloud'&&(shared.pending>0||shared.phase==='sending'||shared.phase==='connecting');
  const signOut=async()=>{
    if(pendingCloud)return;
    setSignOutError('');
    const response=await fetch('/api/v1/auth/logout',{method:'POST',headers:authHeaders}).catch(()=>null);
    if(!response?.ok){setSignOutError('No se pudo cerrar la sesión. Probá de nuevo.');return;}
    if(shared.mode==='cloud')detachSharedDocument();
    close();await onChange();
  };
  /** Borra la cuenta en el servidor. Los borradores de este navegador no se tocan: siguen siendo del usuario. */
  const deleteAccount=async()=>{
    setDeleting('working');setDeleteError('');
    const response=await fetch('/api/v1/auth/delete-account',{method:'POST',headers:{...authHeaders,'content-type':'application/json'},body:JSON.stringify({confirm:confirmation.trim()})}).catch(()=>null);
    if(!response?.ok){setDeleting('open');setDeleteError((await response?.json().catch(()=>null))?.error?.message??'No se pudo contactar al servidor. Probá de nuevo.');return;}
    if(shared.mode==='cloud')detachSharedDocument();
    setDeleting('closed');setConfirmation('');close();await onChange();
  };
  return <>
    <h2>Configuración</h2>
    <section aria-label="Sesión"><h3>Sesión</h3><p className="inline-note">{account.session.email??'Cuenta activa'}{account.session.emailVerified?' ✓ verificado':''}</p>
      <div className="step-actions"><button disabled={pendingCloud} onClick={()=>void signOut()}>Cerrar sesión</button></div>
      {pendingCloud&&<p className="inline-note warn" role="status">Hay cambios pendientes de guardar. Reintentá el guardado desde Mis diagramas antes de cerrar sesión.</p>}
      {signOutError&&<p className="inline-note warn" role="alert">{signOutError}</p>}</section>
    <section aria-label="Privacidad"><h3>Privacidad</h3>
      <label className="check"><input type="checkbox" checked={enabled&&!blocked} disabled={blocked} onChange={e=>{setTelemetryEnabled(e.target.checked);setEnabled(e.target.checked);}}/>Enviar datos anónimos de uso</label>
      <p className="inline-note">{blocked?'Tu navegador pide no ser rastreado (Do Not Track o Global Privacy Control): no se envía nada.':'Sirven para mejorar Diagramia: qué herramientas se usan, errores y tiempos. Nunca se envía el texto de tus diagramas ni tus pedidos a la IA.'} <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">Aviso de privacidad</a></p></section>
    <details className="danger-zone" open={deleting!=='closed'} onToggle={e=>setDeleting((e.target as HTMLDetailsElement).open?'open':'closed')}>
      <summary>Eliminar mi cuenta</summary>
      <p className="inline-note">Se borran tu cuenta, tus {account.storage.documents} diagrama(s) en la nube con sus versiones y tus créditos. No se puede deshacer. Si querés conservar algo de la nube, exportalo antes.</p>
      <label className="field" htmlFor="delete-confirm">Escribí ELIMINAR para confirmar</label>
      <input id="delete-confirm" value={confirmation} autoComplete="off" onChange={e=>setConfirmation(e.target.value)}/>
      {deleteError&&<p className="inline-note warn" role="alert">{deleteError}</p>}
      <button className="danger" disabled={confirmation.trim()!=='ELIMINAR'||deleting==='working'||pendingCloud} onClick={()=>void deleteAccount()}>{deleting==='working'?'Eliminando…':'Eliminar definitivamente'}</button>
    </details>
  </>;
}

const SECTIONS:[AccountSection,string][]=[['resumen','Resumen'],['diagramas','Mis diagramas'],['plan','Plan y facturación'],['ajustes','Configuración']];

/** Sección Cuenta a pantalla completa: uso, diagramas, suscripción y ajustes en un solo lugar. */
export function AccountPage(){
  const {accountOpen,accountSection}=useStore(viewStore),{auth,account}=useStore(accountStore);
  const dialog=useRef<HTMLDialogElement>(null);
  const [cloud,setCloud]=useState<Entry[]>([]),[loading,setLoading]=useState(false),[cloudError,setCloudError]=useState('');
  const refresh=async()=>{
    setLoading(true);setCloudError('');
    try{
      await refreshAccount();
      setCloud(accountStore.get().auth==='signed-in'?await listSharedDocuments('cloud',{throwOnError:true}):[]);
    }catch{setCloudError('No se pudieron cargar tus diagramas. Usá Actualizar para reintentar.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(accountOpen)void refresh();},[accountOpen]);
  useEffect(()=>{
    if(!accountOpen||!dialog.current)return;
    const element=dialog.current,previous=document.activeElement;
    playbackStore.set({playing:false});cancelCameraMove();
    element.showModal();
    return()=>{element.close();if(previous instanceof HTMLElement)previous.focus();};
  },[accountOpen]);
  if(!accountOpen)return null;
  const pick=(section:AccountSection)=>viewStore.set({accountSection:section});
  return <dialog ref={dialog} className="account-page" aria-label="Mi cuenta" onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]')).filter(element=>{
      const collapsed=element.closest('details:not([open])');
      return element.tabIndex>=0&&!element.matches(':disabled')&&element.getClientRects().length>0&&(!collapsed||element===collapsed.querySelector('summary'));
    });
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first&&last){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last&&first){event.preventDefault();first.focus();}
  }}>
    <header><button onClick={close}>← Volver al canvas</button><strong>Mi cuenta</strong></header>
    <div className="account-body">
      {account&&<nav aria-label="Secciones de la cuenta">{SECTIONS.map(([id,label])=><button key={id} className={accountSection===id?'chosen':''} aria-current={accountSection===id?'page':undefined} onClick={()=>pick(id)}>{label}</button>)}</nav>}
      <main>
        {auth==='loading'&&<p className="inline-note">Comprobando la sesión…</p>}
        {auth==='unavailable'&&<><p className="inline-note" role="alert">La cuenta no está disponible en este momento.</p><button onClick={()=>void refresh()}>Reintentar</button></>}
        {auth==='guest'&&<section className="account-pitch"><h2>Guardá tus diagramas en la nube</h2>
          <p>Creá tu cuenta gratis y tené tus diagramas en cualquier dispositivo, con IA incluida cada mes.</p>
          <ul className="benefits"><li>3 diagramas en la nube</li><li>20 créditos de IA por mes</li><li>Exportá a JSON, SVG, PNG, Mermaid, PDF y más</li></ul>
          <button className="primary big" onClick={()=>signIn('menu')}>Crear cuenta o iniciar sesión</button></section>}
        {account&&accountSection==='resumen'&&<Summary account={account}/>}
        {account&&accountSection==='diagramas'&&<>{cloudError?<><h2>Mis diagramas</h2><p className="inline-note warn" role="alert">{cloudError}</p><button disabled={loading} onClick={()=>void refresh()}>Actualizar</button></>:<Diagrams account={account} cloud={cloud} loading={loading} refresh={refresh}/>}</>}
        {account&&accountSection==='plan'&&<><h2>Plan y facturación</h2><PlanBox account={account}/></>}
        {account&&accountSection==='ajustes'&&<Settings account={account} onChange={refresh}/>}
      </main>
    </div>
  </dialog>;
}
