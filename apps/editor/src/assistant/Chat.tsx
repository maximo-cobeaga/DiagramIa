import {useEffect,useRef,useState} from 'react';
import {documentBounds,nodeRect,previewBatch,type ActionBatchInput} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {commit,documentStore,newId,notify,transact} from '../store/documentStore';
import {select,selectionStore} from '../store/selectionStore';
import {fit,viewStore} from '../store/viewStore';
import {saveFile} from '../ui';

// El gateway se alcanza por el proxy del servidor de desarrollo: el navegador nunca ve claves de proveedores.
const API='/api';
const HEADERS={'content-type':'application/json','x-diagramia-client':'editor'};
type Changes=ReturnType<typeof previewBatch>['changes'];
type ProviderInfo={id:string;label:string;model:string;kind:'remote'|'local'|'mock';configured:boolean;missing:string|null};
type Budget={tokens:number;dailyTokenBudget:number;estimatedUsd:number;dailyUsdBudget:number};
type Credits={daily:number;monthly:number;dailyLimit:number;monthlyLimit:number};
type Usage={inputTokens:number;outputTokens:number;calls:number;estimatedCostUsd:number|null;costBasis:string};
type Common={requestId:string;mode:string;provider:string;providerKind:ProviderInfo['kind'];model:string;baseRevision:number;contextTruncated:boolean;repairs:number;replayed:boolean;usage:Usage};
type Finding={targetId:string;severity:'info'|'warning'|'risk';observation:string;evidence:string;suggestion:string};
type Result=Common&(
  |{kind:'proposal';summary:string;batch:ActionBatchInput;changes:Changes;prunedReferences:{stepId:string;removed:string[]}[];warnings?:string[]}
  |{kind:'clarification';summary:string;clarification:string}
  |{kind:'text';text:string}
  |{kind:'review';summary:string;findings:Finding[]});
type Turn={id:string;prompt:string;mode:string;body:string;status:'sending'|'done'|'error';result?:Result;error?:{message:string;retryable:boolean};outcome?:'applied'|'rejected'|'saved'};

const MODES:[string,string,string][]=[
  ['edit','Editar','Cambia sólo lo pedido, con la selección como contexto.'],['create','Crear','Arma elementos o un diagrama nuevo.'],
  ['transform','Transformar','Reorganiza sin perder elementos.'],['animate','Animar','Propone pasos de animación.'],
  ['explain','Explicar','Responde con texto; no cambia el canvas.'],['review','Revisar','Observaciones ligadas a elementos; no es una auditoría.'],
  ['document','Documentar','Redacta Markdown a partir del documento.']
];
const SUGGESTIONS:[string,string][]=[['create','Creá un diagrama de inicio de sesión con usuario, frontend, API y base de datos'],['edit','Agregá Redis como caché dentro de Backend, debajo de la API'],['explain','Explicá qué hace este sistema'],['review','Revisá la arquitectura y señalá riesgos']];
const SEVERITY={info:'Info',warning:'Atención',risk:'Riesgo'} as const;
const COLLECTIONS:Record<keyof Changes,string>={nodes:'Nodos',edges:'Conexiones',drawings:'Trazos',zones:'Zonas',groups:'Grupos',frames:'Frames',animations:'Animaciones',assets:'Imágenes',annotations:'Anotaciones'};
const COST_BASIS:Record<string,string>={'published-price-estimate':'estimado con la tarifa publicada; el cobro real lo informa el proveedor','local-no-charge':'modelo local, sin cargo del proveedor','unknown-price':'sin tarifa conocida para estimar',none:'sin consumo'};
const HISTORY_TURNS=3;
const describe=(action:ActionBatchInput['actions'][number])=>{
  const a=action as Record<string,unknown>&{node?:{id:string;label:string};edge?:{from:string;to:string};zone?:{label:string};frame?:{label:string};animation?:{label:string}};
  return `${a.type}${a.node?` · ${a.node.label} (${a.node.id})`:a.edge?` · ${a.edge.from} → ${a.edge.to}`:a.zone?` · ${a.zone.label}`:a.frame?` · ${a.frame.label}`:a.animation?` · ${a.animation.label}`:typeof a.id==='string'?` · ${a.id}`:''}`;
};
/** Lo que queda de un turno en la conversación: texto corto, nunca el lote ni el documento. */
const replyOf=(result:Result)=>(result.kind==='proposal'?`Propuse ${result.batch.actions.length} acción(es): ${result.summary}`
  :result.kind==='clarification'?result.clarification:result.kind==='text'?result.text
  :`Revisión: ${result.summary} ${result.findings.map(f=>`[${f.targetId}] ${f.observation}`).join(' ')}`).trim().slice(0,1500)||'Sin respuesta.';

/** Chat con el asistente: mensajes en burbujas, propuestas como tarjetas que se ven en el canvas, y el cuadro de texto abajo. */
export function Chat(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),{staging}=useStore(viewStore);
  const [providers,setProviders]=useState<ProviderInfo[]|null>(null),[budget,setBudget]=useState<Budget|null>(null),[credits,setCredits]=useState<Credits|null>(null),[offline,setOffline]=useState(false),[authRequired,setAuthRequired]=useState(false),[providerId,setProviderId]=useState(''),[mode,setMode]=useState('edit'),[prompt,setPrompt]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[stageNote,setStageNote]=useState('');
  const controller=useRef<AbortController|null>(null),threadRef=useRef<HTMLDivElement>(null);
  const last=turns[turns.length-1],sending=last?.status==='sending';
  const patch=(id:string,changes:Partial<Turn>)=>setTurns(list=>list.map(turn=>turn.id===id?{...turn,...changes}:turn));

  async function loadProviders(){
    try{
      const response=await fetch(API+'/v1/providers',{headers:HEADERS});
      if(response.status===401){setAuthRequired(true);setOffline(false);setProviders(null);return;}
      if(!response.ok)throw new Error(String(response.status));
      const body=await response.json(),list=body.providers as ProviderInfo[];
      setProviders(list);setBudget(body.usage);setCredits(body.credits??null);setOffline(false);setAuthRequired(false);
      setProviderId(current=>list.some(p=>p.id===current&&p.configured)?current:list.find(p=>p.configured&&p.kind!=='mock')?.id??list.find(p=>p.configured)?.id??'');
    }catch{setProviders(null);setOffline(true);}
  }
  const unstage=()=>{viewStore.set({staging:null});setStageNote('');};
  useEffect(()=>{void loadProviders();return()=>{controller.current?.abort();viewStore.set({staging:null});};},[]);
  useEffect(()=>{threadRef.current?.scrollTo({top:threadRef.current.scrollHeight});},[turns.length,last?.status]);

  async function send(turn:Turn){
    controller.current=new AbortController();unstage();
    setTurns(list=>[...list.filter(t=>t.id!==turn.id),{...turn,status:'sending',error:undefined}]);
    try{
      const response=await fetch(API+'/v1/assist',{method:'POST',headers:HEADERS,body:turn.body,signal:controller.current.signal}),data=await response.json();
      if(!response.ok){patch(turn.id,{status:'error',error:{message:data?.error?.message??`El gateway respondió ${response.status}.`,retryable:[429,502,504].includes(response.status)}});return;}
      patch(turn.id,{status:'done',result:data as Result});
      void loadProviders();
    }catch(error){
      if(error instanceof DOMException&&error.name==='AbortError')patch(turn.id,{status:'error',error:{message:'Pedido cancelado. El documento no cambió.',retryable:false}});
      // Un corte de red se reintenta con el MISMO requestId: si el gateway ya había terminado, devuelve ese resultado sin gastar de nuevo.
      else patch(turn.id,{status:'error',error:{message:'Se perdió la conexión con el gateway. Reintentá: se usa el mismo identificador para no duplicar el pedido.',retryable:true}});
    }
  }
  function submit(text=prompt,asMode=mode){
    if(!text.trim()||!providerId||sending)return;
    const history=turns.filter(t=>t.status==='done'&&t.result).slice(-HISTORY_TURNS).flatMap(t=>[{role:'user',content:t.prompt},{role:'assistant',content:replyOf(t.result!)}]);
    const id=newId('ai');
    setPrompt('');
    void send({id,prompt:text.trim(),mode:asMode,status:'sending',body:JSON.stringify({requestId:id,providerId,mode:asMode,prompt:text.trim(),document:doc,selectedIds:ids,history})});
  }
  const provider=providers?.find(p=>p.id===providerId);
  // Sólo la última propuesta se puede aplicar; las anteriores quedan como registro de la conversación.
  const proposal=last?.status==='done'&&last.result?.kind==='proposal'&&!last.outcome?last.result:null,stale=Boolean(proposal&&proposal.baseRevision!==doc.revision);
  // Si el documento cambió, la vista previa ya no describe lo que pasaría: se retira.
  useEffect(()=>{if(stale)viewStore.set({staging:null});},[stale]);
  // Una propuesta nueva se dibuja sola en el canvas: se ve antes de decidir, sin que nada se aplique.
  useEffect(()=>{if(proposal&&proposal.baseRevision===doc.revision)stage(proposal.batch.actions.length,true);},[proposal?.requestId]);

  /** Aplica los primeros `count` pasos de la propuesta sobre una copia y la muestra en el canvas. */
  function stage(count:number,reveal=false){
    if(!proposal)return;
    const total=proposal.batch.actions.length,build=(upTo:number)=>previewBatch(doc,{id:newId('staging'),baseRevision:doc.revision,actions:proposal.batch.actions.slice(0,upTo)});
    let step=count,preview:ReturnType<typeof previewBatch>;
    try{preview=build(step);setStageNote('');}
    catch{
      // Un paso intermedio puede no ser válido por sí solo (por ejemplo, un nodo cuya zona todavía no tiene su tamaño final): se muestra el resultado completo.
      try{preview=build(total);step=total;setStageNote(`El paso ${count} no es válido por separado: se muestra la propuesta completa.`);}
      catch{unstage();setStageNote('La propuesta ya no se puede aplicar sobre el documento actual.');return;}
    }
    const changed=Object.values(preview.changes).flatMap(c=>[...c.added,...c.updated]);
    viewStore.set({staging:{doc:preview.document,changed,step,total}});
    if(reveal){
      // Si lo propuesto cae fuera de la vista, se encuadra todo para que no pase inadvertido.
      const {camera,viewport}=viewStore.get(),right=camera.x+viewport.width/camera.zoom,bottom=camera.y+viewport.height/camera.zoom;
      const hidden=preview.document.nodes.filter(n=>changed.includes(n.id)).map(nodeRect).some(r=>r.x<camera.x||r.y<camera.y||r.x+r.width>right||r.y+r.height>bottom);
      if(hidden)fit(documentBounds(preview.document));
    }
  }
  const usageLine=(result:Result)=>`${result.model}${result.providerKind==='mock'?' · DEMOSTRACIÓN':''} · ${result.usage.inputTokens.toLocaleString('es')} + ${result.usage.outputTokens.toLocaleString('es')} tokens${result.usage.estimatedCostUsd!==null?` · USD ${result.usage.estimatedCostUsd.toFixed(4)}`:''} (${COST_BASIS[result.usage.costBasis]??result.usage.costBasis})${result.repairs>0?` · ${result.repairs} reparación`:''}${result.replayed?' · recuperado sin nuevo consumo':''}${result.contextTruncated?' · contexto recortado':''}`;

  function answer(turn:Turn){
    const result=turn.result!;
    if(result.kind==='clarification')return <p>{result.clarification}</p>;
    if(result.kind==='text')return <><pre className="answer">{result.text}</pre><button className="quiet" onClick={()=>saveFile(`${doc.id}-${result.mode}.md`,result.text+'\n','text/markdown')}>Descargar .md</button></>;
    if(result.kind==='review')return <>
      <p>{result.summary||'Revisión'}</p>
      {result.findings.length?<ul className="findings">{result.findings.map((f,i)=><li key={i}><button className="quiet" onClick={()=>select([f.targetId])}>[{SEVERITY[f.severity]}] {f.targetId}</button><span>{f.observation}</span>{f.evidence&&<small>Evidencia: {f.evidence}</small>}{f.suggestion&&<small>Sugerencia: {f.suggestion}</small>}</li>)}</ul>:<p>Sin observaciones.</p>}
      {turn.outcome==='saved'?<small>Guardadas como anotaciones.</small>:result.findings.length>0&&<button onClick={()=>{
        // Se guardan sobre el documento actual: una observación cuyo elemento ya no existe queda a nivel de documento.
        const alive=new Set([...doc.nodes,...doc.edges,...doc.zones,...doc.frames,...doc.groups].map(x=>x.id));
        if(transact(result.findings.map(f=>({type:'ADD_ANNOTATION' as const,annotation:{id:newId('note'),targetId:alive.has(f.targetId)?f.targetId:null,severity:f.severity,text:[f.observation,f.evidence&&`Evidencia: ${f.evidence}`].filter(Boolean).join(' ').slice(0,1000),suggestion:f.suggestion.slice(0,1000),source:'ai' as const}})),`${result.findings.length} observación(es) guardadas como anotaciones`))patch(turn.id,{outcome:'saved'});
      }}>Guardar como anotaciones</button>}
      <small>Las observaciones son una lectura del modelo, no una certeza ni una auditoría.</small>
    </>;
    const live=turn===last&&!turn.outcome;
    return <>
      <p>{result.summary||'Propuesta de cambios'}</p>
      <ol className="staged">{result.batch.actions.map((action,i)=><li key={i} className={live&&staging&&i<staging.step?'shown':''}>{describe(action)}</li>)}</ol>
      <p className="mono">{(Object.keys(COLLECTIONS) as (keyof Changes)[]).flatMap(key=>{const c=result.changes[key];return [c.added.length&&`+${c.added.length} ${COLLECTIONS[key].toLowerCase()}`,c.updated.length&&`~${c.updated.length} ${COLLECTIONS[key].toLowerCase()}`,c.removed.length&&`−${c.removed.length} ${COLLECTIONS[key].toLowerCase()}`].filter(Boolean);}).join(' · ')}</p>
      {result.warnings?.map((warning,i)=><p key={i} className="warn">⚠ {warning}</p>)}
      {result.prunedReferences.length>0&&<p className="warn">⚠ Pasos de animación que pierden referencias: {result.prunedReferences.map(p=>p.stepId).join(', ')}.</p>}
      {!live&&<small>{turn.outcome==='applied'?'✓ Aplicada.':turn.outcome==='rejected'?'Rechazada: el documento no cambió.':'Reemplazada por un pedido posterior.'}</small>}
      {live&&<>
        {!stale&&<div className="stage-control">
          <label className="check"><input type="checkbox" data-role="stage-toggle" checked={Boolean(staging)} onChange={e=>e.target.checked?stage(result.batch.actions.length):unstage()}/>Mostrar en el canvas (resaltada; todavía no se aplicó)</label>
          {staging&&result.batch.actions.length>1&&<label>Paso a paso: {staging.step} de {staging.total}<input type="range" aria-label="Paso de la propuesta" min="1" max={staging.total} value={staging.step} onChange={e=>stage(+e.target.value)}/></label>}
          {stageNote&&<small>{stageNote}</small>}
        </div>}
        {stale&&<p className="warn" role="alert">⚠ Editaste el documento mientras la IA respondía (ahora r{doc.revision}). La propuesta no se aplica sobre tu trabajo nuevo: regenerala con la revisión actual.</p>}
        <div className="button-grid two">
          {stale?<button className="primary" onClick={()=>submit(turn.prompt,turn.mode)}>Regenerar</button>
            :<button className="primary" onClick={()=>{unstage();if(commit(result.batch,'Propuesta de IA aplicada'))patch(turn.id,{outcome:'applied'});}}>Aceptar y aplicar</button>}
          <button onClick={()=>{unstage();patch(turn.id,{outcome:'rejected'});notify('Propuesta rechazada. El documento no cambió.');}}>Rechazar</button>
        </div>
      </>}
    </>;
  }

  return <div className="chat">
    <div className="chat-head">
      <span className="chat-title"><span className="spark" aria-hidden="true">✦</span> Asistente</span>
      <button className="quiet" disabled={!turns.length||sending} onClick={()=>{setTurns([]);unstage();}}>Nueva conversación</button>
    </div>
    <div className="chat-thread" ref={threadRef} aria-live="polite">
      {authRequired&&<div className="bubble system">Iniciá sesión para usar la IA y ver tus créditos. <button className="quiet" onClick={()=>window.location.assign('/api/v1/auth/login')}>Iniciar sesión</button></div>}
      {offline&&<div className="bubble system">⚠ El gateway de IA no está corriendo. Inicialo con <code>npm run api</code>. <button className="quiet" onClick={()=>void loadProviders()}>Reintentar</button></div>}
      {providers&&!providerId&&<div className="bubble system">{providers.map(p=>p.missing).filter(Boolean).join(' ')} Las claves se configuran en el entorno del gateway, nunca en el navegador.</div>}
      {!turns.length&&<div className="chat-welcome">
        <p>Pedime un diagrama o un cambio. Lo que proponga se dibuja en el canvas y <strong>no se aplica hasta que lo aceptes</strong>. Nunca dejo elementos superpuestos.</p>
        <div className="chips">{SUGGESTIONS.map(([suggestedMode,text])=><button key={text} className="chip-button" onClick={()=>{setMode(suggestedMode);setPrompt(text);}}>{text}</button>)}</div>
      </div>}
      {turns.map(turn=><div key={turn.id} className="exchange">
        <div className="bubble user"><span className="bubble-meta">{MODES.find(m=>m[0]===turn.mode)?.[1]}</span>{turn.prompt}</div>
        {turn.status==='sending'&&<div className="bubble assistant typing" role="status"><span/><span/><span/><em>Interpretando con {provider?.label}… el documento no cambia mientras tanto.</em></div>}
        {turn.status==='error'&&<div className="bubble assistant error" role="alert">✕ {turn.error!.message} {turn.error!.retryable&&turn===last&&<button className="quiet" onClick={()=>void send(turn)}>Reintentar</button>}</div>}
        {turn.status==='done'&&<div className={'bubble assistant kind-'+turn.result!.kind}>{answer(turn)}<span className="bubble-meta">{usageLine(turn.result!)}</span></div>}
      </div>)}
    </div>
    <div className="chat-composer">
      {provider?.kind==='mock'&&<p className="inline-note warn">⚠ DEMOSTRACIÓN: este proveedor no es una IA; devuelve siempre la misma propuesta.</p>}
      <textarea id="chat-prompt" rows={2} maxLength={4000} value={prompt} aria-label="Mensaje para el asistente" placeholder={ids.length?`Sobre la selección (${ids.length})…`:'Escribí tu pedido…'} onChange={e=>setPrompt(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}}/>
      <div className="composer-row">
        <select id="chat-mode" aria-label="Modo" value={mode} title={MODES.find(m=>m[0]===mode)?.[2]} onChange={e=>setMode(e.target.value)}>{MODES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
        <select id="chat-provider" aria-label="Proveedor" value={providerId} onChange={e=>setProviderId(e.target.value)} disabled={!providers}>
          {!providerId&&<option value="">Sin proveedor</option>}
          {providers?.map(p=><option key={p.id} value={p.id} disabled={!p.configured}>{p.label}{p.configured?'':' — sin configurar'}</option>)}
        </select>
        <button disabled={!sending} onClick={()=>controller.current?.abort()}>Cancelar</button>
        <button className="primary send" disabled={!prompt.trim()||!providerId||sending} onClick={()=>submit()}>Enviar</button>
      </div>
      <p className="composer-hint">Enter envía · Shift + Enter salto de línea · contexto: {ids.length?`selección (${ids.length}) y vecinos`:'documento completo'} · r{doc.revision}{turns.some(t=>t.status==='done')?` · recuerda ${Math.min(turns.filter(t=>t.status==='done').length,HISTORY_TURNS)} turno(s)`:''}{credits?` · créditos ${credits.daily}/${credits.dailyLimit} hoy, ${credits.monthly}/${credits.monthlyLimit} este mes`:budget?` · hoy ${budget.tokens.toLocaleString('es')} de ${budget.dailyTokenBudget.toLocaleString('es')} tokens`:''}</p>
    </div>
  </div>;
}
