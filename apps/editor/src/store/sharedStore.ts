import {openDocument,type ActionBatch} from '@diagramia/core';
import {createStore} from './createStore';
import {addTab,clearSharedHistory,documentStore,forceSharedDocument,newId,notify,receiveSharedDocument,registerSharedAdapter,switchTab} from './documentStore';
import {accountStore,refreshAccount} from './accountStore';
import {viewStore} from './viewStore';
import {track,trackUseful} from '../telemetry';
import {saveFile} from '../ui';
import {LANG,t} from '../i18n';
import {serverTextIn} from '../serverText';

type Phase='off'|'connecting'|'synced'|'sending'|'offline'|'conflict';
export type SharedMode='local'|'cloud';
type Binding={docId:string;mode:SharedMode};
/** Guardado remoto de la pestaña ACTIVA. Cada pestaña conserva su propio vínculo (ADR 103): al volver a ella se retoma. */
type SharedState={tabId:string|null;docId:string|null;mode:SharedMode;phase:Phase;pending:number;serverRevision:number|null;message:string};
type Item={batch:ActionBatch;tabId:string;docId:string;mode:SharedMode};
const OFF:SharedState={tabId:null,docId:null,mode:'local',phase:'off',pending:0,serverRevision:null,message:t('El documento está sólo en este navegador.')};
export const sharedStore=createStore<SharedState>({...OFF});
const headers={'content-type':'application/json','x-diagramia-client':'editor'};
const BINDINGS_KEY='diagramia.shared.bindings',LEGACY_KEY='diagramia.shared.binding';
// Vínculo de cada pestaña con su documento remoto; cuáles tienen el guardado detenido, cuáles se están creando y cuáles ya se compararon con el servidor en esta sesión.
const bindings=new Map<string,Binding>(),blocked=new Map<string,{phase:'offline'|'conflict';message:string}>(),creating=new Set<string>(),verified=new Set<string>(),staleHistory=new Set<string>();
let queue:Item[]=[],busy=false,pollBusy=false;
const saveBindings=()=>{try{localStorage.setItem(BINDINGS_KEY,JSON.stringify(Object.fromEntries(bindings)));localStorage.removeItem(LEGACY_KEY);}catch{/* sigue visible en esta sesión */}};
const endpoint=(mode:SharedMode,id?:string)=>`/api/v1/${mode}/documents`+(id?'/'+encodeURIComponent(id):'');
const label=(mode:SharedMode)=>mode==='cloud'?t('Guardado en tu nube'):t('Compartido con MCP');
const pendingOf=(tabId:string)=>queue.filter(item=>item.tabId===tabId).length;
const viewing=(tabId:string)=>sharedStore.get().tabId===tabId;

class SharedError extends Error{constructor(readonly status:number,readonly code:string,message:string){super(message);}}
async function request(path:string,method='GET',body?:unknown):Promise<any>{
  const response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:{code:'INVALID_RESPONSE',message:t('Respuesta ilegible del servidor.')}}));
  if(!response.ok)throw new SharedError(response.status,result.error?.code??'HTTP_ERROR',typeof result.error?.message==='string'?serverTextIn(LANG,result.error.message):t('Error HTTP {0}',response.status));
  return result;
}
const problem=(error:unknown)=>error instanceof Error?error.message:t('No se pudo contactar al servidor.');
const current=()=>{const state=sharedStore.get(),editor=documentStore.get();return state.tabId===editor.activeId&&state.docId===editor.doc.id;};
/** Detiene el guardado de una pestaña: sin conexión se reintenta; un conflicto espera una decisión de la persona. */
function block(tabId:string,error:unknown){
  const conflict=error instanceof SharedError&&[409,404].includes(error.status);
  const stop={phase:conflict?'conflict' as const:'offline' as const,message:conflict?t('Conflicto: {0} La copia local sigue abierta. Descargala antes de cargar la versión del servidor.',problem(error)):t('Sin conexión: {0} Los cambios quedan en este navegador y se reintentarán con el mismo ID.',problem(error))};
  blocked.set(tabId,stop);
  if(viewing(tabId))sharedStore.set(stop);
  notify(stop.message,conflict?'error':'warn');
}

/** Envía los cambios en orden. Una pestaña detenida o que todavía se está creando no frena a las demás. */
async function drain(){
  if(busy)return;
  busy=true;
  try{
    for(;;){
      const item=queue.find(entry=>!blocked.has(entry.tabId)&&!creating.has(entry.tabId));
      if(!item)break;
      if(viewing(item.tabId))sharedStore.set({phase:'sending',pending:pendingOf(item.tabId),message:t('Guardando {0} cambio(s) en PostgreSQL…',pendingOf(item.tabId))});
      try{
        const answer=await request(endpoint(item.mode,item.docId)+'/batches','POST',item.batch);
        if(!queue.includes(item))continue;
        queue=queue.filter(entry=>entry!==item);verified.add(item.tabId);
        const left=pendingOf(item.tabId);
        if(viewing(item.tabId))sharedStore.set({pending:left,serverRevision:answer.appliedRevision,phase:left?'sending':'synced',message:left?t('Quedan {0} cambio(s) por guardar.',left):`${label(item.mode)} · r${answer.appliedRevision}`});
      }catch(error){if(queue.includes(item))block(item.tabId,error);}
    }
  }finally{busy=false;}
}

/** Refleja en el store el vínculo de la pestaña activa. Se llama al cambiar de pestaña y cuando cambia un vínculo. */
function refresh(){
  const {activeId,doc}=documentStore.get(),binding=bindings.get(activeId);
  if(!binding||binding.docId!==doc.id){if(binding)drop(activeId);if(sharedStore.get().tabId)sharedStore.set({...OFF});return;}
  // El historial previo al primer guardado no existe en el servidor: si la pestaña no estaba a la vista cuando se guardó, se limpia al volver.
  if(staleHistory.delete(activeId))clearSharedHistory(activeId);
  const base={tabId:activeId,docId:binding.docId,mode:binding.mode,serverRevision:null},stop=blocked.get(activeId),pending=pendingOf(activeId);
  if(creating.has(activeId))sharedStore.set({...base,phase:'connecting',pending,message:binding.mode==='cloud'?t('Guardando el diagrama en tu cuenta…'):t('Enviando documento al espacio local…')});
  else if(stop)sharedStore.set({...base,...stop,pending});
  else if(pending){sharedStore.set({...base,phase:'sending',pending,message:t('Guardando {0} cambio(s) en PostgreSQL…',pending)});void drain();}
  else if(verified.has(activeId))sharedStore.set({...base,phase:'synced',pending:0,serverRevision:doc.revision,message:`${label(binding.mode)} · r${doc.revision}`});
  else{sharedStore.set({...base,phase:'connecting',pending:0,message:t('Reconectando el documento compartido…')});void reconnect();}
}
function drop(tabId:string){
  bindings.delete(tabId);blocked.delete(tabId);creating.delete(tabId);verified.delete(tabId);staleHistory.delete(tabId);queue=queue.filter(item=>item.tabId!==tabId);saveBindings();
}

/** Guarda el documento de la pestaña activa en el servidor y lo deja vinculado: desde ahí cada cambio se guarda solo. */
export async function createSharedDocument(mode:SharedMode='local',options:{auto?:boolean}={}):Promise<boolean>{
  const editor=documentStore.get(),tabId=editor.activeId,doc=editor.doc;
  if(pendingOf(tabId)||creating.has(tabId)){notify(t('Primero resolvé los cambios pendientes del espacio compartido.'),'warn');return false;}
  if(bindings.has(tabId))drop(tabId);
  // El vínculo existe desde ya: lo que se edite mientras el servidor responde queda en la cola y se envía después, en orden.
  bindings.set(tabId,{docId:doc.id,mode});creating.add(tabId);refresh();
  try{
    const answer=await request(endpoint(mode),'POST',doc);
    if(!creating.has(tabId))return false;
    creating.delete(tabId);verified.add(tabId);saveBindings();
    // El historial anterior no existe en el servidor: deshacer más atrás del primer guardado no se puede restaurar ahí.
    if(documentStore.get().activeId===tabId)clearSharedHistory(tabId);else staleHistory.add(tabId);
    if(viewing(tabId)){
      const pending=pendingOf(tabId);
      sharedStore.set({phase:pending?'sending':'synced',pending,serverRevision:answer.document.revision,message:`${label(mode)} · r${answer.document.revision}`});
    }
    notify(mode==='cloud'?(options.auto?t('Guardado automático: el diagrama ya está en tu nube.'):t('Documento guardado en tu nube.')):t('Documento guardado en PostgreSQL y disponible para MCP.'));
    if(mode==='cloud')trackUseful(doc,'saved_cloud');
    void drain();
    return true;
  }catch(error){
    if(creating.has(tabId)){drop(tabId);if(documentStore.get().activeId===tabId)sharedStore.set({...OFF,message:problem(error)});}
    notify(problem(error),'error');
    return false;
  }
}

export async function listSharedDocuments(mode:SharedMode='local',options:{throwOnError?:boolean}={}):Promise<{id:string;title:string;revision:number;shareToken?:string|null}[]>{
  try{return (await request(endpoint(mode))).documents;}catch(error){if(options.throwOnError)throw error;return [];}
}

// ---- Enlace público de sólo lectura (ADR 106). Sólo para diagramas de la nube; quien lo abre ve siempre la última versión guardada. ----
export const shareUrl=(token:string)=>`${location.origin}/s/${token}`;
/** El enlace vigente de un diagrama de la nube, o null si no se está compartiendo. Lanza si no se pudo consultar. */
export async function shareTokenOf(id:string):Promise<string|null>{
  return (await listSharedDocuments('cloud',{throwOnError:true})).find(item=>item.id===id)?.shareToken??null;
}
export async function createShareLink(id:string):Promise<string>{
  const answer=await request(endpoint('cloud',id)+'/share','POST');
  track('share_link_created',{});
  // Compartir es la señal de valor más fuerte: alguien quiso mostrárselo a otra persona.
  if(current()&&documentStore.get().doc.id===id)trackUseful(documentStore.get().doc,'shared');
  return answer.token;
}
/** Corta el enlace: deja de abrir en el momento. Compartir de nuevo genera una dirección distinta. */
export async function removeShareLink(id:string):Promise<void>{
  await request(endpoint('cloud',id)+'/unshare','POST');
  track('share_link_revoked',{});
}

/** Abre un documento remoto. Si ya está abierto en una pestaña, va a esa: dos pestañas con el mismo documento se pisarían. */
export async function openSharedDocument(id:string,mode:SharedMode='local'){
  const open=[...bindings].find(([tabId,binding])=>binding.docId===id&&binding.mode===mode&&documentStore.get().tabs.some(tab=>tab.id===tabId));
  if(open){switchTab(open[0]);return true;}
  try{
    const answer=await request(endpoint(mode,id)),doc=openDocument(answer.document).document;
    if(!addTab(doc))return false;
    const tabId=documentStore.get().activeId;
    bindings.set(tabId,{docId:doc.id,mode});verified.add(tabId);saveBindings();refresh();
    return true;
  }catch(error){notify(problem(error),'error');return false;}
}

export function detachSharedDocument(tabId=sharedStore.get().tabId){
  if(!tabId||!bindings.has(tabId))return;
  const pending=pendingOf(tabId);drop(tabId);
  if(viewing(tabId))sharedStore.set({...OFF,message:pending?t('Desconectado con cambios locales pendientes. Exportá la copia para conservarla.'):t('Documento desconectado; sigue guardándose en este navegador.')});
}
/** Al cerrar sesión o eliminar la cuenta, ninguna pestaña sigue vinculada a la nube. Los diagramas quedan en el navegador. */
export function detachCloudDocuments(){for(const [tabId,binding] of [...bindings])if(binding.mode==='cloud')detachSharedDocument(tabId);}

export function retryShared(){
  const {tabId}=sharedStore.get();
  if(!tabId||blocked.get(tabId)?.phase!=='offline')return;
  blocked.delete(tabId);
  if(!pendingOf(tabId))verified.delete(tabId);
  refresh();
}

export async function recoverShared(){
  const state=sharedStore.get();
  if(!state.docId||!current())return;
  try{
    const answer=await request(endpoint(state.mode,state.docId)),doc=openDocument(answer.document).document;
    const local=documentStore.get().doc;
    saveFile(`diagramia-copia-local-${local.id}-r${local.revision}.json`,JSON.stringify(local,null,2)+'\n','application/json');
    if(!forceSharedDocument(state.tabId!,doc))return;
    queue=queue.filter(item=>item.tabId!==state.tabId);blocked.delete(state.tabId!);verified.add(state.tabId!);
    sharedStore.set({phase:'synced',pending:0,serverRevision:doc.revision,message:t('Recuperado del servidor · r{0}. Se descargó una copia local previa.',doc.revision)});
  }catch(error){block(state.tabId!,error);}
}

async function poll(){
  const state=sharedStore.get();
  if(pollBusy||!current()||state.phase!=='synced'||pendingOf(state.tabId!)||!state.docId)return;
  pollBusy=true;
  try{
    const editor=documentStore.get(),answer=await request(endpoint(state.mode,state.docId)+'/head');
    if(!current()||pendingOf(state.tabId!)||documentStore.get().doc!==editor.doc)return;
    if(answer.revision>editor.doc.revision){
      const full=await request(endpoint(state.mode,state.docId));
      if(!current()||pendingOf(state.tabId!)||documentStore.get().doc!==editor.doc)return;
      const doc=openDocument(full.document).document;
      if(receiveSharedDocument(state.tabId!,doc,'remote'))sharedStore.set({serverRevision:doc.revision,message:t('Otro agente actualizó el documento · r{0}',doc.revision)});
    }
  }catch(error){if(current())block(state.tabId!,error);}finally{pollBusy=false;}
}
setInterval(()=>{void poll();},2500);

let reconnecting=false;
/** Primera vez que se ve una pestaña vinculada en la sesión: se compara la copia local con el servidor antes de darla por guardada. */
async function reconnect(){
  const state=sharedStore.get(),editor=documentStore.get();
  if(reconnecting||state.phase!=='connecting'||!current()||creating.has(state.tabId!))return;
  reconnecting=true;
  try{
    const answer=await request(endpoint(state.mode,state.docId!)),remote=openDocument(answer.document).document;
    if(!current()||sharedStore.get().phase!=='connecting'||documentStore.get().doc!==editor.doc)return;
    if(editor.doc.revision>remote.revision||editor.doc.revision===remote.revision&&JSON.stringify(editor.doc)!==JSON.stringify(remote)){
      const stop={phase:'conflict' as const,message:t('Hay cambios locales que no coinciden con el servidor. Descargá la copia local antes de recuperar la versión compartida.')};
      blocked.set(state.tabId!,stop);sharedStore.set({...stop,serverRevision:remote.revision});
      return;
    }
    if(remote.revision>editor.doc.revision)receiveSharedDocument(state.tabId!,remote,'remote');
    verified.add(state.tabId!);
    sharedStore.set({phase:'synced',serverRevision:remote.revision,message:t('Reconectado · r{0}',remote.revision)});
  }catch(error){if(current()&&sharedStore.get().phase==='connecting')block(state.tabId!,error);}
  finally{reconnecting=false;if(sharedStore.get().phase==='connecting'&&sharedStore.get().tabId!==state.tabId)void reconnect();}
}

try{
  const tabs=new Set(documentStore.get().tabs.map(tab=>tab.id)),raw=JSON.parse(localStorage.getItem(BINDINGS_KEY)??'null'),legacy=raw?null:JSON.parse(localStorage.getItem(LEGACY_KEY)??'null');
  const entries:[unknown,unknown][]=raw&&typeof raw==='object'?Object.entries(raw):legacy&&typeof legacy==='object'?[[legacy.tabId,legacy]]:[];
  for(const [tabId,value] of entries){
    const binding=value as {docId?:unknown;mode?:unknown}|null;
    if(typeof tabId==='string'&&tabs.has(tabId)&&binding&&typeof binding.docId==='string'&&(binding.mode==='local'||binding.mode==='cloud'))bindings.set(tabId,{docId:binding.docId,mode:binding.mode});
  }
}catch{/* vínculos anteriores ilegibles: los documentos locales se conservan */}
// Al volver la conexión, las pestañas que quedaron sin guardar se reintentan solas.
if(typeof window!=='undefined')window.addEventListener('online',()=>{for(const [tabId,stop] of [...blocked])if(stop.phase==='offline'){blocked.delete(tabId);if(!pendingOf(tabId))verified.delete(tabId);}refresh();void drain();});
let seenTab=documentStore.get().activeId;
documentStore.subscribe(()=>{
  const {activeId}=documentStore.get();
  if(activeId!==seenTab){seenTab=activeId;refresh();}
  else if(sharedStore.get().phase==='connecting')void reconnect();
});
refresh();

registerSharedAdapter({
  active:tabId=>bindings.has(tabId),
  send:(tabId,batch)=>{
    const binding=bindings.get(tabId);
    if(!binding)return;
    queue.push({tabId,batch,...binding});
    // Sin conexión, un cambio nuevo vuelve a intentar el envío; un conflicto no se reintenta solo.
    if(blocked.get(tabId)?.phase==='offline')blocked.delete(tabId);
    if(viewing(tabId))sharedStore.set({pending:pendingOf(tabId),...(blocked.has(tabId)||creating.has(tabId)?{}:{phase:'sending' as const})});
    void drain();
  },
  restore:(tabId,sourceRevision,baseRevision,direction)=>{
    const state=sharedStore.get();
    if(!state.docId||state.tabId!==tabId)return;
    if(pendingOf(tabId)||state.phase!=='synced'){notify(t('Esperá a que termine el guardado compartido antes de deshacer o rehacer.'),'warn');return;}
    sharedStore.set({phase:'sending',message:t('Restaurando una versión en PostgreSQL…')});
    void request(endpoint(state.mode,state.docId)+'/restore','POST',{sourceRevision,baseRevision,operationId:newId('restore')}).then(answer=>{
      if(!current()||documentStore.get().doc.revision!==baseRevision){
        const stop={phase:'conflict' as const,message:t('El documento cambió mientras se restauraba. Descargá tu copia y cargá la versión del servidor.')};
        blocked.set(tabId,stop);if(viewing(tabId))sharedStore.set(stop);return;
      }
      const doc=openDocument(answer.document).document;
      receiveSharedDocument(tabId,doc,direction);
      sharedStore.set({phase:'synced',serverRevision:doc.revision,message:t('Versión restaurada · r{0}',doc.revision)});
    }).catch(error=>block(tabId,error));
  },
  detach:detachSharedDocument
});

// ---- Guardado automático en la nube (preferencia `autoCloud`, apagada por defecto) ----
// Con sesión iniciada, un diagrama con contenido que todavía vive sólo en el navegador se guarda solo. Un canvas vacío no ocupa lugar del plan.
const autoFailed=new Set<string>();
let autoTimer:ReturnType<typeof setTimeout>|undefined;
function autosaveTarget():string|null{
  if(!viewStore.get().autoCloud||accountStore.get().auth!=='signed-in')return null;
  const {activeId,doc,recovery}=documentStore.get();
  if(recovery!==null||bindings.has(activeId)||autoFailed.has(activeId))return null;
  return doc.nodes.length||doc.drawings.length||doc.zones.length?activeId:null;
}
function considerAutosave(){
  clearTimeout(autoTimer);
  if(!autosaveTarget())return;
  autoTimer=setTimeout(async()=>{
    const tabId=autosaveTarget();
    if(!tabId)return;
    // Si falla (por ejemplo, el plan llegó a su límite de diagramas) se avisa una vez y no se insiste con esa pestaña.
    if(await createSharedDocument('cloud',{auto:true}))void refreshAccount();else autoFailed.add(tabId);
  },1500);
}
let autoSeen={doc:documentStore.get().doc,auto:viewStore.get().autoCloud,auth:accountStore.get().auth};
const autoCheck=()=>{
  const next={doc:documentStore.get().doc,auto:viewStore.get().autoCloud,auth:accountStore.get().auth};
  if(next.doc===autoSeen.doc&&next.auto===autoSeen.auto&&next.auth===autoSeen.auth)return;
  if(next.auto!==autoSeen.auto||next.auth!==autoSeen.auth)autoFailed.clear();
  autoSeen=next;considerAutosave();
};
documentStore.subscribe(autoCheck);viewStore.subscribe(autoCheck);accountStore.subscribe(autoCheck);
