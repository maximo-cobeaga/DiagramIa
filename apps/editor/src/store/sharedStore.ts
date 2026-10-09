import {openDocument,type ActionBatch,type DiagramDocument} from '@diagramia/core';
import {createStore} from './createStore';
import {addTab,clearSharedHistory,documentStore,forceSharedDocument,newId,notify,receiveSharedDocument,registerSharedAdapter} from './documentStore';
import {trackUseful} from '../telemetry';
import {saveFile} from '../ui';

type Phase='off'|'connecting'|'synced'|'sending'|'offline'|'conflict';
export type SharedMode='local'|'cloud';
type SharedState={tabId:string|null;docId:string|null;mode:SharedMode;phase:Phase;pending:number;serverRevision:number|null;message:string};
type Item={batch:ActionBatch;tabId:string};
export const sharedStore=createStore<SharedState>({tabId:null,docId:null,mode:'local',phase:'off',pending:0,serverRevision:null,message:'El documento está sólo en este navegador.'});
const headers={'content-type':'application/json','x-diagramia-client':'editor'};
let queue:Item[]=[],busy=false,pollBusy=false;
const BINDING_KEY='diagramia.shared.binding';
const saveBinding=(tabId:string,docId:string,mode:SharedMode)=>{try{localStorage.setItem(BINDING_KEY,JSON.stringify({tabId,docId,mode}));}catch{/* sigue visible en esta sesión */}};
const endpoint=(mode:SharedMode,id?:string)=>`/api/v1/${mode}/documents`+(id?'/'+encodeURIComponent(id):'');

class SharedError extends Error{constructor(readonly status:number,readonly code:string,message:string){super(message);}}
async function request(path:string,method='GET',body?:unknown):Promise<any>{
  const response=await fetch(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:{code:'INVALID_RESPONSE',message:'Respuesta ilegible del servidor.'}}));
  if(!response.ok)throw new SharedError(response.status,result.error?.code??'HTTP_ERROR',result.error?.message??`Error HTTP ${response.status}`);
  return result;
}
const problem=(error:unknown)=>error instanceof Error?error.message:'No se pudo contactar al servidor.';
const current=()=>{const state=sharedStore.get(),editor=documentStore.get();return state.tabId===editor.activeId&&state.docId===editor.doc.id;};
const setProblem=(error:unknown)=>{
  const conflict=error instanceof SharedError&&[409,404].includes(error.status);
  sharedStore.set({phase:conflict?'conflict':'offline',message:conflict?`Conflicto: ${problem(error)} La copia local sigue abierta. Descargala antes de cargar la versión del servidor.`:`Sin conexión: ${problem(error)} Los cambios quedan en este navegador y se reintentarán con el mismo ID.`});
  notify(sharedStore.get().message,conflict?'error':'warn');
};

async function drain(){
  if(busy||!queue.length||sharedStore.get().phase==='conflict')return;
  busy=true;
  try{
    while(queue.length){
      const item=queue[0]!,state=sharedStore.get();
      if(item.tabId!==state.tabId||!state.docId)break;
      sharedStore.set({phase:'sending',pending:queue.length,message:`Guardando ${queue.length} cambio(s) en PostgreSQL…`});
      try{
        const answer=await request(endpoint(state.mode,state.docId)+'/batches','POST',item.batch);
        if(sharedStore.get().tabId!==item.tabId)break;
        queue.shift();
        sharedStore.set({pending:queue.length,serverRevision:answer.appliedRevision,phase:queue.length?'sending':'synced',message:queue.length?`Quedan ${queue.length} cambio(s) por guardar.`:`${state.mode==='cloud'?'Guardado en tu nube':'Compartido con MCP'} · r${answer.appliedRevision}`});
      }catch(error){if(sharedStore.get().tabId===item.tabId)setProblem(error);break;}
    }
  }finally{busy=false;if(queue.length&&sharedStore.get().phase==='sending')queueMicrotask(()=>{void drain();});}
}

export async function createSharedDocument(mode:SharedMode='local'){
  const editor=documentStore.get(),tabId=editor.activeId,doc=editor.doc;
  if(queue.length){notify('Primero resolvé los cambios pendientes del espacio compartido.','warn');return;}
  if(sharedStore.get().tabId)detachSharedDocument();
  sharedStore.set({tabId:null,docId:null,mode,phase:'connecting',message:mode==='cloud'?'Guardando el diagrama en tu cuenta…':'Enviando documento al espacio local…'});
  try{
    const answer=await request(endpoint(mode),'POST',doc);
    if(documentStore.get().activeId!==tabId||documentStore.get().doc!==doc){sharedStore.set({phase:'off',message:'El documento cambió durante la conexión. Volvé a conectarlo.'});return;}
    sharedStore.set({tabId,docId:doc.id,mode,phase:'synced',pending:0,serverRevision:answer.document.revision,message:`${mode==='cloud'?'Guardado en tu nube':'Compartido con MCP'} · r${answer.document.revision}`});
    saveBinding(tabId,doc.id,mode);
    clearSharedHistory(tabId);
    notify(mode==='cloud'?'Documento guardado en tu nube.':'Documento guardado en PostgreSQL y disponible para MCP.');
    if(mode==='cloud')trackUseful(doc,'saved_cloud');
  }catch(error){sharedStore.set({phase:'off',message:problem(error)});notify(problem(error),'error');}
}

export async function listSharedDocuments(mode:SharedMode='local',options:{throwOnError?:boolean}={}):Promise<{id:string;title:string;revision:number}[]>{
  try{return (await request(endpoint(mode))).documents;}catch(error){if(options.throwOnError)throw error;return [];}
}

export async function openSharedDocument(id:string,mode:SharedMode='local'){
  if(queue.length){notify('Resolvé los cambios pendientes antes de abrir otro documento compartido.','warn');return false;}
  try{
    const answer=await request(endpoint(mode,id)),doc=openDocument(answer.document).document as DiagramDocument;
    if(!addTab(doc))return false;
    sharedStore.set({tabId:documentStore.get().activeId,docId:doc.id,mode,phase:'synced',pending:0,serverRevision:doc.revision,message:`${mode==='cloud'?'Guardado en tu nube':'Compartido con MCP'} · r${doc.revision}`});
    saveBinding(documentStore.get().activeId,doc.id,mode);
    return true;
  }catch(error){notify(problem(error),'error');return false;}
}

export function detachSharedDocument(tabId=sharedStore.get().tabId){
  if(!tabId||tabId!==sharedStore.get().tabId)return;
  const pending=queue.length;queue=[];
  try{localStorage.removeItem(BINDING_KEY);}catch{}
  sharedStore.set({tabId:null,docId:null,phase:'off',pending:0,serverRevision:null,message:pending?'Desconectado con cambios locales pendientes. Exportá la copia para conservarla.':'Documento desconectado; sigue guardándose en este navegador.'});
}

export function retryShared(){if(sharedStore.get().phase==='offline')void drain();}

export async function recoverShared(){
  const state=sharedStore.get();
  if(!state.docId||!current())return;
  try{
    const answer=await request(endpoint(state.mode,state.docId)),doc=openDocument(answer.document).document;
    const local=documentStore.get().doc;
    saveFile(`diagramia-copia-local-${local.id}-r${local.revision}.json`,JSON.stringify(local,null,2)+'\n','application/json');
    if(!forceSharedDocument(state.tabId!,doc))return;
    queue=[];sharedStore.set({phase:'synced',pending:0,serverRevision:doc.revision,message:`Recuperado del servidor · r${doc.revision}. Se descargó una copia local previa.`});
  }catch(error){setProblem(error);}
}

async function poll(){
  const state=sharedStore.get();
  if(pollBusy||!current()||state.phase!=='synced'||queue.length||!state.docId)return;
  pollBusy=true;
  try{
    const editor=documentStore.get(),answer=await request(endpoint(state.mode,state.docId)+'/head');
    if(!current()||queue.length||documentStore.get().doc!==editor.doc)return;
    if(answer.revision>editor.doc.revision){
      const full=await request(endpoint(state.mode,state.docId));
      if(!current()||queue.length||documentStore.get().doc!==editor.doc)return;
      const doc=openDocument(full.document).document;
      if(receiveSharedDocument(state.tabId!,doc,'remote'))sharedStore.set({serverRevision:doc.revision,message:`Otro agente actualizó el documento · r${doc.revision}`});
    }
  }catch(error){if(current())setProblem(error);}finally{pollBusy=false;}
}
setInterval(()=>{void poll();},2500);

let reconnecting=false;
async function reconnect(){
  const state=sharedStore.get(),editor=documentStore.get();
  if(reconnecting||state.phase!=='connecting'||state.tabId!==editor.activeId||state.docId!==editor.doc.id)return;
  reconnecting=true;
  try{
    const answer=await request(endpoint(state.mode,state.docId)),remote=openDocument(answer.document).document;
    if(!current()||documentStore.get().doc!==editor.doc)return;
    if(editor.doc.revision>remote.revision||editor.doc.revision===remote.revision&&JSON.stringify(editor.doc)!==JSON.stringify(remote)){
      sharedStore.set({phase:'conflict',serverRevision:remote.revision,message:'Hay cambios locales que no coinciden con el servidor. Descargá la copia local antes de recuperar la versión compartida.'});
      return;
    }
    if(remote.revision>editor.doc.revision)receiveSharedDocument(state.tabId!,remote,'remote');
    sharedStore.set({phase:'synced',serverRevision:remote.revision,message:`Reconectado · r${remote.revision}`});
  }catch(error){if(current())setProblem(error);}finally{reconnecting=false;}
}

try{
  const value=JSON.parse(localStorage.getItem(BINDING_KEY)??'null');
  if(value&&typeof value.tabId==='string'&&typeof value.docId==='string'&&(value.mode==='local'||value.mode==='cloud'))
    sharedStore.set({tabId:value.tabId,docId:value.docId,mode:value.mode,phase:'connecting',message:'Reconectando el documento compartido…'});
}catch{/* conexión anterior ilegible: el documento local se conserva */}
documentStore.subscribe(()=>{if(sharedStore.get().phase==='connecting')void reconnect();});
void reconnect();

registerSharedAdapter({
  active:tabId=>sharedStore.get().tabId===tabId,
  send:(tabId,batch)=>{queue.push({tabId,batch});sharedStore.set({pending:queue.length,...(sharedStore.get().phase==='conflict'?{}:{phase:'sending' as const})});void drain();},
  restore:(tabId,sourceRevision,baseRevision,direction)=>{
    const state=sharedStore.get();
    if(!state.docId||state.tabId!==tabId)return;
    if(queue.length||state.phase!=='synced'){notify('Esperá a que termine el guardado compartido antes de deshacer o rehacer.','warn');return;}
    sharedStore.set({phase:'sending',message:'Restaurando una versión en PostgreSQL…'});
    void request(endpoint(state.mode,state.docId)+'/restore','POST',{sourceRevision,baseRevision,operationId:newId('restore')}).then(answer=>{
      if(!current()||documentStore.get().doc.revision!==baseRevision){sharedStore.set({phase:'conflict',message:'El documento cambió mientras se restauraba. Descargá tu copia y cargá la versión del servidor.'});return;}
      const doc=openDocument(answer.document).document;
      receiveSharedDocument(tabId,doc,direction);
      sharedStore.set({phase:'synced',serverRevision:doc.revision,message:`Versión restaurada · r${doc.revision}`});
    }).catch(setProblem);
  },
  detach:detachSharedDocument
});
