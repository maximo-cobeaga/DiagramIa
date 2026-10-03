import {z} from 'zod';
import {Id} from './schema.js';

/**
 * Contrato de telemetría de producto (P7, ADR 046). Mide comportamiento, nunca contenido: ningún campo admite texto
 * libre del usuario (labels, prompts, nombres de archivo, mensajes de error). Los valores son enums, números,
 * IDs aleatorios o identificadores cortos de plantillas y rutas conocidas.
 */
export const TELEMETRY_VERSION=1;
export const MAX_EVENTS_PER_BATCH=50;

const Uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Count=z.number().int().min(0).max(100_000);
const Millis=z.number().int().min(0).max(3_600_000);
/** Identificador técnico corto: plantillas, campañas, fuentes. No puede llevar espacios ni texto arbitrario largo. */
const Slug=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/);
const Source=z.enum(['user','ai','mcp','import','template']);
export const EXPORT_KINDS=['json','svg','png1','png2','png3','pdf','presentation-pdf','mermaid','drawio','dot','plantuml-class','plantuml-sequence','plantuml-state','bpmn','markdown','markdown-selection','timeline'] as const;
export const IMPORT_KINDS=['json','mermaid','drawio','dot','plantuml','bpmn','image','other'] as const;
export const AI_MODES=['create','edit','transform','animate','explain','review','document'] as const;
export const FEEDBACK_REASONS=['misunderstood','incorrect','too_simple','too_complex','bad_layout','missing_elements','other'] as const;

/** Cantidades por tipo de cambio en un lote confirmado. Se emite un evento por lote, no por elemento ni por cuadro de arrastre. */
const ChangeProps=z.strictObject({count:Count.min(1),source:Source});
const EVENT_PROPS={
  // Adquisición y embudo
  landing_view:z.strictObject({}),
  landing_cta_clicked:z.strictObject({placement:z.enum(['nav','hero','closing'])}),
  board_opened:z.strictObject({returning:z.boolean(),fromLanding:z.boolean()}),
  first_element_created:z.strictObject({}),
  signup_started:z.strictObject({trigger:z.enum(['ai','cloud','menu'])}),
  useful_diagram_created:z.strictObject({reason:z.enum(['exported','saved_cloud','reopened']),nodes:Count,edges:Count}),
  // Editor
  node_created:ChangeProps,node_deleted:ChangeProps,node_moved:ChangeProps,node_resized:ChangeProps,node_edited:ChangeProps,
  edge_created:ChangeProps,edge_deleted:ChangeProps,edge_edited:ChangeProps,zone_created:ChangeProps,drawing_created:ChangeProps,
  animation_edited:ChangeProps,layout_applied:ChangeProps,
  undo:z.strictObject({}),redo:z.strictObject({}),
  zoom:z.strictObject({}),pan:z.strictObject({}),
  copy:z.strictObject({count:Count}),paste:z.strictObject({count:Count}),multi_select:z.strictObject({count:Count.min(2)}),
  template_used:z.strictObject({template:Slug}),
  export:z.strictObject({format:z.enum(EXPORT_KINDS)}),
  import:z.strictObject({format:z.enum(IMPORT_KINDS),ok:z.boolean()}),
  tab_created:z.strictObject({}),
  presentation_started:z.strictObject({steps:Count}),
  // IA en el editor: el gateway registra por su cuenta cada pedido (ai_request) con tokens y costo.
  ai_opened:z.strictObject({}),
  ai_proposal_applied:z.strictObject({requestId:Id,mode:z.enum(AI_MODES),actions:Count}),
  ai_proposal_discarded:z.strictObject({requestId:Id,mode:z.enum(AI_MODES)}),
  ai_regenerated:z.strictObject({requestId:Id,mode:z.enum(AI_MODES)}),
  ai_undo_after_apply:z.strictObject({requestId:Id,seconds:Count}),
  ai_edit_after_apply:z.strictObject({requestId:Id,seconds:Count}),
  ai_feedback:z.strictObject({requestId:Id,rating:z.enum(['up','down']),reason:z.enum(FEEDBACK_REASONS).nullable()}),
  // Errores y rendimiento: sin mensajes ni stacks, que pueden contener datos del usuario.
  js_error:z.strictObject({kind:z.enum(['error','unhandledrejection']),name:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/),where:z.string().regex(/^[a-zA-Z0-9._/-]{1,120}(:\d{1,7}){0,2}$/).nullable()}),
  api_error:z.strictObject({route:z.enum(['assist','providers','events','cloud','local','auth','other']),status:z.number().int().min(0).max(599)}),
  save_failed:z.strictObject({target:z.enum(['local','cloud'])}),
  page_load:z.strictObject({ttfbMs:Millis.nullable(),domInteractiveMs:Millis.nullable(),loadMs:Millis.nullable(),lcpMs:Millis.nullable()})
} as const;
export type TelemetryEventName=keyof typeof EVENT_PROPS;
export const TELEMETRY_EVENT_NAMES=Object.keys(EVENT_PROPS) as TelemetryEventName[];

const eventSchema=<N extends TelemetryEventName>(name:N)=>z.strictObject({id:Uuid,name:z.literal(name),at:z.iso.datetime({offset:true}),props:EVENT_PROPS[name]});
export const TelemetryEventSchema=z.discriminatedUnion('name',TELEMETRY_EVENT_NAMES.map(eventSchema) as unknown as [ReturnType<typeof eventSchema>,...ReturnType<typeof eventSchema>[]]);
export type TelemetryEvent={[N in TelemetryEventName]:{id:string;name:N;at:string;props:z.infer<typeof EVENT_PROPS[N]>}}[TelemetryEventName];

/** Contexto de la visita. Sólo hostname del referrer y path de entrada: nunca querystrings, que pueden llevar datos. */
export const TelemetryContextSchema=z.strictObject({
  app:z.enum(['landing','editor']),appVersion:z.string().regex(/^[0-9a-zA-Z.+-]{1,32}$/),
  utmSource:Slug.nullable(),utmMedium:Slug.nullable(),utmCampaign:Slug.nullable(),
  referrerHost:z.string().regex(/^[a-z0-9.-]{1,253}$/).nullable(),landingPath:z.string().regex(/^\/[a-zA-Z0-9._~/-]{0,199}$/).nullable(),
  device:z.enum(['mobile','tablet','desktop']),browser:z.enum(['chrome','edge','firefox','safari','other']),os:z.enum(['windows','macos','linux','android','ios','other']),
  language:z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/).nullable(),
  viewport:z.strictObject({width:z.number().int().min(0).max(20_000),height:z.number().int().min(0).max(20_000)})
});
export type TelemetryContext=z.infer<typeof TelemetryContextSchema>;
export const TelemetryBatchSchema=z.strictObject({
  v:z.literal(TELEMETRY_VERSION),anonymousId:Uuid,sessionId:Uuid,context:TelemetryContextSchema,
  events:z.array(TelemetryEventSchema).min(1).max(MAX_EVENTS_PER_BATCH)
});
export type TelemetryBatch=z.infer<typeof TelemetryBatchSchema>;

/** Eventos que registra el servidor. No tienen ID anónimo: se atribuyen a la cuenta o quedan sin atribuir. */
export const ServerEventSchema=z.discriminatedUnion('name',[
  z.strictObject({name:z.literal('signup_completed'),props:z.strictObject({provider:z.literal('oidc')})}),
  z.strictObject({name:z.literal('signed_in'),props:z.strictObject({provider:z.literal('oidc')})}),
  z.strictObject({name:z.literal('ai_request'),props:z.strictObject({
    requestId:z.string().min(1).max(200),mode:z.enum(AI_MODES),provider:Slug,model:z.string().regex(/^[a-zA-Z0-9._:/-]{1,100}$/),
    outcome:z.enum(['proposal','clarification','text','review','failed','cancelled','refused_by_plan']),errorCode:z.string().regex(/^[A-Z_]{1,40}$/).nullable(),
    inputTokens:Count.max(10_000_000),cachedInputTokens:Count.max(10_000_000),outputTokens:Count.max(10_000_000),
    costUsd:z.number().min(0).max(1000).nullable(),latencyMs:Millis,calls:Count,repairs:Count,replayed:z.boolean()})})
]);
export type ServerEvent=z.infer<typeof ServerEventSchema>;

// Qué evento de editor produce cada acción del core. Las que no figuran no se miden.
const ACTION_EVENTS:Partial<Record<string,TelemetryEventName>>={
  ADD_NODE:'node_created',DELETE_NODE:'node_deleted',MOVE_NODE:'node_moved',MOVE_NODES:'node_moved',RESIZE_NODE:'node_resized',UPDATE_NODE:'node_edited',
  ADD_EDGE:'edge_created',DELETE_EDGE:'edge_deleted',UPDATE_EDGE:'edge_edited',CREATE_ZONE:'zone_created',ADD_DRAWING:'drawing_created',
  CREATE_ANIMATION:'animation_edited',UPDATE_ANIMATION:'animation_edited',ADD_STEP:'animation_edited',UPDATE_STEP:'animation_edited',MOVE_STEP:'animation_edited',DELETE_STEP:'animation_edited',
  ALIGN_NODES:'layout_applied',DISTRIBUTE_NODES:'layout_applied',ARRANGE_DOCUMENT:'layout_applied',LAYOUT_NODES:'layout_applied'
};
/** Un UPDATE_NODE que sólo cambia posición es un movimiento; con tamaño, un redimensionado; lo demás, una edición. */
function updateKind(changes:Record<string,unknown>|undefined):TelemetryEventName{
  const keys=Object.keys(changes??{});
  if(keys.length&&keys.every(key=>key==='position'))return 'node_moved';
  if(keys.includes('size')&&keys.every(key=>key==='position'||key==='size'))return 'node_resized';
  return 'node_edited';
}
/** Cantidad de cambios por evento de editor en un lote. Un lote de 30 nodos es un evento con count 30, no 30 eventos. */
export function changeCounts(actions:readonly {type:string}[]):Partial<Record<TelemetryEventName,number>>{
  const counts:Partial<Record<TelemetryEventName,number>>={};
  for(const action of actions){
    const name=action.type==='UPDATE_NODE'?updateKind((action as {changes?:Record<string,unknown>}).changes):ACTION_EVENTS[action.type];
    if(name)counts[name]=(counts[name]??0)+(action.type==='MOVE_NODES'?Math.max(1,(action as {ids?:unknown[]}).ids?.length??1):1);
  }
  return counts;
}

// ---- Contexto de la visita: funciones puras, compartidas por el editor y probadas sin navegador ----
const SLUG=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
/** Normaliza un valor de campaña a slug; si no queda uno válido, se descarta en vez de guardar texto arbitrario. */
export function toSlug(value:string|null|undefined):string|null{
  if(!value)return null;
  const slug=value.trim().replace(/\s+/g,'-').replace(/[^a-zA-Z0-9._-]/g,'').replace(/^[._-]+/,'').slice(0,64);
  return SLUG.test(slug)?slug:null;
}
export function campaignFrom(search:string):Pick<TelemetryContext,'utmSource'|'utmMedium'|'utmCampaign'>{
  const params=new URLSearchParams(search);
  return {utmSource:toSlug(params.get('utm_source')),utmMedium:toSlug(params.get('utm_medium')),utmCampaign:toSlug(params.get('utm_campaign'))};
}
/** Sólo el host del referrer, y nada si es el propio sitio: una navegación interna no es una fuente de tráfico. */
export function referrerHostOf(referrer:string,ownHost:string):string|null{
  try{const host=new URL(referrer).hostname.toLowerCase();return host&&host!==ownHost.toLowerCase()&&/^[a-z0-9.-]{1,253}$/.test(host)?host:null;}catch{return null;}
}
export function describeAgent(userAgent:string,width:number,touch:boolean):Pick<TelemetryContext,'device'|'browser'|'os'>{
  const ua=userAgent.toLowerCase();
  const os=/iphone|ipad|ipod/.test(ua)||(/macintosh/.test(ua)&&touch)?'ios':/android/.test(ua)?'android':/windows/.test(ua)?'windows':/mac os|macintosh/.test(ua)?'macos':/linux|cros/.test(ua)?'linux':'other';
  const browser=/edg\//.test(ua)?'edge':/firefox|fxios/.test(ua)?'firefox':/chrome|crios|chromium/.test(ua)?'chrome':/safari/.test(ua)?'safari':'other';
  const device=/ipad|tablet/.test(ua)||(os==='android'&&!/mobile/.test(ua))||(os==='ios'&&!/iphone|ipod/.test(ua))?'tablet':/mobi|iphone|ipod/.test(ua)||width<600?'mobile':'desktop';
  return {device,browser,os};
}
/** Archivo y línea de un error, sin origen ni querystring. El mensaje nunca se envía: puede contener datos del usuario. */
export function errorLocation(filename:string|undefined,line?:number,column?:number):string|null{
  if(!filename)return null;
  let path=filename;
  try{path=new URL(filename).pathname;}catch{/* ya es una ruta */}
  path=path.replace(/[?#].*$/,'').replace(/^\/+/,'').split('/').slice(-2).join('/');
  const where=`${path}${line?`:${line}`:''}${line&&column?`:${column}`:''}`;
  return /^[a-zA-Z0-9._/-]{1,120}(:\d{1,7}){0,2}$/.test(where)?where:null;
}
