// Pase de Paddle a cobros reales sin copiar IDs ni secretos a mano (ADR 098). Sirve igual para revisar el sandbox.
//   npm run paddle -- check [--env <archivo>] [--probe]   → sólo lee: compara lo que dice el archivo con lo que hay en Paddle.
//   npm run paddle -- setup [--env <archivo>] [--write]   → crea lo que falte en la cuenta de la clave y arma las variables.
// El entorno (sandbox o live) lo decide la clave de API del archivo. `--probe` crea una transacción sin pagar para comprobar
// el enlace de pago; `--write` guarda las variables en el archivo (con copia previa). Nunca imprime la clave ni el secreto del webhook.
// Lo que sólo se hace en el panel de Paddle: aprobar el dominio y cargar el «default payment link» (infra/DEPLOY.md).
import {copyFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

/** Avisos que el gateway entiende (apps/api/src/billing/paddle.ts). El destino del webhook no necesita ninguno más. */
export const EVENTS=['subscription.created','subscription.activated','subscription.updated','subscription.canceled','subscription.paused','subscription.resumed','subscription.past_due','subscription.trialing'];
/** Catálogo de Pro. Los importes son los de lista del gateway (apps/api/src/index.ts) y los que anuncia el sitio. */
export const CATALOG={
  product:{name:'Diagramia Pro',description:'Plan Pro de Diagramia: más créditos de IA, más diagramas en la nube y elementos propios.',tax_category:'saas',custom_data:{plan:'pro'}},
  monthly:{amount:'1000',interval:'month',description:'Diagramia Pro, USD 10 por mes'},
  yearly:{amount:'4000',interval:'year',description:'Diagramia Pro, USD 40 por año'}
};
const PERMISSIONS='En Paddle → Developer tools → Authentication, la clave necesita leer y escribir Products, Prices, Discounts, Notification settings y Client-side tokens (y Transactions para --probe).';

export class PaddleError extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}

/** Cliente mínimo de la API de Paddle. La clave sólo viaja en la cabecera; los errores conservan el código de Paddle, nunca su detalle. */
export function paddle(apiKey,fetcher=fetch){
  const environment=apiKey.startsWith('pdl_sdbx_')?'sandbox':'live',base=environment==='live'?'https://api.paddle.com':'https://sandbox-api.paddle.com';
  const call=async(method,path,body)=>{
    const response=await fetcher(base+path,{method,signal:AbortSignal.timeout(20_000),headers:{authorization:`Bearer ${apiKey}`,'Paddle-Version':'1',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}).catch(()=>null);
    if(!response)throw new PaddleError('network',0);
    const json=await response.json().catch(()=>null);
    if(!response.ok)throw new PaddleError(typeof json?.error?.code==='string'&&/^[a-z0-9_]{1,80}$/.test(json.error.code)?json.error.code:`http_${response.status}`,response.status);
    return json;
  };
  return {environment,
    get:async path=>(await call('GET',path)).data,
    post:async(path,body)=>(await call('POST',path,body)).data,
    patch:async(path,body)=>(await call('PATCH',path,body)).data,
    /** Todas las páginas de un listado (hasta 20: un catálogo de un producto nunca llega). */
    list:async path=>{
      const items=[];let next=path+(path.includes('?')?'&':'?')+'per_page=200';
      for(let page=0;next&&page<20;page++){const json=await call('GET',next);items.push(...json.data);next=json.meta?.pagination?.has_more&&typeof json.meta.pagination.next==='string'?json.meta.pagination.next.replace(base,''):null;}
      return items;
    }};
}

export function readEnv(text){
  const env={};
  for(const line of text.split(/\r?\n/)){const match=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);if(match)env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');}
  return env;
}
/** Reemplaza cada variable en su línea (o la agrega al final). Las líneas comentadas y el resto del archivo quedan como estaban. */
export function mergeEnv(text,values){
  const eol=text.includes('\r\n')?'\r\n':'\n',lines=text.split(/\r?\n/),missing=[];
  for(const [name,value] of Object.entries(values)){
    const at=lines.findIndex(line=>new RegExp(`^\\s*${name}\\s*=`).test(line));
    if(at>=0)lines[at]=`${name}=${value}`;else missing.push(`${name}=${value}`);
  }
  if(missing.length){while(lines.length&&lines.at(-1)==='')lines.pop();lines.push(...missing,'');}
  return lines.join(eol);
}

/** Lo que el script necesita del archivo de entorno. La dirección del webhook y la página de pago salen de la URL pública del editor. */
export function settings(env){
  const home=env.DIAGRAMIA_OIDC_HOME_URL||env.DIAGRAMIA_APP_URL||'';
  if(!env.DIAGRAMIA_PADDLE_API_KEY)throw new Error('Falta DIAGRAMIA_PADDLE_API_KEY en el archivo.');
  if(!/^https?:\/\//.test(home))throw new Error('Falta DIAGRAMIA_OIDC_HOME_URL (la dirección pública del editor, por ejemplo https://app.diagramia.app/).');
  const percent=Number(env.DIAGRAMIA_OFFER_PERCENT),months=env.DIAGRAMIA_OFFER_MONTHS?Number(env.DIAGRAMIA_OFFER_MONTHS):1;
  return {apiKey:env.DIAGRAMIA_PADDLE_API_KEY,declared:env.DIAGRAMIA_PADDLE_ENV==='live'?'live':'sandbox',
    webhookUrl:new URL('api/v1/billing/webhook',home).href,checkoutUrl:new URL('pago.html',home).href,
    monthly:env.DIAGRAMIA_PADDLE_PRICE_PRO||'',yearly:env.DIAGRAMIA_PADDLE_PRICE_PRO_YEARLY||'',webhookSecret:env.DIAGRAMIA_PADDLE_WEBHOOK_SECRET||'',clientToken:env.DIAGRAMIA_PADDLE_CLIENT_TOKEN||'',
    discountId:env.DIAGRAMIA_OFFER_DISCOUNT_ID||'',
    // La oferta es opcional: sólo se arma con un porcentaje válido (las mismas reglas que el gateway).
    offer:Number.isInteger(percent)&&percent>=5&&percent<=90&&Number.isInteger(months)&&months>=1&&months<=12?{percent,months}:null};
}

const money=amount=>`USD ${Number(amount)/100}`;
const priceIssues=(price,want)=>[
  price.status!=='active'&&'está archivado',
  (price.unit_price?.amount!==want.amount||price.unit_price?.currency_code!=='USD')&&`cobra ${price.unit_price?.currency_code} ${Number(price.unit_price?.amount)/100} y el sitio anuncia ${money(want.amount)}`,
  (price.billing_cycle?.interval!==want.interval||price.billing_cycle?.frequency!==1)&&`no se cobra ${want.interval==='month'?'cada mes':'cada año'}`,
  (price.quantity?.minimum!==1||price.quantity?.maximum!==1)&&`permite de ${price.quantity?.minimum} a ${price.quantity?.maximum} unidades: el pago dejaría multiplicar el importe (tiene que ser 1–1)`,
  price.trial_period&&'tiene un período de prueba que el sitio no anuncia'
].filter(Boolean);
const discountIssues=(discount,offer,monthlyId)=>[
  discount.status!=='active'&&'está archivado',
  (discount.type!=='percentage'||Number(discount.amount)!==offer.percent)&&`descuenta ${discount.amount}${discount.type==='percentage'?' %':' ('+discount.type+')'} y la oferta anuncia ${offer.percent} %`,
  (offer.months===1?discount.recur&&discount.maximum_recurring_intervals!==1:!discount.recur||discount.maximum_recurring_intervals!==offer.months)&&`no dura ${offer.months} mes(es) como anuncia la oferta`,
  discount.restrict_to?.length&&!discount.restrict_to.includes(monthlyId)&&'no se aplica al precio mensual',
  discount.expires_at&&Date.parse(discount.expires_at)<Date.now()&&'ya venció en Paddle',
  discount.usage_limit!==null&&discount.usage_limit!==undefined&&discount.times_used>=discount.usage_limit&&'ya agotó sus usos'
].filter(Boolean);
const explain=error=>error instanceof PaddleError
  ?error.code==='network'?'No se pudo contactar a Paddle. Revisá la conexión.'
    :error.status===401?'Paddle rechazó la clave de API (401): está mal copiada, revocada o es de otro entorno.'
    :error.status===403?`La clave no tiene permiso para esto (403). ${PERMISSIONS}`
    :`Paddle respondió ${error.code}.`
  :error instanceof Error?error.message:String(error);

/**
 * Sólo lee (salvo `probe`). Devuelve una lista de {level:'ok'|'warn'|'bad',text,fix?}: qué coincide con Paddle y qué impediría cobrar.
 */
export async function check(api,config,{probe=false}={}){
  const report=[],ok=text=>report.push({level:'ok',text}),warn=(text,fix)=>report.push({level:'warn',text,fix}),bad=(text,fix)=>report.push({level:'bad',text,fix});
  const live=api.environment==='live',where=live?'la cuenta real (live)':'el sandbox';
  if(config.declared!==api.environment)bad(`DIAGRAMIA_PADDLE_ENV dice ${config.declared} y la clave es de ${where}.`,`Poné DIAGRAMIA_PADDLE_ENV=${api.environment} o cambiá la clave: el gateway usaría el servidor equivocado.`);
  else ok(`Clave y entorno coinciden: ${live?'COBROS REALES (live)':'pruebas (sandbox)'}`);
  const safely=async(label,work)=>{try{await work();}catch(error){bad(`${label}: ${explain(error)}`);}};
  const price=async(id,want,name)=>{
    if(!id)return name==='DIAGRAMIA_PADDLE_PRICE_PRO'?void bad(`Falta ${name}.`,'Corré «npm run paddle -- setup» para crearlo.'):void warn(`Sin ${name}: no se ofrece el plan anual, que el sitio anuncia.`,'Corré «npm run paddle -- setup» para crearlo.');
    try{
      const found=await api.get(`/prices/${id}`),issues=priceIssues(found,want);
      if(issues.length)return void bad(`${name} (${id}) ${issues.join('; ')}.`,'Corré «npm run paddle -- setup»: crea un precio correcto y deja este sin usar.');
      const product=await api.get(`/products/${found.product_id}`);
      if(product.status!=='active')return void bad(`El producto de ${name} está archivado.`);
      ok(`${name}: ${money(want.amount)} ${want.interval==='month'?'por mes':'por año'}, una unidad por compra`);
    }catch(error){
      if(error instanceof PaddleError&&error.status===404)bad(`${name} (${id}) no existe en ${where}.`,live?'Los IDs del sandbox no sirven en live. Corré «npm run paddle -- setup» con la clave live.':'Revisá el ID o corré «npm run paddle -- setup».');
      else bad(`${name}: ${explain(error)}`);
    }
  };
  await price(config.monthly,CATALOG.monthly,'DIAGRAMIA_PADDLE_PRICE_PRO');
  await price(config.yearly,CATALOG.yearly,'DIAGRAMIA_PADDLE_PRICE_PRO_YEARLY');
  if(config.discountId)await safely('Oferta',async()=>{
    if(!config.offer)return void bad('DIAGRAMIA_OFFER_DISCOUNT_ID está cargado sin un DIAGRAMIA_OFFER_PERCENT válido: el gateway apaga la oferta.');
    let discount;
    try{discount=await api.get(`/discounts/${config.discountId}`);}catch(error){if(error instanceof PaddleError&&error.status===404)return void bad(`El descuento ${config.discountId} no existe en ${where}.`,'Corré «npm run paddle -- setup», o quitá DIAGRAMIA_OFFER_* para no ofrecer el descuento.');throw error;}
    const issues=discountIssues(discount,config.offer,config.monthly);
    if(issues.length)bad(`El descuento ${config.discountId} ${issues.join('; ')}.`,'Lo que se muestra tiene que ser lo que Paddle cobra. Corré «npm run paddle -- setup» o corregí DIAGRAMIA_OFFER_*.');
    else ok(`Oferta: ${config.offer.percent} % durante ${config.offer.months} mes(es), sólo en el plan mensual`);
  });
  else ok('Sin oferta configurada (opcional)');
  await safely('Webhook',async()=>{
    const all=await api.list('/notification-settings'),mine=all.filter(setting=>setting.type==='url'&&setting.destination===config.webhookUrl&&setting.active);
    if(!mine.length)return void bad(`No hay un destino activo de avisos hacia ${config.webhookUrl}.`,'Sin él, quien paga no recibe Pro. Corré «npm run paddle -- setup».');
    const signed=mine.find(setting=>setting.endpoint_secret_key===config.webhookSecret);
    if(!signed)return void bad('DIAGRAMIA_PADDLE_WEBHOOK_SECRET no es el secreto del destino de avisos de esta cuenta.','El gateway rechazaría todos los avisos y nadie recibiría Pro. Corré «npm run paddle -- setup --write».');
    const missing=EVENTS.filter(name=>!signed.subscribed_events?.some(event=>event.name===name));
    if(missing.length)return void bad(`Al destino de avisos le faltan: ${missing.join(', ')}.`,'Corré «npm run paddle -- setup».');
    ok(`Webhook: destino activo, firmado con el secreto cargado y con los ${EVENTS.length} avisos de suscripción`);
    if(mine.length>1)warn(`Hay ${mine.length} destinos activos hacia la misma dirección.`,'Cada aviso llega repetido y los firmados con otro secreto se rechazan. Dejá uno solo en Paddle → Notifications.');
    if(live&&signed.traffic_source!=='platform')warn('El destino también recibe simulaciones.','En live conviene «Platform only»: una simulación no debería llegar al servidor de producción.');
  });
  await safely('Token de Paddle.js',async()=>{
    if(!config.clientToken)return void bad('Falta DIAGRAMIA_PADDLE_CLIENT_TOKEN: no hay dónde pagar.','Corré «npm run paddle -- setup».');
    const token=(await api.list('/client-tokens')).find(item=>item.token===config.clientToken);
    if(!token)bad(`DIAGRAMIA_PADDLE_CLIENT_TOKEN no es un token de ${where}.`,'Corré «npm run paddle -- setup».');
    else if(token.status!=='active')bad('El token de Paddle.js está revocado.','Corré «npm run paddle -- setup» para crear otro.');
    else ok('Token público de Paddle.js activo');
  });
  if(probe&&config.monthly)await safely('Enlace de pago',async()=>{
    // Igual que el gateway al tocar «Pasar a Pro», pero sin cuenta: el aviso de esta transacción no le da Pro a nadie.
    let transaction;
    try{transaction=await api.post('/transactions',{items:[{price_id:config.monthly,quantity:1}],custom_data:{diagramia_probe:'paddle-live'}});}
    catch(error){
      if(error instanceof PaddleError&&error.code==='transaction_default_checkout_url_not_set')return void bad('Falta el «default payment link».',`Paddle → Checkout → Checkout settings → Default payment link: ${config.checkoutUrl}`);
      if(error instanceof PaddleError&&error.code==='transaction_checkout_url_domain_is_not_approved')return void bad('El dominio del pago no está aprobado en Paddle.','Paddle → Checkout → Website approval: pedí la aprobación del dominio del editor.');
      throw error;
    }
    const url=transaction.checkout?.url;
    if(typeof url==='string'&&url.startsWith(config.checkoutUrl+'?'))ok(`Enlace de pago: Paddle devuelve la página propia (${config.checkoutUrl}). Quedó una transacción sin pagar, ${transaction.id}`);
    else bad('Paddle devuelve otra página de pago, que el gateway rechaza.',`El «default payment link» tiene que ser exactamente ${config.checkoutUrl}`);
  });
  else warn('No se comprobó el «default payment link» ni la aprobación del dominio.',`Sólo se ven creando una transacción: agregá --probe (queda una transacción sin pagar). Tiene que ser ${config.checkoutUrl}`);
  return report;
}

/**
 * Crea lo que falte y reutiliza lo que ya está bien: correrlo dos veces no duplica nada. Devuelve las variables para el
 * archivo de entorno y lo que hizo. No archiva ni modifica precios o descuentos existentes: si uno no sirve, crea otro.
 */
export async function setup(api,config){
  const done=[],live=api.environment==='live';
  const products=await api.list('/products?status=active');
  let product=products.find(item=>item.custom_data?.plan==='pro')??products.find(item=>item.name===CATALOG.product.name);
  if(product)done.push(`Producto: ya existía (${product.id})`);
  else{product=await api.post('/products',CATALOG.product);done.push(`Producto: creado (${product.id})`);}
  const prices=await api.list(`/prices?product_id=${product.id}&status=active`);
  const price=async(want,label)=>{
    let found=prices.find(item=>!priceIssues(item,want).length);
    if(found)done.push(`Precio ${label}: ya existía (${found.id})`);
    else{
      found=await api.post('/prices',{product_id:product.id,description:want.description,unit_price:{amount:want.amount,currency_code:'USD'},billing_cycle:{interval:want.interval,frequency:1},quantity:{minimum:1,maximum:1},tax_mode:'location'});
      done.push(`Precio ${label}: creado (${found.id})`);
    }
    return found.id;
  };
  const monthly=await price(CATALOG.monthly,'mensual'),yearly=await price(CATALOG.yearly,'anual');
  const values={DIAGRAMIA_PADDLE_ENV:api.environment,DIAGRAMIA_PADDLE_PRICE_PRO:monthly,DIAGRAMIA_PADDLE_PRICE_PRO_YEARLY:yearly};
  if(config.offer){
    const {percent,months}=config.offer,discounts=await api.list('/discounts?status=active');
    let discount=discounts.find(item=>!item.code&&item.restrict_to?.length&&!discountIssues(item,config.offer,monthly).length);
    if(discount)done.push(`Descuento: ya existía (${discount.id})`);
    else{
      discount=await api.post('/discounts',{description:`Oferta de lanzamiento: ${percent}% ${months>1?`los primeros ${months} meses`:'el primer mes'}`,type:'percentage',amount:String(percent),enabled_for_checkout:false,restrict_to:[monthly],...(months>1?{recur:true,maximum_recurring_intervals:months}:{recur:false})});
      done.push(`Descuento: creado (${discount.id})`);
    }
    Object.assign(values,{DIAGRAMIA_OFFER_DISCOUNT_ID:discount.id,DIAGRAMIA_OFFER_PERCENT:String(percent),DIAGRAMIA_OFFER_MONTHS:String(months)});
  }else done.push('Descuento: sin oferta en el archivo (DIAGRAMIA_OFFER_PERCENT), no se crea');
  const destinations=(await api.list('/notification-settings')).filter(setting=>setting.type==='url'&&setting.destination===config.webhookUrl&&setting.active);
  // Si el archivo ya tiene el secreto de uno de los destinos, se conserva ese: no cambia nada en el servidor.
  let destination=destinations.find(setting=>setting.endpoint_secret_key===config.webhookSecret)??destinations[0];
  if(!destination){
    destination=await api.post('/notification-settings',{description:'Diagramia: suscripciones',type:'url',destination:config.webhookUrl,api_version:1,include_sensitive_fields:false,subscribed_events:EVENTS,...(live?{traffic_source:'platform'}:{})});
    done.push(`Webhook: destino creado (${destination.id}) hacia ${config.webhookUrl}`);
  }else{
    const subscribed=(destination.subscribed_events??[]).map(event=>event.name),missing=EVENTS.filter(name=>!subscribed.includes(name));
    if(missing.length){destination=await api.patch(`/notification-settings/${destination.id}`,{subscribed_events:[...subscribed,...missing]});done.push(`Webhook: se sumaron ${missing.length} avisos al destino ${destination.id}`);}
    else done.push(`Webhook: ya existía (${destination.id})`);
  }
  if(typeof destination.endpoint_secret_key!=='string'||!destination.endpoint_secret_key)throw new Error('Paddle no devolvió el secreto del destino de avisos.');
  values.DIAGRAMIA_PADDLE_WEBHOOK_SECRET=destination.endpoint_secret_key;
  const tokens=(await api.list('/client-tokens')).filter(item=>item.status==='active'&&typeof item.token==='string');
  let token=tokens.find(item=>item.token===config.clientToken)??tokens.find(item=>item.name?.startsWith('Diagramia editor'));
  if(token)done.push(`Token de Paddle.js: ya existía (${token.id})`);
  else{token=await api.post('/client-tokens',{name:`Diagramia editor (${api.environment})`,description:'Token público de Paddle.js para la página de pago del editor.'});done.push(`Token de Paddle.js: creado (${token.id})`);}
  values.DIAGRAMIA_PADDLE_CLIENT_TOKEN=token.token;
  return {values,done};
}

async function main(){
  const args=process.argv.slice(2),mode=args[0],flag=name=>args.includes(name),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
  if(mode!=='check'&&mode!=='setup'){console.log('Uso: npm run paddle -- check [--env <archivo>] [--probe]\n     npm run paddle -- setup [--env <archivo>] [--write]');process.exitCode=1;return;}
  const envFile=option('--env')??'.env',path=resolve(fileURLToPath(new URL('../',import.meta.url)),envFile);
  if(!existsSync(path)){console.log(`✖ No existe ${envFile}.`);process.exitCode=1;return;}
  let config;
  try{config=settings(readEnv(readFileSync(path,'utf8')));}catch(error){console.log(`✖ ${explain(error)}`);process.exitCode=1;return;}
  const api=paddle(config.apiKey),account=api.environment==='live'?'CUENTA REAL (live): cobros de verdad':'sandbox: pruebas, sin dinero real';
  if(mode==='check'){
    console.log(`Paddle · ${envFile} · ${account}\n`);
    const report=await check(api,config,{probe:flag('--probe')});
    for(const {level,text,fix} of report)console.log(`  ${level==='ok'?'✔':level==='warn'?'⚠':'✖'} ${text}${fix?`\n      → ${fix}`:''}`);
    const problems=report.filter(item=>item.level==='bad').length,warnings=report.filter(item=>item.level==='warn').length;
    console.log(`\n${problems?`✖ ${problems} problema(s): con esto no se puede cobrar`:'✔ Paddle coincide con el archivo'}${warnings?` · ⚠ ${warnings} aviso(s)`:''}.`);
    process.exitCode=problems?1:0;return;
  }
  console.log(`Paddle · ${envFile} · ${account}\nSe crea sólo lo que falte.\n`);
  let result;
  try{result=await setup(api,config);}catch(error){console.log(`✖ ${explain(error)}`);process.exitCode=1;return;}
  for(const line of result.done)console.log(`  ✔ ${line}`);
  if(flag('--write')){
    const backup=`${path}.antes-de-paddle-${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}`;
    copyFileSync(path,backup);writeFileSync(path,mergeEnv(readFileSync(path,'utf8'),result.values));
    console.log(`\nVariables guardadas en ${envFile} (copia previa: ${backup}).`);
  }else{
    console.log('\nVariables (el secreto del webhook no se muestra; con --write se guardan todas en el archivo):');
    for(const [name,value] of Object.entries(result.values))console.log(`  ${name}=${name==='DIAGRAMIA_PADDLE_WEBHOOK_SECRET'?'(secreto)':value}`);
  }
  console.log(`\nFalta, sólo desde el panel de Paddle: dominio aprobado y «default payment link» = ${config.checkoutUrl}\nDespués: npm run paddle -- check --env ${envFile} --probe`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
