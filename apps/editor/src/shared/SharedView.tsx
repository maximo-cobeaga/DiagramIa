import {useEffect,useState} from 'react';
import {openDocument,type DiagramDocument} from '@diagramia/core';
import {DIAGRAM_CSS} from '../canvas/DiagramLayer';
import {Presentation} from '../presentation/Presentation';
import {playbackStore,usePlaybackClock} from '../store/playbackStore';
import {viewStore} from '../store/viewStore';
import {startSharedViewTelemetry,track} from '../telemetry';
import {SITE_URL} from '../ui';
import {t} from '../i18n';

const SITE=SITE_URL+'?utm_source=share&utm_medium=viewer';
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Página de un enlace compartido (ADR 106): el diagrama y su animación en sólo lectura, para cualquiera que tenga el enlace.
 * Pide el diagrama por su token y lo muestra con el modo presentación; no monta el editor, no guarda nada y no pide sesión.
 */
export function SharedView({token}:{token:string}){
  const [state,setState]=useState<'loading'|'missing'|'error'|'ready'>(token?'loading':'missing'),[doc,setDoc]=useState<DiagramDocument|null>(null),[attempt,setAttempt]=useState(0);
  usePlaybackClock();
  // Un enlace privado no se ofrece a los buscadores. index.html ya trae un robots (noindex): se endurece ese mismo, sin duplicarlo.
  useEffect(()=>{
    const existing=document.querySelector<HTMLMetaElement>('meta[name="robots"]'),meta=existing??document.createElement('meta'),previous=meta.content;
    meta.name='robots';meta.content='noindex,nofollow';if(!existing)document.head.append(meta);
    return()=>{if(existing)meta.content=previous;else meta.remove();};
  },[]);
  useEffect(()=>{
    if(!token)return;
    let alive=true;setState('loading');
    fetch(`/api/v1/shared/${token}`,{headers:{'x-diagramia-client':'editor'}}).then(async response=>{
      if(!alive)return;
      if(response.status===404){setState('missing');return;}
      if(!response.ok)throw new Error(String(response.status));
      const opened=openDocument((await response.json()).document).document;
      if(!alive)return;
      // El modo presentación ya sabe mostrar una copia que no es el documento del editor.
      viewStore.set({tour:{doc:opened,previousAnimationId:''}});
      const animated=opened.animations.length>0;
      playbackStore.set({animationId:'',scenarioId:'',time:0,playing:animated&&!reducedMotion(),cue:1});
      document.title=`${opened.title} · Diagramia`;
      setDoc(opened);setState('ready');
      startSharedViewTelemetry({animated,steps:Math.min(100_000,opened.animations[0]?.steps.length??0)});
    }).catch(()=>{if(alive)setState('error');});
    return()=>{alive=false;};
  },[token,attempt]);
  if(state==='ready'&&doc)return <><style>{DIAGRAM_CSS}</style><Presentation shared={
    <div className="shared-head"><strong title={doc.title}>{doc.title}</strong>
      <a className="shared-brand" href={SITE} target="_blank" rel="noopener" onClick={()=>track('shared_view_cta_clicked',{})}><img src="/favicon.svg" alt=""/><span>{t('Hecho con')} <b>diagramia</b></span><em>{t('Crear el tuyo gratis →')}</em></a>
    </div>}/></>;
  return <main className="shared-status">
    <a className="brand" href={SITE}><img src="/favicon.svg" alt=""/>diagramia</a>
    {state==='loading'?<p role="status">{t('Abriendo el diagrama…')}</p>:state==='missing'?<>
      <h1>{t('Este enlace ya no está disponible')}</h1>
      <p>{t('Puede que quien lo compartió haya dejado de hacerlo, o que la dirección esté incompleta.')}</p>
    </>:<>
      <h1>{t('No se pudo abrir el diagrama')}</h1>
      <p>{t('Revisá tu conexión y probá de nuevo.')}</p>
      <button onClick={()=>setAttempt(attempt+1)}>{t('Reintentar')}</button>
    </>}
    {state!=='loading'&&<a className="shared-cta" href={SITE}>{t('Conocer Diagramia')}</a>}
  </main>;
}
