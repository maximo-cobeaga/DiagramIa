// Editor ↔ PostgreSQL ↔ MCP sobre una base Docker aislada. No toca los documentos del usuario.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {createApp} from '../apps/api/dist/server.js';
import {UsageLedger} from '../apps/api/dist/usage.js';
import {migrateDocuments,PostgresDocumentRepository} from '../apps/api/dist/repositories/postgres.js';
import {AccountRepository} from '../apps/api/dist/repositories/accounts.js';
import {TelemetryRepository} from '../apps/api/dist/repositories/telemetry.js';
import {BillingRepository} from '../apps/api/dist/repositories/billing.js';

const root=fileURLToPath(new URL('../',import.meta.url)),compose=join(root,'infra/compose.dev.yml');
const suffix=randomUUID().slice(0,8),project=`diagramia-shared-${suffix}`,password=`shared-${suffix}`;
const env={...process.env,DIAGRAMIA_DB_PORT:'0',DIAGRAMIA_DB_PASSWORD:password};
const docker=(args)=>execFileSync('docker',['compose','-f',compose,'-p',project,...args],{env,timeout:240_000,maxBuffer:8_000_000});
const browserExe=[process.env.BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync);
if(!browserExe)throw new Error('Chrome/Edge no está disponible para smoke compartido.');
const editorPort=5300+Math.floor(Math.random()*300),debugPort=9500+Math.floor(Math.random()*300),profile=mkdtempSync(join(tmpdir(),'diagramia-shared-'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let pool,server,vite,browser,socket,failure;
try{
  docker(['up','-d','--wait','--wait-timeout','120','db']);
  const address=docker(['port','db','5432']).toString().trim(),dbPort=Number(address.match(/:(\d+)$/)?.[1]);
  pool=new pg.Pool({host:'127.0.0.1',port:dbPort,user:'diagramia',database:'diagramia',password,max:5});
  await migrateDocuments(pool);
  const repo=new PostgresDocumentRepository(pool),accounts=new AccountRepository(pool),alice=await accounts.signIn({issuer:'https://test.example',subject:'alice',email:'alice@example.test',emailVerified:true}),origin=`http://127.0.0.1:${editorPort}`;
  server=createApp({providers:[],ledger:new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null}),productPrompt:'Prueba',token:null,allowedOrigins:[origin],documents:repo,documentToken:'shared-test-token',accounts,telemetry:new TelemetryRepository(pool),billing:{repository:new BillingRepository(pool),paddle:{env:'sandbox',apiKey:'pdl_sdbx_smoke',webhookSecret:'smoke',priceId:'pri_smoke',clientToken:'test_0123456789abcdef0123456789',checkoutUrl:origin+'/pago.html'},prices:{monthlyUsd:10,yearlyUsd:null}},oidc:{redirectUri:new URL(origin+'/api/v1/auth/callback')},config:{maxOutputTokens:1000,maxContextChars:1000,maxRepairs:0,timeoutMs:1000}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const apiOrigin=`http://127.0.0.1:${server.address().port}`;
  vite=spawn(process.execPath,[join(root,'apps/editor/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(editorPort),'--strictPort'],{cwd:join(root,'apps/editor'),env:{...process.env,DIAGRAMIA_API_URL:apiOrigin},stdio:'ignore'});
  let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(origin)).ok;if(ready)break;}catch{}await sleep(250);}assert.ok(ready,'Vite no inició');
  // La sonda representa a una persona: sin estas dos marcas, el editor y el gateway la descartan como navegador automatizado y no hay telemetría que comprobar.
  browser=spawn(browserExe,['--headless=new','--lang=es-AR','--disable-blink-features=AutomationControlled','--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','--window-size=1440,900','about:blank'],{stdio:'ignore'});
  let ws;for(let i=0;i<80;i++){try{const pages=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();ws=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;if(ws)break;}catch{}await sleep(250);}assert.ok(ws,'Chrome no inició');
  socket=new WebSocket(ws);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let sequence=0;const pending=new Map();socket.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const wait=pending.get(msg.id);pending.delete(msg.id);msg.error?wait.reject(new Error(msg.error.message)):wait.resolve(msg.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const js=async expression=>{const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.text);return value.result.value;};
  const until=async(fn,label)=>{for(let i=0;i<50;i++){const value=await fn();if(value)return value;await sleep(250);}throw new Error(`Timeout: ${label}`);};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Network.setCookie',{name:'diagramia_session',value:alice.token,url:origin});
  await send('Page.navigate',{url:origin});await sleep(800);
  await js("localStorage.clear();localStorage.setItem('diagramia.tutorial.seen','1')");await send('Page.reload');await sleep(1000);
  await js("document.querySelector('.account-chip').click()");
  await until(()=>js("!!document.querySelector('.account-page[open]')"),'cuenta completa');
  assert.ok(await js("document.querySelector('.app').inert"),'el canvas debe quedar inerte');
  assert.equal(await js("[...document.querySelectorAll('.tabs button')].some(b=>b.textContent.trim()==='Cuenta')"),false,'Cuenta salió del lateral');
  assert.equal(await js("document.body.textContent.includes('Compartir esta pestaña')"),false,'sin controles locales');
  mkdirSync('evidencias',{recursive:true});
  const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join('evidencias',name+'.png'),Buffer.from(data,'base64'));};
  await shot('ui-cuenta-saas');
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.getAttribute('aria-label')==='Mis diagramas').click()");
  assert.ok(await js("!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Guardar el diagrama abierto en la nube'))"),'aparece el guardado cloud');
  // Abrimos un ejemplo complejo real antes de guardar, sin modificar los ejemplos del usuario.
  await js("document.querySelector('.account-page header button').click();document.querySelector('[aria-label=\"Cargar ejemplo\"]').value='0';document.querySelector('[aria-label=\"Cargar ejemplo\"]').dispatchEvent(new Event('change',{bubbles:true}))");await sleep(600);
  await js("document.querySelector('.account-chip').click()");await sleep(300);
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.getAttribute('aria-label')==='Mis diagramas').click()");await sleep(150);
  await js("[...document.querySelectorAll('.account-page button')].find(b=>b.textContent.includes('Guardar el diagrama abierto en la nube')).click()");
  await until(()=>js("document.querySelector('.account-page')?.textContent.includes('Guardado en tu nube')"),'documento cloud');
  await js("document.querySelector('.account-page header button').click()");
  const saved=async()=>{await sleep(450);return js("JSON.parse(localStorage.getItem('diagramia.doc.'+JSON.parse(localStorage.getItem('diagramia.workspace')).active))");};
  const initial=await saved(),remote={load:()=>repo.get(initial.id,alice.session.projectId),apply:async batch=>(await repo.apply(initial.id,batch,'remote-agent',alice.session.projectId)).document};
  assert.equal((await remote.load()).revision,initial.revision);
  await remote.apply({id:'mcp-title',baseRevision:initial.revision,actions:[{type:'UPDATE_DOCUMENT',changes:{title:'Editado por MCP'}}]});
  await until(async()=>(await saved())?.title==='Editado por MCP','cambio MCP visible en editor');
  const before=await remote.load(),node=before.nodes.find(n=>n.id==='user');assert.ok(node);
  const box=await js("(()=>{const r=document.querySelector('[data-id=\"user\"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',buttons:1,clickCount:1});
  for(let i=1;i<=6;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+i*5,y:box.y,button:'left',buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+30,y:box.y,button:'left',buttons:0,clickCount:1});
  await until(async()=>(await remote.load()).revision>before.revision,'edición UI visible en MCP');
  const moved=await remote.load();assert.ok(moved.nodes.find(n=>n.id==='user').position.x>node.position.x,'la acción UI no movió el nodo');
  await until(()=>js("document.querySelector('.save-state').textContent.includes('✓ Nube')"),'confirmación de guardado antes de undo');
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
  await until(async()=>(await remote.load()).revision>moved.revision,'undo durable');
  assert.equal((await remote.load()).nodes.find(n=>n.id==='user').position.x,node.position.x);
  assert.equal((await accounts.listDocuments(alice.session.projectId)).length,1);
  assert.equal((await repo.get(initial.id,alice.session.projectId)).revision,(await saved()).revision);
  const cloudBefore=await repo.get(initial.id,alice.session.projectId);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',buttons:0,clickCount:1});
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await until(async()=>(await repo.get(initial.id,alice.session.projectId)).revision>cloudBefore.revision,'edición UI guardada en cuenta');
  assert.ok((await repo.get(initial.id,alice.session.projectId)).nodes.find(n=>n.id==='user').position.x>node.position.x);
  const beforeReload=await repo.get(initial.id,alice.session.projectId);
  await send('Page.reload');await sleep(950);
  await until(()=>js("document.querySelector('.save-state')?.textContent.includes('Nube')"),'reconexión tras recargar');
  assert.equal((await saved()).revision,beforeReload.revision);
  // La cuenta encierra el foco y los atajos; Escape devuelve al editor sin tocar contenido ni revisión.
  await js("document.querySelector('.account-chip').focus();document.querySelector('.account-chip').click()");await sleep(300);
  const accountBefore=JSON.stringify(await saved());
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
  assert.equal(JSON.stringify(await saved()),accountBefore,'Delete en Cuenta no borra la selección');
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.getAttribute('aria-label')==='Plan y facturación').click()");await sleep(200);
  assert.ok(await js("document.querySelector('.account-page').textContent.includes('400 créditos')"),'beneficios de Pro visibles');
  assert.equal(await js("document.querySelectorAll('.plan-comparison tbody tr').length"),6);
  await shot('ui-cuenta-plan');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);
  assert.ok(await js("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.account-body main').scrollWidth<=document.querySelector('.account-body main').clientWidth"),'cuenta móvil sin desborde');await shot('ui-cuenta-saas-movil');
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(150);
  assert.equal(await js("!!document.querySelector('.account-page')"),false);
  assert.ok(await js("document.activeElement.matches('.account-chip')"),'el foco vuelve a Cuenta');
  await send('Page.navigate',{url:origin+'/?plan=pro'});
  await until(()=>js("document.querySelector('.account-page')?.textContent.includes('Plan y facturación')&&document.querySelector('.account-page nav button[aria-current=page]')?.getAttribute('aria-label')==='Plan y facturación'"),'intención Pro desde landing');
  assert.equal(await js("new URL(location.href).searchParams.has('plan')"),false,'la intención se consume');
  // Vuelta de la página de pago sin pagar: se dice que no hubo cobro, se muestra el plan y el parámetro no queda en la URL.
  await send('Page.navigate',{url:origin+'/?pro=cancel'});
  await until(()=>js("document.querySelector('.account-page nav button[aria-current=page]')?.getAttribute('aria-label')==='Plan y facturación'&&!new URL(location.href).searchParams.has('pro')"),'vuelta del pago cancelado');
  assert.ok(await js("document.body.textContent.includes('No se hizo ningún cobro')"),'cancelar el pago lo dice con claridad');
  // La página de pago propia rechaza un enlace sin transacción válida y no carga nada de terceros.
  await send('Page.navigate',{url:origin+'/pago.html?_ptxn=<script>'});
  await until(()=>js("document.getElementById('status')?.dataset.tone==='warn'"),'enlace de pago inválido');
  assert.equal(await js("document.querySelectorAll('script[src*=paddle]').length"),0,'sin transacción válida no se carga Paddle.js');
  await send('Page.navigate',{url:origin+'/'});await until(()=>js("!!document.querySelector('.account-chip')"),'volver al editor');
  await js("document.querySelector('.account-chip').click()");await until(()=>js("!!document.querySelector('.account-page')"),'cuenta abierta');
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.getAttribute('aria-label')==='Configuración').click()");await sleep(150);
  assert.ok(await js("document.querySelector('.account-page').textContent.includes('Cerrar sesión')"),'configuración disponible');
  for(let i=0;i<12;i++){await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.ok(await js("!!document.activeElement.closest('.account-page')"),'el foco no escapa de Cuenta, Tab '+i);}
  const beforePreferences=JSON.stringify(await saved());
  await js("document.querySelector('[aria-label=\"Vista del catálogo\"]').value='grid';document.querySelector('[aria-label=\"Vista del catálogo\"]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelectorAll('.setting-switch')[0].click();document.querySelectorAll('.setting-switch')[2].click();document.querySelector('input[name=editor-theme][value=dark]').click()");
  assert.equal(await js("document.documentElement.dataset.motion"),'reduce');
  assert.equal(await js("document.documentElement.dataset.theme"),'dark');
  assert.equal(JSON.stringify(await saved()),beforePreferences,'las preferencias no cambian el documento');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await shot('ui-ajustes-dark');
  // La marca distingue la página recargada de la anterior, que todavía responde un instante después de pedir la recarga.
  await js("window.__beforeReload=true");await send('Page.reload');await until(()=>js("!window.__beforeReload&&!!document.querySelector('.canvas')"),'preferencias después de recarga');
  assert.equal(await js("document.documentElement.dataset.theme"),'dark');
  assert.equal(await js("document.querySelectorAll('[data-canvas-grid]').length"),0,'cuadrícula oculta después de recarga');
  assert.ok(await js("!!document.querySelector('.palette.catalog-grid')"),'vista de catálogo persistida');
  await js("document.querySelector('[aria-label=\"Configuración del editor\"]').click()");await sleep(150);
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Restablecer preferencias').click()");await shot('ui-ajustes-light');
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  // Cobro vencido: la cuenta usa Free, pero la suscripción sigue viva en Paddle y tiene que poder ponerse al día o cancelarse desde acá.
  assert.equal(await new BillingRepository(pool).apply({eventId:`evt-due-${suffix}`,occurredAt:new Date(),userId:alice.session.userId,providerCustomerId:'ctm_smoke',providerSubscriptionId:'sub_smoke_due',priceId:'pri_smoke',status:'past_due',currentPeriodEnd:null,scheduledCancelAt:null,updatePaymentUrl:'https://pay.example/update',cancelUrl:'https://pay.example/cancel'},'subscription.past_due'),'applied');
  await send('Page.reload');await until(()=>js("!!document.querySelector('.account-chip')"),'editor tras el cobro vencido');
  await js("document.querySelector('.account-chip').click()");await until(()=>js("!!document.querySelector('.account-page')"),'cuenta con cobro vencido');
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.getAttribute('aria-label')==='Plan y facturación').click()");
  await until(()=>js("document.querySelector('.plan-box')?.textContent.includes('No pudimos cobrar tu suscripción')"),'aviso de cobro vencido');
  assert.deepEqual(await js("[...document.querySelectorAll('.plan-box .subscription-status a')].map(a=>[a.textContent,a.href,a.rel])"),[['Cambiar medio de pago','https://pay.example/update','noopener noreferrer'],['Cancelar suscripción','https://pay.example/cancel','noopener noreferrer']],'con el cobro vencido se puede cambiar el medio de pago o cancelar');
  assert.equal(await js("document.querySelector('.plan-box').getAttribute('aria-label')"),'Plan Free');
  await shot('ui-cuenta-cobro-vencido');
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(150);
  // Guardado en la nube a la vista, por pestaña y automático (ADR 103). Los ejemplos se abren cada uno en su pestaña.
  const cloudDocs=async()=>(await accounts.listDocuments(alice.session.projectId)).length,saveState=()=>js("document.querySelector('.save-state')?.textContent??''");
  const example=async n=>{await js(`(()=>{const s=document.querySelector('[aria-label="Cargar ejemplo"]');s.value='${n}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(500);};
  const tab=async n=>{await js(`document.querySelectorAll('.doc-tab [role=tab]')[${n}].click()`);await sleep(200);};
  const nudge=async selector=>{
    const at=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:at.x,y:at.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:at.x,y:at.y,button:'left',buttons:0,clickCount:1});
    await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  };
  const autosave=async()=>{
    await js("document.querySelector('[aria-label=\"Configuración del editor\"]').click()");await until(()=>js("!!document.querySelector('[aria-label=\"Guardar automáticamente en la nube\"]')"),'preferencia de guardado automático');
    await js("document.querySelector('[aria-label=\"Guardar automáticamente en la nube\"]').click()");
    await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(200);
  };
  assert.ok((await saveState()).includes('Nube'),'la pestaña del diagrama guardado está a la vista');
  assert.equal(await js("!!document.querySelector('.cloud-save')"),false,'un diagrama que ya está en la nube no ofrece guardarlo de nuevo');
  await example(1);
  assert.ok((await saveState()).includes('Guardado en este navegador'),'un diagrama nuevo empieza sólo en el navegador');
  assert.equal(await js("document.querySelector('.cloud-save')?.textContent"),'☁ Guardar en la nube','el guardado en la nube está en la cabecera');
  assert.ok(await js("document.querySelector('header').scrollWidth<=document.querySelector('header').clientWidth"),'la cabecera no desborda con el botón nuevo');await shot('ui-guardar-en-la-nube');
  await js("document.querySelector('.cloud-save').click()");
  await until(async()=>(await saveState()).includes('✓ Nube'),'guardado desde la cabecera');
  assert.equal(await cloudDocs(),2);assert.equal(await js("!!document.querySelector('.cloud-save')"),false);
  const second=await saved(),revisionOf=async id=>(await repo.get(id,alice.session.projectId)).revision;
  // Cada pestaña conserva su nube: volver a la primera no la deja sólo en el navegador, y las dos siguen guardando.
  await tab(1);await until(async()=>(await saveState()).includes('✓ Nube'),'la primera pestaña retoma su nube');
  const firstRevision=await revisionOf(initial.id);await nudge('[data-id="user"]');
  await until(async()=>await revisionOf(initial.id)>firstRevision,'la primera pestaña sigue guardando');
  await tab(2);await until(async()=>(await saveState()).includes('✓ Nube'),'la segunda pestaña retoma su nube');
  const secondRevision=await revisionOf(second.id);await nudge('.canvas .graph-node');
  await until(async()=>await revisionOf(second.id)>secondRevision,'la segunda pestaña sigue guardando');
  assert.equal(await revisionOf(initial.id),firstRevision+1,'guardar una pestaña no toca el documento de la otra');
  await send('Page.reload');await until(async()=>(await saveState())?.includes('✓ Nube'),'la segunda pestaña sigue en la nube tras recargar');
  assert.equal((await saved()).revision,await revisionOf(second.id));
  await tab(1);await until(async()=>(await saveState()).includes('✓ Nube'),'la primera pestaña sigue en la nube tras recargar');
  // Enlace para compartir (ADR 106): se crea a pedido, abre sin sesión en sólo lectura y deja de abrir al cortarlo.
  const shareTokenInDb=async()=>(await accounts.listDocuments(alice.session.projectId)).find(item=>item.id===initial.id).shareToken;
  const press=(scope,text)=>js(`[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  const offers=text=>js(`[...document.querySelectorAll('.share-dialog button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`);
  assert.equal(await js("document.querySelector('.share-open')?.textContent"),'🔗 Compartir','compartir está en la cabecera');
  assert.ok(await js("document.querySelector('header').scrollWidth<=document.querySelector('header').clientWidth"),'la cabecera no desborda con Compartir');
  await js("document.querySelector('.share-open').click()");
  await until(()=>offers('Crear enlace'),'diálogo de compartir');
  assert.equal(await shareTokenInDb(),null,'abrir el diálogo no publica nada');
  assert.ok(await js("document.querySelector('.app').inert"),'el editor queda inerte detrás del diálogo');
  const beforeShare=JSON.stringify(await saved());
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Delete',code:'Delete',windowsVirtualKeyCode:46});
  assert.equal(JSON.stringify(await saved()),beforeShare,'los atajos del editor no actúan con el diálogo abierto');
  await press('.share-dialog','Crear enlace');
  const link=await until(()=>js("document.querySelector('#share-link')?.value"),'enlace creado'),shareToken=await shareTokenInDb();
  assert.match(shareToken,/^[A-Za-z0-9_-]{20,64}$/);assert.equal(link,`${origin}/s/${shareToken}`,'el enlace que se muestra es el que guardó el servidor');
  await shot('ui-compartir-enlace');
  const sharedDoc=await saved();
  // El editor envía lo que tenía medido al irse: se espera a que llegue con la sesión antes de quitarla para mirar el enlace como un tercero.
  await send('Page.navigate',{url:'about:blank'});
  await until(async()=>(await pool.query("SELECT 1 FROM telemetry_events WHERE name='share_link_created'")).rowCount>0,'eventos del editor enviados con sesión');
  await send('Network.deleteCookies',{name:'diagramia_session',url:origin});
  await send('Page.navigate',{url:link});
  await until(()=>js("document.querySelectorAll('.shared-view .presentation-stage .graph-node').length>0"),'diagrama compartido a la vista sin sesión');
  assert.equal(await js("document.querySelectorAll('.shared-view .presentation-stage .graph-node').length"),sharedDoc.nodes.length,'se dibujan todos los nodos del diagrama');
  assert.equal(await js("document.querySelector('.shared-head strong').textContent"),sharedDoc.title);
  assert.equal(await js("document.title"),`${sharedDoc.title} · Diagramia`);
  assert.equal(await js("!!document.querySelector('.app')||!!document.querySelector('.tools')||!!document.querySelector('.doc-tabs')"),false,'la página compartida no monta el editor');
  assert.equal(await js("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Salir'))"),false,'no hay editor al que salir');
  assert.ok(await js("document.querySelector('.shared-brand').textContent.includes('Hecho con')&&document.querySelector('.shared-brand').href.includes('utm_source=share')"),'la marca lleva a Diagramia');
  assert.equal(await js("document.querySelector('meta[name=robots]')?.content"),'noindex,nofollow','un enlace privado no se ofrece a buscadores');
  if(sharedDoc.animations.length){
    await until(()=>js("[...document.querySelectorAll('.transport button')].some(b=>b.textContent==='Pausar')"),'la animación arranca sola');
    assert.match(await js("document.querySelector('.presentation-caption .mono').textContent"),/^\d+ \/ \d+/,'se ve el paso de la animación');
    await js("[...document.querySelectorAll('.transport button')].find(b=>b.textContent==='Pausar').click()");
    await until(()=>js("[...document.querySelectorAll('.transport button')].some(b=>b.textContent==='Reproducir')"),'quien mira puede pausar');
  }
  await shot('ui-enlace-compartido');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(400);
  assert.ok(await js("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.shared-head').scrollWidth<=innerWidth"),'enlace compartido en móvil sin desborde');await shot('ui-enlace-compartido-movil');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal((await repo.get(initial.id,alice.session.projectId)).revision,sharedDoc.revision,'mirar el enlace no cambia el diagrama');
  // La página compartida sigue el idioma de quien la mira; acá se fuerza inglés y se vuelve a español para el resto del recorrido.
  await send('Page.navigate',{url:link+'?lang=en'});
  await until(()=>js("document.querySelector('.shared-brand')?.textContent.includes('Made with')"),'enlace compartido en inglés');
  assert.ok(await js("[...document.querySelectorAll('.transport button')].some(b=>['Play','Pause'].includes(b.textContent))&&document.querySelector('.shared-brand').textContent.includes('Make your own, free')"),'los controles de la página compartida están en inglés');
  assert.equal(await js("location.pathname+location.search"),`/s/${shareToken}`,'el parámetro de idioma se consume sin romper el enlace');
  await send('Page.navigate',{url:`${origin}/s/${'y'.repeat(24)}`});
  await until(()=>js("document.querySelector('.shared-status h1')?.textContent==='This link is no longer available'"),'enlace inexistente en inglés');
  await send('Page.navigate',{url:link+'?lang=es'});
  await until(()=>js("document.querySelector('.shared-brand')?.textContent.includes('Hecho con')"),'vuelta al español');
  await send('Page.navigate',{url:`${origin}/s/${'x'.repeat(24)}`});
  await until(()=>js("document.querySelector('.shared-status h1')?.textContent==='Este enlace ya no está disponible'"),'un enlace inexistente lo dice');
  await send('Network.setCookie',{name:'diagramia_session',value:alice.token,url:origin});
  await send('Page.navigate',{url:origin+'/'});await until(async()=>(await saveState())?.includes('✓ Nube'),'editor después de mirar el enlace');
  await until(()=>js("!!document.querySelector('.share-open')"),'compartir disponible al volver');
  await js("document.querySelector('.share-open').click()");
  await until(()=>js(`document.querySelector('#share-link')?.value===${JSON.stringify(link)}`),'el diálogo muestra el enlace vigente');
  await press('.share-dialog','Dejar de compartir');
  await until(async()=>await shareTokenInDb()===null,'enlace cortado en el servidor');
  await until(()=>offers('Crear enlace'),'el diálogo vuelve a ofrecer crear un enlace');
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(200);
  assert.equal(await js("!!document.querySelector('.share-dialog')"),false,'Escape cierra el diálogo');
  assert.equal((await fetch(`${origin}/api/v1/shared/${shareToken}`,{headers:{'x-diagramia-client':'editor'}})).status,404,'el enlace cortado deja de abrir');
  // Guardado automático: apagado por defecto; encendido, un diagrama con contenido sube solo y el límite del plan se avisa una vez.
  await example(2);await sleep(2500);
  assert.equal(await cloudDocs(),2,'sin la preferencia, nada sube solo');assert.ok(await js("!!document.querySelector('.cloud-save')"));
  await autosave();
  await until(async()=>(await saveState()).includes('✓ Nube'),'guardado automático del diagrama abierto');
  assert.equal(await cloudDocs(),3);
  await example(3);
  await until(()=>js("document.querySelector('.status').textContent.includes('plan gratuito admite')"),'aviso del límite del plan');await sleep(2500);
  assert.equal(await cloudDocs(),3,'el guardado automático no insiste cuando el plan está lleno');
  assert.ok((await saveState()).includes('navegador')&&await js("!!document.querySelector('.cloud-save')"),'el diagrama que no entró sigue guardado en el navegador');
  await autosave();
  // Compartir un diagrama que todavía no está en la nube: con el plan lleno se explica; con lugar, se guarda y se crea el enlace en un paso.
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(200);};
  await js("document.querySelector('.share-open').click()");
  await until(()=>offers('Ver mis diagramas'),'compartir con el plan lleno lleva a Mis diagramas');
  assert.ok(await js("document.querySelector('.share-dialog').textContent.includes('ya no tiene lugar')"),'con el plan lleno, compartir explica por qué no puede');
  await escape();
  assert.equal(await new BillingRepository(pool).apply({eventId:`evt-active-${suffix}`,occurredAt:new Date(),userId:alice.session.userId,providerCustomerId:'ctm_smoke',providerSubscriptionId:'sub_smoke_due',priceId:'pri_smoke',status:'active',currentPeriodEnd:new Date(Date.now()+30*86_400_000),scheduledCancelAt:null,updatePaymentUrl:'https://pay.example/update',cancelUrl:'https://pay.example/cancel'},'subscription.updated'),'applied');
  await js("window.__beforeReload=true");await send('Page.reload');await until(()=>js("!window.__beforeReload&&!!document.querySelector('.share-open')"),'editor con lugar en el plan');
  const localOnly=await saved();
  assert.ok((await saveState()).includes('navegador'),'el diagrama a compartir vive sólo en el navegador');
  await js("document.querySelector('.share-open').click()");
  await until(()=>offers('Guardar en la nube y crear enlace'),'compartir ofrece guardar primero');
  await press('.share-dialog','Guardar en la nube y crear enlace');
  const localLink=await until(()=>js("document.querySelector('#share-link')?.value"),'guardado y compartido en un paso');
  const localToken=(await accounts.listDocuments(alice.session.projectId)).find(item=>item.id===localOnly.id)?.shareToken;
  assert.equal(localLink,`${origin}/s/${localToken}`);assert.equal(await cloudDocs(),4,'compartir guardó el diagrama en la nube');
  assert.equal((await(await fetch(`${origin}/api/v1/shared/${localToken}`,{headers:{'x-diagramia-client':'editor'}})).json()).document.id,localOnly.id,'el enlace nuevo abre ese diagrama');
  await escape();
  assert.ok((await saveState()).includes('Nube'),'después de compartir, el diagrama sigue guardándose en la nube');
  // Telemetría de punta a punta: el navegador envía por lotes, el gateway valida y PostgreSQL guarda sin contenido.
  let rows=[];
  for(let i=0;i<120;i++){
    rows=(await pool.query("SELECT name,user_id,props,context FROM telemetry_events WHERE origin='client'")).rows;
    const names=new Set(rows.map(row=>row.name));
    if(['board_opened','node_edited','undo','useful_diagram_created','page_load','share_link_created','share_link_revoked','shared_view_opened'].every(name=>names.has(name)))break;
    await sleep(250);
  }
  const names=new Set(rows.map(row=>row.name));
  // El gesto cambia posición y pertenencia a zona mediante UPDATE_NODE: se mide como node_edited.
  for(const name of ['board_opened','node_edited','undo','useful_diagram_created','page_load','share_link_created','share_link_revoked','shared_view_opened'])assert.ok(names.has(name),`falta el evento ${name}; llegaron: ${[...names].join(', ')}`);
  assert.equal(rows.find(row=>row.name==='useful_diagram_created').props.reason,'saved_cloud');
  // La página compartida se miró sin sesión: su evento no es de la cuenta, y el camino de entrada no lleva el token.
  const viewed=rows.find(row=>row.name==='shared_view_opened');
  assert.equal(viewed.context.landingPath,'/s','la telemetría de un enlace compartido registra sólo /s');
  assert.ok(!JSON.stringify(rows).includes(shareToken),'el token del enlace no llega a la telemetría');
  assert.ok(rows.filter(row=>row.context.landingPath!=='/s').every(row=>row.user_id===alice.session.userId),'con sesión, los eventos quedan atribuidos a la cuenta');
  assert.equal((await pool.query('SELECT user_id FROM telemetry_identities')).rows[0]?.user_id,alice.session.userId,'el visitante quedó vinculado a la cuenta');
  const stored=JSON.stringify(rows);
  assert.ok(!stored.includes('Editado por MCP')&&!stored.includes('alice@example.test'),'ni el título del documento ni el email llegan a la telemetría');
  console.log(`Telemetría: ${rows.length} eventos del navegador (${[...names].sort().join(', ')}) guardados sin contenido.`);
  console.log('Cuenta SaaS: resumen, diagramas, plan, foco, móvil, atajos aislados; nube con cambio remoto, edición UI, undo durable, reconexión, guardado desde la cabecera, varias pestañas, enlace para compartir (crear, abrir sin sesión, móvil, cortar) y guardado automático aprobados. MCP se comprueba por separado en smoke:mcp-remote.');
}catch(error){failure=error;
}finally{
  try{socket?.close();}catch{}
  for(const child of [browser,vite])if(child){child.kill();await sleep(200);}
  if(server)await new Promise(resolve=>server.close(resolve));
  await pool?.end();
  try{docker(['down','--volumes','--remove-orphans']);}catch(error){failure??=error;}
  try{rmSync(profile,{recursive:true,force:true});}catch{}
}
if(failure)throw failure;
