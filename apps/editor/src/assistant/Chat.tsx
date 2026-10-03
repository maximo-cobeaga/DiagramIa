import {useEffect,useRef,useState} from 'react';
import {documentBounds,nodeRect,previewBatch,type ActionBatchInput,type DiagramDocument} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {commit,documentStore,newId,notify,transact} from '../store/documentStore';
import {selectionStore} from '../store/selectionStore';
import {fit,focusOn,viewStore} from '../store/viewStore';
import {saveFile} from '../ui';
import {FEEDBACK_REASONS} from '@diagramia/core';
import {track,trackAiApplied} from '../telemetry';
import {ReauthButton} from '../shell/SharedPanel';
import {accountStore,signIn} from '../store/accountStore';
import {Markdown} from './Markdown';
import {playTour,saveTour,type TourStep} from './tour';

// El gateway se alcanza por el proxy del servidor de desarrollo: el navegador nunca ve claves de proveedores.
const API='/api';
const HEADERS={'content-type':'application/json','x-diagramia-client':'editor'};
type Changes=ReturnType<typeof previewBatch>['changes'];
type ProviderInfo={id:string;label:string;model:string;kind:'remote'|'local'|'mock';configured:boolean;missing:string|null};
type Budget={tokens:number;dailyTokenBudget:number;estimatedUsd:number;dailyUsdBudget:number};
type Credits={daily:number;monthly:number;dailyLimit:number;monthlyLimit:number};
type Usage={inputTokens:number;outputTokens:number;calls:number;estimatedCostUsd:number|null;costBasis:string};
type AiMode='create'|'edit'|'transform'|'animate'|'explain'|'review'|'document';
type Common={requestId:string;mode:AiMode;provider:string;providerKind:ProviderInfo['kind'];model:string;baseRevision:number;contextTruncated:boolean;repairs:number;replayed:boolean;usage:Usage};
type Finding={targetId:string;severity:'info'|'warning'|'risk';observation:string;evidence:string;suggestion:string};
type Result=Common&(
  |{kind:'proposal';summary:string;batch:ActionBatchInput;changes:Changes;prunedReferences:{stepId:string;removed:string[]}[];warnings?:string[]}
  |{kind:'clarification';summary:string;clarification:string}
  |{kind:'text';text:string;tour?:TourStep[]}
  |{kind:'review';summary:string;findings:Finding[]});
/** `shown` es lo que se ve en la burbuja del usuario cuando difiere del pedido (por ejemplo, «Explicar más»). */
type Turn={id:string;prompt:string;shown?:string;body:string;status:'sending'|'done'|'error';result?:Result;error?:{message:string;retryable:boolean;code?:string};outcome?:'applied'|'rejected'|'saved';feedback?:'asking-reason'|'sent'};
const REASON_LABELS:Record<typeof FEEDBACK_REASONS[number],string>={misunderstood:'No entendió el pedido',incorrect:'Resultado incorrecto',too_simple:'Demasiado simple',too_complex:'Demasiado complejo',bad_layout:'Diseño malo',missing_elements:'Faltan elementos',other:'Otro'};

// El asistente deduce qué querés del pedido. Si se equivoca, se puede volver a pedir como otra cosa.
const MODE_LABELS:Record<AiMode,string>={create:'Crear',edit:'Editar',transform:'Reorganizar',animate:'Animar',explain:'Explicar',review:'Revisar',document:'Documentar'};
const SUGGESTIONS=['Creá un diagrama de inicio de sesión con usuario, frontend, API y base de datos','Agregá Redis como caché dentro de Backend, debajo de la API','Explicame qué hace este diagrama','¿Qué riesgos ves en este diagrama?'];
const SEVERITY={info:'Info',warning:'Atención',risk:'Riesgo'} as const;
const COLLECTIONS:Record<keyof Changes,string>={nodes:'Nodos',edges:'Conexiones',drawings:'Trazos',zones:'Zonas',groups:'Grupos',frames:'Frames',animations:'Animaciones',assets:'Imágenes',annotations:'Anotaciones'};
const COST_BASIS:Record<string,string>={'published-price-estimate':'estimado con la tarifa publicada; el cobro real lo informa el proveedor','local-no-charge':'modelo local, sin cargo del proveedor','unknown-price':'sin tarifa conocida para estimar',none:'sin consumo'};
const HISTORY_TURNS=3;
const EXPAND_PROMPT='Explicá con más detalle tu respuesta anterior, en lenguaje simple.';

/** Nombre visible de un elemento: nadie tiene por qué saber qué es «edge-4». */
function nameOf(doc:DiagramDocument,id:string):string{
  const node=doc.nodes.find(n=>n.id===id);if(node)return node.label;
  const edge=doc.edges.find(e=>e.id===id);
  if(edge){const from=doc.nodes.find(n=>n.id===edge.from)?.label??edge.from,to=doc.nodes.find(n=>n.id===edge.to)?.label??edge.to;return edge.label?`${edge.label} (${from} → ${to})`:`${from} → ${to}`;}
  return doc.zones.find(z=>z.id===id)?.label??doc.frames.find(f=>f.id===id)?.label??doc.groups.find(g=>g.id===id)?.label??id;
}
const VERBS:Record<string,string>={ADD:'Agrega',CREATE:'Crea',UPDATE:'Cambia',MOVE:'Mueve',RESIZE:'Cambia el tamaño de',DELETE:'Quita',ALIGN:'Alinea',DISTRIBUTE:'Distribuye',ARRANGE:'Ordena',LAYOUT:'Reacomoda'};
const NOUNS:Record<string,string>={NODE:'',NODES:'nodos',EDGE:'conexión',DRAWING:'trazo',ZONE:'la zona',GROUP:'el grupo',FRAME:'el frame',ANIMATION:'la animación',STEP:'un paso',TRACK:'una pista',TRACK_CLIP:'un clip',SCENARIO:'un escenario',ASSET:'una imagen',ANNOTATION:'una anotación',DOCUMENT:'el documento'};
/** Cada acción de una propuesta, en palabras. El detalle técnico queda en el diff. */
function describe(action:ActionBatchInput['actions'][number],doc:DiagramDocument){
  const a=action as Record<string,unknown>&{type:string;node?:{label:string};edge?:{from:string;to:string};zone?:{label:string};frame?:{label:string};animation?:{label:string};group?:{label?:string}};
  const [verb,...rest]=a.type.split('_'),noun=NOUNS[rest.join('_')]??rest.join(' ').toLowerCase(),said=VERBS[verb]??a.type;
  if(a.type==='ADD_EDGE'&&a.edge)return `Conecta «${nameOf(doc,a.edge.from)}» con «${nameOf(doc,a.edge.to)}»`;
  const label=a.node?.label??a.zone?.label??a.frame?.label??a.animation?.label??a.group?.label??(typeof a.id==='string'?nameOf(doc,a.id):typeof a.nodeId==='string'?nameOf(doc,a.nodeId):'');
  return `${said} ${noun}${label?` «${label}»`:''}`.replace(/\s+/g,' ').trim();
}
/** Lo que queda de un turno en la conversación: texto corto, nunca el lote ni el documento. */
const replyOf=(result:Result)=>(result.kind==='proposal'?`Propuse ${result.batch.actions.length} acción(es): ${result.summary}`
  :result.kind==='clarification'?result.clarification:result.kind==='text'?result.text
  :`Revisión: ${result.summary} ${result.findings.map(f=>`[${f.targetId}] ${f.observation}`).join(' ')}`).trim().slice(0,1500)||'Sin respuesta.';

/** Chat con el asistente: mensajes en burbujas, propuestas como tarjetas que se ven en el canvas, y el cuadro de texto abajo. */
export function Chat(){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),{staging}=useStore(viewStore),{auth}=useStore(accountStore);
  const [providers,setProviders]=useState<ProviderInfo[]|null>(null),[budget,setBudget]=useState<Budget|null>(null),[credits,setCredits]=useState<Credits|null>(null),[offline,setOffline]=useState(false),[authRequired,setAuthRequired]=useState(false),[providerId,setProviderId]=useState(''),[prompt,setPrompt]=useState(''),[turns,setTurns]=useState<Turn[]>([]),[stageNote,setStageNote]=useState('');
  const controller=useRef<AbortController|null>(null),threadRef=useRef<HTMLDivElement>(null),opened=useRef(false);
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
  // Al iniciar o cerrar sesión cambian los proveedores del plan y los créditos.
  useEffect(()=>{void loadProviders();},[auth]);
  useEffect(()=>()=>{controller.current?.abort();viewStore.set({staging:null});},[]);
  useEffect(()=>{threadRef.current?.scrollTo({top:threadRef.current.scrollHeight});},[turns.length,last?.status]);

  async function send(turn:Turn){
    controller.current=new AbortController();unstage();
    setTurns(list=>[...list.filter(t=>t.id!==turn.id),{...turn,status:'sending',error:undefined}]);
    try{
      const response=await fetch(API+'/v1/assist',{method:'POST',headers:HEADERS,body:turn.body,signal:controller.current.signal}),data=await response.json();
      if(!response.ok){track('api_error',{route:'assist',status:response.status});patch(turn.id,{status:'error',error:{message:data?.error?.message??`El gateway respondió ${response.status}.`,retryable:[429,502,504].includes(response.status),code:data?.error?.code}});return;}
      patch(turn.id,{status:'done',result:data as Result});
      void loadProviders();
    }catch(error){
      if(error instanceof DOMException&&error.name==='AbortError')patch(turn.id,{status:'error',error:{message:'Pedido cancelado. El documento no cambió.',retryable:false}});
      // Un corte de red se reintenta con el MISMO requestId: si el gateway ya había terminado, devuelve ese resultado sin gastar de nuevo.
      else patch(turn.id,{status:'error',error:{message:'Se perdió la conexión con el gateway. Reintentá: se usa el mismo identificador para no duplicar el pedido.',retryable:true}});
    }
  }
  /**
   * Envía un pedido. Sin modo explícito, el gateway deduce qué se quiere («auto»).
   * `upTo` limita el historial a los turnos hasta ese, para ampliar una respuesta que no es la última.
   */
  function submit(text=prompt,options:{mode?:AiMode|'auto';detail?:'brief'|'expanded';shown?:string;upTo?:Turn}={}){
    if(!text.trim()||!providerId||sending)return;
    const until=options.upTo?turns.indexOf(options.upTo)+1:turns.length;
    const history=turns.slice(0,until).filter(t=>t.status==='done'&&t.result).slice(-HISTORY_TURNS).flatMap(t=>[{role:'user',content:t.prompt},{role:'assistant',content:replyOf(t.result!)}]);
    const id=newId('ai');
    // Sólo se vacía el cuadro si lo que se envió es lo que estaba escrito: ampliar o re-pedir no borra un borrador.
    if(text===prompt)setPrompt('');
    void send({id,prompt:text.trim(),shown:options.shown,status:'sending',body:JSON.stringify({requestId:id,providerId,mode:options.mode??'auto',detail:options.detail??'brief',prompt:text.trim(),document:doc,selectedIds:ids,history})});
  }
  const explainMore=(turn:Turn)=>submit(EXPAND_PROMPT,{mode:'explain',detail:'expanded',shown:'Explicar más',upTo:turn});
  const configured=providers?.filter(p=>p.configured)??[],provider=providers?.find(p=>p.id===providerId);
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
    if(result.kind==='text'){
      const tour=result.tour??[],label=`Explicación: ${turn.shown??turn.prompt}`.slice(0,120);
      return <>
        <Markdown text={result.text}/>
        {tour.length>0&&<div className="tour-actions">
          <button className="primary" onClick={()=>playTour(tour,label)}>▶ Ver explicación animada <small>{tour.length} pasos</small></button>
          {turn.outcome==='saved'?<small>✓ Guardada en la línea de tiempo.</small>:<button className="quiet" onClick={()=>{if(saveTour(tour,label))patch(turn.id,{outcome:'saved'});}}>Guardar como animación</button>}
        </div>}
        {result.mode==='document'&&<button className="quiet" onClick={()=>saveFile(`${doc.id}-documentacion.md`,result.text+'\n','text/markdown')}>Descargar .md</button>}
      </>;
    }
    if(result.kind==='review')return <>
      <p>{result.summary||'Revisión'}</p>
      {result.findings.length?<ul className="findings">{result.findings.map((f,i)=><li key={i} className={'tone-'+f.severity}>
        <button className="finding-target" title="Ver en el diagrama" onClick={()=>{if(!focusOn(doc,f.targetId,f.severity))notify('Ese elemento ya no está en el diagrama.','warn');}}>
          <span className="severity">{SEVERITY[f.severity]}</span>{nameOf(doc,f.targetId)}</button>
        <span>{f.observation}</span>{f.suggestion&&<small>Sugerencia: {f.suggestion}</small>}</li>)}</ul>:<p>Sin observaciones.</p>}
      {turn.outcome==='saved'?<small>Guardadas como anotaciones.</small>:result.findings.length>0&&<button className="quiet" onClick={()=>{
        // Se guardan sobre el documento actual: una observación cuyo elemento ya no existe queda a nivel de documento.
        const alive=new Set([...doc.nodes,...doc.edges,...doc.zones,...doc.frames,...doc.groups].map(x=>x.id));
        if(transact(result.findings.map(f=>({type:'ADD_ANNOTATION' as const,annotation:{id:newId('note'),targetId:alive.has(f.targetId)?f.targetId:null,severity:f.severity,text:[f.observation,f.evidence&&`Evidencia: ${f.evidence}`].filter(Boolean).join(' ').slice(0,1000),suggestion:f.suggestion.slice(0,1000),source:'ai' as const}})),`${result.findings.length} observación(es) guardadas como anotaciones`))patch(turn.id,{outcome:'saved'});
      }}>Guardar como anotaciones</button>}
      <small>Es una lectura del modelo, no una certeza ni una auditoría.</small>
    </>;
    const live=turn===last&&!turn.outcome,base=staging?.doc??doc;
    return <>
      <p>{result.summary||'Propuesta de cambios'}</p>
      <ol className="staged">{result.batch.actions.map((action,i)=><li key={i} className={live&&staging&&i<staging.step?'shown':''}>{describe(action,base)}</li>)}</ol>
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
          {stale?<button className="primary" onClick={()=>{track('ai_regenerated',{requestId:turn.id,mode:result.mode});submit(turn.prompt,{mode:result.mode,shown:turn.shown});}}>Regenerar</button>
            :<button className="primary" onClick={()=>{unstage();if(commit(result.batch,'Propuesta de IA aplicada','ai')){trackAiApplied(turn.id,result.mode,result.batch.actions.length);patch(turn.id,{outcome:'applied'});}}}>Aceptar y aplicar</button>}
          <button onClick={()=>{unstage();track('ai_proposal_discarded',{requestId:turn.id,mode:result.mode});patch(turn.id,{outcome:'rejected'});notify('Propuesta rechazada. El documento no cambió.');}}>Rechazar</button>
        </div>
      </>}
    </>;
  }

  /** Pie de cada respuesta: ampliarla, corregir cómo se interpretó el pedido y opinar. */
  function footer(turn:Turn){
    const result=turn.result!,latest=turn===last;
    const expandable=(result.kind==='text'&&result.mode==='explain')||result.kind==='review'||result.kind==='proposal';
    return <div className="answer-footer">
      {expandable&&<button className="quiet more" disabled={sending} onClick={()=>explainMore(turn)}>Explicar más</button>}
      {latest&&!sending&&!turn.shown&&<label className="intent">Lo tomé como
        <select aria-label="Volver a pedirlo como otra cosa" value={result.mode} onChange={e=>submit(turn.prompt,{mode:e.target.value as AiMode})}>
          {(Object.keys(MODE_LABELS) as AiMode[]).map(mode=><option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
        </select>
      </label>}
      {feedback(turn)}
    </div>;
  }

  /** ¿Te sirvió? Opcional y breve: un toque, y el motivo sólo si la respuesta fue negativa. */
  function feedback(turn:Turn){
    if(turn.result?.replayed)return null;
    const send=(rating:'up'|'down',reason:typeof FEEDBACK_REASONS[number]|null)=>{track('ai_feedback',{requestId:turn.id,rating,reason});patch(turn.id,{feedback:'sent'});};
    if(turn.feedback==='sent')return <small className="feedback-done">Gracias por tu opinión.</small>;
    if(turn.feedback==='asking-reason')return <div className="feedback" role="group" aria-label="¿Qué falló?"><small>¿Qué falló?</small>
      {FEEDBACK_REASONS.map(reason=><button key={reason} className="chip-button" onClick={()=>send('down',reason)}>{REASON_LABELS[reason]}</button>)}
      <button className="quiet" onClick={()=>send('down',null)}>Prefiero no decir</button></div>;
    return <div className="feedback" role="group" aria-label="¿Te sirvió este resultado?">
      <button className="quiet" aria-label="Sí, me sirvió" title="Me sirvió" onClick={()=>send('up',null)}>👍</button>
      <button className="quiet" aria-label="No me sirvió" title="No me sirvió" onClick={()=>patch(turn.id,{feedback:'asking-reason'})}>👎</button></div>;
  }

  const ready=Boolean(providerId)&&!authRequired;
  return <div className="chat">
    <div className="chat-head">
      <span className="chat-title"><span className="spark" aria-hidden="true">✦</span> Asistente</span>
      <button className="quiet" disabled={!turns.length||sending} onClick={()=>{setTurns([]);unstage();}}>Nueva conversación</button>
    </div>
    <div className="chat-thread" ref={threadRef} aria-live="polite">
      {authRequired&&<div className="chat-cta">
        <span className="spark" aria-hidden="true">✦</span>
        <p><strong>Entrá para usar la IA.</strong> Te arma diagramas, te los explica paso a paso y señala qué mejorar. Es gratis y tus diagramas quedan guardados en tu cuenta.</p>
        <button className="signin" onClick={()=>signIn('ai')}>Iniciar sesión</button>
      </div>}
      {offline&&<div className="bubble system">⚠ El gateway de IA no está corriendo. Inicialo con <code>npm run api</code>. <button className="quiet" onClick={()=>void loadProviders()}>Reintentar</button></div>}
      {providers&&!providerId&&<div className="bubble system">{providers.map(p=>p.missing).filter(Boolean).join(' ')} Las claves se configuran en el entorno del gateway, nunca en el navegador.</div>}
      {!turns.length&&!authRequired&&<div className="chat-welcome">
        <p>Contame qué necesitás, con tus palabras: armar un diagrama, cambiarlo, que te lo explique o que lo revise. Lo que proponga se ve en el canvas y <strong>no se aplica hasta que lo aceptes</strong>.</p>
        <div className="chips">{SUGGESTIONS.map(text=><button key={text} className="chip-button" onClick={()=>setPrompt(text)}>{text}</button>)}</div>
      </div>}
      {turns.map(turn=><div key={turn.id} className="exchange">
        <div className={'bubble user'+(turn.shown?' derived':'')}>{turn.shown??turn.prompt}</div>
        {turn.status==='sending'&&<div className="bubble assistant typing" role="status"><span/><span/><span/><em>Pensando… el diagrama no cambia mientras tanto.</em></div>}
        {turn.status==='error'&&<div className="bubble assistant error" role="alert">✕ {turn.error!.message} {turn.error!.retryable&&turn===last&&<button className="quiet" onClick={()=>void send(turn)}>Reintentar</button>}{turn.error!.code==='EMAIL_NOT_VERIFIED'&&<ReauthButton/>}</div>}
        {turn.status==='done'&&<div className={'bubble assistant kind-'+turn.result!.kind}>
          {answer(turn)}{footer(turn)}
          <details className="usage"><summary>Detalles</summary><span className="bubble-meta">{usageLine(turn.result!)}</span></details>
        </div>}
      </div>)}
    </div>
    <div className="chat-composer">
      {provider?.kind==='mock'&&<p className="inline-note warn">⚠ DEMOSTRACIÓN: este proveedor no es una IA; devuelve siempre la misma propuesta.</p>}
      <div className="composer-box">
        <textarea id="chat-prompt" rows={2} maxLength={4000} value={prompt} aria-label="Mensaje para el asistente" disabled={authRequired}
          placeholder={authRequired?'Iniciá sesión para escribirle a la IA':ids.length?`Preguntá o pedí algo sobre lo seleccionado (${ids.length})…`:'Preguntá o pedí lo que necesites…'} onChange={e=>setPrompt(e.target.value)}
          // El panel de IA se ve por defecto: la intención de usarla es enfocar el cuadro, no abrir el editor.
          onFocus={()=>{if(!opened.current){opened.current=true;track('ai_opened',{});}}}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}}/>
        {sending?<button className="send stop" onClick={()=>controller.current?.abort()} aria-label="Cancelar el pedido" title="Cancelar">■</button>
          :<button className="primary send" disabled={!prompt.trim()||!ready} onClick={()=>submit()} aria-label="Enviar" title="Enviar (Enter)">↑</button>}
      </div>
      <div className="composer-row">
        {configured.length>1&&<select id="chat-provider" aria-label="Proveedor" value={providerId} onChange={e=>setProviderId(e.target.value)}>
          {providers?.map(p=><option key={p.id} value={p.id} disabled={!p.configured}>{p.label}{p.configured?'':' — sin configurar'}</option>)}
        </select>}
        <p className="composer-hint">{ids.length?`Sobre lo seleccionado (${ids.length})`:'Sobre todo el diagrama'}{credits?` · te quedan ${Math.max(0,credits.dailyLimit-credits.daily)} créditos hoy`:budget?` · hoy ${budget.tokens.toLocaleString('es')} de ${budget.dailyTokenBudget.toLocaleString('es')} tokens`:''}</p>
      </div>
    </div>
  </div>;
}
