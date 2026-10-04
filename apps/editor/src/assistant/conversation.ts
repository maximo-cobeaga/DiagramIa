/** Ventana de conversación acotada. Al responder preguntas conserva el pedido que las originó. */
type ConversationTurn={id:string;prompt:string;status:string;result?:unknown;outcome?:string};
export function conversationWindow<T extends ConversationTurn>(turns:T[],rootId?:string,limit=3):T[]{
  const size=Math.max(1,Math.min(4,Math.floor(limit))),done=turns.filter(turn=>turn.status==='done'&&turn.result&&turn.outcome!=='cancelled'),recent=done.slice(-size),root=done.find(turn=>turn.id===rootId);
  return root&&!recent.includes(root)?[root,...(size>1?recent.slice(-(size-1)):[])]:recent;
}
