import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {BillingError,createCheckout,translate,verifySignature} from '../src/billing/paddle.js';
import {PLANS,planOf} from '../src/billing/plans.js';
import {RateLimiter} from '../src/repositories/telemetry.js';

const SECRET='pdl_ntfset_test_secret',PRICE='pri_pro_monthly';
test('checkout: explica configuración pendiente sin filtrar datos del proveedor',async()=>{
  const config={env:'sandbox' as const,apiKey:'private-key',webhookSecret:'secret',priceId:'price'};
  const response:typeof fetch=async()=>new Response(JSON.stringify({error:{code:'transaction_default_checkout_url_not_set',detail:'private account data'}}),{status:400});
  await assert.rejects(createCheckout(config,'account',response),(error:unknown)=>error instanceof BillingError&&error.code==='BILLING_UNAVAILABLE'&&error.message.includes('CHECKOUT_SETUP')&&!error.message.includes('private'));
});
test('checkout: informa dominio no aprobado sin pedir reintentos inútiles',async()=>{
  const config={env:'sandbox' as const,apiKey:'private-key',webhookSecret:'secret',priceId:'price'};
  const response:typeof fetch=async()=>new Response(JSON.stringify({error:{code:'transaction_checkout_url_domain_is_not_approved',detail:'private account data'}}),{status:400});
  await assert.rejects(createCheckout(config,'account',response),(error:unknown)=>error instanceof BillingError&&error.code==='BILLING_UNAVAILABLE'&&error.message.includes('CHECKOUT_DOMAIN')&&!error.message.includes('private'));
});
test('el plazo de reintento del pago disminuye y no se extiende al consultar',()=>{
  let now=0;const limiter=new RateLimiter(2,600_000,()=>now);
  assert.ok(limiter.allow('a'));now=1000;assert.ok(limiter.allow('a'));assert.equal(limiter.allow('a'),false);
  assert.equal(limiter.retryAfterSeconds('a'),599);assert.equal(limiter.retryAfterSeconds('b'),0);
  now=599_001;assert.equal(limiter.retryAfterSeconds('a'),1);now=600_000;assert.equal(limiter.retryAfterSeconds('a'),0);assert.ok(limiter.allow('a'));
});
const sign=(body:string,ts:number,secret=SECRET)=>`ts=${ts};h1=${createHmac('sha256',secret).update(`${ts}:${body}`).digest('hex')}`;
const event=(overrides:Record<string,unknown>={},type='subscription.activated')=>JSON.stringify({
  event_id:'evt_1',event_type:type,occurred_at:'2026-10-08T12:00:00.000Z',
  data:{id:'sub_1',status:'active',customer_id:'ctm_1',custom_data:{diagramia_user_id:'user-1'},items:[{price:{id:PRICE},quantity:1}],
    current_billing_period:{starts_at:'2026-10-08T12:00:00Z',ends_at:'2026-11-08T12:00:00Z'},scheduled_change:null,
    management_urls:{update_payment_method:'https://pay.example/update',cancel:'https://pay.example/cancel'},...overrides}
});

test('the limiter prunes idle keys without walking every key on every request',()=>{
  let now=0;const limiter=new RateLimiter(1,1000,()=>now);
  for(let i=0;i<10_001;i++)limiter.allow('k'+i);
  const size=()=>(limiter as unknown as {hits:Map<string,number[]>}).hits.size;
  assert.equal(size(),10_001,'con todas las claves vigentes no hay nada que podar');
  now=6000;limiter.allow('nueva');
  assert.equal(size(),1,'pasada la ventana, las claves sin uso se descartan');
  assert.equal(limiter.allow('nueva'),false);
});

test('webhook signature: accepts the exact body, rejects tampering, old timestamps and malformed headers',()=>{
  const body=event(),now=Date.UTC(2026,9,8,12,0,0),ts=now/1000;
  assert.equal(verifySignature(Buffer.from(body),sign(body,ts),SECRET,now),true);
  assert.equal(verifySignature(Buffer.from(body+' '),sign(body,ts),SECRET,now),false,'un byte distinto invalida la firma');
  assert.equal(verifySignature(Buffer.from(body),sign(body,ts,'otro-secreto'),SECRET,now),false);
  assert.equal(verifySignature(Buffer.from(body),sign(body,ts-3600),SECRET,now),false,'un aviso viejo no se acepta aunque esté bien firmado');
  for(const bad of [undefined,'','ts=1','h1=abc','ts=abc;h1='+'0'.repeat(64),`ts=${ts};h1=zz`])assert.equal(verifySignature(Buffer.from(body),bad,SECRET,now),false);
  assert.equal(verifySignature(Buffer.from(body),sign(body,ts),'',now),false,'sin secreto nunca se acepta');
});

test('translate: turns a subscription event into an internal change and ignores everything that does not concern us',()=>{
  const change=translate(Buffer.from(event()),PRICE)!;
  assert.equal(change.userId,'user-1');assert.equal(change.providerSubscriptionId,'sub_1');assert.equal(change.status,'active');
  assert.equal(change.currentPeriodEnd?.toISOString(),'2026-11-08T12:00:00.000Z');assert.equal(change.cancelUrl,'https://pay.example/cancel');assert.equal(change.scheduledCancelAt,null);
  const scheduled=translate(Buffer.from(event({scheduled_change:{action:'cancel',effective_at:'2026-11-08T12:00:00Z'}},'subscription.updated')),PRICE)!;
  assert.equal(scheduled.scheduledCancelAt?.toISOString(),'2026-11-08T12:00:00.000Z');
  assert.equal(translate(Buffer.from(event({},'transaction.completed')),PRICE),null,'otros tipos de evento se confirman sin tocar nada');
  assert.equal(translate(Buffer.from(event({items:[{price:{id:'pri_otro'}}]})),PRICE),null,'otro producto no concede Pro');
  assert.equal(translate(Buffer.from(event({items:[{price:{id:'pri_year'}}]})),[PRICE,'pri_year'])?.priceId,'pri_year','el plan anual también concede Pro');
  assert.equal(translate(Buffer.from(event({items:[{price:{id:'pri_year'}}]})),[PRICE,null]),null,'sin precio anual configurado, el anual no se reconoce');
  assert.equal(translate(Buffer.from(event({custom_data:{}})),PRICE),null,'sin cuenta de Diagramia no hay a quién asignar');
  const odd=translate(Buffer.from(event({management_urls:{update_payment_method:'javascript:alert(1)',cancel:'http://pay.example/cancel'}})),PRICE)!;
  assert.equal(odd.updatePaymentUrl,null);assert.equal(odd.cancelUrl,null,'los enlaces de gestión sólo se guardan si son https');
  assert.throws(()=>translate(Buffer.from('no es json'),PRICE),BillingError);
  assert.throws(()=>translate(Buffer.from('{"event_id":1}'),PRICE),BillingError);
});

test('plans: only active or trialing subscriptions are Pro, and Pro is strictly larger than Free',()=>{
  assert.equal(planOf(null),'free');
  for(const status of ['active','trialing'])assert.equal(planOf({status,currentPeriodEnd:null}),'pro');
  for(const status of ['past_due','paused','canceled'])assert.equal(planOf({status,currentPeriodEnd:new Date(Date.now()+864e5)}),'free');
  for(const key of Object.keys(PLANS.free) as (keyof typeof PLANS.free)[])assert.ok(PLANS.pro[key]>=PLANS.free[key],key);
  assert.equal(PLANS.free.dailyCredits,6);assert.equal(PLANS.free.monthlyCredits,20);assert.equal(PLANS.free.maxDocuments,3);
});

test('checkout: sends the price and the account, uses the right host, and fails closed on provider errors',async()=>{
  const seen:{url:string;init:RequestInit}[]=[];
  const ok:typeof fetch=async(url,init)=>{seen.push({url:String(url),init:init!});return new Response(JSON.stringify({data:{checkout:{url:'https://pay.example/checkout/txn_1'}}}),{status:201});};
  const config={env:'sandbox' as const,apiKey:'pdl_sdbx_key',webhookSecret:SECRET,priceId:PRICE};
  assert.equal(await createCheckout(config,'user-1',ok),'https://pay.example/checkout/txn_1');
  assert.equal(seen[0]!.url,'https://sandbox-api.paddle.com/transactions');
  const sent=JSON.parse(String(seen[0]!.init.body));
  assert.deepEqual(sent,{items:[{price_id:PRICE,quantity:1}],custom_data:{diagramia_user_id:'user-1'}});
  assert.equal((seen[0]!.init.headers as Record<string,string>).authorization,'Bearer pdl_sdbx_key');
  await createCheckout({...config,env:'live'},'user-1',ok);assert.equal(seen[1]!.url,'https://api.paddle.com/transactions');
  // Paddle usa el enlace predeterminado. Sólo se acepta redirigir a nuestra página de pago.
  const own={...config,checkoutUrl:'https://app.example/pago.html'};
  const back=(url:string):typeof fetch=>async(_u,init)=>{seen.push({url:'',init:init!});return new Response(JSON.stringify({data:{checkout:{url}}}),{status:201});};
  assert.equal(await createCheckout(own,'user-4',back('https://app.example/pago.html?_ptxn=txn_1')),'https://app.example/pago.html?_ptxn=txn_1');
  assert.equal(JSON.parse(String(seen.at(-1)!.init.body)).checkout,undefined,'enviar un override idéntico al enlace predeterminado hace que Paddle rechace el dominio');
  await assert.rejects(createCheckout(own,'user-4',back('https://otro-sitio.example/pago.html?_ptxn=txn_1')),BillingError,'una dirección ajena no se devuelve al navegador');
  await assert.rejects(createCheckout(own,'user-4',back('https://app.example/pago.html.evil.example/?_ptxn=txn_1')),BillingError,'ni una que sólo empieza parecido');
  assert.ok(await createCheckout({...config,checkoutUrl:'http://localhost:5173/pago.html'},'user-4',back('http://localhost:5173/pago.html?_ptxn=txn_1')),'en desarrollo, la página local propia vale');
  // Plan anual: usa su propio precio, y sin él no hay forma de cobrarlo.
  await createCheckout({...config,yearlyPriceId:'pri_year'},'user-3',ok,undefined,'year');
  assert.deepEqual(JSON.parse(String(seen.at(-1)!.init.body)).items,[{price_id:'pri_year',quantity:1}]);
  await assert.rejects(createCheckout(config,'user-3',ok,undefined,'year'),BillingError);
  // El descuento viaja sólo si el servidor lo decide; sin él, el cuerpo es el de siempre.
  await createCheckout(config,'user-2',ok,'dsc_01abcdefghijklmnopqrstuvwx');
  assert.deepEqual(JSON.parse(String(seen.at(-1)!.init.body)),{items:[{price_id:PRICE,quantity:1}],custom_data:{diagramia_user_id:'user-2'},discount_id:'dsc_01abcdefghijklmnopqrstuvwx'});
  await assert.rejects(createCheckout(config,'u',async()=>new Response('{}',{status:500})),BillingError);
  await assert.rejects(createCheckout(config,'u',async()=>new Response(JSON.stringify({data:{checkout:{url:'http://insecure'}}}),{status:201})),BillingError);
  await assert.rejects(createCheckout(config,'u',async()=>{throw new Error('red caída');}),BillingError);
});
