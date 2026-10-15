import {useEffect,useRef,useState} from 'react';
import {useStore} from '../store/createStore';
import {documentStore} from '../store/documentStore';
import {accountStore,refreshAccount,signIn} from '../store/accountStore';
import {createShareLink,createSharedDocument,removeShareLink,shareTokenOf,shareUrl,sharedStore} from '../store/sharedStore';
import {viewStore} from '../store/viewStore';
import {t} from '../i18n';

const close=()=>viewStore.set({shareOpen:false});
const problem=(error:unknown)=>error instanceof Error&&error.message?error.message:t('No se pudo contactar al servidor.');

/** Entrada a «Compartir», a la vista en la cabecera. Sin cuentas en el servidor no hay dónde publicar el enlace. */
export function ShareButton(){
  const {auth}=useStore(accountStore);
  if(auth==='loading'||auth==='unavailable')return null;
  return <button className="share-open" onClick={()=>viewStore.set({shareOpen:true})} title={t('Crear un enlace para que otros vean este diagrama y su animación')}>{t('🔗 Compartir')}</button>;
}

/**
 * Enlace público de sólo lectura (ADR 106). Compartir es una decisión explícita: abrir este diálogo no publica nada.
 * El enlace existe sólo para diagramas de la nube, así que uno que vive en el navegador se guarda primero en la cuenta.
 */
export function ShareDialog(){
  const {auth,account}=useStore(accountStore),shared=useStore(sharedStore),{activeId,doc}=useStore(documentStore);
  const cloudId=shared.tabId===activeId&&shared.mode==='cloud'&&shared.docId===doc.id?doc.id:null,connecting=shared.phase==='connecting';
  const [token,setToken]=useState<string|null>(null),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null),linkRef=useRef<HTMLInputElement>(null),busy=useRef(false);
  // Escape cierra aunque el foco haya quedado fuera del diálogo (el editor de atrás está inerte).
  useEffect(()=>{
    rootRef.current?.focus();
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();close();}};
    window.addEventListener('keydown',onKey,true);return()=>window.removeEventListener('keydown',onKey,true);
  },[]);
  // Con el diagrama ya en la nube se consulta si tiene un enlace vigente. Mientras este diálogo crea o corta uno, manda esa operación.
  useEffect(()=>{
    if(!cloudId||connecting||busy.current)return;
    let alive=true;setLoading(true);setError('');
    shareTokenOf(cloudId).then(found=>{if(alive&&!busy.current)setToken(found);}).catch(failure=>{if(alive&&!busy.current)setError(problem(failure));}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[cloudId,connecting]);

  const run=async(action:()=>Promise<void>)=>{
    busy.current=true;setWorking(true);setError('');setCopied(false);
    try{await action();}catch(failure){setError(problem(failure));}finally{busy.current=false;setWorking(false);}
  };
  const create=()=>run(async()=>{
    if(!cloudId){
      // createSharedDocument avisa por su cuenta si falla; acá sólo se corta el recorrido.
      if(!await createSharedDocument('cloud'))return;
      void refreshAccount();
    }
    setToken(await createShareLink(documentStore.get().doc.id));
  });
  const remove=()=>run(async()=>{if(!cloudId)return;await removeShareLink(cloudId);setToken(null);});
  const copy=async()=>{
    if(!token)return;
    try{await navigator.clipboard.writeText(shareUrl(token));setCopied(true);}
    catch{linkRef.current?.select();setCopied(document.execCommand?.('copy')===true);}
  };
  const full=Boolean(account&&!cloudId&&account.storage.documents>=account.storage.maxDocuments);
  const unsaved=Boolean(cloudId)&&(shared.pending>0||shared.phase==='offline'||shared.phase==='conflict');
  return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
    <div className="modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" tabIndex={-1} ref={rootRef}>
      <span className="eyebrow">{t('COMPARTIR')}</span>
      <h2 id="share-title">{t('Compartí «{0}» con un enlace',doc.title)}</h2>
      <p>{t('Quien tenga el enlace ve el diagrama y reproduce su animación, sin cuenta y sin poder editarlo. No ve nada más de tu cuenta.')}</p>
      {auth==='guest'||!account?<>
        <p className="inline-note">{t('Para crear un enlace necesitás una cuenta: el diagrama se guarda en tu nube y el enlace muestra esa copia.')}</p>
        <div className="modal-actions"><button className="quiet" onClick={close}>{t('Cerrar')}</button><button className="primary" onClick={()=>signIn('cloud')}>{t('Crear cuenta o iniciar sesión')}</button></div>
      </>:token?<>
        <label className="field" htmlFor="share-link">{t('Enlace de sólo lectura')}</label>
        <div className="share-link"><input id="share-link" ref={linkRef} readOnly value={shareUrl(token)} onFocus={e=>e.currentTarget.select()}/>
          <button className="primary" onClick={()=>void copy()}>{copied?t('✓ Copiado'):t('Copiar enlace')}</button></div>
        <p className="inline-note">{t('Muestra siempre la última versión guardada en tu nube: no hace falta volver a compartir después de editar.')}</p>
        {unsaved&&<p className="inline-note warn" role="status">{t('Hay cambios que todavía no se guardaron en la nube: el enlace muestra la versión anterior.')}</p>}
        {error&&<p className="inline-note warn" role="alert">{error}</p>}
        <div className="modal-actions"><button className="quiet danger-text" disabled={working} onClick={()=>void remove()}>{working?t('Cortando…'):t('Dejar de compartir')}</button>
          <a className="button-link" href={shareUrl(token)} target="_blank" rel="noopener noreferrer">{t('Abrir el enlace')}</a><button onClick={close}>{t('Listo')}</button></div>
      </>:<>
        {!cloudId&&<p className="inline-note">{full?t('Tu plan ya no tiene lugar para otro diagrama en la nube. Liberá uno o pasá a Pro para compartir este.'):t('Este diagrama vive sólo en este navegador. Al crear el enlace se guarda en tu cuenta y desde ahí cada cambio se guarda solo.')}</p>}
        {error&&<p className="inline-note warn" role="alert">{error}</p>}
        <div className="modal-actions"><button className="quiet" onClick={close}>{t('Cancelar')}</button>
          {full?<button className="primary" onClick={()=>viewStore.set({shareOpen:false,accountOpen:true,accountSection:'diagramas'})}>{t('Ver mis diagramas')}</button>
            :<button className="primary" disabled={working||loading||connecting} onClick={()=>void create()}>{working?t('Creando el enlace…'):loading||connecting?t('Cargando…'):cloudId?t('Crear enlace'):t('Guardar en la nube y crear enlace')}</button>}</div>
      </>}
    </div>
  </div>;
}
