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
/** `priceId` es el plan mensual; `yearlyPriceId`, opcional, el anual (ADR 093). Los dos otorgan el mismo plan Pro. */
export type PaddleConfig={env:'sandbox'|'live';apiKey:string;webhookSecret:string;priceId:string;yearlyPriceId?:string|null;
  /** Token público de Paddle.js (`test_…` o `live_…`). Es el único dato de Paddle que llega al navegador; sin él no se ofrece el pago. */
  clientToken?:string|null;
  /** Página propia que carga Paddle.js (ADR 094). Paddle devuelve esta URL con `?_ptxn=<transacción>` y ahí se abre el pago. La fija el servidor, nunca el cliente. */
  checkoutUrl?:string|null};
export type BillingInterval='month'|'year';
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
export function translate(rawBody:Buffer,priceIds:string|readonly (string|null|undefined)[]):SubscriptionChange|null{
  const known=new Set((Array.isArray(priceIds)?priceIds:[priceIds]).filter((id):id is string=>Boolean(id)));
  let json:unknown;
  try{json=JSON.parse(rawBody.toString('utf8'));}catch{throw new BillingError('BAD_EVENT','El aviso no es JSON válido.');}
  const parsed=EventSchema.safeParse(json);
  if(!parsed.success)throw new BillingError('BAD_EVENT','El aviso no tiene la forma esperada.');
  const event=parsed.data;
  if(!SUBSCRIPTION_EVENTS.has(event.event_type))return null;
  const {data}=event,userId=data.custom_data?.diagramia_user_id;
  if(typeof userId!=='string'||!userId)return null;
  const price=data.items.map(item=>item.price?.id).find(id=>typeof id==='string'&&known.has(id));
  if(!price)return null;
  const cancel=data.scheduled_change?.action==='cancel'?data.scheduled_change.effective_at:null;
  return {eventId:event.event_id,occurredAt:new Date(event.occurred_at),userId,providerCustomerId:data.customer_id??null,providerSubscriptionId:data.id,priceId:price,status:data.status,
    currentPeriodEnd:data.current_billing_period?.ends_at??null,scheduledCancelAt:cancel,updatePaymentUrl:data.management_urls?.update_payment_method??null,cancelUrl:data.management_urls?.cancel??null};
}

/**
 * Crea la transacción de la suscripción y devuelve la página donde se paga. La cuenta viaja en `custom_data` y vuelve en el aviso.
 * Paddle no tiene una página de pago propia para esto: devuelve el «default payment link» (o `checkoutUrl`) con `?_ptxn=…`,
 * y esa página tiene que cargar Paddle.js. Requiere el «default payment link» configurado en el panel de Paddle (Checkout settings).
 * La URL devuelta se valida: sólo se redirige al navegador a la página propia o, sin ella, a una dirección https.
 */
export async function createCheckout(config:PaddleConfig,userId:string,fetcher:typeof fetch=fetch,discountId?:string,interval:BillingInterval='month'):Promise<string>{
  const priceId=interval==='year'?config.yearlyPriceId:config.priceId;
  if(!priceId)throw new BillingError('BILLING_UNAVAILABLE','El plan anual no está disponible.');
  const response=await fetcher(`${API[config.env]}/transactions`,{
    method:'POST',signal:AbortSignal.timeout(10_000),
    headers:{authorization:`Bearer ${config.apiKey}`,'content-type':'application/json'},
    body:JSON.stringify({items:[{price_id:priceId,quantity:1}],custom_data:{diagramia_user_id:userId},...(discountId?{discount_id:discountId}:{}),...(config.checkoutUrl?{checkout:{url:config.checkoutUrl}}:{})})
  }).catch(()=>null);
  if(!response)throw new BillingError('PROVIDER_ERROR','No se pudo contactar al proveedor de pagos.');
  const body=await response.json().catch(()=>null) as {data?:{checkout?:{url?:unknown}};error?:{code?:unknown}}|null;
  const url=body?.data?.checkout?.url;
  const trusted=typeof url==='string'&&(config.checkoutUrl?url.startsWith(config.checkoutUrl+'?'):url.startsWith('https://'));
  if(!response.ok||!trusted){
    // Para quien opera el servicio: el código de Paddle (nunca su mensaje ni datos del pedido) explica qué falta configurar.
    const code=typeof body?.error?.code==='string'&&/^[a-z0-9_]{1,80}$/.test(body.error.code)?body.error.code:response.ok?'unexpected_checkout_url':`http_${response.status}`;
    console.error('[billing] Paddle no creó el pago:',code);
    throw new BillingError('PROVIDER_ERROR','El proveedor de pagos no devolvió la página de pago.');
  }
  return url;
}
