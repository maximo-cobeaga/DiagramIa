import type {SpendAlert} from './usage.js';

/** Texto de la alerta en castellano: sólo montos y período, nunca datos de usuarios ni pedidos. */
export function alertText(alert:SpendAlert){
  const period=alert.period==='day'?`el día ${alert.key}`:`el mes ${alert.key}`;
  return `Diagramia: la IA ya gastó USD ${alert.usd.toFixed(2)} de USD ${alert.budget.toFixed(2)} en ${period} (${Math.round(alert.ratio*100)} %). Al llegar al tope se pausa sola.`;
}

/**
 * Pedido HTTP según el destino: ntfy (texto plano, para notificaciones en el celular), Discord ({content}) u otro
 * ({text,...alerta}, compatible con Slack). Separado del envío para poder probar cada formato sin red.
 */
export function alertRequest(url:string,alert:SpendAlert):RequestInit|null{
  let host='';
  try{host=new URL(url).hostname;}catch{return null;}
  const text=alertText(alert);
  if(host.includes('ntfy'))return {method:'POST',headers:{'content-type':'text/plain; charset=utf-8',title:'Diagramia: gasto de IA',priority:'high',tags:'warning'},body:text};
  if(host.endsWith('discord.com'))return {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:text})};
  return {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,...alert})};
}
/** Envía la alerta. Nunca lanza: un aviso caído no debe afectar al gateway, y el log conserva la alerta igual. */
export async function sendAlert(url:string,alert:SpendAlert,timeoutMs=5000):Promise<boolean>{
  const request=alertRequest(url,alert);if(!request)return false;
  try{const response=await fetch(url,{...request,signal:AbortSignal.timeout(timeoutMs)});return response.ok;}
  catch{return false;}
}
