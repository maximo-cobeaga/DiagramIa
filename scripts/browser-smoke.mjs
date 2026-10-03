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
const KEYS={Enter:['Enter',13],F2:['F2',113],c:['KeyC',67],z:['KeyZ',90],n:['KeyN',78],l:['KeyL',76],p:['KeyP',80],a:['KeyA',65],d:['KeyD',68],e:['KeyE',69],f:['KeyF',70],g:['KeyG',71],Escape:['Escape',27],ArrowRight:['ArrowRight',39],ArrowUp:['ArrowUp',38],End:['End',35],Delete:['Delete',46],'1':['Digit1',49]};
async function key(name,modifiers=0){
  const [code,vk]=KEYS[name],base={key:name,code,windowsVirtualKeyCode:vk,modifiers};
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',...base});await send('Input.dispatchKeyEvent',{type:'keyUp',...base});await sleep(60);
}
const CTRL=2,SHIFT=8;
const center=selector=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,left:r.left,top:r.top};})()`);
// El documento activo: el índice de pestañas dice cuál es y cada pestaña se guarda con su propia clave.
const ACTIVE_KEY=`'diagramia.doc.'+JSON.parse(localStorage.getItem('diagramia.workspace')).active`;
const saved=async()=>{await sleep(450);return js(`JSON.parse(localStorage.getItem(${ACTIVE_KEY}))`);};
// El chat envía con un botón de ícono: se lo busca por su clase, no por el texto.
const sendChat=()=>js("(()=>{const b=document.querySelector('.chat .send:not(.stop)');if(!b||b.disabled)return false;b.click();return true;})()");
const clickText=(text,scope='body')=>js(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope)}+' button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)return false;b.click();return true;})()`);
const status=()=>js(`document.querySelector('.status span').textContent`);

const results=[];
async function check(name,fn){
  try{const detail=await fn();results.push({name,ok:true,detail});console.log(`ok   ${name}${detail?' — '+detail:''}`);}
  catch(e){results.push({name,ok:false});console.log(`FAIL ${name} — ${e.message}`);}
}
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
const setValue=(selector,value)=>js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);

try{
  await send('Page.enable');await send('Runtime.enable');
  await viewport(1440,900);
  await send('Page.navigate',{url:URL_});await sleep(1200);
  // El inicio se comprueba sin datos previos en este perfil aislado.
  await js(`(()=>{localStorage.clear();localStorage.setItem('diagramia.tutorial.seen','1');localStorage.setItem('diagramia.theme','light');})()`);await send('Page.reload');await sleep(1500);

  await check('el inicio permite contar una idea o dibujar y recupera lo creado al recargar',async()=>{
    expect(await js(`Boolean(document.querySelector('.start-guide'))&&!document.querySelector('.tutorial')`),'el inicio falta o quedó tapado por un modal');
    const empty=await saved();expect(empty.nodes.length===0,'la primera idea no está vacía');
    await shot('27-inicio-guiado');
    await viewport(390,844);await sleep(200);
    await js(`document.querySelector('.start-guide').scrollIntoView({block:'center'})`);
    expect(await js(`document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.start-choice')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.width>=250;})`),'el inicio móvil recorta los botones o desborda');
    await shot('31-inicio-movil');await viewport(1440,900);await js(`scrollTo(0,0)`);await sleep(150);
    await tap('[aria-label="Contame tu idea"]');await sleep(150);
    expect(await js(`document.activeElement.id==='chat-prompt'||document.activeElement.classList.contains('signin')`),'no se enfocó la entrada de IA o de acceso');
    expect((await saved()).revision===empty.revision,'abrir la IA modificó el documento');
    await tap('[aria-label="Dibujar"]');await sleep(80);
    const host=await center('.canvas-host');await click({x:host.x,y:host.y});
    expect(await js(`Boolean(document.querySelector('.inline-editor'))`),'no se puede escribir la primera idea');
    await send('Input.insertText',{text:'Mi cumpleaños'});await key('Enter');
    const drawn=await saved();expect(drawn.nodes.length===1&&drawn.nodes[0].label==='Mi cumpleaños','no se guardó el dibujo');
    await send('Page.reload');await sleep(1200);
    expect((await saved()).nodes[0].id===drawn.nodes[0].id&&!await js(`Boolean(document.querySelector('.start-guide'))`),'recargar reinició el trabajo');
    return 'tres entradas claras; IA sin envío automático; dibujo guardado con su ID';
  });
  await check('los ejemplos cotidianos son editables y se abren sin reemplazar el trabajo',async()=>{
    const old=await js(`JSON.parse(localStorage.getItem('diagramia.workspace')).active`),before=await saved();
    await tap('.doc-tab-add');await tap('[aria-label="Elegir un ejemplo"]');await sleep(120);await shot('30-ejemplos-cotidianos');
    await viewport(390,844);await sleep(150);await js(`document.querySelector('.start-guide').scrollIntoView({block:'center'})`);
    expect(await js(`document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.start-example')].every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})`),'los ejemplos móviles desbordan');
    await shot('32-ejemplos-movil');await viewport(1440,900);await js(`scrollTo(0,0)`);await sleep(150);
    await tap('[aria-label="Abrir ejemplo: Explicar una idea"]');
    const idea=await saved();expect(idea.id==='explain-idea'&&idea.nodes.length===3&&idea.animations[0].steps.length===3,'falta el ejemplo de idea editable y animado');
    expect(await js(`JSON.parse(localStorage.getItem('diagramia.doc.'+${JSON.stringify(old)})).nodes[0].id`)===before.nodes[0].id,'se reemplazó el trabajo anterior');
    await js(`(()=>{const s=document.querySelector('select[aria-label="Cargar ejemplo"]');s.value='6';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const task=await saved();expect(task.id==='plan-task'&&task.nodes.length===4,'falta el ejemplo de tarea');
    return 'idea de tres pasos y tarea de cuatro pasos; documento previo conservado';
  });
  await check('insertar y escribir mantiene la forma, el icono y el color elegidos',async()=>{
    await tap('.doc-tab-add');const host=await center('.canvas-host');
    for(const [i,name] of ['Nota adhesiva','Idea','Página web','Clase'].entries()){
      await js(`(()=>{for(const d of document.querySelectorAll('.palette details'))d.open=true;[...document.querySelectorAll('.palette-item')].find(b=>b.querySelector('span').textContent===${JSON.stringify(name)}).click();})()`);
      const at={x:host.left+host.width*(i%2?.7:.3),y:host.top+host.height*(i<2?.36:.76)};
      await mouse('mouseMoved',at.x,at.y,{buttons:0});await sleep(80);
      const preview=await js(`(()=>{const n=document.querySelector('.place-ghost .graph-node');return {shape:[...n.classList].find(c=>c.startsWith('shape-')),fill:getComputedStyle(n.querySelector('.node-shape')).fill,icon:n.querySelector('.node-icon')?.getAttribute('d')};})()`);
      await mouse('mousePressed',at.x,at.y);await sleep(60);expect(await js(`Boolean(document.querySelector('.place-ghost'))`),'presionar oculta la vista previa real');
      await mouse('mouseReleased',at.x,at.y);await sleep(80);
      const doc=await saved(),node=doc.nodes.at(-1),appearance=await js(`(()=>{const n=document.querySelector('[data-id="${node.id}"]'),e=document.querySelector('.inline-editor');return {shape:[...n.classList].find(c=>c.startsWith('shape-')),fill:getComputedStyle(n.querySelector('.node-shape')).fill,icon:n.querySelector('.node-icon')?.getAttribute('d'),editor:getComputedStyle(e).backgroundColor};})()`);
      expect(appearance.shape===preview.shape&&appearance.fill===preview.fill&&appearance.icon===preview.icon,`${name} se convirtió en otro objeto durante la inserción`);
      expect(appearance.editor==='rgba(0, 0, 0, 0)','la edición tapa la forma con un fondo genérico');
      if(i===3)await shot('33-insercion-fiel');await key('Escape');
    }
    return 'nota, globo, ventana y clase siguen visibles al escribir';
  });
  const trace=async points=>{await mouse('mousePressed',points[0].x,points[0].y);for(const p of points.slice(1))await mouse('mouseMoved',p.x,p.y);};
  await check('el lápiz guarda círculos, puntos y varios trazos con su color desde la vista previa',async()=>{
    await tap('.doc-tab-add');await key('d');await clickText('Color','.pen-tools');
    expect(await js(`document.querySelectorAll('.pen-tools .color-grid .color-dot').length`)===24,'faltan los colores ampliados');
    await setValue('.pen-tools [aria-label="Código del color"]','invalid');expect(await js(`document.querySelector('.pen-tools .custom-color-entry button').disabled`),'acepta un color inválido');
    await setValue('.pen-tools [aria-label="Código del color"]','#bb3366');await clickText('＋ Agregar','.pen-tools');await setValue('[aria-label="Grosor del lápiz"]','4');
    const host=await center('.canvas-host'),cx=host.x,cy=host.top+host.height*.62,points=Array.from({length:65},(_,i)=>({x:cx+50*Math.cos(i*Math.PI*2/64),y:cy+50*Math.sin(i*Math.PI*2/64)}));
    await trace(points);await sleep(100);
    const draft=await js(`(()=>{const s=getComputedStyle(document.querySelector('.ink-preview .free-drawing-path'));return {stroke:s.stroke,dash:s.strokeDasharray,width:s.strokeWidth};})()`);
    expect(draft.stroke==='rgb(187, 51, 102)'&&draft.dash==='none'&&draft.width==='4px',`el trazo cambia durante el gesto: ${JSON.stringify(draft)}`);await shot('34-lapiz-color-real');
    await mouse('mouseReleased',points[0].x,points[0].y);let doc=await saved(),loop=doc.drawings.at(-1);
    expect(loop.kind==='freehand'&&loop.points.length>40&&loop.style.stroke==='#bb3366','el círculo cerrado se perdió o cambió de color');
    await click({x:cx-90,y:cy+80});await drag({x:cx-20,y:cy+95},{x:cx+50,y:cy+95});doc=await saved();expect(doc.drawings.length===3,'el lápiz no permite puntos o varios trazos seguidos');
    await key('Escape');await click({x:points[0].x,y:points[0].y});await clickText('Color','.selection-toolbar');await tap('.selection-toolbar [aria-label="Color Rojo"]');
    expect((await saved()).drawings.find(d=>d.id===loop.id).style.stroke==='#d12f45','no se guardó el nuevo color');
    expect(await js(`getComputedStyle(document.querySelector('[data-id="${loop.id}"] .free-drawing-path')).stroke`)==='rgb(209, 47, 69)','la selección oculta el color real');
    expect(await js(`Boolean(document.querySelector('.selection-outline'))`),'falta el borde independiente de selección');
    expect(await js(`(()=>{const b=document.querySelector('.selection-toolbar').getBoundingClientRect(),s=document.querySelector('[data-id="${loop.id}"] .free-drawing-path').getBoundingClientRect();return b.right<=s.left||b.left>=s.right||b.bottom<=s.top||b.top>=s.bottom;})()`),'la paleta tapa el trazo seleccionado aunque hay lugar al costado');await shot('38-color-seleccionado');await key('z',CTRL);
    expect((await saved()).drawings.find(d=>d.id===loop.id).style.stroke==='#bb3366','undo no restaura el color');
    await clickText('Emprolijar','.selection-toolbar');expect((await saved()).drawings.find(d=>d.id===loop.id).id===loop.id,'emprolijar cambia el ID');await key('z',CTRL);
    expect(JSON.stringify((await saved()).drawings.find(d=>d.id===loop.id).points)===JSON.stringify(loop.points),'undo no recupera el trazo antes de emprolijar');
    await send('Page.reload');await sleep(1000);expect((await saved()).drawings[0].id===loop.id,'recargar cambia el ID');await key('d');await clickText('Color','.pen-tools');
    expect(await js(`Boolean(document.querySelector('.pen-tools [aria-label="Color guardado #bb3366"]'))`),'el color propio se perdió al recargar');
    await viewport(390,844);await sleep(180);await js(`document.querySelector('.canvas-host').scrollIntoView({block:'center'})`);
    expect(await js(`document.documentElement.scrollWidth<=innerWidth&&(()=>{const p=document.querySelector('.pen-tools').getBoundingClientRect(),h=document.querySelector('.canvas-host').getBoundingClientRect();return p.left>=h.left&&p.right<=h.right&&p.bottom<=h.bottom;})()`),'el lápiz o la paleta se salen del canvas móvil');await shot('37-lapiz-movil');await viewport(1440,900);await js(`scrollTo(0,0)`);await key('Escape');
    return 'círculo cerrado, punto y trazo; color visible seleccionado; muestra propia persistida';
  });
  await check('el guiado emprolija un rectángulo al mantener y Shift endereza líneas sin cambiar el color',async()=>{
    await tap('.doc-tab-add');await key('g');await sleep(100);const host=await center('.canvas-host'),x=host.x-90,y=host.top+host.height*.55;
    const corners=[{x,y},{x:x+150,y},{x:x+150,y:y+90},{x,y:y+90},{x,y}],points=[corners[0]];
    for(let j=1;j<corners.length;j++)for(let i=1;i<=8;i++)points.push({x:corners[j-1].x+(corners[j].x-corners[j-1].x)*i/8,y:corners[j-1].y+(corners[j].y-corners[j-1].y)*i/8});
    const before=await saved();await trace(points);await sleep(750);
    expect((await status()).includes('Rectángulo emprolijado'),'mantener no emprolija el rectángulo');expect((await saved()).revision===before.revision,'el guiado guardó antes de soltar');await shot('35-lapiz-guiado');
    await mouse('mouseReleased',x,y);let doc=await saved();expect(doc.drawings[0].points.length===5,'el rectángulo no conserva las cuatro esquinas');
    const circle=Array.from({length:65},(_,i)=>({x:x+225+40*Math.cos(i*Math.PI*2/64),y:y+45+40*Math.sin(i*Math.PI*2/64)}));
    await trace(circle);await sleep(750);expect((await status()).includes('Círculo emprolijado'),'mantener no emprolija el círculo');await mouse('mouseReleased',circle[0].x,circle[0].y);doc=await saved();expect(doc.drawings.at(-1).points.length===81,'el círculo guiado no se guardó editable');
    await key('Escape');await key('l');await drag({x:x-20,y:y+160},{x:x+100,y:y+167},SHIFT);doc=await saved();const line=doc.drawings.at(-1);
    expect(line.kind==='line'&&Math.abs(line.points[0].y-line.points[1].y)<.01,'Shift no endereza la línea');
    // Esc durante el gesto descarta el borrador, sin agregar un trazo.
    await key('d');const count=doc.drawings.length;await mouse('mousePressed',x,y+210);await mouse('mouseMoved',x+70,y+220);await key('Escape');await mouse('mouseReleased',x+70,y+220);
    expect((await saved()).drawings.length===count,'Esc guardó un trazo que debía cancelar');return 'forma editable, guía sin commit prematuro, línea horizontal y cancelación';
  });
  await check('goma y conversión a texto son reversibles y conservan los trazos originales al cancelar',async()=>{
    const before=await saved(),drawing=before.drawings[0],point=drawing.points[0];
    const at=await js(`(()=>{const c=document.querySelector('.canvas'),r=c.getBoundingClientRect(),v=c.getAttribute('viewBox').split(/\\s+/).map(Number);return {x:r.left+(${point.x}-v[0])*r.width/v[2],y:r.top+(${point.y}-v[1])*r.height/v[3]};})()`);
    await key('e');await click(at);expect(!(await saved()).drawings.some(d=>d.id===drawing.id),'la goma no borró el trazo');await key('z',CTRL);expect((await saved()).drawings.some(d=>d.id===drawing.id),'undo no recupera el ID borrado');await key('Escape');
    await click(at);await clickText('Pasar a texto','.selection-toolbar');await sleep(500);
    expect(await js(`Boolean(document.querySelector('.handwriting-text'))`),'falta revisar la conversión');
    const snapshot=JSON.stringify(await saved());await clickText('Cancelar','.handwriting-text');expect(JSON.stringify(await saved())===snapshot,'cancelar la conversión tocó el dibujo');
    await clickText('Pasar a texto','.selection-toolbar');await sleep(500);await setValue('.handwriting-text input','Mi nota');await shot('36-goma-texto');await clickText('Reemplazar por texto','.handwriting-text');
    const converted=await saved();expect(converted.nodes.at(-1).kind==='text'&&converted.nodes.at(-1).label==='Mi nota'&&!converted.drawings.some(d=>d.id===drawing.id),'la conversión no es un reemplazo editable');
    await key('z',CTRL);const restored=await saved();expect(restored.drawings.some(d=>d.id===drawing.id)&&restored.nodes.length===before.nodes.length,'undo no recupera el dibujo original');
    return 'goma con undo; original intacto hasta confirmar; texto editable y recuperación; API local '+(await js(`Boolean(navigator.createHandwritingRecognizer&&globalThis.HandwritingStroke)`)?'presente, español sin certificar':'no disponible, entrada manual');
  });
  // El resto de la regresión conserva su fixture de arquitectura y no consume pestañas de las pruebas de inicio.
  await js(`(()=>{localStorage.clear();localStorage.setItem('diagramia.tutorial.seen','1');localStorage.setItem('diagramia.theme','light');})()`);await send('Page.reload');await sleep(1200);
  await js(`(()=>{const s=document.querySelector('select[aria-label="Cargar ejemplo"]');s.value='0';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(550);

  await check('carga el ejemplo de arquitectura sin errores',async()=>{
    const count=await js(`document.querySelectorAll('.canvas .graph-node').length`);expect(count===4,`se esperaban 4 nodos, hay ${count}`);
    await shot('01-desktop-architecture');return `${count} nodos`;
  });
  await check('el reproductor compacto devuelve espacio al lienzo y su panel se ajusta sin editar el documento',async()=>{
    const before=JSON.stringify(await saved()),compact=await center('.timeline'),canvas=await center('.canvas-host');
    expect(compact.height<=96,`barra inicial demasiado alta: ${compact.height}`);
    expect(!await js(`Boolean(document.querySelector('.motion-editor'))`),'el editor de pasos ocupa espacio al abrir');
    expect(await clickText('Editar pasos','.timeline'),'falta Editar pasos');await sleep(80);
    const opened=await center('.timeline'),smaller=await center('.canvas-host');
    expect(opened.height>compact.height+120&&smaller.height<canvas.height-120,'abrir no intercambió espacio con el lienzo');
    const handle=await center('.timeline-resize');await drag(handle,{x:handle.x,y:handle.y+65});
    expect((await center('.timeline')).height<opened.height-40,'arrastrar hacia abajo no redujo el panel');
    await js(`document.querySelector('.timeline-resize').focus()`);await key('ArrowUp');await key('End');await sleep(80);
    expect(!await js(`Boolean(document.querySelector('.motion-editor'))`),'End no bajó el panel');
    expect(await js(`document.activeElement.classList.contains('edit-motion')`),'el foco quedó perdido al plegar');
    expect((await center('.canvas-host')).height>=canvas.height-1,'no se recuperó el espacio del lienzo');
    await clickText('Reproducir','.timeline');await sleep(160);await clickText('Editar pasos','.timeline');await tap('.edit-motion');
    expect(await js(`document.querySelector('.play-button').dataset.playing==='true'`),'bajar el panel detuvo la reproducción');
    await clickText('Pausar','.timeline');
    expect(JSON.stringify(await saved())===before,'el reproductor o su altura modificó el contenido');
    await key('1');await sleep(100);await shot('25-ui-compacta');
    return `barra ${compact.height}px; lienzo ${canvas.height}px; panel ajustable con mouse y teclado`;
  });
  await check('la barra contextual escribe, colorea, duplica y conecta con mouse o teclado sin perder los originales',async()=>{
    const before=await saved();await click(await center('[data-id="user"]'));await sleep(80);
    expect(await js(`Boolean(document.querySelector('.selection-toolbar'))`),'no aparece la barra junto al elemento');
    await clickText('Color','.selection-toolbar');await tap('[aria-label="Color Lima"]');
    let doc=await saved();expect(doc.nodes.find(n=>n.id==='user').style.fill==='#d4f246','no cambió el color');
    expect(JSON.stringify(doc.nodes.filter(n=>n.id!=='user'))===JSON.stringify(before.nodes.filter(n=>n.id!=='user')),'el color tocó otros nodos');await key('z',CTRL);
    await clickText('Escribir','.selection-toolbar');await send('Input.insertText',{text:'Mi usuario'});await key('Enter');
    expect((await saved()).nodes.find(n=>n.id==='user').label==='Mi usuario','no escribió en el lugar');await key('z',CTRL);
    await clickText('Duplicar','.selection-toolbar');doc=await saved();
    expect(doc.nodes.length===before.nodes.length+1&&new Set(doc.nodes.map(n=>n.id)).size===doc.nodes.length&&before.nodes.every(n=>doc.nodes.some(x=>x.id===n.id)),'duplicar cambió o repitió IDs');await key('z',CTRL);
    await click(await center('[data-id="user"]'));await clickText('Unir','.selection-toolbar');await click(await center('[data-id="api"]'));
    expect((await saved()).edges.some(e=>e.from==='user'&&e.to==='api'),'no conectó con clic');await key('z',CTRL);
    await click(await center('[data-id="user"]'));await clickText('Unir','.selection-toolbar');await js(`document.querySelector('.canvas [data-id="db"]').focus()`);await key('Enter');
    expect((await saved()).edges.some(e=>e.from==='user'&&e.to==='db'),'no conectó con teclado');await key('z',CTRL);
    await click(await center('[data-id="user"]'));const revision=(await saved()).revision;await clickText('Unir','.selection-toolbar');await key('Escape');
    expect(!await js(`Boolean(document.querySelector('.connect-invitation'))`)&&(await saved()).revision===revision,'cancelar unión dejó estado pendiente o editó');
    doc=await saved();expect(JSON.stringify(doc.nodes)===JSON.stringify(before.nodes)&&JSON.stringify(doc.edges)===JSON.stringify(before.edges),'undo no restauró el contenido');
    await clickText('Color','.selection-toolbar');await shot('28-controles-contextuales');await clickText('Más','.selection-toolbar');await sleep(100);
    expect(await js(`document.querySelector('.tabs [aria-selected="true"]').textContent`)==='Propiedades','Más no abrió las propiedades');
    await key('Escape');await key('1');await clickText('IA','.tabs');return 'color, texto, IDs nuevos, dos formas de conectar, cancelar y undo';
  });
  await check('concentración amplía el lienzo y conserva documento, paneles y reproducción',async()=>{
    await clickText('Editar pasos','.timeline');await clickText('Cuenta','.tabs');await sleep(100);
    const doc=JSON.stringify(await saved()),normal=await center('.canvas-host');await tap('.focus-toggle');await sleep(100);
    const focused=await center('.canvas-host');
    expect(focused.width>normal.width+400&&focused.height>normal.height+120,'no recuperó espacio para el lienzo');
    expect(await js(`getComputedStyle(document.querySelector('.tools')).display==='none'&&getComputedStyle(document.querySelector('.side')).display==='none'`),'quedaron paneles visibles');
    await shot('29-modo-concentracion');await clickText('Reproducir','.timeline');await sleep(180);await clickText('Pausar','.timeline');await key('Escape');await sleep(100);
    expect(await js(`document.querySelector('.tabs [aria-selected="true"]').textContent`)==='Cuenta'&&await js(`Boolean(document.querySelector('.motion-editor'))`),'no recuperó panel y edición previos');
    expect(JSON.stringify(await saved())===doc,'el modo concentración modificó el documento');
    await tap('[aria-controls="side-panel"]');await key('f',SHIFT);await key('Escape');
    expect(!await js(`Boolean(document.querySelector('.side'))`),'se abrió un panel que antes estaba cerrado');
    await tap('[aria-controls="side-panel"]');await clickText('IA','.tabs');await tap('.edit-motion');await key('1');
    return `lienzo ${normal.width}×${normal.height} → ${focused.width}×${focused.height}; preferencias restauradas`;
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
    expect(await clickText('Cuenta','.tabs'),'no está la pestaña Cuenta');await sleep(80);
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
    if(!await js(`Boolean(document.querySelector('.motion-editor'))`))await clickText('Editar pasos','.timeline');
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
    expect(await js(`document.querySelectorAll('.canvas .graph-node').length`)===before.nodes.length,'cambió la cantidad de nodos');
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
    if(!await js(`Boolean(document.querySelector('.motion-editor'))`))await clickText('Editar pasos','.timeline');
    await js(`document.querySelector('.timeline-edit').open=true`);
    const before=(await saved()).animations.length;
    expect(await clickText('Crear recorrido','.timeline'),'falta el botón');
    const doc=await saved();expect(doc.animations.length===before+1,'no se creó la animación');
    const steps=doc.animations.at(-1).steps.length;
    expect(await clickText('+ Agregar paso','.timeline'),'falta la acción simple de agregar paso');
    expect((await saved()).animations.at(-1).steps.length===steps+1,'no se agregó el paso');
    return `${steps} pasos automáticos + paso manual`;
  });
  await check('editar texto y segundos de un paso se guarda y se deshace separado del reproductor',async()=>{
    const doc=await saved(),animation=doc.animations.at(-1),index=await js(`[...document.querySelectorAll('.steps button')].findIndex(b=>b.getAttribute('aria-current')==='step')`),step=animation.steps[index];
    const edit=async(label,value)=>{await js(`(()=>{const field=[...document.querySelectorAll('.step-editor .field')].find(f=>f.querySelector('label')?.textContent===${JSON.stringify(label)}).querySelector('input,textarea');field.focus();field.select();})()`);await send('Input.insertText',{text:value});};
    await edit('Duración (segundos)','2.5');await sleep(60);await js(`document.activeElement.blur()`);
    expect((await saved()).animations.at(-1).steps.find(s=>s.id===step.id).durationMs===2500,'los segundos no se guardaron como duración canónica');
    await edit('Texto del paso '+(index+1),'Una idea fácil de contar');await sleep(60);await js(`document.activeElement.blur()`);
    expect((await saved()).animations.at(-1).steps.find(s=>s.id===step.id).caption==='Una idea fácil de contar','no guardó el texto');
    await key('z',CTRL);await key('z',CTRL);
    const restored=(await saved()).animations.at(-1).steps.find(s=>s.id===step.id);expect(restored.caption===step.caption&&restored.durationMs===step.durationMs,'undo perdió el texto o duración originales');
    await shot('26-ui-editar-pasos');return 'texto y 2,5 segundos guardados; dos undo restauran el paso';
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
    const node=await center('.canvas .graph-node');await drag(node,{x:node.x+40,y:node.y});await sleep(500);
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
    const node=await center('.canvas .graph-node');await drag(node,{x:node.x+40,y:node.y});await sleep(500);
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
    await js(`(()=>{const set=(el,proto,v)=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};const provider=document.querySelector('#chat-provider');if(provider)set(provider,HTMLSelectElement.prototype,'mock');set(document.querySelector('#chat-prompt'),HTMLTextAreaElement.prototype,'Agregá una caché');})()`);
    await sleep(100);const revision=(await saved()).revision;
    expect(await sendChat(),'falta Enviar');await sleep(1200);
    const staged=await js(`document.querySelector('ol.staged')?.textContent`);expect(staged&&staged.includes('Agrega'),`propuesta: ${staged} / ${await js(`document.querySelector('.chat').textContent.slice(-300)`)}`);
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
    const fill=text=>js(`(()=>{const set=(el,proto,v)=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};const provider=document.querySelector('#chat-provider');if(provider)set(provider,HTMLSelectElement.prototype,'mock');set(document.querySelector('#chat-prompt'),HTMLTextAreaElement.prototype,${JSON.stringify(text)});})()`);
    const chatText=()=>js(`document.querySelector('.chat').textContent`);
    await send('Page.reload');await sleep(1500);
    expect(await clickText('IA','.tabs'),'no está la pestaña IA');await sleep(500);
    const before=await saved();
    // Cancelar: el pedido se corta antes de que el proveedor responda.
    await fill('Agregá una caché');await sleep(80);
    await js(`(()=>{document.querySelector('.chat .send').click();setTimeout(()=>document.querySelector('.chat .send.stop').click(),30);})()`);await sleep(900);
    expect((await chatText()).includes('Pedido cancelado')&&!(await js(`Boolean(document.querySelector('.staged'))`)),'la cancelación no se reflejó');
    // Vista previa en el canvas y rechazo.
    const nodesBefore=await js(`document.querySelectorAll('.canvas .graph-node').length`);
    await fill('Agregá una caché');await sleep(80);expect(await sendChat(),'falta Enviar');await sleep(1400);
    const staged=await js(`({nodes:document.querySelectorAll('.canvas .graph-node').length,marked:document.querySelectorAll('.canvas .staged').length,banner:document.querySelector('.canvas-banner')?.textContent??''})`);
    expect(staged.nodes===nodesBefore+1&&staged.marked>=1&&staged.banner.includes('Vista previa'),`vista previa: ${JSON.stringify(staged)}`);
    await shot('13-desktop-staging-preview');
    expect((await saved()).revision===before.revision,'la vista previa cambió el documento');
    expect(await clickText('Rechazar','.chat'),'falta Rechazar');await sleep(200);
    expect(await js(`document.querySelectorAll('.canvas .graph-node').length`)===nodesBefore&&!(await js(`Boolean(document.querySelector('.canvas-banner'))`)),'el rechazo dejó la vista previa');
    // Revisión obsoleta: se edita mientras la propuesta espera.
    await fill('Agregá una caché');await sleep(80);await sendChat();await sleep(1200);
    // Con la vista previa activa el canvas es de sólo lectura; se la apaga para editar mientras la propuesta espera.
    await js(`document.querySelector('[data-role="stage-toggle"]').click()`);await sleep(150);
    await js('document.activeElement?.blur()');
    const node=await center('[data-id="user"]');await drag(node,{x:node.x,y:node.y+64});await sleep(200);
    const text=await chatText();
    expect(text.includes('Regenerar')&&!text.includes('Aceptar y aplicar'),'la propuesta obsoleta sigue siendo aplicable');
    const after=await saved();
    expect(after.revision===before.revision+1&&after.nodes.length===before.nodes.length,`documento: r${after.revision} con ${after.nodes.length} nodos`);
    // Se mira el pedido que sale hacia el gateway: la memoria de la conversación es el historial que viaja con él.
    await js(`(()=>{window.__assist=[];const original=window.fetch;window.fetch=(url,init)=>{if(String(url).includes('/v1/assist'))window.__assist.push(JSON.parse(init.body));return original(url,init);};})()`);
    expect(await clickText('Regenerar','.chat'),'falta Regenerar');await sleep(1200);
    expect(await clickText('Aceptar y aplicar','.chat'),'la regeneración no produjo una propuesta aplicable');
    const done=await saved();expect(done.nodes.length===before.nodes.length+1&&done.revision===before.revision+2,'la propuesta regenerada no se aplicó');
    const sent=await js(`window.__assist.at(-1)`);expect(sent?.history?.length>=2&&sent.mode==='edit','la conversación no recuerda los turnos');
    return 'cancelar, previsualizar, rechazar, obsoleta y regenerar';
  });
  await check('los escenarios cambian el recorrido y los estados de los nodos',async()=>{
    await send('Page.reload');await sleep(1200);
    await setValue('select[aria-label="Cargar ejemplo"]','2');await sleep(600);
    await clickText('Editar pasos','.timeline');await sleep(80);
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
    // El recorrido anterior puede haber enfocado otro extremo: volver a encuadrar antes de seleccionar.
    await key('1');await sleep(150);
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
    if(await js("Boolean(document.querySelector('#chat-provider'))"))await setValue('#chat-provider','mock');await setValue('#chat-prompt','Revisá la arquitectura');await sleep(100);
    expect(await sendChat(),'falta Enviar');await sleep(1200);
    expect(await clickText('Guardar como anotaciones','.chat'),`sin observaciones: ${await js(`document.querySelector('.chat').textContent.slice(-200)`)}`);
    doc=await saved();expect(doc.annotations.length===2&&doc.annotations[1].source==='ai',`anotaciones: ${doc.annotations.length}`);
    // Tocar una observación enfoca el elemento y lo resalta, sin seleccionarlo ni cambiar el documento.
    const selectedBefore=await js(`document.querySelectorAll('.canvas .selected').length`);
    expect(await js(`(()=>{const b=document.querySelector('.chat .finding-target');if(!b)return false;b.click();return true;})()`),'la observación no se puede tocar');await sleep(300);
    expect(await js(`document.querySelectorAll('.canvas .focus-flash').length`)>0,'no se resaltó el elemento');
    expect(await js(`document.querySelectorAll('.canvas .selected').length`)===selectedBefore&&(await saved()).revision===doc.revision,'enfocar seleccionó o cambió algo');
    const named=await js(`document.querySelector('.chat .finding-target').textContent`);
    return `${doc.annotations.length} anotaciones (usuario + IA de demostración); enfoque de «${named}»`;
  });
  await check('una explicación es breve, se puede ampliar y se ve como presentación animada sin guardarse sola',async()=>{
    const reachable=await js(`fetch('/api/v1/providers',{headers:{'x-diagramia-client':'editor'}}).then(r=>r.ok?r.json():null).catch(()=>null)`);
    if(!reachable?.providers.some(p=>p.id==='mock'))return 'OMITIDO: el gateway no corre con DIAGRAMIA_ENABLE_MOCK=1';
    await send('Page.reload');await sleep(1500);
    await setValue('select[aria-label="Cargar ejemplo"]','0');await sleep(600);
    expect(await clickText('IA','.tabs'),'no está la pestaña IA');await sleep(500);
    if(await js("Boolean(document.querySelector('#chat-provider'))"))await setValue('#chat-provider','mock');
    await setValue('#chat-prompt','Explicame qué hace este diagrama');await sleep(100);
    expect(await sendChat(),'falta Enviar');await sleep(1200);
    expect(await js(`document.querySelector('.answer-footer .intent select')?.value`)==='explain','el pedido no se interpretó como explicación');
    const before=await saved();
    expect(await clickText('▶ Ver explicación animada','.chat'),`sin recorrido: ${await js(`document.querySelector('.chat').textContent.slice(-300)`)}`);await sleep(1600);
    const caption=await js(`document.querySelector('.presentation-caption')?.textContent??''`);
    expect(caption.includes('Paso 1 de demostración'),`la presentación no muestra el recorrido: ${caption}`);
    await shot('17-desktop-explanation-tour');
    await key('Escape');await sleep(300);
    expect(!(await js(`Boolean(document.querySelector('.presentation'))`)),'la presentación no se cerró');
    expect((await saved()).revision===before.revision,'ver la explicación cambió el documento');
    expect(await clickText('Guardar como animación','.chat'),'falta guardar el recorrido');await sleep(200);
    const after=await saved();expect(after.animations.length===before.animations.length+1&&after.animations.at(-1).steps.length===3,`animaciones: ${after.animations.length}`);
    expect(await clickText('Explicar más','.chat'),'falta Explicar más');await sleep(1200);
    expect(await js(`[...document.querySelectorAll('.chat .bubble.user')].at(-1).textContent`)==='Explicar más','el pedido ampliado no se ve como tal');
    return `recorrido de ${after.animations.at(-1).steps.length} pasos guardado; ampliación enviada`;
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
    await js(`(()=>{const f=document.querySelector('.color-field');f.open=true;f.querySelector('[aria-label="Color Lima"]').click();})()`);
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
  await check('elementos para todo público: buscar, tarjeta con icono, estilo rápido y elemento propio que vuelve agrupado',async()=>{
    await send('Page.reload');await sleep(1500);
    await setValue('select[aria-label="Cargar ejemplo"]','0');await sleep(600);
    await js(`document.querySelector('.tool-extra-toggle')?.getAttribute('aria-expanded')==='false'&&document.querySelector('.tool-extra-toggle').click()`);await sleep(100);
    await setValue('input[aria-label="Buscar elementos"]','bombilla');await sleep(150);
    expect(await js(`[...document.querySelectorAll('.palette-item')].map(b=>b.textContent.trim()).join()`)==='Idea','la búsqueda no encontró la idea por palabra clave');
    await js(`document.querySelector('.palette-item').click()`);await sleep(80);
    const host=await center('.canvas-host');
    // Vista previa: con la forma elegida, el elemento real sigue al puntero antes de ubicarlo.
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:host.left+host.width*.5,y:host.top+host.height*.5});await sleep(200);
    expect(await js(`document.querySelector('.place-ghost .graph-node.shape-cloud')!==null`),'no se ve la vista previa del elemento elegido');await click({x:host.left+host.width*.18,y:host.top+host.height*.85});await sleep(200);await key('Escape');await sleep(100);
    let doc=await saved();const idea=doc.nodes.at(-1);
    expect(idea.icon==='idea'&&idea.style.iconSize==='large'&&idea.size.height>=104,`tarjeta: ${JSON.stringify({icon:idea.icon,style:idea.style,size:idea.size})}`);
    await setValue('input[aria-label="Buscar elementos"]','');
    // Estilo rápido sobre la tarjeta y otro nodo: un solo paso para los dos.
    await click(await center(`[data-id="${idea.id}"]`));await clickText('Propiedades','.tabs');await sleep(150);
    expect(await js(`(()=>{const b=document.querySelector('.presets button[title="Menta"]');if(!b)return false;b.click();return true;})()`),'faltan los estilos rápidos');await sleep(150);
    doc=await saved();expect(doc.nodes.find(n=>n.id===idea.id).style.fill==='#d9f5e8'&&doc.nodes.find(n=>n.id===idea.id).style.iconSize==='large','el estilo rápido no se aplicó o borró el icono grande');
    await shot('18-desktop-icon-card');
    // Elemento propio: dos nodos seleccionados, guardados con nombre e insertados como una pieza.
    await js(`document.activeElement?.blur()`);
    await click(await center('[data-id="api"]'));await sleep(100);
    await js(`(()=>{const list=document.querySelector('details.elements');list.open=true;[...list.querySelectorAll('button')].find(b=>b.textContent.endsWith('· db')).dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));})()`);await sleep(150);
    expect(await clickText('✦ Guardar como elemento propio','.panel-body'),'falta guardar como elemento propio');await sleep(100);
    await setValue('#element-name','API con base');await clickText('Guardar','.save-element-form');await sleep(200);
    expect(await clickText('Biblioteca','.tabs'),'falta la pestaña Biblioteca');await sleep(150);
    expect((await js(`document.querySelector('.panel-body h3').textContent`)).includes('Mis elementos · 1'),'el elemento no quedó en Mis elementos');
    const before=await saved();await clickText('Insertar','.component-list');await sleep(300);
    doc=await saved();const group=doc.groups.find(g=>g.label==='API con base');
    expect(group&&doc.nodes.filter(n=>n.groupId===group.id).length===2&&doc.revision===before.revision+1,'el elemento propio no se insertó agrupado en un paso');
    await shot('19-desktop-own-element');
    // «Darle diseño»: un solo paso, zonas con tono y un recorrido si no había animaciones.
    const plain=await saved();
    expect(await clickText('✦ Darle diseño','.canvas-toolbar'),'falta «Darle diseño»');await sleep(500);
    doc=await saved();
    expect(doc.revision===plain.revision+1&&doc.zones.every(z=>z.style.stroke),'el diseño no se aplicó en un paso a las zonas');
    return `tarjeta «${idea.label}», estilo Menta, elemento «${group.label}» agrupado, diseño aplicado`;
  });
  await check('un enlace ofrece traer los datos de la página y el servidor se niega a visitar la red interna',async()=>{
    await send('Page.reload');await sleep(1500);
    await setValue('select[aria-label="Cargar ejemplo"]','0');await sleep(600);
    await click(await center('[data-id="api"]'));await clickText('Propiedades','.tabs');await sleep(150);
    const field=`#${await js(`[...document.querySelectorAll('.panel-body label')].find(l=>l.textContent.startsWith('Enlace')).htmlFor`)}`.replace(/:/g,'\\:');
    expect(await js(`!document.querySelector('.link-preview')`),'la vista previa aparece sin enlace');
    await js(`document.querySelector(${JSON.stringify(field)}).focus()`);await setValue(field,'http://127.0.0.1/admin');await js(`document.querySelector(${JSON.stringify(field)}).blur()`);await sleep(300);
    const doc=await saved();expect(doc.nodes.find(n=>n.id==='api').link==='http://127.0.0.1/admin','el enlace no se guardó');
    expect(await clickText('Traer título y descripción','.link-preview'),'falta el botón de la vista previa');await sleep(800);
    const message=await js(`document.querySelector('.link-preview [role="alert"]')?.textContent??''`);
    expect(/red privada|Iniciá sesión/.test(message),`respuesta inesperada: «${message}»`);
    expect((await saved()).revision===doc.revision,'pedir la vista previa cambió el documento');
    return message;
  });
  await check('pestañas: canvas nuevo, volver sin perder nada y cerrar',async()=>{
    const before=await saved(),tabs=await js(`document.querySelectorAll('.doc-tab').length`);
    await js(`document.querySelector('.doc-tab-add').click()`);await sleep(500);
    let doc=await saved();
    expect(doc.nodes.length===0&&await js(`document.querySelectorAll('.doc-tab').length`)===tabs+1,'no se abrió un canvas vacío');
    expect(await js(`Boolean(document.querySelector('.start-guide'))`),'falta el inicio guiado del canvas vacío');
    await js(`document.querySelectorAll('.doc-tab [role=tab]')[${tabs-1}].click()`);await sleep(500);
    doc=await saved();expect(doc.id===before.id&&doc.nodes.length===before.nodes.length&&doc.revision===before.revision,'la pestaña anterior cambió');
    await key('z',CTRL);expect((await saved()).revision===before.revision+1,'el historial de la pestaña se perdió al cambiar');
    await js(`document.querySelectorAll('.doc-tab-close')[${tabs}].click()`);await sleep(400);
    expect(await js(`document.querySelectorAll('.doc-tab').length`)===tabs,'la pestaña no se cerró');
    await send('Page.reload');await sleep(1500);
    expect(await js(`document.querySelectorAll('.doc-tab').length`)===tabs&&(await saved()).id===before.id,'las pestañas no se conservaron al recargar');
    return `${tabs} pestañas conservadas`;
  });
  await check('la cámara guía la vista, pausa y cede al usuario sin cambiar el documento',async()=>{
    // Elementos lejanos: un paneo o zoom equivocado queda visible y no pasa por coincidencia.
    const fixture=join(profile,'camera.diagramia.json'),doc={...(await saved()),id:'camera-smoke',title:'Recorrido de cámara',revision:0,appliedBatches:[],
      nodes:['Salida','Escala','Destino'].map((label,i)=>({id:'n'+i,kind:'note',label,position:{x:i*2000,y:100},size:{width:180,height:100},shape:'card',icon:'plane'})),
      edges:[],zones:[],drawings:[],frames:[],groups:[],assets:[],annotations:[],animations:[{id:'journey',label:'Guía visual',steps:[
        {id:'first',caption:'Salida',nodeIds:['n0'],edgeIds:[],durationMs:5000,focus:'close',transition:'slow'},
        {id:'last',caption:'Destino',nodeIds:['n2'],edgeIds:[],durationMs:5000,focus:'close',transition:'smooth'},
        {id:'stay',caption:'Mantener',nodeIds:['n1'],edgeIds:[],durationMs:5000,focus:'stay',transition:'smooth'},
        {id:'all',caption:'Todo',nodeIds:[],edgeIds:[],durationMs:5000,focus:'overview',transition:'cut'},
        {id:'context',caption:'Escala con contexto',nodeIds:['n1'],edgeIds:[],durationMs:5000,focus:'medium',transition:'slow'},
        {id:'cut',caption:'Volver sin movimiento',nodeIds:['n0'],edgeIds:[],durationMs:5000,focus:'close',transition:'cut'}]}]};
    writeFileSync(fixture,JSON.stringify(doc));
    const {root}=await send('DOM.getDocument'),{nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'header input[type=file]'});
    await send('DOM.setFileInputFiles',{nodeId,files:[fixture]});await sleep(650);
    const before=JSON.stringify(await saved()),box=selector=>js(`document.querySelector(${JSON.stringify(selector)}).getAttribute('viewBox').split(/\\s+/).map(Number)`);
    if(!await js(`Boolean(document.querySelector('.motion-editor'))`))await clickText('Editar pasos','.timeline');
    const goto=async i=>{await js(`document.querySelectorAll('.timeline .steps button')[${i}].click()`);};
    await goto(0);await sleep(2000);
    const first=await box('.canvas');expect(first[2]<1000,'no se acercó a la salida');
    await goto(1);await sleep(300);const moving=await box('.canvas');
    expect(moving[0]!==first[0]&&moving[0]<4000,'falta la transición gradual');
    await sleep(800);const last=await box('.canvas');expect(last[0]+last[2]/2>3900,'no enfocó el destino');
    await goto(2);await sleep(1000);expect(JSON.stringify(await box('.canvas'))===JSON.stringify(last),'Mantener movió el encuadre');
    await goto(3);await sleep(60);expect((await box('.canvas'))[2]>=4180,'overview no mostró todos los elementos');
    await goto(4);await sleep(120);await clickText('Reproducir','.timeline');await sleep(120);await clickText('Pausar','.timeline');await sleep(60);
    const paused=await box('.canvas');await sleep(400);expect(JSON.stringify(await box('.canvas'))===JSON.stringify(paused),'la cámara siguió después de pausar');
    await js(`(()=>{const el=[...document.querySelectorAll('.timeline label')].find(l=>l.textContent.includes('Seguir con la cámara')).querySelector('input');el.click();})()`);
    await goto(5);await sleep(120);expect(JSON.stringify(await box('.canvas'))===JSON.stringify(paused),'seguir apagado movió la cámara');
    await js(`(()=>{const el=[...document.querySelectorAll('.timeline label')].find(l=>l.textContent.includes('Seguir con la cámara')).querySelector('input');el.click();})()`);
    await goto(3);await goto(0);await sleep(120);
    const host=await center('.canvas-host');await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:host.x,y:host.y,deltaX:0,deltaY:60});await sleep(60);
    const manual=await box('.canvas');await sleep(400);expect(JSON.stringify(await box('.canvas'))===JSON.stringify(manual),'el movimiento automático pisó el pan manual');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await goto(5);await sleep(60);const reduced=await box('.canvas');expect(reduced[2]<1000,'reduced-motion no aplicó el encuadre');
    await goto(1);await sleep(60);expect((await box('.canvas'))[0]+(await box('.canvas'))[2]/2>3900,'reduced-motion dejó una transición pendiente');
    await goto(0);await key('p');await sleep(200);
    const presentation=await box('.presentation svg');expect(presentation[2]<1000,'el primer paso de la presentación no respetó el enfoque');
    await key('ArrowRight');await sleep(60);await shot('21-camera-presentation');
    expect((await box('.presentation svg'))[0]+(await box('.presentation svg'))[2]/2>3900,'la presentación no siguió el siguiente paso');
    await key('Escape');await sleep(120);expect(JSON.stringify(await box('.canvas'))===JSON.stringify(reduced),'salir cambió la cámara del editor');
    await send('Emulation.setEmulatedMedia',{features:[]});
    await goto(4);await sleep(120);await tap('.doc-tab-add');await sleep(150);
    const empty=await box('.canvas');await sleep(450);expect(JSON.stringify(await box('.canvas'))===JSON.stringify(empty),'el viaje siguió en otra pestaña');
    await js(`document.querySelector('.doc-tab.active .doc-tab-close').click()`);await sleep(200);
    const returned=await box('.canvas');await sleep(450);expect(JSON.stringify(await box('.canvas'))===JSON.stringify(returned),'volver reinició el movimiento');
    expect(JSON.stringify(await saved())===before,'reproducir, mover cámara o presentar cambió el contenido');
    await shot('22-camera-editor');return 'enfoque, transición, mantener, corte, pausa, pan manual, reduced-motion, presentación y pestañas';
  });
  await check('el viaje a San Pancho compara tres fechas y presenta el presupuesto editable',async()=>{
    await setValue('select[aria-label="Cargar ejemplo"]','4');await sleep(700);
    const doc=await saved();expect(doc.id==='san-pancho'&&doc.nodes.length===29&&doc.zones.length===6,'falta el viaje completo');
    expect(doc.animations[0].scenarios.length===3,'faltan las tres fechas');
    await setValue('select[aria-label="Recorrido"]','date-feb');await sleep(100);
    if(!await js(`Boolean(document.querySelector('.motion-editor'))`))await clickText('Editar pasos','.timeline');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await js(`document.querySelectorAll('.timeline .steps button')[1].click()`);await sleep(80);
    await key('p');await sleep(150);
    expect((await js(`document.querySelector('.presentation-caption').textContent`)).includes('9–18 feb 2027'),'la rama no muestra la fecha elegida');
    await shot('23-san-pancho-fechas');await key('ArrowRight');await key('ArrowRight');await sleep(100);
    const caption=await js(`document.querySelector('.presentation-caption').textContent`);
    expect(caption.includes('Presupuesto separado por moneda'),'la cámara no llegó al presupuesto');
    await shot('24-san-pancho-presupuesto');await key('Escape');await sleep(100);
    await send('Emulation.setEmulatedMedia',{features:[]});
    expect((await saved()).revision===doc.revision,'presentar el viaje cambió el contenido');
    return '29 elementos, 6 zonas, 3 fechas y presupuesto ARS/MXN con recorrido de cámara';
  });
  await check('el ejemplo de login muestra pistas sincronizadas y permite editar una pista',async()=>{
    await setValue('select[aria-label="Cargar ejemplo"]','3');await sleep(700);
    let doc=await saved();expect(doc.id==='login-flow'&&doc.animations[0].tracks.length===3,'falta el ejemplo de login con pistas');
    if(!await js(`Boolean(document.querySelector('.motion-editor'))`))await clickText('Editar pasos','.timeline');
    await js(`document.querySelector('.timeline-edit').open=true`);
    expect(await clickText('Pistas (3)','.timeline-edit'),'falta el acceso a las pistas avanzadas');await sleep(100);
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
    expect(!await js(`Boolean(document.querySelector('.tutorial'))`),'el tutorial volvió a interrumpir el trabajo');
    await tap('[aria-label="Abrir el tutorial"]');await sleep(100);
    await js(`[...document.querySelectorAll('.tutorial button')].find(b=>b.textContent==='Saltar').click()`);await sleep(150);
    await tap('[aria-label="Cambiar a modo claro"]');await sleep(200);
    return `canvas ${light} → ${dark.canvas}`;
  });
  await check('todo control visible tiene nombre accesible y toda imagen su texto alternativo, en los cuatro paneles',async()=>{
    // Lo que un lector de pantalla necesita para anunciar un control: aria-label, aria-labelledby, un <label>, texto propio o title.
    const unnamed=()=>js(`(()=>{
      const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&!el.closest('[hidden],[aria-hidden="true"]');};
      const named=el=>{
        if(el.getAttribute('aria-label')?.trim())return true;
        const by=el.getAttribute('aria-labelledby');if(by&&by.split(/\\s+/).some(id=>document.getElementById(id)?.textContent.trim()))return true;
        if(el.labels&&[...el.labels].some(l=>l.textContent.trim()))return true;
        if(!['INPUT','SELECT','TEXTAREA'].includes(el.tagName)&&el.textContent.trim())return true;
        return Boolean(el.getAttribute('title')?.trim());
      };
      const describe=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/)[0]:'')+(el.getAttribute('type')?'['+el.getAttribute('type')+']':'');
      const controls=[...document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=slider]')].filter(visible).filter(el=>!named(el)).map(describe);
      const images=[...document.querySelectorAll('img')].filter(visible).filter(img=>!img.hasAttribute('alt')).map(describe);
      return [...controls,...images];
    })()`);
    const found=new Set();
    for(const tab of ['IA','Propiedades','Biblioteca','Cuenta']){
      await js(`[...document.querySelectorAll('.tabs button')].find(b=>b.textContent.trim()===${JSON.stringify(tab)})?.click()`);await sleep(250);
      for(const item of await unnamed())found.add(`${tab}: ${item}`);
    }
    expect(!found.size,`sin nombre accesible: ${[...found].slice(0,12).join(' · ')}`);
    return 'IA, Propiedades, Biblioteca y Cuenta revisados';
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
