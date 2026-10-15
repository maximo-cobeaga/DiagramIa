import {createStore} from '../store/createStore';
import {documentStore} from '../store/documentStore';
import {CHATS_KEY,parseChats,upsertChat,type SavedChat,type SavedTurn} from './chatHistory';
import {t} from '../i18n';

/** Lo que el store necesita saber de un turno. El chat lo extiende con el resultado completo, que vive sólo en memoria. */
export type StoredTurn={id:string;prompt:string;shown?:string;status:'sending'|'done'|'error';reply?:string;outcome?:string;archived?:boolean;result?:{mode?:string};error?:{message:string;retryable:boolean;code?:string}};
export type Conversation={id:string;turns:StoredTurn[]};
type ChatState={chats:Record<string,Conversation>;saved:SavedChat[]};

const read=()=>{try{return parseChats(localStorage.getItem(CHATS_KEY));}catch{return [];}};
const freshId=()=>'chat-'+crypto.randomUUID().slice(0,8);
const EMPTY:Conversation={id:'',turns:[]};
/** Cada pestaña conserva su conversación mientras el editor está abierto, aunque se cambie de panel; `saved` es el historial del navegador. */
export const chatStore=createStore<ChatState>({chats:{},saved:read()});
/** Pedidos en curso por pestaña: siguen aunque el panel de IA se cierre, y se pueden cancelar al volver. */
export const requests=new Map<string,AbortController>();

const NOTE:Record<string,string>={applied:t('\n\n_✓ Aplicada._'),rejected:t('\n\n_Rechazada: el documento no cambió._'),cancelled:t('\n\n_Pregunta cancelada._')};
/** Un turno guardado vuelve como texto: la propuesta original ya no se puede aplicar, pero se lee y sirve de contexto. */
function restore(turn:SavedTurn):StoredTurn{
  const base={id:turn.id,prompt:turn.prompt,...(turn.shown?{shown:turn.shown}:{}),reply:turn.reply,outcome:turn.outcome,archived:true};
  if(turn.failed)return {...base,status:'error',error:{message:turn.reply||t('El pedido no se completó.'),retryable:false}};
  const result={kind:'text',text:(turn.reply||t('Sin respuesta.'))+(NOTE[turn.outcome??'']??''),requestId:turn.id,mode:turn.mode??'explain',provider:'',providerKind:'remote',model:'',baseRevision:0,contextTruncated:false,repairs:0,replayed:true,
    usage:{inputTokens:0,outputTokens:0,calls:0,estimatedCostUsd:null,costBasis:'none'}};
  return {...base,status:'done',result};
}
const resumed=new WeakMap<SavedChat,Conversation>();
/** Conversación de una pestaña: la que está en memoria o, tras recargar, la última que quedó abierta ahí. */
export function conversationOf(state:ChatState,tabId:string):Conversation{
  const live=state.chats[tabId];if(live)return live;
  const last=state.saved.find(chat=>chat.tabId===tabId);
  if(!last)return EMPTY;
  let conversation=resumed.get(last);
  if(!conversation){conversation={id:last.id,turns:last.turns.map(restore)};resumed.set(last,conversation);}
  return conversation;
}
export function updateTurns(tabId:string,change:(turns:StoredTurn[])=>StoredTurn[]){
  chatStore.set(state=>{const current=conversationOf(state,tabId);return {chats:{...state.chats,[tabId]:{id:current.id||freshId(),turns:change(current.turns)}}};});
}
const persist=(saved:SavedChat[])=>{try{localStorage.setItem(CHATS_KEY,JSON.stringify(saved));}catch{/* almacenamiento lleno o bloqueado: el historial queda sólo en esta sesión */}};
/** Empieza de cero en la pestaña. La conversación anterior queda en el historial, pero ya no se retoma sola. */
export function newConversation(tabId:string){
  flush();
  const saved=chatStore.get().saved.map(chat=>chat.tabId===tabId?{...chat,tabId:''}:chat);
  chatStore.set(state=>({chats:{...state.chats,[tabId]:{id:freshId(),turns:[]}},saved}));persist(saved);
}
export function openConversation(tabId:string,chatId:string){
  flush();
  const {saved}=chatStore.get(),chat=saved.find(item=>item.id===chatId);
  if(!chat)return;
  const next=saved.map(item=>item.id===chatId?{...item,tabId}:item.tabId===tabId?{...item,tabId:''}:item);
  chatStore.set(state=>({chats:{...state.chats,[tabId]:{id:chat.id,turns:chat.turns.map(restore)}},saved:next}));persist(next);
}
/** Borra una conversación guardada, o todas. Las pestañas que la tenían abierta quedan con un chat vacío. */
export function deleteConversations(chatId?:string){
  clearTimeout(timer);timer=undefined;
  const state=chatStore.get(),saved=chatId?state.saved.filter(chat=>chat.id!==chatId):[];
  const chats=Object.fromEntries(Object.entries(state.chats).map(([tabId,chat])=>[tabId,!chatId||chat.id===chatId?{id:freshId(),turns:[]}:chat]));
  chatStore.set({chats,saved});persist(saved);
}

// ---- Guardado: sólo los turnos terminados, en su forma corta ----
const toSaved=(turn:StoredTurn):SavedTurn|null=>turn.status==='sending'?null:{id:turn.id,prompt:turn.prompt,...(turn.shown?{shown:turn.shown}:{}),reply:turn.reply??turn.error?.message??'',
  ...(turn.result?.mode?{mode:turn.result.mode}:{}),...(turn.status==='error'?{failed:true}:{}),...(turn.outcome?{outcome:turn.outcome}:{})};
let timer:ReturnType<typeof setTimeout>|undefined,written=chatStore.get().chats;
function flush(){
  clearTimeout(timer);timer=undefined;
  const state=chatStore.get();
  if(state.chats===written)return;
  written=state.chats;
  let saved=state.saved,changed=false;
  for(const [tabId,chat] of Object.entries(state.chats)){
    const turns=chat.turns.map(toSaved).filter((turn):turn is SavedTurn=>turn!==null);
    if(!turns.length)continue;
    const previous=saved.find(item=>item.id===chat.id);
    // Se guarda ya recortado a los topes, igual que como se va a leer.
    const next=parseChats(JSON.stringify([{id:chat.id,tabId,docTitle:documentStore.get().tabs.find(tab=>tab.id===tabId)?.title??previous?.docTitle??'',title:(turns[0]!.shown??turns[0]!.prompt).slice(0,120),updatedAt:Date.now(),turns}]))[0];
    // Sin cambios no se toca la fecha: abrir una conversación vieja no la sube en el historial.
    if(!next||(previous&&JSON.stringify(previous.turns)===JSON.stringify(next.turns)))continue;
    saved=upsertChat(saved,next);changed=true;
  }
  if(!changed)return;
  chatStore.set({saved});persist(saved);
}
chatStore.subscribe(()=>{if(chatStore.get().chats!==written&&!timer)timer=setTimeout(flush,400);});
if(typeof window!=='undefined')window.addEventListener('pagehide',flush);
