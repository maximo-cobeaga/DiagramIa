import {useEffect,useRef,useState} from 'react';
import {documentBounds,nodeRect,previewBatch,type ActionBatchInput,type DiagramDocument} from '@diagramia/core';
import {useStore} from '../store/createStore';
import {commit,documentStore,newId,notify,transact} from '../store/documentStore';
import {selectionStore} from '../store/selectionStore';
import {fit,focusOn,viewStore} from '../store/viewStore';
import {saveFile} from '../ui';
import {FEEDBACK_REASONS} from '@diagramia/core';
import {noteAiRequest,track,trackAiApplied} from '../telemetry';
import {ReauthButton} from '../shell/AccountPage';
import {accountStore,signIn} from '../store/accountStore';
import {Markdown} from './Markdown';
import {playTour,saveTour,type TourStep} from './tour';
import {conversationWindow} from './conversation';
import {CHAT_LIMITS} from './chatHistory';
import {chatStore,conversationOf,deleteConversations,newConversation,openConversation,requests,updateTurns} from './chatStore';
import {UpgradeAction} from '../shell/PlanBox';
import {LANG,t} from '../i18n';
import {serverTextIn} from '../serverText';

// El gateway se alcanza por el proxy del servidor de desarrollo: el navegador nunca ve claves de proveedores.
const API='/api';
const HEADERS={'content-type':'application/json','x-diagramia-client':'editor'};
type Changes=ReturnType<typeof previewBatch>['changes'];
type ProviderInfo={id:string;label:string;model:string;kind:'remote'|'local'|'mock';configured:boolean;missing:string|null};
type Usage={inputTokens:number;outputTokens:number;calls:number;estimatedCostUsd:number|null;costBasis:string};
type AiMode='create'|'edit'|'transform'|'animate'|'explain'|'review'|'document';
type Common={requestId:string;mode:AiMode;provider:string;providerKind:ProviderInfo['kind'];model:string;baseRevision:number;contextTruncated:boolean;repairs:number;replayed:boolean;usage:Usage};
type Finding={targetId:string;severity:'info'|'warning'|'risk';observation:string;evidence:string;suggestion:string};
type Result=Common&(
  |{kind:'proposal';summary:string;batch:ActionBatchInput;changes:Changes;prunedReferences:{stepId:string;removed:string[]}[];warnings?:string[]}
  |{kind:'clarification';summary:string;clarification:string;options?:string[]}
  |{kind:'text';text:string;tour?:TourStep[]}
  |{kind:'review';summary:string;findings:Finding[]});
/**
 * `shown` es lo que se ve en la burbuja del usuario cuando difiere del pedido (por ejemplo, «Explicar más»).
 * `reply` es la respuesta en texto corto, que es lo único que se guarda; un turno `archived` viene de una conversación guardada.
 */
type Turn={id:string;prompt:string;shown?:string;questionRootId?:string;body:string;reply?:string;archived?:boolean;status:'sending'|'done'|'error';result?:Result;error?:{message:string;retryable:boolean;code?:string};outcome?:'applied'|'rejected'|'saved'|'cancelled';feedback?:'asking-reason'|'sent'};
const REASON_LABELS:Record<typeof FEEDBACK_REASONS[number],string>={misunderstood:t('No entendió el pedido'),incorrect:t('Resultado incorrecto'),too_simple:t('Demasiado simple'),too_complex:t('Demasiado complejo'),bad_layout:t('Diseño malo'),missing_elements:t('Faltan elementos'),other:t('Otro')};

// El asistente deduce qué querés del pedido. Si se equivoca, se puede volver a pedir como otra cosa.
const MODE_LABELS:Record<AiMode,string>={create:t('Crear'),edit:t('Editar'),transform:t('Reorganizar'),animate:t('Animar'),explain:t('Explicar'),review:t('Revisar'),document:t('Documentar')};
const SUGGESTIONS=[t('Creá un diagrama de inicio de sesión con usuario, frontend, API y base de datos'),t('Agregá Redis como caché dentro de Backend, debajo de la API'),t('Explicame qué hace este diagrama'),t('¿Qué riesgos ves en este diagrama?')];
const SEVERITY={info:t('Info'),warning:t('Atención'),risk:t('Riesgo')} as const;
const COLLECTIONS:Record<keyof Changes,string>={nodes:t('Nodos'),edges:t('Conexiones'),drawings:t('Trazos'),zones:t('Zonas'),groups:t('Grupos'),frames:t('Frames'),animations:t('Animaciones'),assets:t('Imágenes'),annotations:t('Anotaciones')};
const COST_BASIS:Record<string,string>={'published-price-estimate':t('estimado con la tarifa publicada; el cobro real lo informa el proveedor'),'local-no-charge':t('modelo local, sin cargo del proveedor'),'unknown-price':t('sin tarifa conocida para estimar'),none:t('sin consumo')};
const HISTORY_TURNS=3;
const EXPAND_PROMPT=t('Explicá con más detalle tu respuesta anterior, en lenguaje simple.');

/** Nombre visible de un elemento: nadie tiene por qué saber qué es «edge-4». */
function nameOf(doc:DiagramDocument,id:string):string{
  const node=doc.nodes.find(n=>n.id===id);if(node)return node.label;
  const edge=doc.edges.find(e=>e.id===id);
  if(edge){const from=doc.nodes.find(n=>n.id===edge.from)?.label??edge.from,to=doc.nodes.find(n=>n.id===edge.to)?.label??edge.to;return edge.label?`${edge.label} (${from} → ${to})`:`${from} → ${to}`;}
  return doc.zones.find(z=>z.id===id)?.label??doc.frames.find(f=>f.id===id)?.label??doc.groups.find(g=>g.id===id)?.label??id;
}
const VERBS:Record<string,string>={ADD:t('Agrega'),CREATE:t('Crea'),UPDATE:t('Cambia'),MOVE:t('Mueve'),RESIZE:t('Cambia el tamaño de'),DELETE:t('Quita'),ALIGN:t('Alinea'),DISTRIBUTE:t('Distribuye'),ARRANGE:t('Ordena'),LAYOUT:t('Reacomoda')};
const NOUNS:Record<string,string>={NODE:'',NODES:t('nodos'),EDGE:t('conexión'),DRAWING:t('trazo'),ZONE:t('la zona'),GROUP:t('el grupo'),FRAME:t('el frame'),ANIMATION:t('la animación'),STEP:t('un paso'),TRACK:t('una pista'),TRACK_CLIP:t('un clip'),SCENARIO:t('un escenario'),ASSET:t('una imagen'),ANNOTATION:t('una anotación'),DOCUMENT:t('el documento')};
/** Cada acción de una propuesta, en palabras. El detalle técnico queda en el diff. */
function describe(action:ActionBatchInput['actions'][number],doc:DiagramDocument){
  const a=action as Record<string,unknown>&{type:string;node?:{label:string};edge?:{from:string;to:string};zone?:{label:string};frame?:{label:string};animation?:{label:string};group?:{label?:string}};
  const [verb,...rest]=a.type.split('_'),noun=NOUNS[rest.join('_')]??rest.join(' ').toLowerCase(),said=VERBS[verb]??a.type;
  if(a.type==='ADD_EDGE'&&a.edge)return t('Conecta «{0}» con «{1}»',nameOf(doc,a.edge.from),nameOf(doc,a.edge.to));
  const label=a.node?.label??a.zone?.label??a.frame?.label??a.animation?.label??a.group?.label??(typeof a.id==='string'?nameOf(doc,a.id):typeof a.nodeId==='string'?nameOf(doc,a.nodeId):'');
  return `${said} ${noun}${label?` «${label}»`:''}`.replace(/\s+/g,' ').trim();
}
/** Lo que queda de un turno en la conversación: texto corto, nunca el lote ni el documento. */
const replyOf=(result:Result)=>(result.kind==='proposal'?t('Propuse {0} acción(es): {1}',result.batch.actions.length,result.summary)
  :result.kind==='clarification'?result.clarification:result.kind==='text'?result.text
  :t('Revisión: {0} {1}',result.summary,result.findings.map(f=>`[${f.targetId}] ${f.observation}`).join(' '))).trim().slice(0,1500)||t('Sin respuesta.');

/** La respuesta como texto, para el historial: una propuesta queda como su resumen y sus pasos en palabras. */
function archiveText(result:Result,doc:DiagramDocument):string{
  if(result.kind==='text')return result.text;
  if(result.kind==='clarification')return [result.clarification,...(result.options??[]).map(option=>`- ${option}`)].join('\n');
  if(result.kind==='review')return [t('**Revisión:** {0}',result.summary),'',...result.findings.map(f=>`- ${SEVERITY[f.severity]} · ${nameOf(doc,f.targetId)}: ${f.observation}`)].join('\n');
  const steps=result.batch.actions.slice(0,12).map((action,i)=>`${i+1}. ${describe(action,doc)}`),more=result.batch.actions.length-steps.length;
  return [`**Propuesta:** ${result.summary||t('cambios en el diagrama')}`,'',...steps,...(more>0?[`${steps.length+1}. …y ${more} paso(s) más`]:[])].join('\n');
}
const when=(at:number)=>{const date=new Date(at),today=new Date().toDateString()===date.toDateString();return today?date.toLocaleTimeString(LANG,{hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString(LANG,{day:'numeric',month:'short'});};

/** Respuestas sugeridas de una pregunta de la IA, más «Otro» para escribir una distinta. Un toque envía la respuesta. */
function QuestionChoices({options,disabled,onChoose,onOther}:{options:string[];disabled:boolean;onChoose:(text:string)=>void;onOther:(text:string)=>void}){
  const [other,setOther]=useState(false),[text,setText]=useState('');
  const sendOther=()=>{if(text.trim()&&!disabled)onOther(text.trim());};
  return <div className="question-choices" role="group" aria-label={t('Respuestas sugeridas')}>
    {options.map((option,i)=><button key={option} className="choice-option" disabled={disabled} onClick={()=>onChoose(option)}><span className="choice-key" aria-hidden="true">{i+1}</span>{option}</button>)}
    {other
      ?<div className="choice-other"><input autoFocus aria-label={t('Tu respuesta')} maxLength={500} value={text} placeholder={t('Escribí tu respuesta…')} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();sendOther();}else if(e.key==='Escape')setOther(false);}}/>
        <button className="primary" disabled={!text.trim()||disabled} onClick={sendOther}>{t('Enviar')}</button></div>
      :<button className="choice-option other" disabled={disabled} aria-expanded={false} onClick={()=>setOther(true)}><span className="choice-key" aria-hidden="true">+</span>{t('Otro…')}</button>}
  </div>;
}

/** Chat con el asistente: mensajes en burbujas, propuestas como tarjetas que se ven en el canvas, y el cuadro de texto abajo. */
export function Chat(){
  const {doc,activeId:tabId}=useStore(documentStore),{ids}=useStore(selectionStore),{staging}=useStore(viewStore),{auth}=useStore(accountStore),chats=useStore(chatStore);
  const [providers,setProviders]=useState<ProviderInfo[]|null>(null),[offline,setOffline]=useState(false),[authRequired,setAuthRequired]=useState(false),[providerId,setProviderId]=useState(''),[prompt,setPrompt]=useState(''),[stageNote,setStageNote]=useState(''),[history,setHistory]=useState(false);
  // La conversación vive en un store por pestaña: cambiar de panel o de pestaña no la pierde, y un pedido en curso termina igual.
  const turns=conversationOf(chats,tabId).turns as Turn[],setTurns=(change:(list:Turn[])=>Turn[])=>updateTurns(tabId,change as never);
  const threadRef=useRef<HTMLDivElement>(null),opened=useRef(false);
  const last=turns[turns.length-1],sending=last?.status==='sending';
  const question=last?.status==='done'&&last.result?.kind==='clarification'&&!last.outcome?last:null;
  const patch=(id:string,changes:Partial<Turn>)=>setTurns(list=>list.map(turn=>turn.id===id?{...turn,...changes}:turn));

  async function loadProviders(){
    try{
      const response=await fetch(API+'/v1/providers',{headers:HEADERS});
      if(response.status===401){setAuthRequired(true);setOffline(false);setProviders(null);return;}
      if(!response.ok)throw new Error(String(response.status));
      const body=await response.json(),list=(body.providers as ProviderInfo[]).filter(p=>p.kind!=='local');
      setProviders(list);setOffline(false);setAuthRequired(false);
      setProviderId(current=>list.some(p=>p.id===current&&p.configured)?current:list.find(p=>p.configured&&p.kind!=='mock')?.id??list.find(p=>p.configured)?.id??'');
    }catch{setProviders(null);setOffline(true);}
  }
  const unstage=()=>{viewStore.set({staging:null});setStageNote('');};
  // Al iniciar o cerrar sesión cambian los proveedores del plan y los créditos.
  useEffect(()=>{void loadProviders();},[auth]);
  useEffect(()=>()=>{viewStore.set({staging:null});},[]);
  useEffect(()=>{threadRef.current?.scrollTo({top:threadRef.current.scrollHeight});},[turns.length,last?.status]);

  async function send(turn:Turn){
    const controller=new AbortController();requests.set(tabId,controller);unstage();noteAiRequest();
    setTurns(list=>[...list.filter(t=>t.id!==turn.id),{...turn,status:'sending',error:undefined}]);
    try{
      const response=await fetch(API+'/v1/assist',{method:'POST',headers:HEADERS,body:turn.body,signal:controller.signal}),data=await response.json();
      if(!response.ok){track('api_error',{route:'assist',status:response.status});patch(turn.id,{status:'error',error:{message:typeof data?.error?.message==='string'?serverTextIn(LANG,data.error.message):t('El gateway respondió {0}.',response.status),retryable:[429,502,504].includes(response.status),code:data?.error?.code}});return;}
      // El cuerpo del pedido lleva el documento entero: terminado el turno ya no hace falta para reintentar.
      patch(turn.id,{status:'done',result:data as Result,reply:archiveText(data as Result,documentStore.get().doc),body:''});
      void loadProviders();
    }catch(error){
      if(error instanceof DOMException&&error.name==='AbortError')patch(turn.id,{status:'error',error:{message:t('Pedido cancelado. El documento no cambió.'),retryable:false}});
      // Un corte de red se reintenta con el MISMO requestId: si el gateway ya había terminado, devuelve ese resultado sin gastar de nuevo.
      else patch(turn.id,{status:'error',error:{message:t('Se perdió la conexión con el gateway. Reintentá: se usa el mismo identificador para no duplicar el pedido.'),retryable:true}});
    }
  }
  /**
   * Envía un pedido. Sin modo explícito, el gateway deduce qué se quiere («auto»).
   * `upTo` limita el historial a los turnos hasta ese, para ampliar una respuesta que no es la última.
   */
  function submit(text=prompt,options:{mode?:AiMode|'auto';detail?:'brief'|'expanded';shown?:string;upTo?:Turn}={}){
    if(!text.trim()||!providerId||sending)return;
    const until=options.upTo?turns.indexOf(options.upTo)+1:turns.length;
    const rootId=!options.mode&&!options.upTo&&question?(question.questionRootId??question.id):undefined;
    const context=conversationWindow(turns.slice(0,until),rootId,HISTORY_TURNS).flatMap(t=>[{role:'user',content:t.prompt},{role:'assistant',content:replyOf(t.result!)}]);
    const id=newId('ai');
    // Sólo se vacía el cuadro si lo que se envió es lo que estaba escrito: ampliar o re-pedir no borra un borrador.
    if(text===prompt)setPrompt('');
    void send({id,prompt:text.trim(),shown:options.shown,questionRootId:rootId,status:'sending',body:JSON.stringify({requestId:id,providerId,mode:options.mode??(rootId?question!.result!.mode:'auto'),detail:options.detail??'brief',prompt:text.trim(),document:doc,selectedIds:ids,history:context,language:LANG})});
  }
  const explainMore=(turn:Turn)=>submit(EXPAND_PROMPT,{mode:'explain',detail:'expanded',shown:t('Explicar más'),upTo:turn});
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
      try{preview=build(total);step=total;setStageNote(t('El paso {0} no es válido por separado: se muestra la propuesta completa.',count));}
      catch{unstage();setStageNote(t('La propuesta ya no se puede aplicar sobre el documento actual.'));return;}
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
  const usageLine=(result:Result)=>t('{0}{1} · {2} + {3} tokens{4} ({5}){6}{7}{8}',result.model,result.providerKind==='mock'?t(' · DEMOSTRACIÓN'):'',result.usage.inputTokens.toLocaleString('es'),result.usage.outputTokens.toLocaleString('es'),result.usage.estimatedCostUsd!==null?` · USD ${result.usage.estimatedCostUsd.toFixed(4)}`:'',COST_BASIS[result.usage.costBasis]??result.usage.costBasis,result.repairs>0?t(' · {0} reparación',result.repairs):'',result.replayed?t(' · recuperado sin nuevo consumo'):'',result.contextTruncated?t(' · contexto recortado'):'');

  function answer(turn:Turn){
    const result=turn.result!;
    if(result.kind==='clarification'){
      if(turn.outcome==='cancelled')return <p className="cancelled-question">{t('Pregunta cancelada.')}</p>;
      const options=result.options??[],open=turn===last&&!turn.outcome;
      return <div className="assistant-question"><p>{result.clarification}</p>
        {open&&options.length>0&&<QuestionChoices options={options} disabled={sending} onChoose={choice=>{track('ai_question_answered',{mode:result.mode,via:'option'});submit(choice);}} onOther={text=>{track('ai_question_answered',{mode:result.mode,via:'other'});submit(text);}}/>}
        {open&&<div className="question-actions">{options.length===0&&<button onClick={()=>document.getElementById('chat-prompt')?.focus()}>{t('Responder')}</button>}<button className="quiet" onClick={()=>patch(turn.id,{outcome:'cancelled'})}>{t('Cancelar')}</button></div>}</div>;
    }
    if(result.kind==='text'){
      const tour=result.tour??[],label=t('Explicación: {0}',turn.shown??turn.prompt).slice(0,120);
      return <>
        <Markdown text={result.text}/>
        {tour.length>0&&<div className="tour-actions">
          <button className="primary" onClick={()=>playTour(tour,label)}>{t('▶ Ver explicación animada')} <small>{tour.length} {t('pasos')}</small></button>
          {turn.outcome==='saved'?<small>{t('✓ Guardada en la línea de tiempo.')}</small>:<button className="quiet" onClick={()=>{if(saveTour(tour,label))patch(turn.id,{outcome:'saved'});}}>{t('Guardar como animación')}</button>}
        </div>}
        {result.mode==='document'&&!turn.archived&&<button className="quiet" onClick={()=>saveFile(`${doc.id}-documentacion.md`,result.text+'\n','text/markdown')}>{t('Descargar .md')}</button>}
      </>;
    }
    if(result.kind==='review')return <>
      <p>{result.summary||t('Revisión')}</p>
      {result.findings.length?<ul className="findings">{result.findings.map((f,i)=><li key={i} className={'tone-'+f.severity}>
        <button className="finding-target" title={t('Ver en el diagrama')} onClick={()=>{if(!focusOn(doc,f.targetId,f.severity))notify(t('Ese elemento ya no está en el diagrama.'),'warn');}}>
          <span className="severity">{SEVERITY[f.severity]}</span>{nameOf(doc,f.targetId)}</button>
        <span>{f.observation}</span>{f.suggestion&&<small>{t('Sugerencia:')} {f.suggestion}</small>}</li>)}</ul>:<p>{t('Sin observaciones.')}</p>}
      {turn.outcome==='saved'?<small>{t('Guardadas como anotaciones.')}</small>:result.findings.length>0&&<button className="quiet" onClick={()=>{
        // Se guardan sobre el documento actual: una observación cuyo elemento ya no existe queda a nivel de documento.
        const alive=new Set([...doc.nodes,...doc.edges,...doc.zones,...doc.frames,...doc.groups].map(x=>x.id));
        if(transact(result.findings.map(f=>({type:'ADD_ANNOTATION' as const,annotation:{id:newId('note'),targetId:alive.has(f.targetId)?f.targetId:null,severity:f.severity,text:[f.observation,f.evidence&&t('Evidencia: {0}',f.evidence)].filter(Boolean).join(' ').slice(0,1000),suggestion:f.suggestion.slice(0,1000),source:'ai' as const}})),t('{0} observación(es) guardadas como anotaciones',result.findings.length)))patch(turn.id,{outcome:'saved'});
      }}>{t('Guardar como anotaciones')}</button>}
      <small>{t('Es una lectura del modelo, no una certeza ni una auditoría.')}</small>
    </>;
    const live=turn===last&&!turn.outcome,base=staging?.doc??doc;
    return <>
      <p>{result.summary||t('Propuesta de cambios')}</p>
      <ol className="staged">{result.batch.actions.map((action,i)=><li key={i} className={live&&staging&&i<staging.step?'shown':''}>{describe(action,base)}</li>)}</ol>
      <p className="mono">{(Object.keys(COLLECTIONS) as (keyof Changes)[]).flatMap(key=>{const c=result.changes[key];return [c.added.length&&`+${c.added.length} ${COLLECTIONS[key].toLowerCase()}`,c.updated.length&&`~${c.updated.length} ${COLLECTIONS[key].toLowerCase()}`,c.removed.length&&`−${c.removed.length} ${COLLECTIONS[key].toLowerCase()}`].filter(Boolean);}).join(' · ')}</p>
      {result.warnings?.map((warning,i)=><p key={i} className="warn">⚠ {warning}</p>)}
      {result.prunedReferences.length>0&&<p className="warn">{t('⚠ Pasos de animación que pierden referencias:')} {result.prunedReferences.map(p=>p.stepId).join(', ')}.</p>}
      {!live&&<small>{turn.outcome==='applied'?t('✓ Aplicada.'):turn.outcome==='rejected'?t('Rechazada: el documento no cambió.'):t('Reemplazada por un pedido posterior.')}</small>}
      {live&&<>
        {!stale&&<div className="stage-control">
          <label className="check"><input type="checkbox" data-role="stage-toggle" checked={Boolean(staging)} onChange={e=>e.target.checked?stage(result.batch.actions.length):unstage()}/>{t('Mostrar en el canvas (resaltada; todavía no se aplicó)')}</label>
          {staging&&result.batch.actions.length>1&&<label>{t('Paso a paso:')} {staging.step} {t('de')} {staging.total}<input type="range" aria-label={t('Paso de la propuesta')} min="1" max={staging.total} value={staging.step} onChange={e=>stage(+e.target.value)}/></label>}
          {stageNote&&<small>{stageNote}</small>}
        </div>}
        {stale&&<p className="warn" role="alert">{t('⚠ Editaste el documento mientras la IA respondía (ahora r')}{doc.revision}{t('). La propuesta no se aplica sobre tu trabajo nuevo: regenerala con la revisión actual.')}</p>}
        <div className="button-grid two">
          {stale?<button className="primary" onClick={()=>{track('ai_regenerated',{requestId:turn.id,mode:result.mode});submit(turn.prompt,{mode:result.mode,shown:turn.shown});}}>{t('Regenerar')}</button>
            :<button className="primary" onClick={()=>{unstage();if(commit(result.batch,t('Propuesta de IA aplicada'),'ai')){trackAiApplied(turn.id,result.mode,result.batch.actions.length);patch(turn.id,{outcome:'applied'});}}}>{t('Aceptar y aplicar')}</button>}
          <button onClick={()=>{unstage();track('ai_proposal_discarded',{requestId:turn.id,mode:result.mode});patch(turn.id,{outcome:'rejected'});notify(t('Propuesta rechazada. El documento no cambió.'));}}>{t('Rechazar')}</button>
        </div>
      </>}
    </>;
  }

  /** Pie de cada respuesta: ampliarla, corregir cómo se interpretó el pedido y opinar. */
  function footer(turn:Turn){
    const result=turn.result!,latest=turn===last;
    if(result.kind==='clarification')return null;
    const expandable=(result.kind==='text'&&result.mode==='explain')||result.kind==='review'||result.kind==='proposal';
    return <div className="answer-footer">
      {expandable&&<button className="quiet more" disabled={sending} onClick={()=>explainMore(turn)}>{t('Explicar más')}</button>}
      {latest&&!sending&&!turn.shown&&<label className="intent">{t('Lo tomé como')}
        <select aria-label={t('Volver a pedirlo como otra cosa')} value={result.mode} onChange={e=>submit(turn.prompt,{mode:e.target.value as AiMode})}>
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
    if(turn.feedback==='sent')return <small className="feedback-done">{t('Gracias por tu opinión.')}</small>;
    if(turn.feedback==='asking-reason')return <div className="feedback" role="group" aria-label={t('¿Qué falló?')}><small>{t('¿Qué falló?')}</small>
      {FEEDBACK_REASONS.map(reason=><button key={reason} className="chip-button" onClick={()=>send('down',reason)}>{REASON_LABELS[reason]}</button>)}
      <button className="quiet" onClick={()=>send('down',null)}>{t('Prefiero no decir')}</button></div>;
    return <div className="feedback" role="group" aria-label={t('¿Te sirvió este resultado?')}>
      <button className="quiet" aria-label={t('Sí, me sirvió')} title={t('Me sirvió')} onClick={()=>send('up',null)}>👍</button>
      <button className="quiet" aria-label={t('No me sirvió')} title={t('No me sirvió')} onClick={()=>patch(turn.id,{feedback:'asking-reason'})}>👎</button></div>;
  }

  const ready=Boolean(providerId)&&!authRequired;
  return <div className="chat">
    <div className="chat-head">
      <span className="chat-title"><span className="spark" aria-hidden="true">✦</span> {t('Asistente')}</span>
      <span className="chat-head-actions">
        <button className="quiet" aria-expanded={history} disabled={!chats.saved.length&&!history} onClick={()=>setHistory(!history)}>{history?t('← Chat'):t('Historial{0}',chats.saved.length?` (${chats.saved.length})`:'')}</button>
        <button className="quiet" aria-label={t('Nueva conversación')} title={t('Nueva conversación')} disabled={!turns.length||sending} onClick={()=>{newConversation(tabId);unstage();setHistory(false);}}>{t('＋ Nueva')}</button>
      </span>
    </div>
    {history&&<div className="chat-thread chat-history" aria-label={t('Conversaciones guardadas')}>
      <p className="inline-note">{t('Se guardan en este navegador las últimas')} {CHAT_LIMITS.chats} {t('conversaciones, sólo como texto. Al retomar una, la IA recibe los últimos')} {HISTORY_TURNS} {t('intercambios: no gasta más que un pedido común.')}</p>
      {chats.saved.length?<ul className="shared-documents">{chats.saved.map(chat=><li key={chat.id} className="chat-history-item">
        <button disabled={sending} aria-current={chat.id===conversationOf(chats,tabId).id?'true':undefined} onClick={()=>{openConversation(tabId,chat.id);unstage();setHistory(false);}}>{chat.title}<small>{[chat.docTitle,when(chat.updatedAt),`${chat.turns.length} mensaje(s)`].filter(Boolean).join(' · ')}</small></button>
        <button className="quiet" aria-label={t('Borrar la conversación «{0}»',chat.title)} title={t('Borrar')} disabled={sending} onClick={()=>deleteConversations(chat.id)}>×</button></li>)}</ul>
        :<p className="inline-note">{t('Todavía no hay conversaciones guardadas.')}</p>}
      {chats.saved.length>1&&<button className="quiet" disabled={sending} onClick={()=>{if(confirm(t('Se borran todas las conversaciones guardadas en este navegador. Tus diagramas no cambian.')))deleteConversations();}}>{t('Borrar todo el historial')}</button>}
    </div>}
    <div className="chat-thread" ref={threadRef} aria-live="polite" hidden={history}>
      {authRequired&&<div className="chat-cta">
        <span className="spark" aria-hidden="true">✦</span>
        <p><strong>{t('Entrá para usar la IA.')}</strong> {t('Te arma diagramas, te los explica paso a paso y señala qué mejorar. Es gratis y tus diagramas quedan guardados en tu cuenta.')}</p>
        <button className="signin" onClick={()=>signIn('ai')}>{t('Iniciar sesión')}</button>
      </div>}
      {offline&&<div className="bubble system">{t('⚠ El gateway de IA no está corriendo. Inicialo con')} <code>npm run api</code>. <button className="quiet" onClick={()=>void loadProviders()}>{t('Reintentar')}</button></div>}
      {providers&&!providerId&&<div className="bubble system">{providers.map(p=>p.missing).filter(Boolean).join(' ')} {t('Las claves se configuran en el entorno del gateway, nunca en el navegador.')}</div>}
      {!turns.length&&!authRequired&&<div className="chat-welcome">
        <div className="welcome-mark" aria-hidden="true">✦</div>
        <h2>{t('¿Qué idea tenés hoy?')}</h2>
        <p>{t('Contámela y le damos forma juntos. También podés pedirme que explique o mejore tu diagrama.')}</p>
        <div className="chips">{SUGGESTIONS.map(text=><button key={text} className="chip-button" onClick={()=>{track('ai_suggestion_clicked',{});setPrompt(text);}}>{text}</button>)}</div>
        <p className="welcome-control">{t('Vos decidís: cada cambio espera tu aprobación.')}</p>
      </div>}
      {turns.map(turn=><div key={turn.id} className="exchange">
        <div className={'bubble user'+(turn.shown?' derived':'')}>{turn.shown??turn.prompt}</div>
        {turn.status==='sending'&&<div className="bubble assistant typing" role="status"><span/><span/><span/><em>{t('Pensando…')}</em></div>}
        {turn.status==='error'&&<div className="bubble assistant error" role="alert">✕ {turn.error!.message} {turn.error!.retryable&&turn===last&&<button className="quiet" onClick={()=>void send(turn)}>{t('Reintentar')}</button>}{turn.error!.code==='EMAIL_NOT_VERIFIED'&&<ReauthButton/>}{turn.error!.code==='CREDIT_LIMIT'&&<UpgradeAction>{t('Pasar a Pro · 400 créditos al mes')}</UpgradeAction>}</div>}
        {turn.status==='done'&&<div className={'bubble assistant kind-'+turn.result!.kind}>
          {answer(turn)}{footer(turn)}
          {turn.archived?<small className="bubble-meta">{t('De una conversación guardada.')}</small>:<details className="usage"><summary>{t('Detalles')}</summary><span className="bubble-meta">{usageLine(turn.result!)}</span></details>}
        </div>}
      </div>)}
    </div>
    <div className="chat-composer">
      {provider?.kind==='mock'&&<p className="inline-note warn">{t('Demostración · sin IA')}</p>}
      <div className="composer-box">
        <textarea id="chat-prompt" rows={2} maxLength={4000} value={prompt} aria-label={t('Mensaje para el asistente')} disabled={authRequired}
          placeholder={authRequired?t('Iniciá sesión para escribirle a la IA'):question?t('Respondé acá…'):ids.length?t('Sobre la selección ({0})…',ids.length):t('Preguntá o pedí lo que necesites…')} onChange={e=>setPrompt(e.target.value)}
          // El panel de IA se ve por defecto: la intención de usarla es enfocar el cuadro, no abrir el editor.
          onFocus={()=>{if(!opened.current){opened.current=true;track('ai_opened',{});}}}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}}/>
        {sending?<button className="send stop" onClick={()=>requests.get(tabId)?.abort()} aria-label={t('Cancelar el pedido')} title={t('Cancelar')}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg></button>
          :<button className="primary send" disabled={!prompt.trim()||!ready} onClick={()=>submit()} aria-label={t('Enviar')} title={t('Enviar (Enter)')}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg></button>}
      </div>
      {configured.length>1&&<div className="composer-row">
        <select id="chat-provider" aria-label={t('Proveedor')} value={providerId} onChange={e=>setProviderId(e.target.value)}>
          {providers?.map(p=><option key={p.id} value={p.id} disabled={!p.configured}>{p.label}{p.configured?'':t(' — sin configurar')}</option>)}
        </select>
      </div>}
    </div>
  </div>;
}
