// Landing y formulario contra PostgreSQL efímero y Chromium real. Sin credenciales, IA paga ni tráfico a producción.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {extname,join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createApp} from '../apps/api/dist/server.js';
import {UsageLedger} from '../apps/api/dist/usage.js';
import {migrateDocuments} from '../apps/api/dist/repositories/postgres.js';
import {ContactRepository} from '../apps/api/dist/repositories/contact.js';

const suffix=randomUUID().slice(0,8),project=`diagramia-landing-${suffix}`,password=`landing-${suffix}`,root=resolve('apps/landing');
const docker=args=>execFileSync('docker',['compose','-f','infra/compose.dev.yml','-p',project,...args],{env:{...process.env,DIAGRAMIA_DB_PORT:'0',DIAGRAMIA_DB_PASSWORD:password},timeout:240_000,stdio:['pipe','pipe','pipe']});
const executable=[process.env.BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync);
assert.ok(executable,'Chrome/Edge requerido');
const profile=mkdtempSync(join(tmpdir(),'diagramia-landing-')),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
let pool,api,site,browser,socket,failure,failWrites=false;
const checks=[];
try{
  docker(['up','-d','--wait','--wait-timeout','120','db']);
  const port=Number(docker(['port','db','5432']).toString().trim().match(/:(\d+)$/)[1]);
  pool=new pg.Pool({host:'127.0.0.1',port,user:'diagramia',database:'diagramia',password});await migrateDocuments(pool);
  const repository=new ContactRepository(pool),allowedOrigins=[];
  api=createApp({providers:[],productPrompt:'Prueba',token:'gateway-test',allowedOrigins,ledger:new UsageLedger({dailyTokenBudget:1000,dailyUsdBudget:1,requestsPerMinute:10,ledgerPath:null}),config:{maxOutputTokens:100,maxContextChars:100,maxRepairs:0,timeoutMs:1000},billing:{repository:{},paddle:{env:'sandbox',apiKey:'pdl_sdbx_landing',webhookSecret:'landing',priceId:'pri_landing',clientToken:'test_0123456789abcdef0123456789'},
      // Oferta de campaña vigente: la landing la muestra con su vencimiento real (ADR 092).
      offer:{discountId:'dsc_01landinglandinglanding01',percent:50,months:3,regularUsd:10,endsAt:new Date(Date.now()+3*3_600_000+30_000),welcomeHours:0}},
    contact:{repository:{create:async(...args)=>{if(failWrites)throw new Error('Fallo de almacenamiento de prueba');return repository.create(...args);}},perHour:50}});
  // Simula sólo el prefijo /api del proxy; el gateway y el repositorio son reales.
  api.prependListener('request',req=>{req.url=req.url.replace(/^\/api(?=\/)/,'');});const apiOrigin=await listen(api);
  site=createServer((req,res)=>{
    try{
      const name=new URL(req.url,'http://localhost').pathname,path=resolve(root,'.'+(name==='/'?'/index.html':name));
      if(!path.startsWith(root+sep))return void res.writeHead(403).end();
      let body=readFileSync(path);const extension=extname(path);
      if(extension==='.html')body=Buffer.from(body.toString().replace(/(<meta name="diagramia-app" content=")[^"]*/g,`$1${apiOrigin}/`).replace(/(<meta name="diagramia-events" content=")[^"]*/g,'$1'));
      const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.ttf':'font/ttf'};
      res.writeHead(200,{'content-type':mime[extension]??'application/octet-stream','content-security-policy':`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src ${apiOrigin}; object-src 'none'; base-uri 'self'; form-action 'self'`});res.end(body);
    }catch{res.writeHead(404).end();}
  });
  const siteOrigin=await listen(site);allowedOrigins.push(siteOrigin);
  const debugPort=9400+Math.floor(Math.random()*200);
  browser=spawn(executable,['--headless=new',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','about:blank'],{stdio:'ignore'});
  let ws;for(let i=0;i<80;i++){try{const pages=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();ws=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;if(ws)break;}catch{}await sleep(250);}assert.ok(ws,'Chrome no inició');
  socket=new WebSocket(ws);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let sequence=0;const pending=new Map(),errors=[];
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const wait=pending.get(message.id);pending.delete(message.id);message.error?wait.reject(new Error(message.error.message)):wait.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text);};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const js=async expression=>{const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.exception?.description??value.exceptionDetails.text);return value.result.value;};
  const until=async(fn,label)=>{for(let i=0;i<60;i++){if(await fn())return;await sleep(100);}throw new Error('Timeout: '+label);};
  const navigate=async path=>{await send('Page.navigate',{url:siteOrigin+path});await until(()=>js("document.readyState==='complete'"),'carga');await sleep(150);};
  const shot=async name=>{mkdirSync('evidencias',{recursive:true});const {data}=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join('evidencias',name+'.png'),Buffer.from(data,'base64'));};
  const check=async(name,fn)=>{await fn();checks.push(name);console.log('ok '+name);};
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const width of [1440,1024,390,320])await check(`landing ${width}px: planes, ejemplos y diagramas legibles sin desborde`,async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await navigate('/');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'),'desborde del documento');
    assert.equal(await js('document.querySelectorAll(".team-card").length'),6);
    assert.equal(await js('document.querySelectorAll(".price-card").length'),3);
    assert.ok(!(await js('document.body.textContent')).includes('manual de marca'));
    const pro=await js('document.querySelector(".price-card.pro a").href');assert.ok(pro.includes('?plan=pro'));
    await until(()=>js("!document.getElementById('offer-tag').hidden"),'oferta visible');
    const offerText=await js("document.getElementById('offer-tag').textContent");
    assert.ok(/50% menos/.test(offerText)&&/USD 5 por mes/.test(offerText)&&/USD 10 por mes/.test(offerText)&&/primeros 3 meses/.test(offerText)&&/Termina en 0[23]:\d\d:\d\d/.test(offerText),'la oferta muestra porcentaje, precio, meses y cuenta regresiva: '+offerText);
    for(const scenario of ['campaign','hiring','purchase']){
      await js(`document.querySelector('[data-scenario="${scenario}"]').click()`);
      assert.equal(await js('document.querySelectorAll(".p-node").length'),4);
      assert.ok(await js("document.querySelector('.graph-viewport').scrollWidth<=document.querySelector('.graph-viewport').clientWidth"),'el diagrama requiere pan');
      assert.ok(await js("document.querySelector('.p-title').getScreenCTM().a*parseFloat(getComputedStyle(document.querySelector('.p-title')).fontSize)>=12"),'texto pequeño');
    }
    await js("document.querySelector('#play').scrollIntoView()");await sleep(100);if(width===1440||width===390)await shot(`ui-landing-movimiento-${width}`);
    await js("document.querySelector('#precios').scrollIntoView()");await sleep(100);if(width===1440||width===390)await shot(`ui-landing-planes-${width}`);
    await js("document.querySelector('#equipos').scrollIntoView()");await sleep(100);if(width===1440)await shot('ui-landing-equipos');
  });
  await check('reproductor: pausa, búsqueda temporal, escenarios e inglés',async()=>{
    await js("document.querySelector('#play-toggle').click()");await sleep(300);assert.equal(await js("document.querySelector('#play-toggle').textContent"),'Pausar');
    await js("document.querySelector('#play-toggle').click();document.querySelector('#scrubber').value='5000';document.querySelector('#scrubber').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#language').click()");
    assert.equal(await js('document.documentElement.lang'),'en');assert.equal(await js("document.querySelector('#play-toggle').textContent"),'Play');
  });
  for(const width of [1440,390,320])await check(`empresas ${width}px: formulario accesible sin desborde`,async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});await navigate('/empresas.html');
    assert.ok(await js('document.documentElement.scrollWidth<=innerWidth'));
    assert.equal(await js("document.querySelector('.hp').getBoundingClientRect().height"),0,'el honeypot está oculto');
    assert.ok(await js("[...document.querySelectorAll('input:not([name=website]),select,textarea')].every(el=>el.labels.length>0)"));
    if(width!==320)await shot(`ui-empresas-${width}`);
  });
  const fill=()=>js(`(()=>{const data={name:'Ana Prueba',email:'ana@empresa.test',company:'Empresa de prueba',teamSize:'11-50',message:'Queremos explicar el proceso de ventas y formar al equipo.'};for(const [name,value] of Object.entries(data))document.querySelector('[name="'+name+'"]').value=value;})()`);
  await check('formulario: envío real con CORS y PostgreSQL, confirmación sólo después del guardado',async()=>{
    await fill();await js("document.querySelector('#contact-submit').click()");await until(()=>js("document.querySelector('#contact-status').dataset.tone==='ok'"),'guardado');
    const contacts=await repository.list();assert.equal(contacts.length,1);assert.equal(contacts[0].company,'Empresa de prueba');
    await shot('ui-empresas-enviada');
  });
  await check('formulario: fallo de almacenamiento conserva los datos y permite reintentar',async()=>{
    await navigate('/empresas.html');await fill();failWrites=true;await js("document.querySelector('#contact-submit').click()");
    await until(()=>js("document.querySelector('#contact-status').dataset.tone==='error'"),'error');
    assert.equal(await js("document.querySelector('[name=company]').value"),'Empresa de prueba');assert.equal((await repository.list()).length,1);
    failWrites=false;await js("document.querySelector('#contact-submit').click()");await until(()=>js("document.querySelector('#contact-status').dataset.tone==='ok'"),'reintento');assert.equal((await repository.list()).length,2);
  });
  assert.deepEqual(errors,[],'sin excepciones JavaScript');console.log(`${checks.length}/${checks.length} comprobaciones aprobadas. Capturas en evidencias/.`);
}catch(error){failure=error;}
finally{
  socket?.close();browser?.kill();
  for(const server of [site,api])if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
  await pool?.end();try{docker(['down','--volumes','--remove-orphans']);}catch(error){failure??=error;}
  await sleep(300);if(profile.startsWith(join(tmpdir(),'diagramia-landing-')))try{rmSync(profile,{recursive:true,force:true});}catch{}
}
if(failure)throw failure;
