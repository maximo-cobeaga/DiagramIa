// Dashboard del fundador sobre PostgreSQL Docker efímero, con eventos sembrados cuyo resultado se calculó a mano.
// No toca la base de desarrollo. Requiere Docker: `npm run smoke:dashboard`.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {migrateDocuments} from '../apps/api/dist/repositories/postgres.js';
import {AccountRepository} from '../apps/api/dist/repositories/accounts.js';
import {TelemetryRepository} from '../apps/api/dist/repositories/telemetry.js';
import {FounderDashboard} from '../apps/api/dist/repositories/dashboard.js';
import {createApp} from '../apps/api/dist/server.js';
import {UsageLedger} from '../apps/api/dist/usage.js';

const compose=fileURLToPath(new URL('../infra/compose.dev.yml',import.meta.url));
const suffix=randomUUID().slice(0,8),project=`diagramia-dashboard-${suffix}`,password=`dashboard-${suffix}`;
const env={...process.env,DIAGRAMIA_DB_PORT:'0',DIAGRAMIA_DB_PASSWORD:password};
const docker=args=>execFileSync('docker',['compose','-f',compose,'-p',project,...args],{env,timeout:240_000,maxBuffer:8_000_000,stdio:['pipe','pipe','pipe']});
const context={app:'editor',appVersion:'smoke',utmSource:null,utmMedium:null,utmCampaign:null,referrerHost:null,landingPath:'/',device:'desktop',browser:'chrome',os:'linux',language:'es',viewport:{width:1280,height:800}};
const root=fileURLToPath(new URL('../',import.meta.url)),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browserExe=[process.env.BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync);
let pool,failure=null,server,vite,browser,socket,profile;
try{
  docker(['up','-d','--wait','--wait-timeout','120','db']);
  const port=Number(docker(['port','db','5432']).toString().trim().match(/:(\d+)$/)?.[1]);
  pool=new pg.Pool({host:'127.0.0.1',port,user:'diagramia',database:'diagramia',password,max:5});
  await migrateDocuments(pool);
  const accounts=new AccountRepository(pool),ana=await accounts.signIn({issuer:'https://oidc.example',subject:'ana',email:'ana@example.test'}),userA=ana.session.userId;
  // Cada visitante envía sus eventos el día en que ocurren, como haría el navegador.
  const visit=async(anonymousId,at,events,userId=null)=>{
    const repo=new TelemetryRepository(pool,()=>new Date(at));
    await repo.ingest({v:1,anonymousId,sessionId:randomUUID(),context,events:events.map(([name,props,time])=>({id:randomUUID(),name,at:time??at,props}))},userId);
  };
  const [a,b,c,d,e]=Array.from({length:5},()=>randomUUID());
  // Semana actual (08–14/10): A llega por la landing, crea, exporta a los 10 min, se registra y aplica una propuesta de IA.
  await visit(a,'2026-10-08T10:00:00Z',[['landing_view',{}],['board_opened',{returning:false,fromLanding:true}],['first_element_created',{},'2026-10-08T10:02:00Z'],
    ['useful_diagram_created',{reason:'exported',nodes:3,edges:2},'2026-10-08T10:10:00Z'],['ai_proposal_applied',{requestId:'req-a',mode:'create',actions:6},'2026-10-08T10:20:00Z'],
    ['ai_feedback',{requestId:'req-a',rating:'up',reason:null},'2026-10-08T10:21:00Z']],userA);
  const serverEvents=new TelemetryRepository(pool,()=>new Date('2026-10-08T10:15:00Z'));
  await serverEvents.record({name:'signup_completed',props:{provider:'oidc'}},userA);
  await serverEvents.record({name:'ai_request',props:{requestId:'req-a',mode:'create',provider:'openai',model:'gpt-6-luna',outcome:'proposal',errorCode:null,inputTokens:6000,cachedInputTokens:0,outputTokens:1500,costUsd:0.002,latencyMs:3000,calls:1,repairs:0,replayed:false}},userA);
  await serverEvents.record({name:'ai_request',props:{requestId:'req-x',mode:'edit',provider:'openai',model:'none',outcome:'blocked',errorCode:'RATE_LIMITED',inputTokens:0,cachedInputTokens:0,outputTokens:0,costUsd:null,latencyMs:1,calls:0,repairs:0,replayed:false}},userA);
  // B mira la landing y se va. C entra directo, llega a un diagrama útil a los 30 min y deja un 👎.
  await visit(b,'2026-10-09T09:00:00Z',[['landing_view',{}]]);
  await visit(c,'2026-10-09T12:00:00Z',[['board_opened',{returning:false,fromLanding:false}],['first_element_created',{},'2026-10-09T12:05:00Z'],
    ['useful_diagram_created',{reason:'saved_cloud',nodes:4,edges:3},'2026-10-09T12:30:00Z'],['ai_feedback',{requestId:'req-c',rating:'down',reason:'bad_layout'},'2026-10-09T12:31:00Z']]);
  // Semana anterior: D llega el 02/10 y vuelve el día 7 (09/10); E llega el 03/10 y vuelve el 05/10, no el día 7.
  await visit(d,'2026-10-02T15:00:00Z',[['board_opened',{returning:false,fromLanding:false}]]);
  await visit(d,'2026-10-09T15:00:00Z',[['board_opened',{returning:true,fromLanding:false}]]);
  await visit(e,'2026-10-03T15:00:00Z',[['board_opened',{returning:false,fromLanding:false}]]);
  await visit(e,'2026-10-05T15:00:00Z',[['undo',{}]]);

  const dashboard=new FounderDashboard(pool,()=>new Date('2026-10-14T20:00:00Z'));
  const report=await dashboard.report(),value=id=>report.indicators.find(i=>i.id===id);
  const expected={north_star:[0.5,0],landing_to_canvas:[0.5,null],canvas_to_first_element:[1,0],signup_conversion:[0.5,0],ttfv:[20,null],
    first_useful:[0.5,0],ai_adoption:[0.25,0],ai_acceptance:[1,null],d7_retention:[0.5,null],negative_feedback:[0.5,null]};
  for(const [id,[now,before]] of Object.entries(expected)){
    const indicator=value(id);assert.ok(indicator,`falta el indicador ${id}`);
    assert.deepEqual([indicator.value,indicator.previous],[now,before],`${id}: ${JSON.stringify(indicator)}`);
  }
  assert.equal(report.indicators.length,10);
  assert.deepEqual([report.wau,report.previousWau],[4,2]);
  assert.deepEqual(report.cost,{aiUsd:0.002,previousAiUsd:0,perActiveUser:0.0005,aiRequests:1,blocked:1,failed:0});
  // Recalcular no duplica: un registro por día y los mismos números.
  const again=await dashboard.report();
  assert.deepEqual(again.indicators,report.indicators);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM telemetry_daily')).rows[0].n,28);
  // Vista #fundador en Chrome real con sesión de administradora; otra cuenta recibe 403. Capturas en state/smoke/.
  if(!browserExe)console.log('Vista del panel OMITIDA: no hay Chrome/Edge.');
  else{
    const editorPort=5600+Math.floor(Math.random()*300),debugPort=9800+Math.floor(Math.random()*150),origin=`http://127.0.0.1:${editorPort}`;
    const bob=await accounts.signIn({issuer:'https://oidc.example',subject:'bob',email:'bob@example.test'});
    server=createApp({providers:[],ledger:new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null}),productPrompt:'p',token:null,allowedOrigins:[origin],accounts,
      dashboard,adminEmails:['ANA@example.test'],config:{maxOutputTokens:10,maxContextChars:10,maxRepairs:0,timeoutMs:1000}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const api=`http://127.0.0.1:${server.address().port}`,as=token=>({'x-diagramia-client':'editor',cookie:`diagramia_session=${token}`});
    assert.equal((await fetch(api+'/v1/admin/dashboard',{headers:as(bob.token)})).status,403,'una cuenta que no es administradora no ve el panel');
    assert.equal((await fetch(api+'/v1/admin/dashboard',{headers:{'x-diagramia-client':'editor'}})).status,403,'sin sesión no hay panel');
    vite=spawn(process.execPath,[join(root,'apps/editor/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(editorPort),'--strictPort'],{cwd:join(root,'apps/editor'),env:{...process.env,DIAGRAMIA_API_URL:api},stdio:'ignore'});
    let ready=false;for(let i=0;i<80&&!ready;i++){try{ready=(await fetch(origin)).ok;}catch{}if(!ready)await sleep(250);}assert.ok(ready,'Vite no inició');
    profile=mkdtempSync(join(tmpdir(),'diagramia-founder-'));
    browser=spawn(browserExe,['--headless=new',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','--window-size=1440,900','about:blank'],{stdio:'ignore'});
    let ws;for(let i=0;i<80&&!ws;i++){try{ws=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;}catch{}if(!ws)await sleep(250);}assert.ok(ws,'Chrome no inició');
    socket=new WebSocket(ws);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let sequence=0;const pending=new Map();socket.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const wait=pending.get(msg.id);pending.delete(msg.id);msg.error?wait.reject(new Error(msg.error.message)):wait.resolve(msg.result);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const js=async expression=>{const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.text);return value.result.value;};
    const shot=async name=>{mkdirSync(join(root,'state/smoke'),{recursive:true});writeFileSync(join(root,'state/smoke',name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));};
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
    await send('Network.setCookie',{name:'diagramia_session',value:ana.token,url:origin});
    await send('Page.navigate',{url:origin+'/#fundador'});
    let tiles=0;for(let i=0;i<60&&tiles<9;i++){await sleep(250);tiles=await js("document.querySelectorAll('.founder-tile').length");}
    assert.equal(tiles,11,'9 indicadores más costo y fricción');
    const hero=await js("document.querySelector('.founder-hero strong').textContent");assert.equal(hero,'0.50');
    const text=await js('document.body.innerText');
    for(const shown of ['50 %','20 min','Sin comparación','▲ 50.0 pp','USD 0.0020'])assert.ok(text.includes(shown),`la vista no muestra «${shown}»`);
    assert.equal(await js('document.documentElement.scrollWidth<=window.innerWidth'),true,'sin desborde horizontal en escritorio');
    await shot('17-founder-dashboard');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(400);
    assert.equal(await js('document.documentElement.scrollWidth<=window.innerWidth'),true,'sin desborde horizontal en móvil (la tabla se desplaza dentro de su caja)');
    await shot('17-founder-dashboard-mobile');
    console.log('Vista #fundador: indicadores visibles para la administradora, 403 para otras cuentas, sin desborde en escritorio ni móvil.');
  }
  console.log(`Dashboard: 10 indicadores coinciden con los valores calculados a mano (WAU ${report.wau}, D7 ${value('d7_retention').value}, TTFV ${value('ttfv').value} min); agregados idempotentes.`);
}catch(error){failure=error;}
finally{
  try{socket?.close();}catch{}
  for(const child of [browser,vite])if(child){child.kill();await sleep(200);}
  if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
  if(profile)try{rmSync(profile,{recursive:true,force:true});}catch{}
  await pool?.end();
  try{docker(['down','--volumes','--remove-orphans']);}catch(error){failure??=error;}
}
if(failure)throw failure;
