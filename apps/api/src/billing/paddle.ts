import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

/**
 * Paddle (Merchant of Record, ADR 048/089) detrás de una interfaz propia: el resto del gateway sólo conoce
 * `SubscriptionChange`. Cambiar de proveedor es escribir otro módulo con `verify`, `translate` y `createCheckout`.
 */
export type SubscriptionChange={
  eventId:string;occurredAt:Date;userId:string;
  providerCustomerId:string|null;providerSubscriptionId:string;priceId:string|null;status:string;
  currentPeriodEnd:Date|null;scheduledCancelAt:Date|null;updatePaymentUrl:string|null;cancelUrl:string|null;
};
export type PaddleConfig={env:'sandbox'|'live';apiKey:string;webhookSecret:string;priceId:string};
export class BillingError extends Error{constructor(readonly code:'BILLING_UNAVAILABLE'|'BAD_SIGNATURE'|'BAD_EVENT'|'PROVIDER_ERROR',message:string){super(message);this.name='BillingError';}}

const API={sandbox:'https://sandbox-api.paddle.com',live:'https://api.paddle.com'} as const;
const SUBSCRIPTION_EVENTS=new Set(['subscription.created','subscription.activated','subscription.updated','subscription.canceled','subscription.paused','subscription.resumed','subscription.past_due','subscription.trialing']);

/** Cabecera `Paddle-Signature: ts=<epoch>;h1=<hmac>`; el HMAC-SHA256 se calcula sobre `ts:cuerpo` exacto, sin reserializar. */
export function verifySignature(rawBody:Buffer,header:string|undefined,secret:string,now=Date.now(),toleranceSeconds=300):boolean{
  if(!header||!secret)return false;
  const parts=new Map(header.split(';').map(part=>{const i=part.indexOf('=');return [part.slice(0,i).trim(),part.slice(i+1).trim()] as const;}));
  const ts=parts.get('ts'),h1=parts.get('h1');
  if(!ts||!h1||!/^\d{1,12}$/.test(ts)||!/^[0-9a-f]{64}$/.test(h1))return false;
  if(Math.abs(now/1000-Number(ts))>toleranceSeconds)return false;
  const expected=createHmac('sha256',secret).update(`${ts}:`).update(rawBody).digest();
  return timingSafeEqual(expected,Buffer.from(h1,'hex'));
}

const date=z.string().datetime({offset:true}).nullish().transform(value=>value?new Date(value):null);
const EventSchema=z.object({
  event_id:z.string().min(1).max(100),event_type:z.string().min(1).max(100),occurred_at:z.string().datetime({offset:true}),
  data:z.object({
    id:z.string().min(1).max(100),status:z.string().min(1).max(40),customer_id:z.string().max(100).nullish(),
    custom_data:z.record(z.string(),z.unknown()).nullish(),
    items:z.array(z.object({price:z.object({id:z.string().max(100)}).nullish()}).passthrough()).default([]),
    current_billing_period:z.object({ends_at:date}).nullish(),
    scheduled_change:z.object({action:z.string(),effective_at:date}).nullish(),
    management_urls:z.object({update_payment_method:z.string().url().nullish(),cancel:z.string().url().nullish()}).nullish()
  }).passthrough()
}).passthrough();

/** Devuelve el cambio de suscripción o `null` si el evento no importa (otro tipo, otro precio o sin cuenta de Diagramia). */
export function translate(rawBody:Buffer,priceId:string):SubscriptionChange|null{
  let json:unknown;
  try{json=JSON.parse(rawBody.toString('utf8'));}catch{throw new BillingError('BAD_EVENT','El aviso no es JSON válido.');}
  const parsed=EventSchema.safeParse(json);
  if(!parsed.success)throw new BillingError('BAD_EVENT','El aviso no tiene la forma esperada.');
  const event=parsed.data;
  if(!SUBSCRIPTION_EVENTS.has(event.event_type))return null;
  const {data}=event,userId=data.custom_data?.diagramia_user_id;
  if(typeof userId!=='string'||!userId)return null;
  const price=data.items.map(item=>item.price?.id).find(id=>id===priceId);
  if(!price)return null;
  const cancel=data.scheduled_change?.action==='cancel'?data.scheduled_change.effective_at:null;
  return {eventId:event.event_id,occurredAt:new Date(event.occurred_at),userId,providerCustomerId:data.customer_id??null,providerSubscriptionId:data.id,priceId:price,status:data.status,
    currentPeriodEnd:data.current_billing_period?.ends_at??null,scheduledCancelAt:cancel,updatePaymentUrl:data.management_urls?.update_payment_method??null,cancelUrl:data.management_urls?.cancel??null};
}

/**
 * Crea la transacción de la suscripción y devuelve la página de pago de Paddle. La cuenta viaja en `custom_data` y vuelve en el aviso.
 * Requiere el «default payment link» configurado en el panel de Paddle (Checkout settings).
 */
export async function createCheckout(config:PaddleConfig,userId:string,fetcher:typeof fetch=fetch):Promise<string>{
  const response=await fetcher(`${API[config.env]}/transactions`,{
    method:'POST',signal:AbortSignal.timeout(10_000),
    headers:{authorization:`Bearer ${config.apiKey}`,'content-type':'application/json'},
    body:JSON.stringify({items:[{price_id:config.priceId,quantity:1}],custom_data:{diagramia_user_id:userId}})
  }).catch(()=>null);
  if(!response)throw new BillingError('PROVIDER_ERROR','No se pudo contactar al proveedor de pagos.');
  const body=await response.json().catch(()=>null) as {data?:{checkout?:{url?:unknown}}}|null;
  const url=body?.data?.checkout?.url;
  if(!response.ok||typeof url!=='string'||!url.startsWith('https://'))throw new BillingError('PROVIDER_ERROR','El proveedor de pagos no devolvió la página de pago.');
  return url;
}
