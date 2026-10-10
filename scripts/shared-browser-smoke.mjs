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
  browser=spawn(browserExe,['--headless=new',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','--window-size=1440,900','about:blank'],{stdio:'ignore'});
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
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.textContent==='Mis diagramas').click()");
  assert.ok(await js("!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Guardar el diagrama abierto en la nube'))"),'aparece el guardado cloud');
  // Abrimos un ejemplo complejo real antes de guardar, sin modificar los ejemplos del usuario.
  await js("document.querySelector('.account-page header button').click();document.querySelector('[aria-label=\"Cargar ejemplo\"]').value='0';document.querySelector('[aria-label=\"Cargar ejemplo\"]').dispatchEvent(new Event('change',{bubbles:true}))");await sleep(600);
  await js("document.querySelector('.account-chip').click()");await sleep(300);
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.textContent==='Mis diagramas').click()");await sleep(150);
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
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.textContent==='Plan y facturación').click()");await sleep(200);
  assert.ok(await js("document.querySelector('.account-page').textContent.includes('400 créditos')"),'beneficios de Pro visibles');
  await shot('ui-cuenta-plan');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);
  assert.ok(await js("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.account-body main').scrollWidth<=document.querySelector('.account-body main').clientWidth"),'cuenta móvil sin desborde');await shot('ui-cuenta-saas-movil');
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(150);
  assert.equal(await js("!!document.querySelector('.account-page')"),false);
  assert.ok(await js("document.activeElement.matches('.account-chip')"),'el foco vuelve a Cuenta');
  await send('Page.navigate',{url:origin+'/?plan=pro'});
  await until(()=>js("document.querySelector('.account-page')?.textContent.includes('Plan y facturación')&&document.querySelector('.account-page nav button[aria-current=page]')?.textContent==='Plan y facturación'"),'intención Pro desde landing');
  assert.equal(await js("new URL(location.href).searchParams.has('plan')"),false,'la intención se consume');
  // Vuelta de la página de pago sin pagar: se dice que no hubo cobro, se muestra el plan y el parámetro no queda en la URL.
  await send('Page.navigate',{url:origin+'/?pro=cancel'});
  await until(()=>js("document.querySelector('.account-page nav button[aria-current=page]')?.textContent==='Plan y facturación'&&!new URL(location.href).searchParams.has('pro')"),'vuelta del pago cancelado');
  assert.ok(await js("document.body.textContent.includes('No se hizo ningún cobro')"),'cancelar el pago lo dice con claridad');
  // La página de pago propia rechaza un enlace sin transacción válida y no carga nada de terceros.
  await send('Page.navigate',{url:origin+'/pago.html?_ptxn=<script>'});
  await until(()=>js("document.getElementById('status')?.dataset.tone==='warn'"),'enlace de pago inválido');
  assert.equal(await js("document.querySelectorAll('script[src*=paddle]').length"),0,'sin transacción válida no se carga Paddle.js');
  await send('Page.navigate',{url:origin+'/'});await until(()=>js("!!document.querySelector('.account-chip')"),'volver al editor');
  await js("document.querySelector('.account-chip').click()");await until(()=>js("!!document.querySelector('.account-page')"),'cuenta abierta');
  await js("[...document.querySelectorAll('.account-page nav button')].find(b=>b.textContent==='Configuración').click()");await sleep(150);
  assert.ok(await js("document.querySelector('.account-page').textContent.includes('Cerrar sesión')"),'configuración disponible');
  for(let i=0;i<12;i++){await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.ok(await js("!!document.activeElement.closest('.account-page')"),'el foco no escapa de Cuenta, Tab '+i);}
  // Telemetría de punta a punta: el navegador envía por lotes, el gateway valida y PostgreSQL guarda sin contenido.
  let rows=[];
  for(let i=0;i<120;i++){
    rows=(await pool.query("SELECT name,user_id,props,context FROM telemetry_events WHERE origin='client'")).rows;
    const names=new Set(rows.map(row=>row.name));
    if(['board_opened','node_edited','undo','useful_diagram_created','page_load'].every(name=>names.has(name)))break;
    await sleep(250);
  }
  const names=new Set(rows.map(row=>row.name));
  // El gesto cambia posición y pertenencia a zona mediante UPDATE_NODE: se mide como node_edited.
  for(const name of ['board_opened','node_edited','undo','useful_diagram_created','page_load'])assert.ok(names.has(name),`falta el evento ${name}; llegaron: ${[...names].join(', ')}`);
  assert.equal(rows.find(row=>row.name==='useful_diagram_created').props.reason,'saved_cloud');
  assert.ok(rows.every(row=>row.user_id===alice.session.userId),'con sesión, los eventos quedan atribuidos a la cuenta');
  assert.equal((await pool.query('SELECT user_id FROM telemetry_identities')).rows[0]?.user_id,alice.session.userId,'el visitante quedó vinculado a la cuenta');
  const stored=JSON.stringify(rows);
  assert.ok(!stored.includes('Editado por MCP')&&!stored.includes('alice@example.test'),'ni el título del documento ni el email llegan a la telemetría');
  console.log(`Telemetría: ${rows.length} eventos del navegador (${[...names].sort().join(', ')}) guardados sin contenido.`);
  console.log('Cuenta SaaS: resumen, diagramas, plan, foco, móvil, atajos aislados; nube con cambio remoto, edición UI, undo durable y reconexión aprobados. MCP se comprueba por separado en smoke:mcp-remote.');
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
