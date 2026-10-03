// Mide el editor en Chromium real con documentos de 100, 500 y 1999 nodos (P8.2): carga hasta ver todos los nodos,
// costo por cuadro al arrastrar un nodo y al hacer zoom, y tareas largas (>50 ms) del hilo principal.
// Requiere el editor corriendo (npm run dev). ATENCIÓN: borra el guardado del navegador para esa URL; usá una instancia aparte:
//   npm run dev -w @diagramia/editor -- --port 5174   y luego   DIAGRAMIA_URL=http://127.0.0.1:5174/ npm run perf:browser
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const URL_=process.env.DIAGRAMIA_URL??'http://127.0.0.1:5173/';
const executable=[process.env.BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync);
if(!executable){console.error('No se encontró Chrome ni Edge.');process.exit(2);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=9400+Math.floor(Math.random()*300),profile=mkdtempSync(join(tmpdir(),'diagramia-perf-'));
const browser=spawn(executable,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--disable-gpu','--window-size=1440,900','about:blank'],{stdio:'ignore'});

function synthetic(count){
  const perZone=20,zones=[],nodes=[],edges=[];
  for(let z=0;z<Math.ceil(count/perZone);z++){
    const zx=(z%10)*1100,zy=Math.floor(z/10)*700;
    zones.push({id:`zone-${z}`,label:`Zona ${z}`,bounds:{x:zx,y:zy,width:1040,height:640},style:{}});
    for(let i=0;i<perZone&&nodes.length<count;i++){const n=nodes.length;nodes.push({id:`n-${n}`,kind:'service',label:`Servicio ${n}`,position:{x:zx+40+(i%5)*200,y:zy+60+Math.floor(i/5)*140},size:{width:160,height:80},zoneId:`zone-${z}`});}
  }
  for(let n=1;n<count;n++)edges.push({id:`e-${n}`,from:`n-${n-1}`,to:`n-${n}`,label:'llama'});
  for(let n=3;n<count;n+=3)edges.push({id:`x-${n}`,from:`n-${n}`,to:`n-${(n*7)%count}`,label:''});
  return {schemaVersion:'1.7.0',id:`perf-${count}`,title:`Perf ${count}`,revision:0,nodes,edges,zones,groups:[],frames:[],drawings:[],animations:[],assets:[],annotations:[],appliedBatches:[]};
}

let socket,results=[];
try{
  let ws;for(let i=0;i<80&&!ws;i++){try{ws=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;}catch{}if(!ws)await sleep(250);}
  socket=new WebSocket(ws);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let seq=0;const pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const w=pending.get(m.id);pending.delete(m.id);m.error?w.reject(new Error(m.error.message)):w.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const js=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
  const frame=()=>js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(e.duration)}).observe({type:'longtask',buffered:true});}catch{}"});
  await send('Page.navigate',{url:URL_});await sleep(1500);
  for(const count of [100,500,1999]){
    const doc=synthetic(count);
    await js(`(()=>{localStorage.clear();localStorage.setItem('diagramia.tutorial.seen','1');localStorage.setItem('diagramia.telemetry','off');localStorage.setItem('diagramia.workspace',JSON.stringify({tabs:['tab-perf'],active:'tab-perf'}));localStorage.setItem('diagramia.doc.tab-perf',${JSON.stringify(JSON.stringify(doc))});})()`);
    const started=Date.now();await send('Page.reload');
    let shown=0;for(let i=0;i<240&&shown<count;i++){await sleep(100);shown=await js("document.querySelectorAll('.canvas .graph-node').length").catch(()=>0);}
    await frame();const loadMs=Date.now()-started;
    await js('window.__long=[]');
    // Arrastre de un nodo visible en 20 pasos: cada paso espera dos cuadros, así se mide lo que ve el usuario.
    const box=await js(`(()=>{const r=document.querySelector('[data-id="n-0"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',buttons:1,clickCount:1});
    const steps=[];
    for(let i=1;i<=20;i++){const t=performance.now();await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+i*6,y:box.y+i*3,button:'left',buttons:1});await frame();steps.push(performance.now()-t);}
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+120,y:box.y+60,button:'left',buttons:0,clickCount:1});await frame();
    const dragLong=await js('window.__long.slice()');await js('window.__long=[]');
    const zooms=[];
    for(let i=0;i<10;i++){const t=performance.now();await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:700,y:450,deltaX:0,deltaY:i%2?-120:120,modifiers:2});await frame();zooms.push(performance.now()-t);}
    const zoomLong=await js('window.__long.slice()');
    const median=list=>{const s=[...list].sort((a,b)=>a-b);return Math.round(s[Math.floor(s.length/2)]);},p95=list=>{const s=[...list].sort((a,b)=>a-b);return Math.round(s[Math.floor(s.length*0.95)]);};
    results.push({nodes:count,edges:doc.edges.length,shown,loadMs,dragFrameMedianMs:median(steps),dragFrameP95Ms:p95(steps),dragLongTasks:dragLong.length,dragLongestMs:Math.round(Math.max(0,...dragLong)),zoomFrameMedianMs:median(zooms),zoomLongTasks:zoomLong.length});
  }
  console.table(results);
  mkdirSync('state/perf',{recursive:true});
  writeFileSync(`state/perf/browser-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({at:new Date().toISOString(),browser:executable,results},null,2));
}finally{
  try{socket?.close();}catch{}
  browser.kill();await sleep(300);
  try{rmSync(profile,{recursive:true,force:true});}catch{}
}
