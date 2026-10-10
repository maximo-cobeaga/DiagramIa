import {MAX_EVENTS_PER_BATCH,TELEMETRY_VERSION,TelemetryEventSchema,campaignFrom,changeCounts,describeAgent,errorLocation,referrerHostOf,
  type DiagramDocument,type TelemetryContext,type TelemetryEvent,type TelemetryEventName} from '@diagramia/core';
import pkg from '../package.json';

/**
 * Telemetría de producto (P7.1, ADR 046). Mide comportamiento, nunca contenido: los eventos se validan contra el
 * contrato del core antes de encolarse, y un evento que no lo cumple se descarta. Se envía por lotes al gateway.
 * Respeta Do Not Track, Global Privacy Control y la opción del usuario. Nunca bloquea ni rompe el editor.
 */
const ENDPOINT='/api/v1/events',PREF='diagramia.telemetry',AID='diagramia.aid',SID='diagramia.sid',ONCE='diagramia.telemetry.once';
const SESSION_IDLE_MS=30*60_000,FLUSH_MS=10_000,MAX_QUEUE=200;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Props<N extends TelemetryEventName>=Extract<TelemetryEvent,{name:N}>['props'];

const storage=(kind:'local'|'session')=>{try{return kind==='local'?window.localStorage:window.sessionStorage;}catch{return null;}};
const read=(kind:'local'|'session',key:string)=>{try{return storage(kind)?.getItem(key)??null;}catch{return null;}};
const write=(kind:'local'|'session',key:string,value:string)=>{try{storage(kind)?.setItem(key,value);}catch{/* almacenamiento bloqueado: se sigue sin persistir */}};

/** Señales del navegador que piden no ser medido. Se respetan aunque la opción propia esté activa. */
export function browserOptOut(){
  const nav=navigator as Navigator&{globalPrivacyControl?:boolean;msDoNotTrack?:string};
  return nav.globalPrivacyControl===true||nav.doNotTrack==='1'||(window as {doNotTrack?:string}).doNotTrack==='1';
}
export const telemetryEnabled=()=>!browserOptOut()&&read('local',PREF)!=='off';
export function setTelemetryEnabled(enabled:boolean){
  write('local',PREF,enabled?'on':'off');
  if(!enabled)queue.length=0;
}

// ---- Identidad anónima y sesión ----
const url=new URL(window.location.href),fromLanding=UUID.test(url.searchParams.get('aid')??'');
const previousAid=read('local',AID),returning=UUID.test(previousAid??'');
// La landing pasa su ID anónimo para unir la visita con la apertura del canvas; después se quita de la URL.
const anonymousId=fromLanding?url.searchParams.get('aid')!:returning?previousAid!:crypto.randomUUID();
// Con la medición apagada no se guarda ningún identificador en el navegador.
if(telemetryEnabled())write('local',AID,anonymousId);
function sessionId(){
  const now=Date.now(),saved=read('session',SID)?.split('|'),landingSid=url.searchParams.get('sid');
  const id=saved&&UUID.test(saved[0]!)&&now-Number(saved[1])<SESSION_IDLE_MS?saved[0]!:landingSid&&UUID.test(landingSid)?landingSid:crypto.randomUUID();
  write('session',SID,`${id}|${now}`);
  return id;
}
const campaign=campaignFrom(url.search);
if(['aid','sid','utm_source','utm_medium','utm_campaign'].some(key=>url.searchParams.has(key))){
  for(const key of ['aid','sid'])url.searchParams.delete(key);
  try{history.replaceState(history.state,'',url.pathname+(url.searchParams.toString()?`?${url.searchParams}`:'')+url.hash);}catch{/* sin historial: se deja la URL */}
}
const context=():TelemetryContext=>({
  app:'editor',appVersion:pkg.version,...campaign,
  referrerHost:referrerHostOf(document.referrer,location.hostname),landingPath:/^\/[a-zA-Z0-9._~/-]{0,199}$/.test(location.pathname)?location.pathname:null,
  ...describeAgent(navigator.userAgent,window.innerWidth,navigator.maxTouchPoints>0),
  language:/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(navigator.language)?navigator.language:null,
  viewport:{width:Math.round(window.innerWidth),height:Math.round(window.innerHeight)}
});

// ---- Cola y envío ----
const queue:TelemetryEvent[]=[];
let disabledByServer=false,backoffUntil=0,sending=false;
// Resumen de uso de la sesión: tiempo activo (con interacción real y página visible) y cuánto se trabajó. Se emite al ocultarse la página.
const usage={activeMs:0,changes:0,aiRequests:0,usedAi:false,usedAnimation:false};
let lastActivity=0,probe:()=>{nodes:number;edges:number;animations:number}=()=>({nodes:0,edges:0,animations:0});
/** El editor registra cómo leer el tamaño del trabajo actual (sólo conteos) para el resumen de sesión. */
export function setSessionProbe(fn:typeof probe){probe=fn;}
/** Un pedido a la IA salió del navegador (el costo y el resultado los mide el servidor por su cuenta). */
export function noteAiRequest(){usage.aiRequests++;usage.usedAi=true;}
function emitSummary(){
  const activeSeconds=Math.round(usage.activeMs/1000);
  if(activeSeconds<3&&!usage.changes)return;
  const size=probe();
  track('session_summary',{activeSeconds:Math.min(100_000,activeSeconds),changes:Math.min(100_000,usage.changes),aiRequests:Math.min(100_000,usage.aiRequests),
    nodes:Math.min(100_000,size.nodes),edges:Math.min(100_000,size.edges),animations:Math.min(100_000,size.animations),usedAi:usage.usedAi,usedAnimation:usage.usedAnimation});
  usage.activeMs=0;usage.changes=0;usage.aiRequests=0;
}
export function track<N extends TelemetryEventName>(name:N,props:Props<N>){
  if(disabledByServer||!telemetryEnabled())return;
  const parsed=TelemetryEventSchema.safeParse({id:crypto.randomUUID(),name,at:new Date().toISOString(),props});
  if(!parsed.success){if(['127.0.0.1','localhost'].includes(location.hostname))console.warn('[telemetry] evento descartado',name,parsed.error.issues[0]?.message);return;}
  queue.push(parsed.data as TelemetryEvent);
  if(name==='ai_opened')usage.usedAi=true;
  else if(name==='animation_played'||name==='animation_created')usage.usedAnimation=true;
  if(queue.length>MAX_QUEUE)queue.splice(0,queue.length-MAX_QUEUE);
  if(queue.length>=20)void flush();
}
/** Un evento por navegador (o por clave): primer elemento, diagrama útil por documento. */
export function trackOnce<N extends TelemetryEventName>(key:string,name:N,props:Props<N>){
  if(!telemetryEnabled())return;
  const seen=new Set<string>(JSON.parse(read('local',ONCE)??'[]') as string[]);
  if(seen.has(key))return;
  seen.add(key);write('local',ONCE,JSON.stringify([...seen].slice(-500)));
  track(name,props);
}
/** Un evento por sesión del navegador (o por clave): avisos que se vuelven a dibujar muchas veces y no deben inflar la medición. */
export function trackSession<N extends TelemetryEventName>(key:string,name:N,props:Props<N>){
  const mark='diagramia.telemetry.session.'+key;
  if(read('session',mark))return;
  write('session',mark,'1');track(name,props);
}
const lastThrottled=new Map<string,number>();
/** Para gestos continuos (zoom, pan, selección): como mucho un evento por ventana. */
export function trackThrottled<N extends TelemetryEventName>(name:N,props:Props<N>,windowMs=30_000){
  const now=Date.now();if(now-(lastThrottled.get(name)??0)<windowMs)return;
  lastThrottled.set(name,now);track(name,props);
}
export async function flush(keepalive=false){
  if(sending||!queue.length||disabledByServer||Date.now()<backoffUntil)return;
  sending=true;
  const events=queue.splice(0,MAX_EVENTS_PER_BATCH);
  try{
    const response=await fetch(ENDPOINT,{method:'POST',keepalive,credentials:'same-origin',headers:{'content-type':'application/json','x-diagramia-client':'editor'},
      body:JSON.stringify({v:TELEMETRY_VERSION,anonymousId,sessionId:sessionId(),context:context(),events})});
    // 503: el gateway no tiene telemetría (desarrollo local sin base). No se insiste en esta carga de página.
    if(response.status===503||response.status===404)disabledByServer=true;
    else if(response.status===429||response.status>=500){queue.unshift(...events);backoffUntil=Date.now()+60_000;}
    // 400: el lote no cumple el contrato (versiones distintas); se descarta para no reintentarlo para siempre.
  }catch{queue.unshift(...events);backoffUntil=Date.now()+30_000;}
  finally{sending=false;}
}

// ---- Eventos del documento ----
type Source='user'|'ai'|'mcp'|'import'|'template';
let lastAi:{requestId:string;at:number;edited:boolean}|null=null;
/** Mide un lote confirmado por tipo de cambio. Después de aplicar IA, también la primera edición manual y el deshacer. */
export function trackBatch(actions:readonly {type:string}[],source:Source){
  const counts=changeCounts(actions);
  for(const [name,count] of Object.entries(counts)){track(name as 'node_created',{count:count!,source});usage.changes+=count!;}
  if(counts.node_created&&(source==='user'||source==='ai'))trackOnce('first_element_created','first_element_created',{});
  if(source==='user'&&lastAi&&!lastAi.edited&&Date.now()-lastAi.at<5*60_000){
    lastAi.edited=true;track('ai_edit_after_apply',{requestId:lastAi.requestId,seconds:Math.round((Date.now()-lastAi.at)/1000)});
  }
}
export function trackAiApplied(requestId:string,mode:Props<'ai_proposal_applied'>['mode'],actions:number){
  lastAi={requestId,at:Date.now(),edited:false};
  track('ai_proposal_applied',{requestId,mode,actions});
}
export function trackUndo(){
  track('undo',{});
  if(lastAi&&Date.now()-lastAi.at<60_000){track('ai_undo_after_apply',{requestId:lastAi.requestId,seconds:Math.round((Date.now()-lastAi.at)/1000)});lastAi=null;}
}
/** Diagrama útil: al menos dos nodos y una conexión, y una señal de valor. Una vez por documento. */
export function trackUseful(doc:DiagramDocument,reason:Props<'useful_diagram_created'>['reason']){
  if(doc.nodes.length<2||doc.edges.length<1)return;
  trackOnce(`useful:${doc.id}`,'useful_diagram_created',{reason,nodes:doc.nodes.length,edges:doc.edges.length});
}
/** Un documento abierto en una sesión anterior y vuelto a abrir cuenta como reapertura. */
export function trackReopened(doc:DiagramDocument){
  const key=`diagramia.telemetry.seen.${doc.id}`,current=sessionId(),seen=read('local',key);
  if(seen&&seen!==current)trackUseful(doc,'reopened');
  write('local',key,current);
}

// ---- Arranque, errores y rendimiento ----
let errors=0;
export function startTelemetry(){
  track('board_opened',{returning,fromLanding});
  const report=(kind:'error'|'unhandledrejection',error:unknown,filename?:string,line?:number,column?:number)=>{
    if(++errors>10)return;
    const name=error instanceof Error&&/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(error.name)?error.name:'Unknown';
    track('js_error',{kind,name,where:errorLocation(filename,line,column)});
  };
  window.addEventListener('error',e=>report('error',e.error,e.filename,e.lineno,e.colno));
  window.addEventListener('unhandledrejection',e=>report('unhandledrejection',e.reason));
  let lcp:number|null=null;
  try{new PerformanceObserver(list=>{const last=list.getEntries().at(-1);if(last)lcp=Math.round(last.startTime);}).observe({type:'largest-contentful-paint',buffered:true});}catch{/* sin soporte */}
  const timing=()=>{
    const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined,ms=(value?:number)=>value&&value>0?Math.min(3_600_000,Math.round(value)):null;
    track('page_load',{ttfbMs:ms(nav?.responseStart),domInteractiveMs:ms(nav?.domInteractive),loadMs:ms(nav?.loadEventEnd),lcpMs:lcp});
  };
  if(document.readyState==='complete')setTimeout(timing,3000);else window.addEventListener('load',()=>setTimeout(timing,3000),{once:true});
  setInterval(()=>void flush(),FLUSH_MS);
  // Tiempo activo: segundos con interacción reciente y la página a la vista. Parado o en segundo plano no suma.
  const touch=()=>{lastActivity=Date.now();};
  for(const type of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(type,touch,{passive:true,capture:true});
  window.addEventListener('pointermove',()=>{if(Date.now()-lastActivity>1000)touch();},{passive:true,capture:true});
  setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastActivity<30_000)usage.activeMs+=1000;},1000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){emitSummary();void flush(true);}});
  window.addEventListener('pagehide',()=>{emitSummary();void flush(true);});
}
