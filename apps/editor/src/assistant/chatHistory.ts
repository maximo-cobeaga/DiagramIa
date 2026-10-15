/**
 * Conversaciones con la IA guardadas en este navegador (ADR 102). Sólo texto corto: el pedido y un resumen de la respuesta;
 * nunca el documento ni el lote de acciones. Los topes evitan que el historial compita con el guardado local de los diagramas.
 */
export const CHAT_LIMITS={chats:20,turns:40,prompt:1000,reply:2000,bytes:300_000} as const;
export const CHATS_KEY='diagramia.chats';
export type SavedTurn={id:string;prompt:string;shown?:string;reply:string;mode?:string;failed?:boolean;outcome?:string};
/** `tabId` es la pestaña donde quedó abierta: al volver a esa pestaña se retoma sola. Vacío, sólo figura en el historial. */
export type SavedChat={id:string;tabId:string;docTitle:string;title:string;updatedAt:number;turns:SavedTurn[]};

const text=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):'';
function parseTurn(value:unknown):SavedTurn|null{
  if(!value||typeof value!=='object')return null;
  const raw=value as Record<string,unknown>,id=text(raw.id,80),prompt=text(raw.prompt,CHAT_LIMITS.prompt);
  if(!id||!prompt)return null;
  const shown=text(raw.shown,120),mode=text(raw.mode,20),outcome=text(raw.outcome,20);
  return {id,prompt,reply:text(raw.reply,CHAT_LIMITS.reply),...(shown?{shown}:{}),...(mode?{mode}:{}),...(raw.failed===true?{failed:true}:{}),...(outcome?{outcome}:{})};
}
/** Las más recientes primero, con los topes de cantidad, de turnos y de tamaño total. */
export function trimChats(chats:SavedChat[]):SavedChat[]{
  const kept=[...chats].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,CHAT_LIMITS.chats).map(chat=>({...chat,turns:chat.turns.slice(-CHAT_LIMITS.turns)}));
  while(kept.length>1&&JSON.stringify(kept).length>CHAT_LIMITS.bytes)kept.pop();
  return kept;
}
/** Lee lo guardado sin confiar en su forma: lo ilegible se descarta y los campos desconocidos no pasan. */
export function parseChats(raw:string|null):SavedChat[]{
  try{
    const value:unknown=JSON.parse(raw??'null');
    if(!Array.isArray(value))return [];
    return trimChats(value.flatMap(item=>{
      if(!item||typeof item!=='object')return [];
      const chat=item as Record<string,unknown>,id=text(chat.id,80),turns=Array.isArray(chat.turns)?chat.turns.map(parseTurn).filter((turn):turn is SavedTurn=>turn!==null):[];
      if(!id||!turns.length)return [];
      return [{id,tabId:text(chat.tabId,80),docTitle:text(chat.docTitle,200),title:text(chat.title,120)||turns[0]!.prompt.slice(0,120),updatedAt:typeof chat.updatedAt==='number'&&Number.isFinite(chat.updatedAt)?chat.updatedAt:0,turns}];
    }));
  }catch{return [];}
}
export const upsertChat=(chats:SavedChat[],chat:SavedChat)=>trimChats([chat,...chats.filter(other=>other.id!==chat.id)]);
