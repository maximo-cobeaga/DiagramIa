// Recorrido end-to-end del editor en un Chromium real (Edge o Chrome ya instalados), manejado por el
// protocolo DevTools sin dependencias. Requiere el editor corriendo: `npm run dev` y luego `npm run smoke`.
// ATENCIÓN: borra el documento guardado en el navegador para la URL que prueba. Si estás trabajando en el editor,
// levantá otra instancia (npm run dev -w @diagramia/editor -- --port 5174) y apuntá DIAGRAMIA_URL a ella.
// Deja capturas en state/smoke/. Variables: DIAGRAMIA_URL, BROWSER (ruta al ejecutable).
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const URL_=process.env.DIAGRAMIA_URL??'http://127.0.0.1:5173/';
const candidates=[process.env.BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
const executable=candidates.find(existsSync);
if(!executable){console.error('No se encontró Chrome ni Edge. Indicá la ruta con BROWSER=...');process.exit(2);}

const port=9300+Math.floor(Math.random()*500),profile=mkdtempSync(join(tmpdir(),'diagramia-smoke-')),shots='state/smoke';
mkdirSync(shots,{recursive:true});
const browser=spawn(executable,['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-gpu','--window-size=1440,900','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function target(){
  for(let i=0;i<60;i++){
    try{const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const page=pages.find(p=>p.type==='page');if(page)return page.webSocketDebuggerUrl;}catch{}
    await sleep(250);
  }
  throw new Error('El navegador no abrió el puerto de depuración.');
}
const socket=new WebSocket(await target());
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0;const waiting=new Map(),problems=[];
socket.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.id){const entry=waiting.get(message.id);waiting.delete(message.id);if(message.error)entry.reject(new Error(message.error.message));else entry.resolve(message.result);return;}
  if(message.method==='Runtime.exceptionThrown')problems.push('excepción: '+(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text));
  if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')problems.push('console.error: '+message.params.args.map(a=>a.value??a.description).join(' '));
  if(message.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});
};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
async function js(expression){
  const {result,exceptionDetails}=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(exceptionDetails)throw new Error(exceptionDetails.exception?.description??exceptionDetails.text);
  return result.value;
}
const viewport=(width,height,mobile=false)=>send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
async function shot(name){const {data}=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(shots,name+'.png'),Buffer.from(data,'base64'));}
const mouse=(type,x,y,extra={})=>send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...extra});
async function drag(from,to,modifiers=0){
  await mouse('mouseMoved',from.x,from.y,{buttons:0,modifiers});await mouse('mousePressed',from.x,from.y,{modifiers});
  for(let i=1;i<=6;i++)await mouse('mouseMoved',from.x+(to.x-from.x)*i/6,from.y+(to.y-from.y)*i/6,{modifiers});
  await mouse('mouseReleased',to.x,to.y,{modifiers});await sleep(60);
}
const click=point=>drag(point,point);
// Dos pulsaciones seguidas, sin movimientos intermedios, para que cuenten como doble clic.
async function doubleClick(point){for(let i=0;i<2;i++){await mouse('mousePressed',point.x,point.y);await mouse('mouseReleased',point.x,point.y);}await sleep(150);}
const tap=async selector=>{if(!await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true;})()`))throw new Error(`no existe ${selector}`);};
const KEYS={Enter:['Enter',13],F2:['F2',113],c:['KeyC',67],z:['KeyZ',90],n:['KeyN',78],l:['KeyL',76],p:['KeyP',80],a:['KeyA',65],d:['KeyD',68],g:['KeyG',71],Escape:['Escape',27],ArrowRight:['ArrowRight',39],Delete:['Delete',46],'1':['Digit1',49]};
async function key(name,modifiers=0){
  const [code,vk]=KEYS[name],base={key:name,code,windowsVirtualKeyCode:vk,modifiers};
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',...base});await send('Input.dispatchKeyEvent',{type:'keyUp',...base});await sleep(60);
}
const CTRL=2,SHIFT=8;
const center=selector=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,left:r.left,top:r.top};})()`);
// El documento activo: el índice de pestañas dice cuál es y cada pestaña se guarda con su propia clave.
const ACTIVE_KEY=`'diagramia.doc.'+JSON.parse(localStorage.getItem('diagramia.workspace')).active`;
const saved=async()=>{await sleep(450);return js(`JSON.parse(localStorage.getItem(${ACTIVE_KEY}))`);};
const clickText=(text,scope='body')=>js(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope)}+' button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)return false;b.click();return true;})()`);
const status=()=>js(`document.querySelector('.status span').textContent`);

const results=[];
async function check(name,fn){
  try{const detail=await fn();results.push({name,ok:true,detail});console.log(`ok   ${name}${detail?' — '+detail:''}`);}
  catch(e){results.push({name,ok:false});console.log(`FAIL ${name} — ${e.message}`);}
}
const expect=(condition,message)=>{if(!condition)throw new Error(message);};

try{
  await send('Page.enable');await send('Runtime.enable');
  await viewport(1440,900);
  await send('Page.navigate',{url:URL_});await sleep(1200);
  // El tutorial de primera vez se prueba aparte; para el resto del recorrido se lo da por visto.
  await js(`(()=>{localStorage.clear();localStorage.setItem('diagramia.tutorial.seen','1');localStorage.setItem('diagramia.theme','light');})()`);await send('Page.reload');await sleep(1500);

  await check('carga el ejemplo de arquitectura sin errores',async()=>{
    const count=await js(`document.querySelectorAll('.graph-node').length`);expect(count===4,`se esperaban 4 nodos, hay ${count}`);
    await shot('01-desktop-architecture');return `${count} nodos`;
  });
  await check('arrastrar un nodo lo mueve con una acción y Ctrl+Z lo restaura',async()=>{
    const before=await saved()??{revision:0,nodes:[{id:'user',position:{x:40,y:220}}]},from=await center('[data-id="user"]');
    await drag(from,{x:from.x,y:from.y+90});
    const after=await saved(),was=before.nodes.find(n=>n.id==='user').position,now=after.nodes.find(n=>n.id==='user').position;
    expect(now.y>was.y&&now.x===was.x,`posición ${JSON.stringify(was)} → ${JSON.stringify(now)}`);
    expect((now.y-was.y)%8===0,'el desplazamiento no respetó la grilla');
    await key('z',CTRL);const undone=(await saved()).nodes.find(n=>n.id==='user').position;
    expect(undone.y===was.y,`undo dejó y=${undone.y}`);
    return `y ${was.y} → ${now.y} → ${undone.y}`;
  });
  await check('el zoom con Ctrl + rueda mantiene fijo el punto bajo el cursor',async()=>{
    const before=await center('[data-id="api"] .node-shape');
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:before.x,y:before.y,deltaX:0,deltaY:-240,modifiers:CTRL});await sleep(120);
    const after=await center('[data-id="api"] .node-shape');
    expect(after.width>before.width*1.2,'no hubo zoom');
    expect(Math.abs(after.x-before.x)<2&&Math.abs(after.y-before.y)<2,`el punto se desplazó ${after.x-before.x},${after.y-before.y}`);
    await key('1');await sleep(120);
    return `ancho ${before.width.toFixed(0)} → ${after.width.toFixed(0)} px`;
  });
  await check('la selección rectangular toma los nodos y las flechas mueven la selección',async()=>{
    const host=await center('.canvas-host');
    await drag({x:host.left+6,y:host.top+6},{x:host.left+host.width-6,y:host.top+host.height-6});
    const selected=await js(`document.querySelectorAll('.graph-node.selected').length`);expect(selected===4,`seleccionados: ${selected}`);
    const before=await saved();await key('ArrowRight');const after=await saved();
    expect(after.nodes.every((n,i)=>n.position.x===before.nodes[i].position.x+8),'el nudge no movió 8 px a todos');
    await key('z',CTRL);await key('Escape');
    return `${selected} nodos`;
  });
  await check('un nodo creado dentro de una zona queda perteneciendo a ella',async()=>{
    const zone=await center('[data-id="backend"] .zone');
    await key('n');await click({x:zone.x,y:zone.top+zone.height*.62});
    // Al crear un nodo se abre la edición de su texto; Esc la cierra sin cambiarlo.
    expect(await js(`Boolean(document.querySelector('.inline-editor'))`),'no se abrió la edición del texto');await key('Escape');
    const doc=await saved(),node=doc.nodes.at(-1);
    expect(doc.nodes.length===5&&node.zoneId==='backend',`zoneId=${node.zoneId}`);
    return node.id;
  });
  await check('las manijas redimensionan el nodo seleccionado',async()=>{
    const before=(await saved()).nodes.at(-1),handle=await center('[data-handle="se"]');
    expect(handle,'no hay manijas');
    await drag(handle,{x:handle.x+60,y:handle.y+40});
    const after=(await saved()).nodes.at(-1);
    expect(after.size.width>before.size.width&&after.size.height>before.size.height,JSON.stringify(after.size));
    return `${before.size.width}×${before.size.height} → ${after.size.width}×${after.size.height}`;
  });
  await check('una propuesta se valida, muestra el diff y se aplica sólo al aceptar',async()=>{
    await key('Escape');
    const api=await center('[data-id="api"]');await click(api);
    expect(await clickText('Sesión','.tabs'),'no está la pestaña Sesión');await sleep(80);
    const revision=(await saved()).revision;
    await js(`document.querySelector('details.manual').open=true`);
    expect(await clickText('Ejemplo: agregar Redis'),'falta el ejemplo');await sleep(60);
    expect(await clickText('Validar y ver cambios'),'falta validar');await sleep(80);
    const diff=await js(`document.querySelector('.diff')?.textContent`);expect(diff&&diff.includes('redis'),`diff: ${diff}`);
    expect((await saved()).revision===revision,'el preview modificó el documento');
    expect(await clickText('Aceptar y aplicar'),'falta aceptar');
    const doc=await saved(),redis=doc.nodes.find(n=>n.id==='redis');
    expect(redis&&redis.zoneId==='backend'&&doc.revision===revision+1,'Redis no quedó dentro de Backend');
    await shot('02-desktop-proposal-applied');
    return `redis en ${JSON.stringify(redis.position)}`;
  });
  await check('la reproducción avanza y deshacer no reinicia el playhead',async()=>{
    expect(await clickText('Reproducir','.timeline'),'falta Reproducir');await sleep(700);
    const particles=await js(`document.querySelectorAll('.particle').length`);expect(particles>0,'no hay partículas');
    await clickText('Pausar','.timeline');
    const time=await js(`document.querySelector('.timecode').textContent`);
    await key('z',CTRL);
    const later=await js(`document.querySelector('.timecode').textContent`);
    expect(time===later&&!time.startsWith('0:00.0'),`playhead ${time} → ${later}`);
    return time;
  });
  await check('la presentación navega con teclado y sale sin modificar el documento',async()=>{
    const revision=(await saved()).revision;
    await key('p');await sleep(900);
    expect(await js(`Boolean(document.querySelector('.presentation svg'))`),'no abrió');
    await key('ArrowRight');await sleep(900);await shot('03-presentation');
    const caption=await js(`document.querySelector('.presentation-caption').textContent`);
    await key('Escape');await sleep(120);
    expect(!(await js(`Boolean(document.querySelector('.presentation'))`)),'no cerró');
    expect((await saved()).revision===revision,'la presentación cambió el documento');
    return caption;
  });
  await check('recargar conserva el documento guardado',async()=>{
    const before=await saved();await send('Page.reload');await sleep(1500);
    const title=await js(`document.querySelector('.doc-tab.active [role=tab]').textContent`);
    expect(title.includes('r'+before.revision),`título tras recargar: ${title}`);
    expect(await js(`document.querySelectorAll('.graph-node').length`)===before.nodes.length,'cambió la cantidad de nodos');
    return title;
  });
  for(const [index,name] of [[1,'checkout-success'],[2,'checkout-failure']]){
    await check(`el ejemplo ${name} se carga y se dibuja`,async()=>{
      await js(`(()=>{const s=document.querySelector('select[aria-label="Cargar ejemplo"]');s.value='${index}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await sleep(500);
      const doc=await saved();expect(doc.id===name,`id=${doc.id}`);
      await shot(`0${3+index}-desktop-${name}`);
      return `${doc.nodes.length} nodos, ${doc.edges.length} conexiones`;
    });
  }
  await check('recorrido automático y edición de timeline',async()=>{
    const before=(await saved()).animations.length;
    expect(await clickText('Crear recorrido','.timeline'),'falta el botón');
    const doc=await saved();expect(doc.animations.length===before+1,'no se creó la animación');
    const steps=doc.animations.at(-1).steps.length;
    expect(await clickText('+ Agregar paso','.timeline'),'falta la acción simple de agregar paso');
    expect((await saved()).animations.at(-1).steps.length===steps+1,'no se agregó el paso');
    return `${steps} pasos automáticos + paso manual`;
  });
  await check('la biblioteca inserta componentes con IDs nuevos',async()=>{
    expect(await clickText('Biblioteca','.tabs'),'falta la pestaña');await sleep(80);
    await clickText('Insertar','.component-list');await sleep(200);await clickText('Insertar','.component-list');
    const doc=await saved(),ids=doc.nodes.map(n=>n.id);
    expect(ids.includes('client-1')&&ids.includes('client-2'),'no se instanció dos veces');
    await shot('06-desktop-library');
    return 'client-1, client-2';
  });
  await check('el conector une dos nodos y la zona dibujada adopta los nodos que encierra',async()=>{
    await send('Page.reload');await sleep(2000);
    await js(`(()=>{const s=document.querySelector('select[aria-label="Cargar ejemplo"]');s.value='0';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(500);
    const before=await saved(),user=await center('[data-id="user"]'),db=await center('[data-id="db"]');
    await key('c');await drag(user,db);await key('Escape');
    let doc=await saved();const edge=doc.edges.at(-1);
    expect(doc.edges.length===before.edges.length+1&&edge.from==='user'&&edge.to==='db',`conexión: ${JSON.stringify(edge)}`);
    const front=await center('[data-id="frontend"] .node-shape');
    await key('z');await drag({x:user.x-user.width,y:user.y-user.height*1.5},{x:front.x+front.width,y:front.y+front.height*1.5});await key('Escape');
    doc=await saved();const zone=doc.zones.at(-1),members=doc.nodes.filter(n=>n.zoneId===zone.id).map(n=>n.id);
    expect(doc.zones.length===2&&members.join()==='user,frontend',`miembros: ${members}`);
    await shot('08-desktop-connector-zone');
    return `zona ${zone.id} con ${members.join(', ')}`;
  });
  await check('las herramientas libres crean línea, flecha y trazo seleccionables',async()=>{
    const box=await center('.canvas'),base=await saved(),from={x:box.x+box.width*.34,y:box.y+box.height*.34},to={x:from.x+85,y:from.y+45};
    for(const [tool,kind] of [['l','line'],['a','arrow'],['d','freehand']]){await key(tool);await drag(from,to);await key('Escape');}
    const after=await saved(),added=after.drawings.slice(base.drawings.length);
    expect(added.map(d=>d.kind).join()==='line,arrow,freehand',`tipos: ${added.map(d=>d.kind).join(',')}`);
    expect(added.every(d=>d.points.length>=2),'faltan puntos en un trazo');
    return `${added.length} trazos, IDs ${added.map(d=>d.id).join(', ')}`;
  });
  await check('exporta SVG autónomo y PNG reales',async()=>{
    await js(`(()=>{window.__blobs=[];const make=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__blobs.push(b);return make(b);};HTMLAnchorElement.prototype.click=function(){};})()`);
    const pick=value=>js(`(()=>{const s=document.querySelector('select[aria-label="Exportar"]');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await pick('svg');await sleep(900);
    const svg=await js(`window.__blobs.at(-1).text()`);
    expect(svg.startsWith('<svg')&&svg.includes('PostgreSQL')&&svg.includes('@font-face')&&!svg.includes('handle'),'SVG incompleto o con UI');
    await pick('png2');await sleep(1500);
    const png=await js(`(()=>{const b=window.__blobs.at(-1);return {type:b.type,size:b.size};})()`);
    expect(png.type==='image/png'&&png.size>5000,JSON.stringify(png));
    await pick('pdf');await sleep(1400);
    const pdf=await js(`(async()=>{const b=window.__blobs.at(-1),bytes=new Uint8Array(await b.arrayBuffer());return {type:b.type,size:b.size,signature:String.fromCharCode(...bytes.slice(0,5))};})()`);
    expect(pdf.type==='application/pdf'&&pdf.signature==='%PDF-'&&pdf.size>5000,`PDF inválido: ${JSON.stringify(pdf)}`);
    await pick('mermaid');await sleep(200);
    const mermaid=await js(`window.__blobs.at(-1).text()`);expect(mermaid.includes('flowchart LR')&&mermaid.includes('subgraph backend'),'Mermaid inválido');
    return `SVG ${Math.round(svg.length/1024)} KB, PNG ${Math.round(png.size/1024)} KB, PDF ${Math.round(pdf.size/1024)} KB`;
  });
  await check('importar Mermaid reemplaza el documento y un archivo inválido no lo toca',async()=>{
    const good=join(profile,'flujo.mmd'),bad=join(profile,'roto.mmd');
    writeFileSync(good,['flowchart LR','  subgraph core[Núcleo]','    a[Entrada] --> b{¿Válido?}','  end','  b -->|sí| c[(Datos)]','  b -.->|no| d([Rechazo])',''].join('\n'));writeFileSync(bad,'esto no es mermaid');
    const {root}=await send('DOM.getDocument'),{nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'header input[type=file]'});
    await send('DOM.setFileInputFiles',{nodeId,files:[good]});await sleep(600);
    let doc=await saved();expect(doc.id==='flujo'&&doc.nodes.length===4&&doc.zones.length===1,`importado: ${doc.id} ${doc.nodes.length}`);
    await shot('09-desktop-mermaid-import');
    await send('DOM.setFileInputFiles',{nodeId,files:[bad]});await sleep(500);
    const text=await status();doc=await saved();
    expect(doc.id==='flujo'&&text.includes('intacto'),`tras archivo inválido: ${text}`);
    return text.slice(0,90);
  });
  await check('importar PlantUML y BPMN desde la UI y exportar sus subconjuntos',async()=>{
    const puml=join(profile,'login.puml'),bpmn=join(profile,'pedido.bpmn');
    writeFileSync(puml,'@startuml\nactor Usuario\nparticipant API\nUsuario -> API: Iniciar sesión\nAPI --> Usuario: OK\n@enduml\n');
    writeFileSync(bpmn,'<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P" name="Pedido"><bpmn:startEvent id="Start"/><bpmn:task id="Review" name="Revisar"/><bpmn:endEvent id="End"/><bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Review"/><bpmn:sequenceFlow id="F2" sourceRef="Review" targetRef="End"/></bpmn:process></bpmn:definitions>');
    const {root}=await send('DOM.getDocument'),{nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'header input[type=file]'});
    await send('DOM.setFileInputFiles',{nodeId,files:[puml]});await sleep(600);
    let doc=await saved();expect(doc.id==='login'&&doc.nodes.length===2&&doc.edges.length===2,`PlantUML: ${doc.id} ${doc.nodes.length}/${doc.edges.length}`);
    await send('DOM.setFileInputFiles',{nodeId,files:[bpmn]});await sleep(600);
    doc=await saved();expect(doc.id==='pedido'&&doc.nodes.length===3&&doc.edges.length===2,`BPMN: ${doc.id} ${doc.nodes.length}/${doc.edges.length}`);
    const pick=value=>js(`(()=>{const s=document.querySelector('select[aria-label="Exportar"]');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await pick('plantuml-class');await sleep(250);
    const uml=await js('window.__blobs.at(-1).text()');expect(uml.includes('@startuml')&&uml.includes('Review'),'export PlantUML incompleto');
    await pick('bpmn');await sleep(250);
    const xml=await js('window.__blobs.at(-1).text()');expect(xml.includes('bpmn:definitions')&&xml.includes('F1'),'export BPMN incompleto');
    return `PlantUML ${Math.round(uml.length/1000)} KB, BPMN ${Math.round(xml.length/1000)} KB`;
  });
  await check('si el almacenamiento falla se avisa, no se confirma el guardado y el export sigue disponible',async()=>{
    await js(`(()=>{window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};})()`);
    const node=await center('.graph-node');await drag(node,{x:node.x+40,y:node.y});await sleep(500);
    const state=await js(`document.querySelector('.save-state').textContent`),text=await status();
    await js(`Storage.prototype.setItem=window.__set`);
    expect(state.includes('Sin guardar')&&text.includes('No se pudo guardar'),`estado: ${state} / ${text}`);
    expect(await clickText('Reintentar','.save-state'),'falta Reintentar');await sleep(200);
    expect((await js(`document.querySelector('.save-state').textContent`)).includes('Guardado'),'el reintento no guardó');
    return state;
  });
  await check('un documento guardado ilegible o de versión desconocida no se pisa y se puede exportar',async()=>{
    const future=JSON.stringify({...(await saved()),schemaVersion:'9.0.0'});
    await js(`localStorage.setItem(${ACTIVE_KEY},${JSON.stringify(future)})`);await send('Page.reload');await sleep(1500);
    const text=await status();expect(text.includes('9.0.0'),`mensaje: ${text}`);
    const node=await center('.graph-node');await drag(node,{x:node.x+40,y:node.y});await sleep(500);
    expect(await js(`localStorage.getItem(${ACTIVE_KEY})`)===future,'se pisó el documento ilegible');
    expect(await clickText('Exportar copia dañada'),'falta el botón de recuperación');await sleep(400);
    expect((await saved()).schemaVersion!=='9.0.0','el guardado no se rehabilitó');
    return text.slice(0,80);
  });
  await check('el chat pide una propuesta al gateway y sólo la aplica al aceptar (proveedor de demostración)',async()=>{
    const reachable=await js(`fetch('/api/v1/providers',{headers:{'x-diagramia-client':'editor'}}).then(r=>r.ok?r.json():null).catch(()=>null)`);
    if(!reachable?.providers.some(p=>p.id==='mock'))return 'OMITIDO: el gateway no corre con DIAGRAMIA_ENABLE_MOCK=1';
    await send('Page.reload');await sleep(1500);
    expect(await clickText('IA','.tabs'),'no está la pestaña IA');await sleep(500);
    await js(`(()=>{const set=(el,proto,v)=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};set(document.querySelector('#chat-provider'),HTMLSelectElement.prototype,'mock');set(document.querySelector('#chat-prompt'),HTMLTextAreaElement.prototype,'Agregá una caché');})()`);
    await sleep(100);const revision=(await saved()).revision;
    expect(await clickText('Enviar','.chat'),'falta Enviar');await sleep(1200);
    const staged=await js(`document.querySelector('ol.staged')?.textContent`);expect(staged&&staged.includes('ADD_NODE'),`propuesta: ${staged} / ${await js(`document.querySelector('.chat').textContent.slice(-300)`)}`);
    expect((await saved()).revision===revision,'la propuesta cambió el documento antes de aceptar');
    const badge=await js(`document.querySelector('.chat').textContent.includes('DEMOSTRACIÓN')`);expect(badge,'el mock no está marcado como demostración');
    await shot('10-desktop-chat-proposal');
    expect(await clickText('Aceptar y aplicar','.chat'),'falta aceptar');
    const doc=await saved();expect(doc.revision===revision+1&&doc.nodes.some(n=>n.id==='mock-cache'),'no se aplicó');
    return staged.slice(0,60);
  });
  await check('rechazar, cancelar o editar durante una propuesta de IA nunca cambia el documento sin aceptar',async()=>{
    const reachable=await js(`fetch('/api/v1/providers',{headers:{'x-diagramia-client':'editor'}}).then(r=>r.ok?r.json():null).catch(()=>null)`);
    if(!reachable?.providers.some(p=>p.id==='mock'))return 'OMITIDO: el gateway no corre con DIAGRAMIA_ENABLE_MOCK=1';
    const fill=text=>js(`(()=>{const set=(el,proto,v)=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};set(document.querySelector('#chat-provider'),HTMLSelectElement.prototype,'mock');set(document.querySelector('#chat-mode'),HTMLSelectElement.prototype,'edit');set(document.querySelector('#chat-prompt'),HTMLTextAreaElement.prototype,${JSON.stringify(text)});})()`);
    const chatText=()=>js(`document.querySelector('.chat').textContent`);
    await send('Page.reload');await sleep(1500);
    expect(await clickText('IA','.tabs'),'no está la pestaña IA');await sleep(500);
    const before=await saved();
    // Cancelar: el pedido se corta antes de que el proveedor responda.
    await fill('Agregá una caché');await sleep(80);
    await js(`(()=>{const b=[...document.querySelectorAll('.chat button')];b.find(x=>x.textContent.trim()==='Enviar').click();setTimeout(()=>b.find(x=>x.textContent.trim()==='Cancelar').click(),30);})()`);await sleep(900);
    expect((await chatText()).includes('Pedido cancelado')&&!(await js(`Boolean(document.querySelector('.staged'))`)),'la cancelación no se reflejó');
    // Vista previa en el canvas y rechazo.
    const nodesBefore=await js(`document.querySelectorAll('.canvas .graph-node').length`);
    await fill('Agregá una caché');await sleep(80);expect(await clickText('Enviar','.chat'),'falta Enviar');await sleep(1400);
    const staged=await js(`({nodes:document.querySelectorAll('.canvas .graph-node').length,marked:document.querySelectorAll('.canvas .staged').length,banner:document.querySelector('.canvas-banner')?.textContent??''})`);
    expect(staged.nodes===nodesBefore+1&&staged.marked>=1&&staged.banner.includes('Vista previa'),`vista previa: ${JSON.stringify(staged)}`);
    await shot('13-desktop-staging-preview');
    expect((await saved()).revision===before.revision,'la vista previa cambió el documento');
    expect(await clickText('Rechazar','.chat'),'falta Rechazar');await sleep(200);
    expect(await js(`document.querySelectorAll('.canvas .graph-node').length`)===nodesBefore&&!(await js(`Boolean(document.querySelector('.canvas-banner'))`)),'el rechazo dejó la vista previa');
    // Revisión obsoleta: se edita mientras la propuesta espera.
    await fill('Agregá una caché');await sleep(80);await clickText('Enviar','.chat');await sleep(1200);
    // Con la vista previa activa el canvas es de sólo lectura; se la apaga para editar mientras la propuesta espera.
    await js(`document.querySelector('[data-role="stage-toggle"]').click()`);await sleep(150);
    await js('document.activeElement?.blur()');
    const node=await center('[data-id="user"]');await drag(node,{x:node.x,y:node.y+64});await sleep(200);
    const text=await chatText();
    expect(text.includes('Regenerar')&&!text.includes('Aceptar y aplicar'),'la propuesta obsoleta sigue siendo aplicable');
    const after=await saved();
    expect(after.revision===before.revision+1&&after.nodes.length===before.nodes.length,`documento: r${after.revision} con ${after.nodes.length} nodos`);
    expect(await clickText('Regenerar','.chat'),'falta Regenerar');await sleep(1200);
    expect(await clickText('Aceptar y aplicar','.chat'),'la regeneración no produjo una propuesta aplicable');
    const done=await saved();expect(done.nodes.length===before.nodes.length+1&&done.revision===before.revision+2,'la propuesta regenerada no se aplicó');
    expect((await chatText()).includes('recuerda'),'la conversación no recuerda los turnos');
    return 'cancelar, previsualizar, rechazar, obsoleta y regenerar';
  });
  const setValue=(selector,value)=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  await check('los escenarios cambian el recorrido y los estados de los nodos',async()=>{
    await send('Page.reload');await sleep(1200);
    await setValue('select[aria-label="Cargar ejemplo"]','2');await sleep(600);
    const all=await js(`document.querySelectorAll('.steps li').length`);
    await setValue('select[aria-label="Recorrido"]','expired');await sleep(200);
    const expired=await js(`document.querySelectorAll('.steps li').length`);
    expect(all===19&&expired===13,`pasos: ${all} / ${expired}`);
    await js(`[...document.querySelectorAll('.steps button')].at(-1).click()`);await sleep(200);
    await js(`document.querySelector('.scrubber').focus()`);
    const seekEnd=await js(`(()=>{const r=document.querySelector('.scrubber');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(r,r.max);r.dispatchEvent(new Event('input',{bubbles:true}));return r.max;})()`);await sleep(200);
    const states=await js(`[...document.querySelectorAll('.canvas .node-state')].map(t=>t.textContent).join(' | ')`);
    expect(states.includes('LIBERADO')&&states.includes('CANCELADO')&&!states.includes('CONFIRMADO'),`estados: ${states}`);
    await shot('11-desktop-scenario-expired');
    await setValue('select[aria-label="Recorrido"]','recovered');await sleep(200);
    await js(`(()=>{const r=document.querySelector('.scrubber');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(r,r.max);r.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(200);
    const recovered=await js(`[...document.querySelectorAll('.canvas .node-state')].map(t=>t.textContent).join(' | ')`);
    expect(recovered.includes('CONFIRMADO')&&!recovered.includes('LIBERADO'),`estados: ${recovered}`);
    return `${expired} pasos, ${states}`;
  });
  await check('una imagen se agrega como asset, un SVG con script se rechaza y el asset se va con su nodo',async()=>{
    const png=join(profile,'logo.png'),evil=join(profile,'evil.svg');
    // PNG de 2 × 2 generado en el navegador para que sea una imagen real y decodificable.
    const data=await js(`(()=>{const c=document.createElement('canvas');c.width=64;c.height=48;const x=c.getContext('2d');x.fillStyle='#245cf6';x.fillRect(0,0,64,48);x.fillStyle='#d4f246';x.fillRect(8,8,24,24);return c.toDataURL('image/png').split(',')[1];})()`);
    writeFileSync(png,Buffer.from(data,'base64'));writeFileSync(evil,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>');
    const {root}=await send('DOM.getDocument'),{nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[data-role="image-input"]'});
    await send('DOM.setFileInputFiles',{nodeId,files:[png]});await sleep(900);
    let doc=await saved();const node=doc.nodes.at(-1);
    expect(doc.assets.length===1&&node.kind==='image'&&node.assetId===doc.assets[0].id,`assets: ${doc.assets.length}, ${await status()}`);
    expect(await js(`Boolean(document.querySelector('.canvas image'))`),'la imagen no se dibuja');
    await shot('12-desktop-image');
    await send('DOM.setFileInputFiles',{nodeId,files:[evil]});await sleep(700);
    const text=await status();doc=await saved();
    expect(doc.assets.length===1&&/SVG/.test(text),`tras SVG hostil: ${text}`);
    await js('document.activeElement?.blur()');await key('Delete');doc=await saved();
    expect(doc.assets.length===0&&!doc.nodes.some(n=>n.kind==='image'),'el asset quedó huérfano');
    return `${node.size.width}×${node.size.height}, rechazo: ${text.slice(0,70)}`;
  });
  await check('las anotaciones se guardan en el documento, se marcan en el canvas y no salen en el export',async()=>{
    await key('Escape');
    const api=await center('[data-id="api"]');await click(api);await sleep(100);
    expect(await clickText('Propiedades','.tabs'),'falta la pestaña');await sleep(100);
    await setValue('#new-annotation','Sin límite de reintentos');await sleep(60);
    expect(await clickText('Agregar','.annotations'),'falta Agregar');
    let doc=await saved();expect(doc.annotations.length===1&&doc.annotations[0].targetId==='api','no se guardó');
    expect(await js(`document.querySelectorAll('.canvas .annotation-mark').length`)===1,'sin marcador');
    await js(`(()=>{window.__blobs=[];const make=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__blobs.push(b);return make(b);};HTMLAnchorElement.prototype.click=function(){};})()`);
    await setValue('select[aria-label="Exportar"]','svg');await sleep(900);
    const svg=await js(`window.__blobs.at(-1).text()`);expect(svg.startsWith('<svg')&&!svg.includes('annotation-mark'),'el export incluye marcadores');
    await setValue('select[aria-label="Exportar"]','markdown');await sleep(300);
    const md=await js(`window.__blobs.at(-1).text()`);expect(md.includes('## Observaciones')&&md.includes('Sin límite de reintentos'),'el Markdown no incluye la anotación');
    const reachable=await js(`fetch('/api/v1/providers',{headers:{'x-diagramia-client':'editor'}}).then(r=>r.ok?r.json():null).catch(()=>null)`);
    if(!reachable?.providers.some(p=>p.id==='mock'))return 'anotación manual ok; revisión de IA OMITIDA: gateway sin proveedor de demostración';
    expect(await clickText('IA','.tabs'),'no está la pestaña IA');await sleep(500);
    await setValue('#chat-provider','mock');await setValue('#chat-mode','review');await setValue('#chat-prompt','Revisá la arquitectura');await sleep(100);
    expect(await clickText('Enviar','.chat'),'falta Enviar');await sleep(1200);
    expect(await clickText('Guardar como anotaciones','.chat'),`sin observaciones: ${await js(`document.querySelector('.chat').textContent.slice(-200)`)}`);
    doc=await saved();expect(doc.annotations.length===2&&doc.annotations[1].source==='ai',`anotaciones: ${doc.annotations.length}`);
    return `${doc.annotations.length} anotaciones (usuario + IA de demostración)`;
  });
  await check('formas, texto en el lugar, estilo y flechas enganchadas en cualquier punto',async()=>{
    await send('Page.reload');await sleep(1500);
    await setValue('select[aria-label="Cargar ejemplo"]','0');await sleep(600);
    // Forma UML desde la paleta: clic en la paleta y clic en el canvas.
    await js(`(()=>{for(const d of document.querySelectorAll('.palette details'))d.open=true;[...document.querySelectorAll('.palette-item')].find(b=>b.textContent.trim()==='Clase').click();})()`);await sleep(100);
    const host=await center('.canvas-host');
    await click({x:host.left+host.width*.2,y:host.top+host.height*.82});await sleep(150);
    expect(await js(`Boolean(document.querySelector('.inline-editor'))`),'no se abrió el editor en el lugar');
    await send('Input.insertText',{text:'Pedido'});await key('Enter');
    let doc=await saved();const cls=doc.nodes.at(-1);
    expect(cls.shape==='class'&&cls.label==='Pedido'&&cls.details.includes('--'),JSON.stringify({shape:cls.shape,label:cls.label}));
    // Doble clic sobre un nodo existente para renombrarlo en el lugar.
    await doubleClick(await center('[data-id="api"]'));
    expect(await js(`Boolean(document.querySelector('.inline-editor'))`),'el doble clic no abrió el editor');
    await send('Input.insertText',{text:'API pública'});await key('Enter');
    doc=await saved();expect(doc.nodes.find(n=>n.id==='api').label==='API pública','el doble clic no editó el texto');
    // Estilo: color de relleno desde Propiedades.
    await click(await center('[data-id="db"]'));expect(await clickText('Propiedades','.tabs'),'falta Propiedades');await sleep(120);
    await js(`document.querySelector('.color-field .swatch[title="#d4f246"]').click()`);
    doc=await saved();expect(doc.nodes.find(n=>n.id==='db').style.fill==='#d4f246','el relleno no cambió');
    // Flecha enganchada: se suelta cerca del borde superior de PostgreSQL y queda fija en ese punto.
    const user=await center('[data-id="user"] .node-shape'),db=await center('[data-id="db"] .node-shape');
    await js('document.activeElement?.blur()');await key('c');
    await drag({x:user.x,y:user.top+user.height-3},{x:db.left+db.width*.25,y:db.top+4});await key('Escape');
    doc=await saved();const edge=doc.edges.at(-1);
    expect(edge.from==='user'&&edge.to==='db'&&edge.toAnchor&&edge.toAnchor.y===0&&edge.toAnchor.x<.5&&edge.fromAnchor&&edge.fromAnchor.y===1,`enganches: ${JSON.stringify([edge.fromAnchor,edge.toAnchor])}`);
    // Arrastrar el extremo a otro nodo reconecta la flecha.
    // La conexión recién creada queda seleccionada: sus extremos ya son arrastrables.
    const end=await center('[data-handle="end-to"]'),front=await center('[data-id="frontend"] .node-shape');
    expect(end,'la flecha seleccionada no muestra sus extremos');
    await drag(end,{x:front.x,y:front.y});
    doc=await saved();const moved=doc.edges.find(e=>e.id===edge.id);
    expect(moved.to==='frontend'&&moved.toAnchor===null,`tras reconectar: ${moved.to}`);
    await shot('14-desktop-shapes-style-anchors');
    return `clase «${cls.label}», relleno ${doc.nodes.find(n=>n.id==='db').style.fill}, enganche ${JSON.stringify(edge.toAnchor)}`;
  });
  await check('pestañas: canvas nuevo, volver sin perder nada y cerrar',async()=>{
    const before=await saved(),tabs=await js(`document.querySelectorAll('.doc-tab').length`);
    await js(`document.querySelector('.doc-tab-add').click()`);await sleep(500);
    let doc=await saved();
    expect(doc.nodes.length===0&&await js(`document.querySelectorAll('.doc-tab').length`)===tabs+1,'no se abrió un canvas vacío');
    expect(await js(`Boolean(document.querySelector('.canvas-empty'))`),'falta el mensaje de canvas vacío');
    await js(`document.querySelectorAll('.doc-tab [role=tab]')[${tabs-1}].click()`);await sleep(500);
    doc=await saved();expect(doc.id===before.id&&doc.nodes.length===before.nodes.length&&doc.revision===before.revision,'la pestaña anterior cambió');
    await key('z',CTRL);expect((await saved()).revision===before.revision+1,'el historial de la pestaña se perdió al cambiar');
    await js(`document.querySelectorAll('.doc-tab-close')[${tabs}].click()`);await sleep(400);
    expect(await js(`document.querySelectorAll('.doc-tab').length`)===tabs,'la pestaña no se cerró');
    await send('Page.reload');await sleep(1500);
    expect(await js(`document.querySelectorAll('.doc-tab').length`)===tabs&&(await saved()).id===before.id,'las pestañas no se conservaron al recargar');
    return `${tabs} pestañas conservadas`;
  });
  await check('el ejemplo de login muestra pistas sincronizadas y permite editar una pista',async()=>{
    await setValue('select[aria-label="Cargar ejemplo"]','3');await sleep(700);
    let doc=await saved();expect(doc.id==='login-flow'&&doc.animations[0].tracks.length===3,'falta el ejemplo de login con pistas');
    expect(await clickText('Pistas (3)','.timeline-bar'),'falta el acceso visible a las pistas');await sleep(100);
    expect(await js(`document.querySelectorAll('.tracks-grid .track-row').length`)===4,'no se dibujaron las tres pistas');
    await js(`document.querySelectorAll('.tracks-grid .track-row')[2].querySelectorAll('.track-cell')[4].click()`);await sleep(150);
    expect((await js(`document.querySelector('.timeline .caption').textContent`)).includes('Se entrega una credencial'),'el texto de pista no sigue el playhead');
    await setValue('select[aria-label="Recorrido"]','rejected');await sleep(150);
    expect(await js(`document.querySelectorAll('.steps li').length`)===5,'la rama no filtró pasos');
    await js(`document.querySelectorAll('.tracks-grid .track-row')[2].querySelectorAll('.track-cell')[4].click()`);await sleep(150);
    expect((await js(`document.querySelector('.timeline .caption').textContent`)).includes('No se crea una sesión'),'la pista no siguió la rama de rechazo');
    expect(await clickText('+ Agregar pista','.tracks-editor'),'falta agregar pista');
    doc=await saved();expect(doc.animations[0].tracks.length===4,'no se creó la pista');
    await js(`document.querySelectorAll('.tracks-grid .track-row')[4].querySelectorAll('.track-cell')[0].click()`);
    doc=await saved();expect(doc.animations[0].tracks.at(-1).clips.length===1,'no se añadió un efecto al paso');
    await js(`(()=>{window.__blobs=[];const make=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__blobs.push(b);return make(b);};HTMLAnchorElement.prototype.click=function(){};})()`);
    await setValue('select[aria-label="Exportar"]','presentation-pdf');await sleep(1800);
    const exported=await js(`(async()=>{const b=window.__blobs.find(b=>b.type==='application/pdf');if(!b)return null;const bytes=new Uint8Array(await b.arrayBuffer());return {size:b.size,signature:String.fromCharCode(...bytes.slice(0,5))};})()`);
    expect(exported?.signature==='%PDF-'&&exported.size>10000,`PDF de presentación inválido: ${JSON.stringify(exported)} / ${await status()}`);
    await shot('16-desktop-login-tracks');return `3 pistas, rama filtrada, pista editable y PDF de presentación ${Math.round(exported.size/1024)} KB`;
  });
  await check('modo oscuro, panel lateral plegable con IA primero y tutorial',async()=>{
    const first=await js(`document.querySelector('.tabs button').textContent`);expect(first==='IA',`primera pestaña del panel: ${first}`);
    expect(await js(`Boolean(document.querySelector('.chat'))`),'el panel no abre en IA');
    const light=await js(`getComputedStyle(document.querySelector('.canvas-host')).backgroundColor`);
    await tap('[aria-label="Cambiar a modo oscuro"]');await sleep(300);
    const dark=await js(`({theme:document.documentElement.dataset.theme,canvas:getComputedStyle(document.querySelector('.canvas-host')).backgroundColor,node:getComputedStyle(document.querySelector('.canvas .node-shape')).fill})`);
    expect(dark.theme==='dark'&&dark.canvas!==light&&dark.node!=='rgb(255, 255, 255)',JSON.stringify(dark));
    await shot('15-desktop-dark');
    await js(`(()=>{window.__blobs=[];const make=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__blobs.push(b);return make(b);};HTMLAnchorElement.prototype.click=function(){};})()`);
    await setValue('select[aria-label="Exportar"]','png1');await sleep(1500);
    const pixel=await js(`(async()=>{const bitmap=await createImageBitmap(window.__blobs.at(-1));const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const x=c.getContext('2d');x.drawImage(bitmap,0,0);return [...x.getImageData(2,2,1,1).data];})()`);
    expect(pixel[0]===255&&pixel[1]===255&&pixel[2]===255,`el export en modo oscuro no salió claro: ${pixel}`);
    await send('Page.reload');await sleep(1500);
    expect(await js(`document.documentElement.dataset.theme`)==='dark','el tema no se recordó');
    const wide=await center('.canvas-host');
    await tap('[aria-controls="side-panel"]');await sleep(300);
    const wider=await center('.canvas-host');
    expect(!(await js(`Boolean(document.querySelector('.side'))`))&&wider.width>wide.width+200,'el panel no se cerró');
    await tap('[aria-controls="side-panel"]');await sleep(200);
    expect(await js(`Boolean(document.querySelector('.side'))`),'el panel no volvió a abrirse');
    await tap('[aria-label="Abrir el tutorial"]');await sleep(300);
    expect(await js(`Boolean(document.querySelector('.tutorial'))`)&&await js(`document.querySelector('.app').inert`),'el tutorial no abrió como modal');
    await shot('16-desktop-tutorial-dark');
    for(let i=0;i<5;i++){await js(`[...document.querySelectorAll('.tutorial button')].find(b=>b.textContent==='Siguiente').click()`);await sleep(60);}
    await js(`[...document.querySelectorAll('.tutorial button')].find(b=>b.textContent==='Empezar').click()`);await sleep(200);
    expect(!(await js(`Boolean(document.querySelector('.tutorial'))`)),'el tutorial no cerró');
    await js(`localStorage.removeItem('diagramia.tutorial.seen')`);await send('Page.reload');await sleep(1500);
    expect(await js(`Boolean(document.querySelector('.tutorial'))`),'el tutorial no aparece la primera vez');
    await js(`[...document.querySelectorAll('.tutorial button')].find(b=>b.textContent==='Saltar').click()`);await sleep(150);
    await tap('[aria-label="Cambiar a modo claro"]');await sleep(200);
    return `canvas ${light} → ${dark.canvas}`;
  });
  for(const [width,height,label] of [[1024,768,'tablet'],[390,844,'mobile']]){
    await check(`layout ${label} ${width}×${height} sin desborde horizontal`,async()=>{
      await viewport(width,height,label==='mobile');await sleep(400);await key('1');await sleep(200);
      const overflow=await js(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
      await shot(`07-${label}`);
      expect(overflow<=1,`desborde horizontal de ${overflow}px`);
      if(label==='mobile'){
        const canvas=await center('.canvas-host');
        expect(canvas.top<height-160,`el catálogo empujó el canvas fuera de la primera pantalla (y=${Math.round(canvas.top)})`);
        expect(await js(`document.querySelector('.tool-extra-toggle')?.getAttribute('aria-expanded')`)==='false','el catálogo móvil debe abrir plegado');
      }
      return `canvas ${JSON.stringify(await js(`(()=>{const r=document.querySelector('.canvas-host').getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})()`))}`;
    });
  }
  await check('sin errores de consola ni excepciones durante todo el recorrido',async()=>{expect(!problems.length,problems.slice(0,5).join(' | '));return await status();});
}finally{
  socket.close();browser.kill();await sleep(300);
  try{rmSync(profile,{recursive:true,force:true});}catch{}
}
const failed=results.filter(r=>!r.ok).length;
console.log(`\n${results.length-failed}/${results.length} comprobaciones aprobadas. Capturas en ${shots}/`);
process.exit(failed?1:0);
