import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {DiagramError,SCHEMA_VERSION,TelemetryBatchSchema,describeError,type ServerEvent} from '@diagramia/core';
import type {Provider} from '@diagramia/providers';
import {AssistError,MODES,assist,systemPrompt,type AssistAnswer,type AssistConfig} from './assist.js';
import {UsageError,UsageLedger} from './usage.js';
import {PostgresDocumentRepository,RepositoryError} from './repositories/postgres.js';
import {AccountRepository,CreditError} from './repositories/accounts.js';
import {OidcAuthenticator} from './auth/oidc.js';
import {RemoteMcpService} from './mcp.js';
import {RateLimiter,TelemetryRepository} from './repositories/telemetry.js';
import {FounderDashboard} from './repositories/dashboard.js';

export type AppOptions={providers:Provider[];ledger:UsageLedger;config:AssistConfig;productPrompt:string;allowedOrigins:string[];token:string|null;documents?:PostgresDocumentRepository;documentToken?:string;localWorkspace?:boolean;accounts?:AccountRepository;oidc?:OidcAuthenticator;remoteMcp?:RemoteMcpService;
  /** IDs de proveedor que puede usar una cuenta (plan Free). Sin lista, todos los configurados. */
  accountProviders?:string[];
  /** Telemetría propia (P7.1). Sin repositorio, /v1/events responde 503 y el editor deja de enviar. */
  telemetry?:TelemetryRepository;eventsPerMinute?:number;
  /** Detrás de un reverse proxy propio: la IP del cliente es la última de X-Forwarded-For. */
  trustProxy?:boolean;
  /** Antiabuso de la IA incluida (P4.4). Por defecto exige email verificado y limita 20 pedidos/min por IP y 6 por cuenta. */
  /** Dashboard del fundador (P7.3): sólo para cuentas con email verificado incluido en adminEmails. */
  dashboard?:FounderDashboard;adminEmails?:string[];
  requireVerifiedEmail?:boolean;aiPerIpPerMinute?:number;aiPerUserPerMinute?:number;ready?:()=>Promise<boolean>;log?:(entry:{event:'http';method:string;path:string;status:number;durationMs:number})=>void};
const MAX_BODY=4_000_000;
const MAX_DOCUMENT_BODY=10_500_000;
const MAX_EVENTS_BODY=64_000;
const USAGE_STATUS={RATE_LIMITED:429,BUDGET_EXCEEDED:402,IN_PROGRESS:409,IDEMPOTENCY_CONFLICT:409} as const;

async function readJson(req:IncomingMessage,maxBytes=MAX_BODY):Promise<unknown>{
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req){
    size+=(chunk as Buffer).length;
    if(size>maxBytes)throw new AssistError('PAYLOAD_TOO_LARGE',`El pedido supera ${Math.floor(maxBytes/1_000_000)} MB.`,413);
    chunks.push(chunk as Buffer);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AssistError('INVALID_JSON','El cuerpo del pedido no es JSON válido.',400);}
}
const sameToken=(given:string,expected:string)=>given.length===expected.length&&timingSafeEqual(Buffer.from(given),Buffer.from(expected));
const loopback=(address:string|undefined)=>address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';
function cookie(req:IncomingMessage,name:string){
  const value=String(req.headers.cookie??'').split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='));
  if(!value)return undefined;
  try{return decodeURIComponent(value.slice(name.length+1));}catch{return undefined;}
}
/** IP del cliente para límites de frecuencia. Sólo se confía en X-Forwarded-For si el despliegue lo declara. */
function clientIp(req:IncomingMessage,trustProxy=false){
  const forwarded=trustProxy?String(req.headers['x-forwarded-for']??'').split(',').map(part=>part.trim()).filter(Boolean).at(-1):undefined;
  return forwarded??req.socket.remoteAddress??'unknown';
}
const sessionCookie=(token:string,secure:boolean,maxAge:number)=>`diagramia_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;
const flowCookie=(token:string,secure:boolean,maxAge:number)=>`diagramia_oidc_flow=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;

/**
 * Gateway de inferencia. Las claves de proveedores viven sólo en este proceso. Pensado para escuchar en loopback;
 * fuera de loopback exige token. Las rutas de documentos requieren además un token sólo del servidor.
 * Con OIDC configurado, las rutas de cuenta aíslan documentos por proyecto.
 */
export function createApp(options:AppOptions):Server{
  const system=systemPrompt(options.productPrompt),eventLimiter=new RateLimiter(options.eventsPerMinute??60,60_000);
  const aiPerIp=new RateLimiter(options.aiPerIpPerMinute??20,60_000),aiPerUser=new RateLimiter(options.aiPerUserPerMinute??6,60_000);
  // La telemetría nunca rompe el producto: un fallo al registrar queda en el log sin datos del pedido.
  const record=(event:ServerEvent,userId:string|null)=>{void options.telemetry?.record(event,userId).catch(error=>console.error('[telemetry] no se registró',event.name+':',error instanceof Error?error.name:'error'));};
  return createServer(async(req:IncomingMessage,res:ServerResponse)=>{
    const started=Date.now();let route='unknown';
    const origin=req.headers.origin,allowed=!origin||options.allowedOrigins.includes(origin);
    const send=(status:number,body:unknown)=>{
      if(res.writableEnded||res.destroyed)return;
      res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(origin&&allowed?{'access-control-allow-origin':origin,'access-control-allow-credentials':'true',vary:'Origin'}:{})});
      res.end(JSON.stringify(body));
      options.log?.({event:'http',method:req.method??'UNKNOWN',path:route,status,durationMs:Date.now()-started});
    };
    const fail=(status:number,code:string,message:string)=>send(status,{error:{code,message}});
    try{
      const path=new URL(req.url??'/','http://gateway').pathname;route=path;
      if(options.remoteMcp&&(path==='/mcp'||path===options.remoteMcp.metadataPath)){
        if(!options.remoteMcp.matchesHost(req))return fail(403,'MCP_ORIGIN_DENIED','Host u origen MCP no autorizado.');
        if(path===options.remoteMcp.metadataPath){
          if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS'});return void res.end();}
          if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED','Sólo se admite GET para metadatos OAuth.');
          res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'});
          return void res.end(JSON.stringify(options.remoteMcp.metadata()));
        }
        res.once('finish',()=>options.log?.({event:'http',method:req.method??'UNKNOWN',path,status:res.statusCode,durationMs:Date.now()-started}));
        await options.remoteMcp.handle(req,res);return;
      }
      if(!allowed)return fail(403,'ORIGIN_NOT_ALLOWED','Origen no autorizado para este gateway.');
      if(req.method==='OPTIONS'){
        res.writeHead(204,{'access-control-allow-origin':origin??'','access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST','access-control-allow-headers':'content-type,authorization,x-diagramia-client','access-control-max-age':'600',vary:'Origin'});
        return void res.end();
      }
      if(path==='/health'&&req.method==='GET')return send(200,{status:'ok',schemaVersion:SCHEMA_VERSION});
      if(path==='/ready'&&req.method==='GET')return await options.ready?.()===false?fail(503,'NOT_READY','La base de documentos no responde.'):send(200,{status:'ready',schemaVersion:SCHEMA_VERSION});
      if(path==='/v1/auth/login'&&req.method==='GET'){
        if(!options.oidc||!options.accounts)return fail(503,'AUTH_UNAVAILABLE','Inicio de sesión no configurado.');
        let flow:Awaited<ReturnType<OidcAuthenticator['begin']>>;
        try{flow=await options.oidc.begin();}catch{return fail(503,'AUTH_UNAVAILABLE','No se pudo contactar al proveedor de identidad. Reintentá.');}
        const secure=options.oidc.redirectUri.protocol==='https:';
        res.writeHead(302,{location:flow.redirect.href,'set-cookie':flowCookie(flow.cookie,secure,600),'cache-control':'no-store'});return void res.end();
      }
      if(path==='/v1/auth/callback'&&req.method==='GET'){
        if(!options.oidc||!options.accounts)return fail(503,'AUTH_UNAVAILABLE','Inicio de sesión no configurado.');
        const callback=new URL(options.oidc.redirectUri);
        callback.search=new URL(req.url??'/','http://gateway').search;
        let identity:Awaited<ReturnType<OidcAuthenticator['finish']>>;
        try{identity=await options.oidc.finish(callback,cookie(req,'diagramia_oidc_flow'));}catch{return fail(400,'AUTH_FAILED','No se completó el inicio de sesión. Volvé a intentarlo.');}
        const {token,session,created}=await options.accounts.signIn(identity);
        record({name:created?'signup_completed':'signed_in',props:{provider:'oidc'}},session.userId);
        const secure=options.oidc.redirectUri.protocol==='https:';
        res.writeHead(302,{location:options.oidc.homeUrl.href,'set-cookie':[flowCookie('',secure,0),sessionCookie(token,secure,30*86_400)],'cache-control':'no-store'});return void res.end();
      }
      // El header propio obliga a un preflight CORS: una página ajena no puede disparar pedidos «simples» contra el gateway local.
      if(req.headers['x-diagramia-client']!=='editor')return fail(400,'MISSING_CLIENT_HEADER','Falta el header x-diagramia-client.');
      if(path==='/v1/events'&&req.method==='POST'){
        if(!options.telemetry)return fail(503,'TELEMETRY_UNAVAILABLE','La telemetría no está configurada en este gateway.');
        if(!eventLimiter.allow(clientIp(req,options.trustProxy)))return fail(429,'RATE_LIMITED','Demasiados envíos de eventos. Se reintenta más tarde.');
        const batch=TelemetryBatchSchema.parse(await readJson(req,MAX_EVENTS_BODY));
        const session=options.accounts?await options.accounts.readSession(cookie(req,'diagramia_session')):null;
        return send(202,await options.telemetry.ingest(batch,session?.userId??null));
      }
      if(path==='/v1/auth/status'&&req.method==='GET')return send(200,{configured:!!options.oidc&&!!options.accounts});
      if(path==='/v1/auth/me'&&req.method==='GET'){
        const session=await options.accounts?.readSession(cookie(req,'diagramia_session'));
        if(!session)return fail(401,'SESSION_REQUIRED','Iniciá sesión para usar la nube.');
        return send(200,{session,storage:await options.accounts!.storage(session.projectId),credits:await options.accounts!.creditUsage(session.userId)});
      }
      if(path==='/v1/auth/logout'&&req.method==='POST'){
        await options.accounts?.endSession(cookie(req,'diagramia_session'));
        res.setHeader('set-cookie',sessionCookie('',options.oidc?.redirectUri.protocol==='https:',0));
        return send(200,{signedOut:true});
      }
      if(path==='/v1/cloud/documents'||path.startsWith('/v1/cloud/documents/')||path==='/v1/cloud/usage'){
        if(!options.accounts||!options.documents)return fail(503,'CLOUD_UNAVAILABLE','La nube no está configurada.');
        const session=await options.accounts.readSession(cookie(req,'diagramia_session'));
        if(!session)return fail(401,'SESSION_REQUIRED','Iniciá sesión para usar la nube.');
        const repo=options.documents,projectId=session.projectId;
        if(path==='/v1/cloud/usage'&&req.method==='GET')return send(200,await options.accounts.storage(projectId));
        if(path==='/v1/cloud/documents'&&req.method==='GET')return send(200,{documents:await options.accounts.listDocuments(projectId)});
        if(path==='/v1/cloud/documents'&&req.method==='POST')return send(201,{document:await repo.createFrom(await readJson(req,MAX_DOCUMENT_BODY),session.userId,projectId)});
        const match=path.match(/^\/v1\/cloud\/documents\/([^/]+)(?:\/(batches|head|restore))?$/);
        if(!match)return fail(404,'NOT_FOUND','Ruta inexistente.');
        const [,id,part]=match;
        if(!await options.accounts.ownsDocument(projectId,id!))return fail(404,'NOT_FOUND','No existe el documento en este proyecto.');
        if(!part&&req.method==='GET')return send(200,{document:await repo.get(id!,projectId)});
        if(part==='head'&&req.method==='GET')return send(200,{revision:(await repo.get(id!,projectId)).revision});
        if(part==='batches'&&req.method==='POST')return send(200,await repo.apply(id!,await readJson(req),session.userId,projectId));
        if(part==='restore'&&req.method==='POST'){
          const input=z.strictObject({sourceRevision:z.number().int().nonnegative(),baseRevision:z.number().int().nonnegative(),operationId:z.string()}).parse(await readJson(req));
          return send(200,await repo.restore(id!,input.sourceRevision,input.baseRevision,input.operationId,session.userId,projectId));
        }
        return fail(404,'NOT_FOUND','Ruta inexistente.');
      }
      // Puente de desarrollo de un solo usuario. Nunca se habilita por defecto ni acepta conexiones fuera de loopback.
      // El token de documentos permanece en el proceso del servidor y no llega al navegador.
      if(path==='/v1/local/documents'||path.startsWith('/v1/local/documents/')){
        if(!options.localWorkspace||!options.documents||!loopback(req.socket.remoteAddress))return fail(503,'LOCAL_WORKSPACE_UNAVAILABLE','Espacio local compartido no disponible.');
        const repo=options.documents;
        if(path==='/v1/local/documents'&&req.method==='GET')return send(200,{documents:await repo.list()});
        if(path==='/v1/local/documents'&&req.method==='POST')return send(201,{document:await repo.createFrom(await readJson(req,MAX_DOCUMENT_BODY))});
        const match=path.match(/^\/v1\/local\/documents\/([^/]+)(?:\/(batches|head|restore))?$/);
        if(!match)return fail(404,'NOT_FOUND','Ruta inexistente.');
        const [,id,part]=match;
        if(!await repo.isLocal(id!))return fail(404,'NOT_FOUND','No existe el documento en el espacio local.');
        if(!part&&req.method==='GET')return send(200,{document:await repo.get(id!)});
        if(part==='head'&&req.method==='GET')return send(200,{revision:await repo.head(id!)});
        if(part==='batches'&&req.method==='POST')return send(200,await repo.apply(id!,await readJson(req)));
        if(part==='restore'&&req.method==='POST'){
          const input=z.strictObject({sourceRevision:z.number().int().nonnegative(),baseRevision:z.number().int().nonnegative(),operationId:z.string()}).parse(await readJson(req));
          return send(200,await repo.restore(id!,input.sourceRevision,input.baseRevision,input.operationId));
        }
        return fail(404,'NOT_FOUND','Ruta inexistente.');
      }
      if(path==='/v1/documents'||path.startsWith('/v1/documents/')){
        if(!options.documents||!options.documentToken)return fail(503,'DOCUMENTS_UNAVAILABLE','Repositorio de documentos no configurado.');
        if(!sameToken(String(req.headers.authorization??''),`Bearer ${options.documentToken}`))return fail(401,'UNAUTHORIZED','Token de documentos inválido o ausente.');
        const repo=options.documents;
        if(path==='/v1/documents'&&req.method==='POST'){
          const input=z.strictObject({id:z.string(),title:z.string()}).parse(await readJson(req));
          return send(201,{document:await repo.create(input.id,input.title)});
        }
        const match=path.match(/^\/v1\/documents\/([^/]+)(?:\/(batches|versions|audit|restore|head))?(?:\/(\d+))?$/);
        if(!match)return fail(404,'NOT_FOUND','Ruta inexistente.');
        const [,id,part,revision]=match;
        if(!part&&req.method==='GET')return send(200,{document:await repo.get(id!)});
        if(part==='head'&&req.method==='GET')return send(200,{revision:await repo.head(id!)});
        if(part==='batches'&&req.method==='POST')return send(200,await repo.apply(id!,await readJson(req)));
        if(part==='versions'&&req.method==='GET')return send(200,revision?{document:await repo.getVersion(id!,Number(revision))}:{versions:await repo.versions(id!)});
        if(part==='audit'&&req.method==='GET')return send(200,{events:await repo.audit(id!)});
        if(part==='restore'&&req.method==='POST'){
          const input=z.strictObject({sourceRevision:z.number().int().nonnegative(),baseRevision:z.number().int().nonnegative(),operationId:z.string()}).parse(await readJson(req));
          return send(200,await repo.restore(id!,input.sourceRevision,input.baseRevision,input.operationId));
        }
        return fail(404,'NOT_FOUND','Ruta inexistente.');
      }
      const session=options.accounts?await options.accounts.readSession(cookie(req,'diagramia_session')):null;
      if(options.token&&!session&&!sameToken(String(req.headers.authorization??''),`Bearer ${options.token}`))return fail(401,'UNAUTHORIZED','Token del gateway inválido o ausente.');
      if(path==='/v1/admin/dashboard'&&req.method==='GET'){
        if(!options.dashboard)return fail(503,'DASHBOARD_UNAVAILABLE','El dashboard necesita PostgreSQL con telemetría.');
        const admins=(options.adminEmails??[]).map(email=>email.toLowerCase());
        if(!session?.emailVerified||!session.email||!admins.includes(session.email.toLowerCase()))return fail(403,'ADMIN_ONLY','El dashboard es sólo para administradores.');
        const to=new URL(req.url??'/','http://gateway').searchParams.get('to');
        if(to!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(to))return fail(400,'INVALID_REQUEST','to debe ser una fecha AAAA-MM-DD.');
        return send(200,await options.dashboard.report(to??undefined));
      }
      if(options.accounts&&!session&&['/v1/providers','/v1/usage','/v1/assist'].includes(path))return fail(401,'SESSION_REQUIRED','Iniciá sesión para usar IA.');
      // Una cuenta sólo ve y usa los proveedores de su plan: los créditos Free no pagan un modelo más caro.
      const providers=session&&options.accountProviders?options.providers.filter(p=>options.accountProviders!.includes(p.info().id)):options.providers;
      if(path==='/v1/providers'&&req.method==='GET')return send(200,{modes:MODES,providers:providers.map(p=>p.info()),usage:options.ledger.summary(),credits:session?await options.accounts!.creditUsage(session.userId):null});
      if(path==='/v1/usage'&&req.method==='GET')return send(200,{...options.ledger.summary(),credits:session?await options.accounts!.creditUsage(session.userId):null});
      if(path==='/v1/assist'&&req.method==='POST'){
        const body=await readJson(req),abort=new AbortController(),started=Date.now();
        // Si el cliente corta la conexión antes de la respuesta, se cancela la llamada al proveedor.
        res.on('close',()=>{if(!res.writableEnded)abort.abort();});
        const meta=z.object({requestId:z.string().min(1).max(200),mode:z.enum(MODES),providerId:z.string().min(1).max(40)}).safeParse(body);
        // Cada pedido de IA queda medido con su resultado, tokens, costo y latencia (P7.2), con el requestId del cliente.
        const track=(outcome:{answer?:AssistAnswer;error?:unknown;refused?:boolean;blocked?:string})=>{
          if(!meta.success)return;
          const known=outcome.error instanceof AssistError||outcome.error instanceof UsageError||outcome.error instanceof CreditError?outcome.error:null;
          const failure=outcome.error instanceof AssistError?outcome.error:null,usage=outcome.answer?.usage??failure?.usage;
          const code=outcome.refused?'PROVIDER_NOT_IN_PLAN':outcome.blocked??(known?known.code:outcome.error?'UNEXPECTED':null);
          // Un requestId que no tiene forma de ID no se guarda: podría ser texto libre del cliente.
          record({name:'ai_request',props:{requestId:/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(meta.data.requestId)?meta.data.requestId:'invalid-id',mode:meta.data.mode,provider:meta.data.providerId.replace(/[^a-zA-Z0-9._-]/g,'_'),
            model:(outcome.answer?.model??failure?.model??'none').replace(/[^a-zA-Z0-9._:/-]/g,'_').slice(0,100),
            outcome:outcome.refused?'refused_by_plan':outcome.blocked?'blocked':outcome.answer?outcome.answer.kind:code==='CANCELLED'?'cancelled':'failed',
            errorCode:code&&/^[A-Z_]{1,40}$/.test(code)?code:code?'UNEXPECTED':null,
            inputTokens:usage?.inputTokens??0,cachedInputTokens:usage?.cachedInputTokens??0,outputTokens:usage?.outputTokens??0,costUsd:usage?.estimatedCostUsd??null,
            latencyMs:Math.min(3_600_000,Date.now()-started),calls:usage?.calls??0,repairs:Math.max(0,outcome.answer?.repairs??0),replayed:Boolean(outcome.answer?.replayed)}},session?.userId??null);
        };
        // Límites antes de cualquier reserva: por IP siempre, por cuenta si hay sesión. Un pedido rechazado no gasta créditos.
        if(!aiPerIp.allow(clientIp(req,options.trustProxy))||(session&&!aiPerUser.allow(session.userId))){
          track({blocked:'RATE_LIMITED'});return fail(429,'RATE_LIMITED','Demasiados pedidos seguidos. Esperá un minuto y volvé a intentar.');
        }
        if(session&&options.requireVerifiedEmail!==false&&!session.emailVerified){
          track({blocked:'EMAIL_NOT_VERIFIED'});return fail(403,'EMAIL_NOT_VERIFIED','Verificá tu email para usar la IA: revisá el correo de confirmación y volvé a iniciar sesión.');
        }
        try{
        if(session){
          const input=z.object({requestId:z.string().min(1).max(200),mode:z.enum(MODES),providerId:z.string().max(40)}).parse(body),credits=input.mode==='create'?2:1;
          if(!providers.some(p=>p.info().id===input.providerId)){track({refused:true});return fail(403,'PROVIDER_NOT_IN_PLAN',`El proveedor «${input.providerId}» no está incluido en tu plan.`);}
          const fingerprint=createHash('sha256').update(JSON.stringify(body)).digest('hex');
          const reservation=await options.accounts!.reserveCredits(session.userId,input.requestId,fingerprint,credits);
          if(reservation.replayed){const replay={...(reservation.replayed as AssistAnswer),replayed:true};track({answer:replay});return send(200,replay);}
          try{
            // El ledger del proceso es global: su ID interno incluye la cuenta para que dos usuarios
            // que elijan el mismo requestId nunca compartan una respuesta ni un recibo.
            const privateId='acct-'+createHash('sha256').update(session.userId+'\0'+input.requestId).digest('hex').slice(0,32);
            const answer=await assist({...body as object,requestId:privateId},{providers,ledger:options.ledger,config:options.config,system},abort.signal);
            const publicAnswer={...answer,requestId:input.requestId};
            await options.accounts!.settleCredits(session.userId,input.requestId,publicAnswer);
            track({answer:publicAnswer});return send(200,publicAnswer);
          }catch(error){await options.accounts!.releaseCredits(session.userId,input.requestId);throw error;}
        }
        const answer=await assist(body,{providers:options.providers,ledger:options.ledger,config:options.config,system},abort.signal);
        track({answer});return send(200,answer);
        }catch(error){track({error});throw error;}
      }
      return fail(404,'NOT_FOUND','Ruta inexistente.');
    }catch(error){
      if(error instanceof AssistError)return fail(error.status,error.code,error.message);
      if(error instanceof UsageError)return fail(USAGE_STATUS[error.code],error.code,error.message);
      if(error instanceof CreditError)return fail(error.code==='CREDIT_LIMIT'?429:409,error.code,error.message);
      if(error instanceof RepositoryError)return fail(error.code==='NOT_FOUND'?404:error.code==='CORRUPT_DOCUMENT'?500:409,error.code,error.message);
      if(error instanceof z.ZodError||error instanceof DiagramError)return fail(400,error instanceof DiagramError?error.code:'INVALID_REQUEST',describeError(error));
      // Sin stack traces ni datos del pedido en la respuesta ni en el log.
      console.error('[gateway] error inesperado:',error instanceof Error?error.name+': '+error.message:String(error));
      return fail(500,'INTERNAL','Error interno del gateway.');
    }
  });
}
