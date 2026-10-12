import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error script sin tipos: se prueba su contrato.
import {EVENTS,check,mergeEnv,paddle,readEnv,settings,setup} from '../../../scripts/paddle-live.mjs';

type Row=Record<string,any>;
/** Doble de la API de Paddle con las formas reales de sus respuestas. Guarda lo creado y cuenta las escrituras. */
function fakePaddle(seed:Partial<Record<'products'|'prices'|'discounts'|'notification-settings'|'client-tokens',Row[]>>={},defaultLink:string|null='https://app.diagramia.app/pago.html'){
  const store:Record<string,Row[]>={products:[],prices:[],discounts:[],'notification-settings':[],'client-tokens':[],transactions:[],...structuredClone(seed)};
  const writes:string[]=[],prefix:Record<string,string>={products:'pro',prices:'pri',discounts:'dsc','notification-settings':'ntfset','client-tokens':'ctkn',transactions:'txn'};
  let serial=0;
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const fetcher=async(input:string|URL|Request,init:RequestInit={})=>{
    const url=new URL(String(input)),[,kind,id]=url.pathname.split('/'),method=init.method??'GET',rows=store[kind!];
    assert.equal((init.headers as Record<string,string>).authorization,'Bearer pdl_live_apikey_prueba');
    if(!rows)return reply(404,{error:{code:'not_found'}});
    if(method==='GET'&&id){const row=rows.find(item=>item.id===id);return row?reply(200,{data:row}):reply(404,{error:{code:'not_found'}});}
    if(method==='GET')return reply(200,{data:rows.filter(row=>[...url.searchParams].every(([name,value])=>name==='per_page'||String(row[name])===value)),meta:{pagination:{has_more:false,next:url.href}}});
    const body=JSON.parse(String(init.body));writes.push(`${method} ${url.pathname}`);
    if(method==='PATCH'){const row=rows.find(item=>item.id===id)!;Object.assign(row,body,body.subscribed_events?{subscribed_events:body.subscribed_events.map((name:string)=>({name}))}:{});return reply(200,{data:row});}
    if(kind==='transactions'&&!defaultLink)return reply(400,{error:{code:'transaction_default_checkout_url_not_set',detail:'no se muestra'}});
    const row:Row={id:`${prefix[kind!]}_${String(++serial).padStart(26,'0')}`,status:'active',...body};
    if(kind==='prices')Object.assign(row,{trial_period:null});
    if(kind==='discounts')Object.assign(row,{code:null,expires_at:null,usage_limit:null,times_used:0,maximum_recurring_intervals:body.maximum_recurring_intervals??null});
    if(kind==='notification-settings')Object.assign(row,{active:true,endpoint_secret_key:`pdl_ntfset_secreto_${serial}`,subscribed_events:body.subscribed_events.map((name:string)=>({name}))});
    if(kind==='client-tokens')Object.assign(row,{token:`live_${'a'.repeat(27)}${serial}`});
    if(kind==='transactions')Object.assign(row,{status:'ready',checkout:{url:`${defaultLink}?_ptxn=${row.id}`}});
    rows.push(row);return reply(201,{data:row});
  };
  return {store,writes,api:paddle('pdl_live_apikey_prueba',fetcher as typeof fetch)};
}
const base={DIAGRAMIA_PADDLE_API_KEY:'pdl_live_apikey_prueba',DIAGRAMIA_PADDLE_ENV:'live',DIAGRAMIA_OIDC_HOME_URL:'https://app.diagramia.app/'};
const bad=(report:{level:string;text:string}[])=>report.filter(item=>item.level==='bad').map(item=>item.text);

test('go-live setup creates the whole live catalog once, and the check then agrees with it',async()=>{
  const fake=fakePaddle(),offer={...base,DIAGRAMIA_OFFER_PERCENT:'50',DIAGRAMIA_OFFER_MONTHS:'3'};
  assert.equal(fake.api.environment,'live');
  const first=await setup(fake.api,settings(offer));
  assert.deepEqual(fake.writes,['POST /products','POST /prices','POST /prices','POST /discounts','POST /notification-settings','POST /client-tokens']);
  const [monthly,yearly]=fake.store.prices!;
  assert.deepEqual([monthly!.unit_price,monthly!.billing_cycle,monthly!.quantity],[{amount:'1000',currency_code:'USD'},{interval:'month',frequency:1},{minimum:1,maximum:1}]);
  assert.deepEqual([yearly!.unit_price.amount,yearly!.billing_cycle.interval,yearly!.quantity],['4000','year',{minimum:1,maximum:1}],'un Pro por compra: nunca 1–100');
  assert.deepEqual([fake.store.discounts![0]!.amount,fake.store.discounts![0]!.maximum_recurring_intervals,fake.store.discounts![0]!.restrict_to],['50',3,[monthly!.id]],'la oferta sólo alcanza al plan mensual');
  const destination=fake.store['notification-settings']![0]!;
  assert.deepEqual([destination.destination,destination.subscribed_events.map((event:Row)=>event.name),destination.traffic_source,destination.include_sensitive_fields],
    ['https://app.diagramia.app/api/v1/billing/webhook',EVENTS,'platform',false],'el destino recibe sólo los avisos de suscripción, sin simulaciones ni datos sensibles');
  assert.deepEqual(first.values,{DIAGRAMIA_PADDLE_ENV:'live',DIAGRAMIA_PADDLE_PRICE_PRO:monthly!.id,DIAGRAMIA_PADDLE_PRICE_PRO_YEARLY:yearly!.id,DIAGRAMIA_OFFER_DISCOUNT_ID:fake.store.discounts![0]!.id,
    DIAGRAMIA_OFFER_PERCENT:'50',DIAGRAMIA_OFFER_MONTHS:'3',DIAGRAMIA_PADDLE_WEBHOOK_SECRET:destination.endpoint_secret_key,DIAGRAMIA_PADDLE_CLIENT_TOKEN:fake.store['client-tokens']![0]!.token});
  // El archivo ya escrito: repetir no crea nada y devuelve lo mismo.
  const env=readEnv(mergeEnv(Object.entries(offer).map(([name,value])=>`${name}=${value}`).join('\n'),first.values));
  fake.writes.length=0;
  assert.deepEqual((await setup(fake.api,settings(env))).values,first.values);assert.deepEqual(fake.writes,[]);
  const report=await check(fake.api,settings(env),{probe:true});
  assert.deepEqual(bad(report),[]);assert.deepEqual(fake.writes,['POST /transactions'],'sólo --probe escribe: una transacción sin pagar');
  assert.equal(fake.store.transactions![0]!.custom_data.diagramia_user_id,undefined,'la transacción de prueba no es de ninguna cuenta');
  assert.ok(!JSON.stringify(report).includes(destination.endpoint_secret_key)&&!JSON.stringify(first.done).includes(destination.endpoint_secret_key),'el secreto del webhook no aparece en lo que se imprime');
});

test('the check names what would stop real payments',async()=>{
  const fake=fakePaddle(),good=readEnv(mergeEnv('',{...base,...(await setup(fake.api,settings(base))).values}));
  const run=async(change:Record<string,string>,api=fake.api,probe=false)=>bad(await check(api,settings({...good,...change}),{probe}));
  assert.deepEqual(await run({}),[]);
  assert.match((await run({DIAGRAMIA_PADDLE_ENV:'sandbox'}))[0]!,/dice sandbox y la clave es de la cuenta real/);
  assert.match((await run({DIAGRAMIA_PADDLE_PRICE_PRO:'pri_01m4hnrx3qgbftj800cc1bbd55'}))[0]!,/no existe en la cuenta real/,'un ID del sandbox no existe en live');
  assert.match((await run({DIAGRAMIA_PADDLE_WEBHOOK_SECRET:'otro-secreto'}))[0]!,/no es el secreto del destino/);
  assert.match((await run({DIAGRAMIA_PADDLE_CLIENT_TOKEN:'test_0123456789abcdef0123456789'}))[0]!,/no es un token de la cuenta real/);
  assert.match((await run({DIAGRAMIA_OFFER_DISCOUNT_ID:'dsc_01m4hnrxh1nxx4sby4trwt2wa9',DIAGRAMIA_OFFER_PERCENT:'50'}))[0]!,/El descuento .* no existe/);
  fake.store.prices![0]!.quantity={minimum:1,maximum:100};
  assert.match((await run({}))[0]!,/de 1 a 100 unidades/);
  fake.store.prices![0]!.quantity={minimum:1,maximum:1};
  fake.store['notification-settings']![0]!.subscribed_events.pop();
  assert.match((await run({}))[0]!,/le faltan: subscription\.trialing/);
  const repaired=await setup(fake.api,settings(good));
  assert.ok(repaired.done.some((line:string)=>/se sumaron 1 avisos/.test(line)));assert.deepEqual(await run({}),[]);
  const unset=fakePaddle(fake.store,null);
  assert.deepEqual(await run({},unset.api,true),['Falta el «default payment link».']);
  const elsewhere=fakePaddle(fake.store,'https://otro.example/pagar');
  assert.match((await run({},elsewhere.api,true))[0]!,/otra página de pago/);
});

test('writing the variables replaces sandbox values in place and leaves the rest of the file alone',()=>{
  const before='# Cobro\r\nDIAGRAMIA_PADDLE_ENV=sandbox   # pruebas\r\nDIAGRAMIA_PADDLE_API_KEY=pdl_live_apikey_prueba\r\nDIAGRAMIA_PADDLE_PRICE_PRO=pri_sandbox\r\n# DIAGRAMIA_OFFER_DISCOUNT_ID=dsc_...\r\nOTRA=1\r\n';
  const after=mergeEnv(before,{DIAGRAMIA_PADDLE_ENV:'live',DIAGRAMIA_PADDLE_PRICE_PRO:'pri_live',DIAGRAMIA_OFFER_DISCOUNT_ID:'dsc_live'});
  assert.equal(after,'# Cobro\r\nDIAGRAMIA_PADDLE_ENV=live\r\nDIAGRAMIA_PADDLE_API_KEY=pdl_live_apikey_prueba\r\nDIAGRAMIA_PADDLE_PRICE_PRO=pri_live\r\n# DIAGRAMIA_OFFER_DISCOUNT_ID=dsc_...\r\nOTRA=1\r\nDIAGRAMIA_OFFER_DISCOUNT_ID=dsc_live\r\n');
  assert.throws(()=>settings({DIAGRAMIA_OIDC_HOME_URL:'https://app.diagramia.app/'}),/DIAGRAMIA_PADDLE_API_KEY/);
  assert.equal(paddle('pdl_sdbx_apikey_x').environment,'sandbox');
});
