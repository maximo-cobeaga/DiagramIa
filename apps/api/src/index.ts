import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {providersFromEnv} from '@diagramia/providers';
import {Pool} from 'pg';
import {createApp} from './server.js';
import {UsageLedger} from './usage.js';
import {sendAlert,sendNotice} from './alerts.js';
import {migrateDocuments,PostgresDocumentRepository} from './repositories/postgres.js';
import {AccountRepository} from './repositories/accounts.js';
import {BillingRepository} from './repositories/billing.js';
import {OidcAuthenticator} from './auth/oidc.js';
import {RemoteMcpService} from './mcp.js';
import {TelemetryRepository} from './repositories/telemetry.js';
import {ContactRepository} from './repositories/contact.js';
import {FounderDashboard} from './repositories/dashboard.js';
import {parseOffer} from './billing/offer.js';

/** Precios de lista del plan Pro en USD (ADR 093): los que muestran la landing, el editor y la oferta. Deben coincidir con los precios de Paddle. */
const PRO_PRICE_USD=10,PRO_YEARLY_USD=40;

const root=fileURLToPath(new URL('../../../',import.meta.url));
// Carga opcional de .env en la raíz del repo (el archivo está en .gitignore). Las variables ya definidas tienen prioridad.
if(existsSync(root+'.env'))process.loadEnvFile(root+'.env');
const env=process.env,number=(name:string,fallback:number)=>{const value=Number(env[name]);return Number.isFinite(value)&&value>0?value:fallback;};

const host=env.DIAGRAMIA_API_HOST??'127.0.0.1',port=number('DIAGRAMIA_API_PORT',8787),token=env.DIAGRAMIA_API_TOKEN||null;
if(!['127.0.0.1','localhost','::1'].includes(host)&&!token){
  console.error('El gateway no se expone fuera de loopback sin DIAGRAMIA_API_TOKEN.');process.exit(1);
}
// El prompt del asistente tiene una sola fuente: prompts/06_SYSTEM_PROMPT_PRODUCTO.md (sin su primera línea, que es una nota para desarrolladores).
const productPrompt=readFileSync(root+'prompts/06_SYSTEM_PROMPT_PRODUCTO.md','utf8').split('\n').slice(1).join('\n');
const ledger=new UsageLedger({
  dailyTokenBudget:number('DIAGRAMIA_DAILY_TOKEN_BUDGET',400_000),dailyUsdBudget:number('DIAGRAMIA_DAILY_USD_BUDGET',2),
  requestsPerMinute:number('DIAGRAMIA_REQUESTS_PER_MINUTE',10),ledgerPath:root+'state/usage-ledger.json',
  // Tope mensual de la IA incluida y alerta al cruzar una fracción: una línea JSON en el log, para conectar a un aviso externo.
  monthlyUsdBudget:number('DIAGRAMIA_MONTHLY_USD_BUDGET',20),alertRatio:Math.min(1,number('DIAGRAMIA_SPEND_ALERT_RATIO',0.8)),
  onAlert:alert=>{
    console.warn(JSON.stringify(alert));
    // Opcional: aviso en el celular o en un canal (ntfy, Discord o Slack). Ver docs/GUIA_PASO_A_PASO.md, paso 5.
    if(env.DIAGRAMIA_ALERT_WEBHOOK_URL)void sendAlert(env.DIAGRAMIA_ALERT_WEBHOOK_URL,alert).then(sent=>{if(!sent)console.warn('No se pudo enviar la alerta de gasto al webhook.');});
  }
});
// Servicio en la nube: los modelos locales (Ollama, LM Studio) ya no se ofrecen aunque el entorno los configure.
const providers=providersFromEnv(env).filter(provider=>provider.info().kind!=='local');
async function start(){
  if(env.DIAGRAMIA_DATABASE_URL&&!env.DIAGRAMIA_DOCUMENTS_TOKEN)throw new Error('DIAGRAMIA_DOCUMENTS_TOKEN es obligatorio al habilitar la base de documentos.');
  const oidcNames=['DIAGRAMIA_OIDC_ISSUER','DIAGRAMIA_OIDC_CLIENT_ID','DIAGRAMIA_OIDC_CLIENT_SECRET','DIAGRAMIA_OIDC_REDIRECT_URI','DIAGRAMIA_OIDC_HOME_URL'] as const;
  const configured=oidcNames.filter(name=>!!env[name]);
  if(configured.length&&configured.length!==oidcNames.length)throw new Error(`OIDC incompleto: configurar ${oidcNames.filter(name=>!env[name]).join(', ')}.`);
  if(configured.length&&!env.DIAGRAMIA_DATABASE_URL)throw new Error('OIDC requiere DIAGRAMIA_DATABASE_URL para sesiones y proyectos.');
  const mcpNames=['DIAGRAMIA_MCP_RESOURCE_URL','DIAGRAMIA_MCP_JWKS_URL'] as const,mcpConfigured=mcpNames.filter(name=>!!env[name]);
  if(mcpConfigured.length&&mcpConfigured.length!==mcpNames.length)throw new Error(`MCP remoto incompleto: configurar ${mcpNames.filter(name=>!env[name]).join(', ')}.`);
  if(mcpConfigured.length&&!configured.length)throw new Error('MCP remoto requiere OIDC y PostgreSQL configurados.');
  const pool=env.DIAGRAMIA_DATABASE_URL?new Pool({connectionString:env.DIAGRAMIA_DATABASE_URL,connectionTimeoutMillis:5000,max:10}):null;
  try{
    if(pool)await migrateDocuments(pool);
    const documents=pool?new PostgresDocumentRepository(pool):undefined,accounts=pool&&configured.length?new AccountRepository(pool):undefined;
    // Retención mínima: al iniciar y cada 6 h se borran respuestas de IA de más de 24 h, recibos viejos y sesiones vencidas.
    if(accounts){
      const purge=()=>accounts.purgeExpired().catch(error=>console.error('No se pudo purgar datos vencidos:',error instanceof Error?error.message:String(error)));
      await purge();setInterval(()=>void purge(),6*3_600_000).unref();
    }
    // Cobro (ADR 089/094): todo o nada, pero una configuración incompleta apaga el cobro en vez de tirar abajo el producto.
    // El editor, la IA y la nube no dependen de Paddle; el aviso queda en el log y en `npm run doctor`.
    const paddleNames=['DIAGRAMIA_PADDLE_API_KEY','DIAGRAMIA_PADDLE_WEBHOOK_SECRET','DIAGRAMIA_PADDLE_PRICE_PRO'] as const;
    let paddleConfigured=paddleNames.filter(name=>!!env[name]);
    const billingOff=(reason:string)=>{console.error(`COBRO APAGADO: ${reason} El resto del servicio funciona con el plan Free.`);paddleConfigured=[];};
    if(paddleConfigured.length&&paddleConfigured.length!==paddleNames.length)billingOff(`configuración incompleta, falta ${paddleNames.filter(name=>!env[name]).join(', ')}.`);
    else if(paddleConfigured.length&&!accounts)billingOff('requiere OIDC y PostgreSQL configurados.');
    const paddleEnv=env.DIAGRAMIA_PADDLE_ENV==='live'?'live':'sandbox';
    // Token público de Paddle.js: debe ser del mismo entorno que la clave. Sin él hay cobro configurado pero no se ofrece el pago.
    let clientToken:string|null=env.DIAGRAMIA_PADDLE_CLIENT_TOKEN||null;
    if(paddleConfigured.length&&!clientToken)console.error('COBRO SIN PÁGINA DE PAGO: falta DIAGRAMIA_PADDLE_CLIENT_TOKEN (Paddle → Developer tools → Authentication → Client-side tokens). No se ofrece Pro hasta cargarlo.');
    if(clientToken&&!new RegExp(`^${paddleEnv==='live'?'live':'test'}_[a-z0-9]{20,60}$`).test(clientToken)){
      console.error(`COBRO SIN PÁGINA DE PAGO: DIAGRAMIA_PADDLE_CLIENT_TOKEN no es un token ${paddleEnv==='live'?'live_':'test_'}… del entorno ${paddleEnv}. ¿Pegaste la clave de API por error? Esa nunca va acá.`);clientToken=null;
    }
    // Página propia donde se abre el pago: vive en el mismo origen que el editor.
    const checkoutUrl=env.DIAGRAMIA_OIDC_HOME_URL?new URL('pago.html',env.DIAGRAMIA_OIDC_HOME_URL).href:null;
    let offer:ReturnType<typeof parseOffer>;
    try{offer=paddleConfigured.length?parseOffer(env,PRO_PRICE_USD):undefined;}catch(error){console.error('OFERTA APAGADA:',error instanceof Error?error.message:String(error));}
    const billing=paddleConfigured.length&&pool?{repository:new BillingRepository(pool),paddle:{env:paddleEnv as 'live'|'sandbox',apiKey:env.DIAGRAMIA_PADDLE_API_KEY!,webhookSecret:env.DIAGRAMIA_PADDLE_WEBHOOK_SECRET!,priceId:env.DIAGRAMIA_PADDLE_PRICE_PRO!,yearlyPriceId:env.DIAGRAMIA_PADDLE_PRICE_PRO_YEARLY||null,clientToken,checkoutUrl},offer,prices:{monthlyUsd:PRO_PRICE_USD,yearlyUsd:PRO_YEARLY_USD}}:undefined;
    const remoteMcp=mcpConfigured.length&&documents&&accounts?new RemoteMcpService({resourceUrl:env.DIAGRAMIA_MCP_RESOURCE_URL!,issuer:env.DIAGRAMIA_OIDC_ISSUER!,jwksUrl:env.DIAGRAMIA_MCP_JWKS_URL!},accounts,documents):undefined;
    const server=createApp({
      providers,ledger,productPrompt,token,documents,
      documentToken:pool?env.DIAGRAMIA_DOCUMENTS_TOKEN:undefined,
      localWorkspace:env.DIAGRAMIA_LOCAL_WORKSPACE==='1'&&['127.0.0.1','localhost','::1'].includes(host),
      accounts,remoteMcp,billing,
      // Telemetría propia (ADR 046): requiere PostgreSQL; DIAGRAMIA_TELEMETRY=0 la apaga.
      telemetry:pool&&env.DIAGRAMIA_TELEMETRY!=='0'?new TelemetryRepository(pool):undefined,
      // Plan Empresas: los datos quedan en la bandeja privada; el webhook sólo recibe un aviso sin datos personales.
      contact:pool?{repository:new ContactRepository(pool),notify:text=>{if(env.DIAGRAMIA_ALERT_WEBHOOK_URL)void sendNotice(env.DIAGRAMIA_ALERT_WEBHOOK_URL,'Diagramia: consulta de empresa',text);}}:undefined,
      dashboard:pool&&env.DIAGRAMIA_TELEMETRY!=='0'?new FounderDashboard(pool):undefined,
      adminEmails:(env.DIAGRAMIA_ADMIN_EMAILS??'').split(',').map(email=>email.trim()).filter(Boolean),
      eventsPerMinute:number('DIAGRAMIA_EVENTS_PER_MINUTE',60),trustProxy:env.DIAGRAMIA_TRUST_PROXY==='1',
      requireVerifiedEmail:env.DIAGRAMIA_REQUIRE_VERIFIED_EMAIL!=='0',aiPerIpPerMinute:number('DIAGRAMIA_AI_PER_IP_PER_MINUTE',20),aiPerUserPerMinute:number('DIAGRAMIA_AI_PER_USER_PER_MINUTE',6),
      // Plan Free: GPT-6 Luna por defecto (ADR 045). Lista separada por comas de IDs de proveedor.
      accountProviders:(env.DIAGRAMIA_ACCOUNT_PROVIDERS??'openai').split(',').map(id=>id.trim()).filter(Boolean),
      oidc:configured.length?new OidcAuthenticator({issuer:env.DIAGRAMIA_OIDC_ISSUER!,clientId:env.DIAGRAMIA_OIDC_CLIENT_ID!,clientSecret:env.DIAGRAMIA_OIDC_CLIENT_SECRET!,redirectUri:env.DIAGRAMIA_OIDC_REDIRECT_URI!,homeUrl:env.DIAGRAMIA_OIDC_HOME_URL!}):undefined,
      ready:pool?async()=>{try{await pool.query('SELECT 1');return true;}catch{return false;}}:undefined,
      log:entry=>{if(entry.path!=='/health'&&entry.path!=='/ready')console.log(JSON.stringify(entry));},
      allowedOrigins:(env.DIAGRAMIA_ALLOWED_ORIGINS??'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173').split(',').map(o=>o.trim()).filter(Boolean),
      config:{maxOutputTokens:number('DIAGRAMIA_MAX_OUTPUT_TOKENS',8000),maxContextChars:number('DIAGRAMIA_MAX_CONTEXT_CHARS',60_000),maxRepairs:Math.min(3,Math.round(number('DIAGRAMIA_MAX_REPAIRS',1))),timeoutMs:number('DIAGRAMIA_REQUEST_TIMEOUT_MS',120_000)}
    });
    // Detrás de un proxy sin DIAGRAMIA_TRUST_PROXY, todos los visitantes comparten la IP del proxy y los límites por IP se vuelven globales.
    if(configured.length&&env.DIAGRAMIA_TRUST_PROXY!=='1')console.warn('Atención: con cuentas activas y sin DIAGRAMIA_TRUST_PROXY=1, los límites por IP usan la IP de la conexión. Detrás del reverse proxy, activalo.');
    server.listen(port,host,()=>{
      console.log(`Gateway de Diagramia en http://${host}:${port}${pool?' · documentos PostgreSQL listos':''}`);
      for(const provider of providers){const info=provider.info();console.log(`  ${info.id.padEnd(10)} ${info.configured?'listo':'sin configurar'} · ${info.model}${info.kind==='mock'?' · DEMOSTRACIÓN, no es un modelo':''}${info.missing?' · '+info.missing:''}`);}
    });
    for(const signal of ['SIGINT','SIGTERM']as const)process.once(signal,()=>server.close(()=>{void pool?.end().finally(()=>process.exit(0));}));
  }catch(error){await pool?.end();throw error;}
}
// Una promesa suelta que falla (un aviso, una medición) no debe tirar el gateway con pedidos en curso: queda en el log, sin datos del pedido.
process.on('unhandledRejection',reason=>{console.error('[gateway] promesa sin manejar:',reason instanceof Error?reason.name+': '+reason.message:'error');});
start().catch(error=>{console.error('No se pudo iniciar el gateway:',error instanceof Error?error.message:String(error));process.exitCode=1;});
