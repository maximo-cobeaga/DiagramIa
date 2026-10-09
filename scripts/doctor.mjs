// Diagnóstico de configuración: dice qué está listo, qué falta y cómo arreglarlo, en castellano llano.
//   npm run doctor                       → revisa .env (desarrollo local)
//   npm run doctor -- --online           → además prueba la clave de OpenAI y el login de Auth0 por internet (no gasta créditos)
//   npm run doctor -- --env .env.production   → revisa el archivo de producción antes de desplegar
// Nunca imprime secretos: sólo si están o no, y su largo.
import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),online=args.includes('--online'),envArg=args[args.indexOf('--env')+1];
const envFile=args.includes('--env')?envArg:'.env',production=envFile.includes('production');
const path=resolve(root,envFile);
const env={};
if(existsSync(path)){
  for(const line of readFileSync(path,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if(match)env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
  }
}
const get=name=>env[name]||'';
let problems=0,warnings=0;
const ok=text=>console.log(`  ✔ ${text}`);
const warn=(text,fix)=>{warnings++;console.log(`  ⚠ ${text}${fix?`\n      → ${fix}`:''}`);};
const bad=(text,fix)=>{problems++;console.log(`  ✖ ${text}${fix?`\n      → ${fix}`:''}`);};
const section=title=>console.log(`\n${title}`);
const secret=name=>{const value=get(name);return value?`(cargada, ${value.length} caracteres)`:'';};

console.log(`Diagnóstico de Diagramia · archivo: ${envFile}${online?' · con pruebas por internet':''}`);
if(!existsSync(path)){bad(`No existe ${envFile}.`,production?'Copiá infra/env.production.example a .env.production y completalo (docs/GUIA_PASO_A_PASO.md, paso 6).':'Copiá .env.example a .env (en la raíz del proyecto).');}

section('1. Herramientas');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major>22||(major===22&&minor>=12))ok(`Node ${process.versions.node}`);else bad(`Node ${process.versions.node} es viejo.`,'Instalá Node 22.12 o más nuevo desde https://nodejs.org (versión LTS).');
let docker=false;
// En producción el diagnóstico suele correr dentro de un contenedor, sin acceso a Docker: no se revisa.
if(!production){
  try{execFileSync('docker',['info','--format','{{.ServerVersion}}'],{stdio:'pipe',timeout:15000});docker=true;ok('Docker está corriendo');}
  catch{warn('Docker no responde.','Abrí Docker Desktop y esperá a que diga «Engine running». Hace falta para la base de datos local.');}
}

section('2. Inteligencia artificial (GPT-6 Luna para el plan Free)');
if(get('OPENAI_API_KEY')){
  if(!/^sk-/.test(get('OPENAI_API_KEY')))warn(`OPENAI_API_KEY ${secret('OPENAI_API_KEY')} no empieza con «sk-».`,'Revisá que hayas copiado la clave completa, sin espacios ni comillas.');
  else ok(`OPENAI_API_KEY ${secret('OPENAI_API_KEY')}`);
  const effort=get('DIAGRAMIA_OPENAI_REASONING_EFFORT')||'low';
  if(!['none','low','medium','high','xhigh','max'].includes(effort))bad(`DIAGRAMIA_OPENAI_REASONING_EFFORT=${effort} no es válido.`,'Usá none, low, medium, high, xhigh o max (recomendado: low).');else ok(`Esfuerzo de razonamiento: ${effort}`);
  if(online){
    const model=get('DIAGRAMIA_OPENAI_MODEL')||'gpt-6-luna';
    try{
      const response=await fetch(`${(get('DIAGRAMIA_OPENAI_BASE_URL')||'https://api.openai.com/v1').replace(/\/+$/,'')}/models/${model}`,{headers:{authorization:`Bearer ${get('OPENAI_API_KEY')}`},signal:AbortSignal.timeout(15000)});
      if(response.ok)ok(`OpenAI acepta la clave y el modelo ${model} está disponible para tu cuenta`);
      else if(response.status===401)bad('OpenAI rechazó la clave (401).','Generá una clave nueva en https://platform.openai.com/api-keys y pegala de nuevo.');
      else if(response.status===404)bad(`Tu cuenta de OpenAI no ve el modelo ${model} (404).`,'Revisá el nombre del modelo o que tu organización tenga acceso.');
      else if(response.status===429)bad('OpenAI respondió 429: sin saldo o límite alcanzado.','Cargá crédito en https://platform.openai.com/settings/organization/billing.');
      else warn(`OpenAI respondió ${response.status}.`);
    }catch{warn('No se pudo contactar a OpenAI.','Revisá tu conexión a internet.');}
  }
}else if(!production&&get('DIAGRAMIA_COMPAT_API_KEY')&&get('DIAGRAMIA_COMPAT_MODEL')){
  // Un proveedor compatible (DeepSeek u otro) sirve para probar en local; no reemplaza a Luna. El tope en USD sólo lo cubre con su tarifa cargada.
  const rate=name=>{const raw=get(name);return raw!==''&&Number.isFinite(Number(raw))&&Number(raw)>=0;},priced=rate('DIAGRAMIA_COMPAT_INPUT_USD_PER_MTOK')&&rate('DIAGRAMIA_COMPAT_OUTPUT_USD_PER_MTOK');
  warn(`Probando con ${get('DIAGRAMIA_COMPAT_LABEL')||'un servidor compatible'} (${get('DIAGRAMIA_COMPAT_MODEL')}); falta OPENAI_API_KEY para GPT-6 Luna.`,priced
    ?'Tarifa cargada: los topes en USD también limitan a este proveedor. Para Luna seguí el paso 1 de la guía.'
    :'Sin tarifa cargada, el tope en USD no limita a este proveedor: copiá sus precios en DIAGRAMIA_COMPAT_INPUT_USD_PER_MTOK y DIAGRAMIA_COMPAT_OUTPUT_USD_PER_MTOK, y poné un límite en su panel.');
}else bad('Falta OPENAI_API_KEY: la IA incluida no funciona.','Seguí docs/GUIA_PASO_A_PASO.md, paso 1.');
const allowed=(get('DIAGRAMIA_ACCOUNT_PROVIDERS')||'openai').split(',').map(s=>s.trim());
ok(`Las cuentas usan: ${allowed.join(', ')}`);
if(get('DIAGRAMIA_ENABLE_MOCK')==='1')production?bad('El proveedor de demostración está activado en producción.','Borrá DIAGRAMIA_ENABLE_MOCK.'):warn('El proveedor de demostración está activado (está bien sólo para probar la interfaz).');

section('3. Base de datos');
const databaseUrl=production?'(interna de Docker)':get('DIAGRAMIA_DATABASE_URL');
if(production){
  if(get('DIAGRAMIA_DB_PASSWORD').length>=24)ok(`DIAGRAMIA_DB_PASSWORD ${secret('DIAGRAMIA_DB_PASSWORD')}`);else bad('DIAGRAMIA_DB_PASSWORD falta o es corta.','Generá una con: openssl rand -hex 32');
}else if(!databaseUrl)warn('Sin DIAGRAMIA_DATABASE_URL: no hay cuentas, nube, telemetría ni panel.','Para probar todo en tu PC seguí docs/GUIA_PASO_A_PASO.md, paso 2.');
else{
  try{
    const {default:pg}=await import('pg');
    const pool=new pg.Pool({connectionString:databaseUrl,connectionTimeoutMillis:4000,max:1});
    const migrations=await pool.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='schema_migrations'").then(async r=>r.rows[0].n?(await pool.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n:0);
    await pool.end();
    ok(`PostgreSQL responde (${migrations} migraciones aplicadas${migrations?'':'; se aplican solas al iniciar npm run api'})`);
  }catch{bad('No se pudo conectar a PostgreSQL.',docker?'Ejecutá: npm run db:up   (y revisá que la URL tenga el puerto 5433).':'Abrí Docker Desktop y después ejecutá: npm run db:up');}
}
if(get('DIAGRAMIA_DATABASE_URL')||production){
  if(get('DIAGRAMIA_DOCUMENTS_TOKEN').length>=32)ok(`DIAGRAMIA_DOCUMENTS_TOKEN ${secret('DIAGRAMIA_DOCUMENTS_TOKEN')}`);
  else bad('DIAGRAMIA_DOCUMENTS_TOKEN falta o es corto (mínimo 32 caracteres).','Generalo con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

section('4. Cuentas (Auth0)');
const oidc=['DIAGRAMIA_OIDC_ISSUER','DIAGRAMIA_OIDC_CLIENT_ID','DIAGRAMIA_OIDC_CLIENT_SECRET','DIAGRAMIA_OIDC_REDIRECT_URI','DIAGRAMIA_OIDC_HOME_URL'];
const filled=oidc.filter(get);
if(!filled.length)(production?bad:warn)('Login desactivado (sin variables DIAGRAMIA_OIDC_*).','Seguí docs/GUIA_PASO_A_PASO.md, paso 3.');
else if(filled.length<oidc.length)bad(`Login a medias: faltan ${oidc.filter(n=>!get(n)).join(', ')}.`,'Completá las cinco variables o borralas todas.');
else{
  ok('Las cinco variables de login están cargadas');
  const issuer=get('DIAGRAMIA_OIDC_ISSUER'),redirect=get('DIAGRAMIA_OIDC_REDIRECT_URI');
  if(!/^https:\/\/.+\/$/.test(issuer))warn('DIAGRAMIA_OIDC_ISSUER debería ser https://<tu-tenant>.<región>.auth0.com/ (con la barra final).');
  if(!/\/api\/v1\/auth\/callback$/.test(redirect))bad('DIAGRAMIA_OIDC_REDIRECT_URI debe terminar en /api/v1/auth/callback.',production?'Ejemplo: https://app.tu-dominio.com/api/v1/auth/callback':'En tu PC: http://127.0.0.1:5173/api/v1/auth/callback');
  if(production&&!redirect.startsWith('https://'))bad('En producción la callback tiene que ser https.');
  if(!get('DIAGRAMIA_DATABASE_URL')&&!production)bad('El login necesita base de datos (DIAGRAMIA_DATABASE_URL).');
  if(online){
    try{
      const response=await fetch(new URL('.well-known/openid-configuration',issuer.endsWith('/')?issuer:issuer+'/'),{signal:AbortSignal.timeout(15000)});
      const body=response.ok?await response.json():null;
      if(body?.issuer===issuer)ok('Auth0 responde y el issuer coincide exactamente');
      else if(body)bad(`Auth0 responde, pero su issuer es «${body.issuer}».`,'Copiá ese valor exacto (con la barra final) en DIAGRAMIA_OIDC_ISSUER.');
      else bad(`No se encontró la configuración de Auth0 (${response.status}).`,'Revisá el dominio del tenant en Auth0 → Settings.');
    }catch{bad('No se pudo contactar al issuer de Auth0.','Revisá el dominio y tu conexión.');}
  }
}
if(filled.length&&!production&&get('DIAGRAMIA_REQUIRE_VERIFIED_EMAIL')==='0')warn('La IA está permitida sin email verificado (sólo para pruebas).');

section('5. Gasto y panel del fundador');
const daily=Number(get('DIAGRAMIA_DAILY_USD_BUDGET')||2),monthly=Number(get('DIAGRAMIA_MONTHLY_USD_BUDGET')||20);
ok(`Tope de gasto de IA: USD ${daily} por día y USD ${monthly} por mes (estimado)`);
if(get('DIAGRAMIA_ALERT_WEBHOOK_URL'))ok('Las alertas de gasto se envían a un webhook');else (production?warn:ok)(production?'Las alertas de gasto sólo quedan en el log.':'Alertas de gasto en el log (opcional: DIAGRAMIA_ALERT_WEBHOOK_URL)',production?'Seguí docs/GUIA_PASO_A_PASO.md, paso 5, para recibirlas en el celular.':undefined);
if(get('DIAGRAMIA_ADMIN_EMAILS'))ok(`Panel del fundador para: ${get('DIAGRAMIA_ADMIN_EMAILS')}`);else warn('Nadie puede ver el panel del fundador.','Poné tu email en DIAGRAMIA_ADMIN_EMAILS (el mismo con el que entrás).');

section('Cobro de la suscripción Pro (Paddle)');
{
  const names=['DIAGRAMIA_PADDLE_API_KEY','DIAGRAMIA_PADDLE_WEBHOOK_SECRET','DIAGRAMIA_PADDLE_PRICE_PRO'],filledPaddle=names.filter(name=>get(name));
  if(!filledPaddle.length)warn('El cobro está apagado: nadie puede pasar a Pro.','Cuando tengas la cuenta de Paddle, completá DIAGRAMIA_PADDLE_* (docs/GUIA_PASO_A_PASO.md, paso 8).');
  else if(filledPaddle.length!==names.length)bad(`Cobro incompleto: faltan ${names.filter(name=>!get(name)).join(', ')}.`,'Las tres variables van juntas; el gateway no arranca con alguna sola.');
  else{
    const live=get('DIAGRAMIA_PADDLE_ENV')==='live',key=get('DIAGRAMIA_PADDLE_API_KEY');
    ok(`Paddle en modo ${live?'REAL (live)':'pruebas (sandbox)'}: clave ${secret('DIAGRAMIA_PADDLE_API_KEY')}`);
    if(live&&key.startsWith('pdl_sdbx_'))bad('Modo live con una clave de sandbox.','Una clave de sandbox sólo sirve contra el sandbox: creá una clave live en Paddle.');
    if(!live&&!key.startsWith('pdl_sdbx_'))bad('Modo sandbox con una clave que no es de sandbox.','Poné DIAGRAMIA_PADDLE_ENV=live o usá una clave pdl_sdbx_.');
    if(production&&!live)warn('Producción cobrando en modo de pruebas: nadie paga de verdad.','Está bien hasta que Paddle apruebe la cuenta real; después, DIAGRAMIA_PADDLE_ENV=live.');
    if(!/^pri_[a-z0-9]{20,}$/.test(get('DIAGRAMIA_PADDLE_PRICE_PRO')))bad('DIAGRAMIA_PADDLE_PRICE_PRO no parece un ID de precio (pri_…).','Copialo desde Catalog → Prices en el panel de Paddle.');
    if(get('DIAGRAMIA_PADDLE_WEBHOOK_SECRET').length<16)bad('DIAGRAMIA_PADDLE_WEBHOOK_SECRET es demasiado corto.','Copialo entero desde Developer Tools → Notifications.');
    if(!get('DIAGRAMIA_DATABASE_URL')&&!production)bad('El cobro necesita base de datos y login.');
  }
}

if(production){
  section('6. Producción');
  for(const name of ['DIAGRAMIA_APP_URL','DIAGRAMIA_APP_HOST','DIAGRAMIA_SITE_HOST','DIAGRAMIA_APP_ORIGIN','DIAGRAMIA_ALLOWED_ORIGINS'])get(name)?ok(`${name}=${get(name)}`):bad(`Falta ${name}.`,'Mirá infra/env.production.example.');
  if(get('DIAGRAMIA_API_TOKEN').length>=32)ok(`DIAGRAMIA_API_TOKEN ${secret('DIAGRAMIA_API_TOKEN')}`);else bad('DIAGRAMIA_API_TOKEN falta o es corto.','Generalo con: openssl rand -hex 32');
  if(get('DIAGRAMIA_APP_URL')&&!get('DIAGRAMIA_APP_URL').endsWith('/'))bad('DIAGRAMIA_APP_URL debe terminar en «/».');
  if(get('DIAGRAMIA_APP_ORIGIN')&&!(get('DIAGRAMIA_ALLOWED_ORIGINS')).includes(get('DIAGRAMIA_APP_ORIGIN')))bad('DIAGRAMIA_ALLOWED_ORIGINS no incluye el origen del editor.');
  if(!get('DIAGRAMIA_RELEASE'))warn('DIAGRAMIA_RELEASE vacío: no vas a poder volver a una versión anterior por nombre.','Antes de cada despliegue: export DIAGRAMIA_RELEASE=$(git rev-parse --short HEAD)');
}

console.log(`\n${problems?`✖ ${problems} problema(s) para resolver`:'✔ Sin problemas'}${warnings?` · ⚠ ${warnings} aviso(s)`:''}.`);
process.exitCode=problems?1:0;
