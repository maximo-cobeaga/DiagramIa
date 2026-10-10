import {flush as flushTelemetry,track} from '../telemetry';
import {accountStore,refreshAccount,signIn} from '../store/accountStore';
import {viewStore} from '../store/viewStore';
import {notify} from '../store/documentStore';

type Source='plan_box'|'offer'|'limit'|'landing'|'header';
export type Interval='month'|'year';

/** Abre el pago de Pro en Paddle. Si sale bien la página se va y no devuelve nada; si no, devuelve el mensaje para mostrar. */
export async function startCheckout(source:Source='plan_box',interval:Interval='month'):Promise<string|null>{
  // La oferta es del plan mensual: el anual ya viene con su propio descuento.
  const offered=interval==='month'&&Boolean(accountStore.get().account?.billing.offer);
  track('checkout_started',{source,offer:offered,interval});
  const response=await fetch('/api/v1/billing/checkout',{method:'POST',headers:{'x-diagramia-client':'editor','content-type':'application/json'},body:JSON.stringify({interval})}).catch(()=>null);
  const body=await response?.json().catch(()=>null) as {url?:string;error?:{message?:string}}|null;
  if(!response?.ok||!body?.url){
    track('checkout_failed',{status:response?.status??0});
    return body?.error?.message??'No se pudo abrir el pago. Probá de nuevo en unos minutos.';
  }
  // Sólo se navega a la página de pago propia: aunque el servidor ya la valida, el navegador no sigue una dirección ajena.
  let target:URL;
  try{target=new URL(body.url,window.location.href);}catch{track('checkout_failed',{status:0});return 'No se pudo abrir el pago. Probá de nuevo en unos minutos.';}
  if(target.origin!==window.location.origin||target.pathname!=='/pago.html'){track('checkout_failed',{status:0});return 'No se pudo abrir el pago. Probá de nuevo en unos minutos.';}
  await flushTelemetry(true).catch(()=>undefined);
  window.location.assign(target.href);
  return null;
}

/** Muestra el plan de la cuenta (qué incluye Pro y el botón de pago). */
export const openPlan=()=>viewStore.set({accountOpen:true,accountSection:'plan'});

/**
 * «Pasar a Pro» desde cualquier lugar del editor. Sin sesión, va al inicio de sesión y vuelve a pagar; con sesión, directo a la
 * pasarela. Si el cobro no está disponible o falla, se abre el plan con la explicación en lugar de dejar al usuario sin respuesta.
 */
export async function goPro(source:Source,interval:Interval='month'):Promise<void>{
  const {auth,account}=accountStore.get();
  if(auth==='guest'){remember(interval==='year'?'pro-login:year':'pro-login');signIn('pro');return;}
  if(auth!=='signed-in'||!account?.billing.available||account.billing.plan==='pro'){openPlan();return;}
  const failure=await startCheckout(source,interval==='year'&&account.billing.prices?.yearlyUsd?'year':'month');
  if(failure){openPlan();notify(failure,'warn');}
}

const INTENT='diagramia.intent';
const remember=(value:string|null)=>{try{if(value)sessionStorage.setItem(INTENT,value);else sessionStorage.removeItem(INTENT);}catch{/* sin almacenamiento: se pierde la intención, no el flujo */}};
const recalled=()=>{try{return sessionStorage.getItem(INTENT);}catch{return null;}};

/** «?plan=pro» (botones de la landing): se recuerda para sobrevivir al inicio de sesión y se saca de la URL. */
export function capturePlanIntent(){
  try{
    const url=new URL(window.location.href);
    if(url.searchParams.get('plan')!=='pro')return;
    remember(url.searchParams.get('interval')==='year'?'pro:year':'pro');url.searchParams.delete('plan');url.searchParams.delete('interval');
    history.replaceState(history.state,'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:'')+url.hash);
  }catch{/* sin historial: se deja la URL */}
}

/**
 * Vuelta de la página de pago (`?pro=ok` o `?pro=cancel`). El plan lo activa el aviso firmado de Paddle, que puede tardar
 * unos segundos: se consulta la cuenta hasta verlo, sin prometer nada antes. Si se demora, se dice la verdad y no se pierde el pago.
 */
export async function resolveCheckoutReturn(){
  let result:string|null=null;
  try{
    const url=new URL(window.location.href);result=url.searchParams.get('pro');
    if(result!=='ok'&&result!=='cancel')return;
    url.searchParams.delete('pro');
    history.replaceState(history.state,'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:'')+url.hash);
  }catch{return;}
  remember(null);
  if(result==='cancel'){track('checkout_returned',{result:'cancelled',activated:false});openPlan();notify('No se hizo ningún cobro. Podés pasar a Pro cuando quieras.');return;}
  notify('Pago recibido. Estamos activando tu plan Pro…');
  const isPro=()=>accountStore.get().account?.billing.plan==='pro';
  for(let attempt=0;attempt<20&&!isPro();attempt++){
    await new Promise(resolve=>setTimeout(resolve,attempt<5?1500:3000));
    await refreshAccount().catch(()=>undefined);
  }
  track('checkout_returned',{result:'completed',activated:isPro()});
  if(isPro()){openPlan();notify('¡Listo! Ya tenés Diagramia Pro.');}
  else notify('Recibimos tu pago, pero la activación está tardando. Suele resolverse en unos minutos: recargá la página. Si no cambia, escribinos y lo arreglamos.','warn');
}

let resolving=false;
/**
 * Con la cuenta ya cargada: quien llegó para pasar a Pro inicia sesión si no lo hizo y, con sesión, cae directo en el pago.
 * Un intento de login por intención (`pro-login`): si vuelve sin sesión, no se entra en bucle.
 */
export async function resolvePlanIntent(){
  const intent=recalled();
  if(!intent||resolving)return;
  const {auth}=accountStore.get();
  if(auth==='loading')return;
  if(auth==='guest'&&(intent==='pro'||intent==='pro:year')){remember(intent==='pro:year'?'pro-login:year':'pro-login');signIn('pro');return;}
  remember(null);
  if(auth==='unavailable'){notify('No pudimos verificar tu sesión. Probá de nuevo en unos minutos.','warn');return;}
  if(auth!=='signed-in')return;
  resolving=true;
  try{await goPro('landing',intent.endsWith(':year')?'year':'month');}finally{resolving=false;}
}
