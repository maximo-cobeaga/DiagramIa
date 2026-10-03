import {BatchSchema,applyBatch,documentBounds,emptyDocument,openDocument,validateDocument,prunedReferences,describeError,errorCode,type ActionBatch,type ActionInput,type DiagramDocument} from '@diagramia/core';
import architecture from '../../../../examples/architecture.diagramia.json';
import {createStore} from './createStore';
import {pruneSelection,selectionStore} from './selectionStore';
import {cancelCameraMove,fit,viewStore,type Camera} from './viewStore';
import {track,trackBatch,trackThrottled,trackUndo} from '../telemetry';

// Cada pestaña es un documento independiente, guardado con su propia clave. El índice dice cuáles hay y cuál está abierta.
const WORKSPACE='diagramia.workspace',DOC='diagramia.doc.',LEGACY=['diagramia.document','diagramia.starter.document.v1'];
export const HISTORY_LIMIT=100,MAX_TABS=12;
export type Notice={text:string;tone:'info'|'warn'|'error'};
export type SaveState={status:'saved'|'pending'|'error'|'blocked';detail:string};
export type Tab={id:string;title:string};
type TabState={doc:DiagramDocument;past:DiagramDocument[];future:DiagramDocument[];dropped:number;recovery:string|null;camera:Camera|null};
export const newId=(prefix:string)=>prefix+'-'+crypto.randomUUID().slice(0,8);
const example=()=>openDocument(architecture).document;
const blank=(doc:DiagramDocument,recovery:string|null=null):TabState=>({doc,past:[],future:[],dropped:0,recovery,camera:null});

/** Abre el contenido guardado de una pestaña. Si no se puede leer, no se pisa: queda como copia para exportar. */
function openTab(raw:string|null):{state:TabState;notice:Notice|null}{
  if(!raw)return {state:blank(emptyDocument(newId('doc'),'Documento sin título')),notice:null};
  try{
    const opened=openDocument(JSON.parse(raw));
    return {state:blank(opened.document),notice:opened.migratedFrom?{text:`Documento migrado del schema ${opened.migratedFrom} al vigente sin cambiar IDs.`,tone:'info'}:null};
  }catch(e){
    return {state:blank(example(),raw),notice:{text:`El documento guardado no se pudo abrir (${describeError(e)}). Se muestra un ejemplo y el guardado de esta pestaña queda en pausa hasta exportar la copia.`,tone:'error'}};
  }
}
const states=new Map<string,TabState>();
function boot(){
  let order:string[]=[],active='',notice:Notice={text:'Listo para editar.',tone:'info'};
  try{
    const workspace=JSON.parse(localStorage.getItem(WORKSPACE)??'null') as {tabs?:unknown;active?:unknown}|null;
    if(workspace&&Array.isArray(workspace.tabs))for(const id of workspace.tabs.slice(0,MAX_TABS)){
      if(typeof id!=='string'||states.has(id))continue;
      const opened=openTab(localStorage.getItem(DOC+id));
      states.set(id,opened.state);order.push(id);
      if(id===workspace.active){active=id;notice=opened.notice??{text:'Documento recuperado del guardado local.',tone:'info'};}
    }
    if(!order.length){
      // Primera vez con pestañas: se adopta el documento único de versiones anteriores, si existe.
      const legacy=LEGACY.map(key=>localStorage.getItem(key)).find(Boolean)??null,opened=legacy?openTab(legacy):{state:blank(emptyDocument(newId('doc'),'Mi primera idea')),notice:null};
      const id=newId('tab');states.set(id,opened.state);order=[id];active=id;
      notice=opened.notice??{text:legacy?'Documento recuperado del guardado local.':'Listo para editar.',tone:'info'};
    }
  }catch{
    states.clear();const id=newId('tab');states.set(id,blank(emptyDocument(newId('doc'),'Mi primera idea')));order=[id];active=id;
  }
  if(!states.has(active))active=order[0];
  return {order,active,notice};
}
const initial=boot(),first=states.get(initial.active)!;
const tabList=(order:string[]):Tab[]=>order.map(id=>({id,title:states.get(id)!.doc.title}));
const saveOf=(recovery:string|null):SaveState=>recovery!==null?{status:'blocked',detail:'Guardado en pausa'}:{status:'saved',detail:'Guardado en este navegador'};

export const documentStore=createStore({
  doc:first.doc,past:first.past,future:first.future,dropped:first.dropped,recovery:first.recovery,
  tabs:tabList(initial.order),activeId:initial.active,
  save:saveOf(first.recovery),notice:initial.notice,log:[] as string[],externalChange:null as string|null
});
export const notify=(text:string,tone:Notice['tone']='info')=>documentStore.set({notice:{text,tone}});
type SharedAdapter={active:(tabId:string)=>boolean;send:(tabId:string,batch:ActionBatch)=>void;restore:(tabId:string,sourceRevision:number,baseRevision:number,direction:'undo'|'redo')=>void;detach:(tabId:string)=>void};
let sharedAdapter:SharedAdapter|null=null;
export const registerSharedAdapter=(adapter:SharedAdapter)=>{sharedAdapter=adapter;};
const order=()=>documentStore.get().tabs.map(tab=>tab.id);

function install(doc:DiagramDocument,previous:DiagramDocument,extra:{log?:string;notice?:Notice;history?:'push'|'undo'|'redo'}){
  documentStore.set(state=>{
    const past=extra.history==='undo'?state.past.slice(0,-1):[...state.past,previous];
    return {
      doc,notice:extra.notice??state.notice,
      past:past.slice(-HISTORY_LIMIT),dropped:state.dropped+Math.max(0,past.length-HISTORY_LIMIT),
      future:extra.history==='undo'?[...state.future,previous]:extra.history==='redo'?state.future.slice(0,-1):[],
      log:extra.log?[...state.log,extra.log].slice(-60):state.log,
      tabs:state.tabs.map(tab=>tab.id===state.activeId&&tab.title!==doc.title?{...tab,title:doc.title}:tab)
    };
  });
  pruneSelection(doc);
}

/** Aplica un lote ya armado (propuestas de IA, MCP pegado a mano). Devuelve true si el documento cambió. */
export function commit(batch:unknown,label='Cambio aplicado',source:'user'|'ai'='user'):boolean{
  const {doc,activeId}=documentStore.get();
  try{
    const next=applyBatch(doc,batch);
    if(next.revision===doc.revision){notify('Este lote ya se había aplicado; no se repitió.');return false;}
    const pruned=prunedReferences(doc,next);
    install(next,doc,{history:'push',log:`r${next.revision} · ${label}`,notice:pruned.length
      ?{text:`${label}. Se quitaron referencias en ${pruned.length} paso(s) de animación: revisá sus textos (${pruned.map(p=>p.stepId).join(', ')}).`,tone:'warn'}
      :{text:`${label}. Revisión ${next.revision}.`,tone:'info'}});
    trackBatch((batch as {actions?:{type:string}[]}).actions??[],source);
    if(sharedAdapter?.active(activeId))sharedAdapter.send(activeId,BatchSchema.parse(batch));
    return true;
  }catch(e){
    notify(errorCode(e)==='REVISION_CONFLICT'?`Conflicto de revisión: el documento cambió desde que se generó el lote. ${describeError(e)}`:describeError(e),'error');
    return false;
  }
}
export const transact=(actions:ActionInput[],label?:string)=>actions.length?commit({id:newId('ui'),baseRevision:documentStore.get().doc.revision,actions},label):false;

// Undo restaura contenido con una revisión nueva: las revisiones nunca retroceden y el ledger reciente se conserva.
function travel(direction:'undo'|'redo'){
  const {doc,past,future,activeId}=documentStore.get(),stack=direction==='undo'?past:future;
  if(!stack.length)return;
  if(direction==='undo')trackUndo();else track('redo',{});
  if(sharedAdapter?.active(activeId)){
    sharedAdapter.restore(activeId,stack[stack.length-1]!.revision,doc.revision,direction);
    return;
  }
  const restored=validateDocument({...stack[stack.length-1],revision:doc.revision+1,appliedBatches:doc.appliedBatches});
  install(restored,doc,{history:direction,notice:{text:direction==='undo'?'Cambio deshecho.':'Cambio rehecho.',tone:'info'},log:`r${restored.revision} · ${direction==='undo'?'Deshacer':'Rehacer'}`});
}
export const undo=()=>travel('undo'),redo=()=>travel('redo');

/** Reemplaza el documento completo de la pestaña (import, ejemplo). Se puede deshacer en esta sesión. */
export function replaceDocument(next:DiagramDocument,message:string,tone:Notice['tone']='info'){
  const {doc,activeId}=documentStore.get();
  if(sharedAdapter?.active(activeId))sharedAdapter.detach(activeId);
  // La revisión sigue creciendo para que un lote armado contra el documento anterior no se aplique por error.
  install(validateDocument({...next,revision:Math.max(next.revision,doc.revision+1)}),doc,{history:'push',notice:{text:message,tone},log:message});
}

/** Recibe una revisión remota sin fabricar un número de revisión local. */
export function receiveSharedDocument(tabId:string,next:DiagramDocument,reason:'remote'|'undo'|'redo'){
  const state=documentStore.get();
  if(state.activeId!==tabId||state.doc.id!==next.id)return false;
  install(validateDocument(next),state.doc,{history:reason==='remote'?'push':reason,notice:{text:reason==='remote'?`Otro agente actualizó el documento a r${next.revision}.`:`${reason==='undo'?'Cambio deshecho':'Cambio rehecho'} en el espacio compartido · r${next.revision}.`,tone:'info'},log:`r${next.revision} · ${reason==='remote'?'Cambio remoto':reason}`});
  return true;
}

/** Recupera el servidor sólo por pedido explícito; borra el historial optimista que nunca llegó a la base. */
export function forceSharedDocument(tabId:string,next:DiagramDocument){
  const state=documentStore.get();
  if(state.activeId!==tabId)return false;
  const doc=validateDocument(next);
  documentStore.set({doc,past:[],future:[],notice:{text:`Se cargó la revisión r${doc.revision} del espacio compartido.`,tone:'info'},log:[...state.log,`r${doc.revision} · Recuperado del servidor`].slice(-60)});
  pruneSelection(doc);
  return true;
}
export function clearSharedHistory(tabId:string){if(documentStore.get().activeId===tabId)documentStore.set({past:[],future:[]});}

let lastWritten:string|null=null,timer:ReturnType<typeof setTimeout>|undefined;
function write(){
  timer=undefined;
  const {doc,recovery,activeId}=documentStore.get();
  if(recovery!==null)return;
  try{
    const body=JSON.stringify(doc);
    localStorage.setItem(DOC+activeId,body);localStorage.setItem(WORKSPACE,JSON.stringify({tabs:order(),active:activeId}));lastWritten=body;
    documentStore.set({save:{status:'saved',detail:`Guardado en este navegador · r${doc.revision}`}});
  }catch{
    trackThrottled('save_failed',{target:'local'},300_000);
    documentStore.set({save:{status:'error',detail:'Sin guardar'},notice:{text:'No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). Tus cambios siguen en esta pestaña: exportá el JSON para no perderlos.',tone:'error'}});
  }
}
let persisted=documentStore.get().doc;
documentStore.subscribe(()=>{
  const {doc,recovery}=documentStore.get();
  if(doc===persisted)return;
  persisted=doc;
  if(recovery!==null)return;
  documentStore.set({save:{status:'pending',detail:'Guardando…'}});
  clearTimeout(timer);timer=setTimeout(write,250);
});
const flush=()=>{if(timer){clearTimeout(timer);write();}};
// El índice de pestañas y el documento abierto quedan guardados desde el arranque, no recién con el primer cambio.
if(first.recovery===null)write();
if(typeof window!=='undefined'){
  window.addEventListener('pagehide',flush);
  // Otra ventana del navegador escribió esta misma pestaña: se avisa en vez de pisar o perder cambios en silencio.
  window.addEventListener('storage',e=>{if(e.key===DOC+documentStore.get().activeId&&e.newValue&&e.newValue!==lastWritten)documentStore.set({externalChange:e.newValue});});
}
export function retrySave(){clearTimeout(timer);write();}
export function loadExternalChange(){
  const {externalChange}=documentStore.get();if(!externalChange)return;
  try{replaceDocument(openDocument(JSON.parse(externalChange)).document,'Se cargó la versión guardada por la otra ventana. Podés deshacer para volver a la tuya.');}
  catch(e){notify(describeError(e),'error');}
  documentStore.set({externalChange:null});
}
export const dismissExternalChange=()=>documentStore.set({externalChange:null});
/** Tras exportar la copia dañada, el guardado local vuelve a habilitarse con el documento visible. */
export function releaseRecovery(){documentStore.set({recovery:null});retrySave();notify('Copia de recuperación exportada. El guardado local volvió a habilitarse.');}

// ---- Pestañas ----
function stash(){
  cancelCameraMove();
  const {doc,past,future,dropped,recovery,activeId}=documentStore.get();
  states.set(activeId,{doc,past,future,dropped,recovery,camera:viewStore.get().camera});
}
function show(id:string,tabs:Tab[],notice:Notice){
  cancelCameraMove();
  const state=states.get(id)!;
  selectionStore.set({ids:[]});viewStore.set({staging:null,editingId:null,tool:'select',startMode:'choose',connectFromId:null});
  persisted=state.doc;
  documentStore.set({doc:state.doc,past:state.past,future:state.future,dropped:state.dropped,recovery:state.recovery,activeId:id,tabs,save:saveOf(state.recovery),notice,externalChange:null});
  if(state.camera)viewStore.set({camera:state.camera});else fit(documentBounds(state.doc));
  try{localStorage.setItem(WORKSPACE,JSON.stringify({tabs:tabs.map(tab=>tab.id),active:id}));if(state.recovery===null)localStorage.setItem(DOC+id,JSON.stringify(state.doc));}catch{/* el aviso de guardado aparece con el próximo cambio */}
}
export function switchTab(id:string){
  if(id===documentStore.get().activeId||!states.has(id))return;
  flush();stash();
  show(id,documentStore.get().tabs,{text:`Pestaña «${states.get(id)!.doc.title}».`,tone:'info'});
}
/** Abre un documento en una pestaña nueva; sin documento, un canvas vacío. */
export function addTab(doc?:DiagramDocument):boolean{
  const {tabs}=documentStore.get();
  if(tabs.length>=MAX_TABS){notify(`El máximo es ${MAX_TABS} pestañas. Cerrá o exportá alguna.`,'warn');return false;}
  flush();stash();
  const id=newId('tab'),next=doc??emptyDocument(newId('doc'),`Diagrama ${tabs.length+1}`);
  track('tab_created',{});
  states.set(id,blank(next));
  show(id,[...tabs,{id,title:next.title}],{text:doc?`«${next.title}» abierto en una pestaña nueva.`:'Pestaña nueva con un canvas vacío.',tone:'info'});
  return true;
}
/** Cierra una pestaña y borra su documento del navegador. Quien llama debe haber confirmado con el usuario. */
export function closeTab(id:string){
  const {tabs,activeId}=documentStore.get(),index=tabs.findIndex(tab=>tab.id===id);
  if(index<0)return;
  if(sharedAdapter?.active(id))sharedAdapter.detach(id);
  if(id===activeId)flush();
  const rest=tabs.filter(tab=>tab.id!==id);
  states.delete(id);
  try{localStorage.removeItem(DOC+id);}catch{/* nada que limpiar */}
  if(!rest.length){const fresh=newId('tab'),doc=emptyDocument(newId('doc'),'Documento sin título');states.set(fresh,blank(doc));show(fresh,[{id:fresh,title:doc.title}],{text:'Se cerró la última pestaña: se abrió un canvas vacío.',tone:'info'});return;}
  if(id===activeId)show(rest[Math.min(index,rest.length-1)].id,rest,{text:'Pestaña cerrada.',tone:'info'});
  else{documentStore.set({tabs:rest});try{localStorage.setItem(WORKSPACE,JSON.stringify({tabs:rest.map(tab=>tab.id),active:activeId}));}catch{/* se reescribe con el próximo guardado */}}
}
