import {useEffect,useRef,useState} from 'react';
import {useStore} from '../store/createStore';
import {documentStore} from '../store/documentStore';
import {cancelCameraMove,viewStore,type AccountSection} from '../store/viewStore';
import {playbackStore} from '../store/playbackStore';
import {accountStore,refreshAccount,signIn,type Account} from '../store/accountStore';
import {createSharedDocument,detachCloudDocuments,detachSharedDocument,listSharedDocuments,openSharedDocument,recoverShared,retryShared,sharedStore} from '../store/sharedStore';
import {browserOptOut,flush as flushTelemetry,setTelemetryEnabled,telemetryEnabled} from '../telemetry';
import {PlanBox,ProBenefits} from './PlanBox';
import {startCheckout} from './checkout';
import {EditorPreferences} from './EditorPreferences';
import {LANG,t} from '../i18n';
import {serverTextIn} from '../serverText';

type Entry={id:string;title:string;revision:number;shareToken?:string|null};
const authHeaders={'x-diagramia-client':'editor'};
const mb=(bytes:number)=>(bytes/1_000_000).toFixed(1)+' MB';
const close=()=>viewStore.set({accountOpen:false});
// La palabra que se escribe para confirmar va en el idioma del editor; al servidor siempre le llega la suya.
const CONFIRM_WORD=t('ELIMINAR');

/** La verificación del email sólo llega con el inicio de sesión: volver a pasar por el proveedor la actualiza, y con su sesión abierta no pide la contraseña. */
export function ReauthButton(){
  return <button className="quiet" onClick={()=>void flushTelemetry(true).finally(()=>window.location.assign('/api/v1/auth/login'))}>{t('Ya lo verifiqué')}</button>;
}

function Meter({label,used,max,format=String,unlimited=false}:{label:string;used:number;max:number;format?:(n:number)=>string;unlimited?:boolean}){
  if(unlimited)return <div className="meter"><div className="meter-head"><span>{label}</span><strong>{format(used)} {t('usados · sin límite')}</strong></div></div>;
  const ratio=max>0?Math.min(1,used/max):0;
  return <div className="meter"><div className="meter-head"><span>{label}</span><strong>{format(used)} / {format(max)}</strong></div>
    <div className="meter-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(used,max)}><i className={ratio>=1?'full':ratio>=.8?'high':''} style={{width:`${ratio*100}%`}}/></div></div>;
}


function UpgradeCard({account}:{account:Account}){
  const [working,setWorking]=useState(false),[error,setError]=useState('');
  if(!account.billing.available||account.billing.plan==='pro')return null;
  return <section className="upgrade-card" aria-label={t('Plan Pro')}>
    <div><span className="eyebrow">{t('DIAGRAMIA PRO')}</span><h3>{t('Más IA, más diagramas, sin frenarte.')}</h3>
      <p className="price"><strong>USD {account.billing.prices?.monthlyUsd??10}</strong> {t('por mes')}{account.billing.prices?.yearlyUsd?t(' o USD {0} por año',account.billing.prices.yearlyUsd):''} {t('· cancelás cuando quieras')}</p></div>
    <ProBenefits/>
    <button className="primary big" disabled={working} onClick={async()=>{setWorking(true);setError('');const failure=await startCheckout();if(failure){setWorking(false);setError(failure);}}}>{working?t('Abriendo el pago…'):t('Pasar a Pro')}</button>
    <small>{t('Si pasan menos de 14 días desde el pago, te lo devolvemos.')} <a href={LANG==='en'?'https://diagramia.app/refunds.html':'https://diagramia.app/reembolsos.html'} target="_blank" rel="noopener noreferrer">{t('Condiciones')}</a></small>
    {error&&<p className="inline-note warn" role="alert">{error}</p>}
  </section>;
}

function Summary({account}:{account:Account}){
  const {credits,storage,billing}=account,pro=billing.plan==='pro',email=account.session.email;
  return <>
    <div className="account-hero"><span className="avatar big" aria-hidden="true">{(email??'?').slice(0,1).toUpperCase()}</span>
      <div><h2>{email??t('Mi cuenta')}</h2><span className={'plan-badge'+(pro?' pro':'')}>{pro?t('Plan Pro'):t('Plan Free')}</span></div></div>
    {!account.session.emailVerified&&<p className="inline-note warn" role="status">{t('⚠ Tu email todavía no está verificado: la IA se habilita cuando lo confirmes desde el correo que te enviamos.')} <ReauthButton/></p>}
    <section aria-label={t('Uso del plan')}><h3>{t('Tu uso')}</h3>
      <Meter label={t('Créditos de IA este mes')} used={credits.monthly} max={credits.monthlyLimit} unlimited={credits.unlimited}/>
      <Meter label={t('Créditos de IA hoy')} used={credits.daily} max={credits.dailyLimit} unlimited={credits.unlimited}/>
      {credits.unlimited&&<p className="inline-note">{t('Tu cuenta es de administrador: los pedidos a la IA se cuentan, pero no tienen tope.')}</p>}
      <Meter label={t('Diagramas en la nube')} used={storage.documents} max={storage.maxDocuments}/>
      <Meter label={t('Almacenamiento')} used={storage.bytes} max={storage.maxBytes} format={mb}/></section>
    <UpgradeCard account={account}/>
  </>;
}

function Diagrams({account,cloud,loading,refresh}:{account:Account;cloud:Entry[];loading:boolean;refresh:()=>Promise<void>}){
  const {activeId,doc}=useStore(documentStore),shared=useStore(sharedStore),attached=shared.tabId===activeId;
  const bodyBytes=new TextEncoder().encode(JSON.stringify(doc)).length,full=account.storage.documents>=account.storage.maxDocuments;
  const open=async(id:string)=>{if(await openSharedDocument(id,'cloud')){await refresh();close();}};
  return <>
    <h2>{t('Mis diagramas')}</h2>
    <p className="inline-note">{account.storage.documents} {t('de')} {account.storage.maxDocuments} {t('diagramas ·')} {mb(account.storage.bytes)} {t('de')} {mb(account.storage.maxBytes)}</p>
    <div className="step-actions">
      {!attached&&<button className="primary" disabled={full||bodyBytes>account.storage.maxDocumentBytes} onClick={async()=>{await createSharedDocument('cloud');await refresh();}}>{t('Guardar el diagrama abierto en la nube')}</button>}
      {attached&&<button disabled={shared.pending>0||shared.phase==='sending'} onClick={()=>detachSharedDocument()}>{t('Dejar de sincronizar el diagrama abierto')}</button>}
      {attached&&shared.phase==='offline'&&<button onClick={retryShared}>{t('Reintentar guardado')}</button>}
      {attached&&shared.phase==='conflict'&&<button onClick={()=>void recoverShared()}>{t('Descargar copia y cargar servidor')}</button>}
      <button className="quiet" disabled={loading} onClick={()=>void refresh()}>{loading?t('Cargando…'):t('Actualizar')}</button>
    </div>
    {full&&account.billing.available&&account.billing.plan==='free'&&<p className="inline-note warn" role="status">{t('Llegaste al límite de diagramas de Free. Con Pro guardás hasta 100.')}</p>}
    <p className="inline-note" role="status">{shared.message}{attached?t(' {0} cambio(s) pendiente(s).',shared.pending):''}</p>
    {bodyBytes>account.storage.maxDocumentBytes&&!attached&&<p className="inline-note warn" role="status">{t('Este diagrama supera el tamaño permitido por tu plan. Podés exportarlo para conservarlo.')}</p>}
    {loading?<p role="status">{t('Cargando tus diagramas…')}</p>:cloud.length?<ul className="shared-documents big">{cloud.map(item=><li key={item.id}><button onClick={()=>void open(item.id)} title={item.id}>{item.title}<small>r{item.revision}{item.shareToken?t(' · 🔗 compartido por enlace'):''}</small></button></li>)}</ul>
      :<p className="empty-state">{t('Todavía no guardaste ningún diagrama en la nube. Guardá el que tenés abierto y lo vas a encontrar acá desde cualquier dispositivo.')}</p>}
  </>;
}

function AccountSettings({account,onChange}:{account:Account;onChange:()=>Promise<void>}){
  const shared=useStore(sharedStore);
  const [enabled,setEnabled]=useState(telemetryEnabled()),blocked=browserOptOut();
  const [deleting,setDeleting]=useState<'closed'|'open'|'working'>('closed'),[confirmation,setConfirmation]=useState(''),[deleteError,setDeleteError]=useState(''),[signOutError,setSignOutError]=useState('');
  const pendingCloud=shared.mode==='cloud'&&(shared.pending>0||shared.phase==='sending'||shared.phase==='connecting');
  const signOut=async()=>{
    if(pendingCloud)return;
    setSignOutError('');
    const response=await fetch('/api/v1/auth/logout',{method:'POST',headers:authHeaders}).catch(()=>null);
    if(!response?.ok){setSignOutError(t('No se pudo cerrar la sesión. Probá de nuevo.'));return;}
    detachCloudDocuments();
    close();await onChange();
  };
  /** Borra la cuenta en el servidor. Los borradores de este navegador no se tocan: siguen siendo del usuario. */
  const deleteAccount=async()=>{
    setDeleting('working');setDeleteError('');
    const response=await fetch('/api/v1/auth/delete-account',{method:'POST',headers:{...authHeaders,'content-type':'application/json'},body:JSON.stringify({confirm:'ELIMINAR'})}).catch(()=>null);
    if(!response?.ok){setDeleting('open');{const failure=(await response?.json().catch(()=>null))?.error?.message;setDeleteError(typeof failure==='string'?serverTextIn(LANG,failure):t('No se pudo contactar al servidor. Probá de nuevo.'));}return;}
    detachCloudDocuments();
    setDeleting('closed');setConfirmation('');close();await onChange();
  };
  return <>
    <h3 className="settings-section-title">{t('Cuenta y privacidad')}</h3>
    <section aria-label={t('Sesión')}><h3>{t('Sesión')}</h3><p className="inline-note">{account.session.email??t('Cuenta activa')}{account.session.emailVerified?t(' ✓ verificado'):''}</p>
      <div className="step-actions"><button disabled={pendingCloud} onClick={()=>void signOut()}>{t('Cerrar sesión')}</button></div>
      {pendingCloud&&<p className="inline-note warn" role="status">{t('Hay cambios pendientes de guardar. Reintentá el guardado desde Mis diagramas antes de cerrar sesión.')}</p>}
      {signOutError&&<p className="inline-note warn" role="alert">{signOutError}</p>}</section>
    <section aria-label={t('Privacidad')}><h3>{t('Privacidad')}</h3>
      <label className="check"><input type="checkbox" checked={enabled&&!blocked} disabled={blocked} onChange={e=>{setTelemetryEnabled(e.target.checked);setEnabled(e.target.checked);}}/>{t('Enviar datos anónimos de uso')}</label>
      <p className="inline-note">{blocked?t('Tu navegador pide no ser rastreado (Do Not Track o Global Privacy Control): no se envía nada.'):t('Sirven para mejorar Diagramia: qué herramientas se usan, errores y tiempos. Nunca se envía el texto de tus diagramas ni tus pedidos a la IA.')} <a href={LANG==='en'?'/privacy.html':'/privacidad.html'} target="_blank" rel="noopener noreferrer">{t('Aviso de privacidad')}</a></p></section>
    <details className="danger-zone" open={deleting!=='closed'} onToggle={e=>setDeleting((e.target as HTMLDetailsElement).open?'open':'closed')}>
      <summary>{t('Eliminar mi cuenta')}</summary>
      <p className="inline-note">{t('Se borran tu cuenta, tus')} {account.storage.documents} {t('diagrama(s) en la nube con sus versiones y tus créditos. No se puede deshacer. Si querés conservar algo de la nube, exportalo antes.')}</p>
      <label className="field" htmlFor="delete-confirm">{t('Escribí {0} para confirmar',CONFIRM_WORD)}</label>
      <input id="delete-confirm" value={confirmation} autoComplete="off" onChange={e=>setConfirmation(e.target.value)}/>
      {deleteError&&<p className="inline-note warn" role="alert">{deleteError}</p>}
      <button className="danger" disabled={confirmation.trim()!==CONFIRM_WORD||deleting==='working'||pendingCloud} onClick={()=>void deleteAccount()}>{deleting==='working'?t('Eliminando…'):t('Eliminar definitivamente')}</button>
    </details>
  </>;
}

const SECTIONS:[AccountSection,string][]=[['resumen',t('Resumen')],['diagramas',t('Mis diagramas')],['plan',t('Plan y facturación')],['ajustes',t('Configuración')]];

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
    }catch{setCloudError(t('No se pudieron cargar tus diagramas. Usá Actualizar para reintentar.'));}
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
  return <dialog ref={dialog} className="account-page" aria-label={t('Mi cuenta')} onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]')).filter(element=>{
      const collapsed=element.closest('details:not([open])');
      return element.tabIndex>=0&&!element.matches(':disabled')&&element.getClientRects().length>0&&(!collapsed||element===collapsed.querySelector('summary'));
    });
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first&&last){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last&&first){event.preventDefault();first.focus();}
  }}>
    <header><button onClick={close}>{t('← Volver al canvas')}</button><a className="brand" href="#" onClick={event=>{event.preventDefault();close();}}><img src="/favicon.svg" alt=""/>diagramia</a><span className="account-header-note">{t('TU ESPACIO PERSONAL')}</span></header>
    <div className="account-body">
      <nav aria-label={t('Secciones de la cuenta')}><div className="account-nav-identity"><span className="eyebrow">{t('MI CUENTA')}</span><strong>{account?.session.email??t('Tu espacio')}</strong><span className="plan-badge">{account?.billing.plan==='pro'?t('Pro'):t('Free')}</span></div>{(account?SECTIONS:SECTIONS.filter(([id])=>id==='resumen'||id==='ajustes')).map(([id,label],i)=><button key={id} aria-label={label} className={accountSection===id?'chosen':''} aria-current={accountSection===id?'page':undefined} onClick={()=>pick(id)}><span className="nav-index" aria-hidden="true">0{i+1}</span>{label}<span className="nav-arrow" aria-hidden="true">↗</span></button>)}<p className="account-nav-foot">{t('Un poco de orden.')}<br/>{t('Mucho espacio para crear.')}</p></nav>
      <main>
        {auth==='loading'&&<p className="inline-note">{t('Comprobando la sesión…')}</p>}
        {auth==='unavailable'&&<><p className="inline-note" role="alert">{t('La cuenta no está disponible en este momento.')}</p><button onClick={()=>void refresh()}>{t('Reintentar')}</button></>}
        {auth==='guest'&&accountSection!=='ajustes'&&<section className="account-pitch"><h2>{t('Guardá tus diagramas en la nube')}</h2>
          <p>{t('Creá tu cuenta gratis y tené tus diagramas en cualquier dispositivo, con IA incluida cada mes.')}</p>
          <ul className="benefits"><li>{t('3 diagramas en la nube')}</li><li>{t('20 créditos de IA por mes')}</li><li>{t('Exportá a JSON, SVG, PNG, Mermaid, PDF y más')}</li></ul>
          <button className="primary big" onClick={()=>signIn('menu')}>{t('Crear cuenta o iniciar sesión')}</button></section>}
        {account&&accountSection==='resumen'&&<Summary account={account}/>}
        {account&&accountSection==='diagramas'&&<>{cloudError?<><h2>{t('Mis diagramas')}</h2><p className="inline-note warn" role="alert">{cloudError}</p><button disabled={loading} onClick={()=>void refresh()}>{t('Actualizar')}</button></>:<Diagrams account={account} cloud={cloud} loading={loading} refresh={refresh}/>}</>}
        {account&&accountSection==='plan'&&<><div className="settings-intro"><span className="eyebrow">{t('ELEGÍ TU PRÓXIMO PASO')}</span><h2>{t('Más posibilidades.')}<br/>{t('El mismo canvas.')}</h2><p>{t('Empezá con Free. Elegí Pro cuando tus ideas pidan más.')}</p></div><PlanBox account={account}/></>}
        {accountSection==='ajustes'&&<><EditorPreferences/>{account&&<AccountSettings account={account} onChange={refresh}/>}</>}
      </main>
    </div>
  </dialog>;
}
