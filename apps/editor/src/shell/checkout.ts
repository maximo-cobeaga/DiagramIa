import {flush as flushTelemetry} from '../telemetry';
import {accountStore,signIn} from '../store/accountStore';
import {viewStore} from '../store/viewStore';

/** Abre el pago de Pro en Paddle. Si sale bien la página se va y no devuelve nada; si no, devuelve el mensaje para mostrar. */
export async function startCheckout():Promise<string|null>{
  const response=await fetch('/api/v1/billing/checkout',{method:'POST',headers:{'x-diagramia-client':'editor'}}).catch(()=>null);
  const body=await response?.json().catch(()=>null) as {url?:string;error?:{message?:string}}|null;
  if(!response?.ok||!body?.url)return body?.error?.message??'No se pudo abrir el pago. Probá de nuevo en unos minutos.';
  await flushTelemetry(true).catch(()=>undefined);
  window.location.assign(body.url);
  return null;
}

/** Muestra el plan de la cuenta (qué incluye Pro y el botón de pago). */
export const openPlan=()=>viewStore.set({accountOpen:true,accountSection:'plan'});

const INTENT='diagramia.intent';
const remember=(value:string|null)=>{try{if(value)sessionStorage.setItem(INTENT,value);else sessionStorage.removeItem(INTENT);}catch{/* sin almacenamiento: se pierde la intención, no el flujo */}};
const recalled=()=>{try{return sessionStorage.getItem(INTENT);}catch{return null;}};

/** «?plan=pro» (botones de la landing): se recuerda para sobrevivir al inicio de sesión y se saca de la URL. */
export function capturePlanIntent(){
  try{
    const url=new URL(window.location.href);
    if(url.searchParams.get('plan')!=='pro')return;
    remember('pro');url.searchParams.delete('plan');
    history.replaceState(history.state,'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:'')+url.hash);
  }catch{/* sin historial: se deja la URL */}
}

/** Con la cuenta ya cargada: quien llegó para pasar a Pro inicia sesión si hace falta y cae en el plan. Un intento de login por intención, para no entrar en bucle. */
export function resolvePlanIntent(){
  const intent=recalled();
  if(!intent)return;
  const {auth,account}=accountStore.get();
  if(auth==='loading')return;
  if(auth==='guest'&&intent==='pro'){remember('pro-login');signIn('menu');return;}
  remember(null);
  if(auth==='signed-in'&&account)openPlan();
}
