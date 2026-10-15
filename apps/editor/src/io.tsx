import {renderToStaticMarkup} from 'react-dom/server';
import {ASSET_TYPES,MAX_ASSET_BYTES,describeError,documentBounds,openDocument,resolveMembership,resolveScenario,sampleAnimation,sampleTrackEffects,statesAt,stepCamera,stepStarts,type DiagramAsset,type DiagramDocument,type Rect} from '@diagramia/core';
import {exportMarkdown,exportMermaid,importMermaid,exportDrawio,importDrawio,exportDot,importDot,exportPlantUml,importPlantUml,exportBpmn,importBpmn,type InteropReport} from '@diagramia/interop';
import {DIAGRAM_CSS,DiagramLayer,type LayerProps} from './canvas/DiagramLayer';
import {documentStore,newId,notify,replaceDocument,transact} from './store/documentStore';
import {select,selectionStore} from './store/selectionStore';
import {fit,viewStore} from './store/viewStore';
import {playbackStore} from './store/playbackStore';
import {track,trackUseful} from './telemetry';
import {saveFile} from './ui';
import {t} from './i18n';

const PADDING=32,MAX_CANVAS=8192;
const FONTS=[['Manrope','/fonts/Manrope.ttf','200 800'],['Plex','/fonts/IBMPlexMono-Regular.ttf','400']] as const;

async function dataUrl(path:string):Promise<string>{
  const response=await fetch(path);if(!response.ok)throw new Error(t('No se pudo leer {0}',path));
  const blob=await response.blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
}
/** Las tipografías (licencia OFL) se incrustan para que el archivo se vea igual fuera del editor. */
export async function fontCss():Promise<string>{
  const faces=await Promise.all(FONTS.map(async([family,path,weight])=>`@font-face{font-family:${family};src:url(${await dataUrl(path)}) format('truetype');font-weight:${weight}}`));
  return faces.join('');
}

/** SVG autónomo encuadrado al contenido: sin UI, sin selección, sin frames ni estado de reproducción. */
export function svgMarkup(doc:DiagramDocument,fonts='',options:{bounds?:Rect;layer?:Partial<LayerProps>}={}):{markup:string;width:number;height:number}{
  const content=options.bounds??documentBounds(doc,[...doc.nodes,...doc.edges,...doc.drawings,...doc.zones].map(x=>x.id))??{x:0,y:0,width:320,height:200};
  const x=Math.floor(content.x-PADDING),y=Math.floor(content.y-PADDING),width=Math.ceil(content.width+PADDING*2),height=Math.ceil(content.height+PADDING*2);
  const body=renderToStaticMarkup(<DiagramLayer {...options.layer} doc={doc} showFrames={false}/>);
  return {width,height,markup:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}"><style>${fonts}${DIAGRAM_CSS}</style><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fff"/>${body}</svg>`};
}

async function rasterize(markup:string,width:number,height:number,scale:number,max=MAX_CANVAS):Promise<{canvas:HTMLCanvasElement;fitted:number}>{
  const fitted=Math.min(scale,max/width,max/height);
  const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));
  try{
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error(t('El navegador no pudo rasterizar el SVG.')));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=Math.round(width*fitted);canvas.height=Math.round(height*fitted);
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    return {canvas,fitted};
  }finally{URL.revokeObjectURL(url);}
}
async function exportPng(doc:DiagramDocument,scale:number){
  const {markup,width,height}=svgMarkup(doc,await fontCss());
  const {canvas,fitted}=await rasterize(markup,width,height,scale);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error(t('El navegador no pudo generar el PNG.'));
    saveFile(`${doc.id}.png`,blob,'image/png');
    notify(fitted<scale?t('PNG exportado a {0} × {1}: la escala se redujo para respetar el límite de {2} px.',canvas.width,canvas.height,MAX_CANVAS):t('PNG exportado a {0} × {1}.',canvas.width,canvas.height),fitted<scale?'warn':'info');
}

/** PDF A4 ajustado al contenido; las páginas contienen una imagen rasterizada del diagrama. */
async function exportPdf(doc:DiagramDocument,presentation=false){
  const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),fonts=await fontCss();
  const playback=playbackStore.get(),raw=doc.animations.find(a=>a.id===playback.animationId)??doc.animations[0];
  const animation=presentation&&raw?resolveScenario(raw,playback.scenarioId):null;
  const slides:{title:string;bounds?:Rect;layer?:Partial<LayerProps>}[]=animation?animation.steps.map((step,index)=>{
    const time=stepStarts(animation)[index]+Math.min(1,step.durationMs-1),sample=sampleAnimation(animation,time),effects=sampleTrackEffects(animation,time);
    return {title:[step.caption,...effects.captions].filter(Boolean).join(' · '),bounds:stepCamera(doc,animation,index).bounds??undefined,
      layer:{states:statesAt(animation,index),activeNodes:new Set([...sample.step.nodeIds,...effects.nodeIds]),activeEdges:new Set([...sample.step.edgeIds,...effects.edgeIds]),failed:step.tone==='failure',progress:.65}};
  }):presentation&&doc.frames.length?doc.frames.map(frame=>({title:frame.label,bounds:frame.bounds})): [{title:doc.title}];
  if(slides.length>100)throw new Error(t('La presentación supera 100 páginas. Dividila antes de exportarla.'));
  for(let index=0;index<slides.length;index++){
    const slide=slides[index]!,{markup,width,height}=svgMarkup(doc,fonts,{bounds:slide.bounds,layer:slide.layer});
    const {canvas}=await rasterize(markup,width,height,1.5,4096);
    const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
    if(!jpeg)throw new Error(t('El navegador no pudo preparar una página del PDF.'));
    const image=await pdf.embedJpg(await jpeg.arrayBuffer()),landscape=width>=height;
    const page=pdf.addPage(landscape?[841.89,595.28]:[595.28,841.89]),pw=page.getWidth(),ph=page.getHeight();
    page.drawRectangle({x:0,y:0,width:pw,height:ph,color:rgb(1,1,1)});
    const boxW=pw-64,boxH=ph-112,ratio=Math.min(boxW/width,boxH/height),drawW=width*ratio,drawH=height*ratio;
    page.drawImage(image,{x:(pw-drawW)/2,y:72+(boxH-drawH)/2,width:drawW,height:drawH});
    const clean=(value:string)=>value.replace(/[^\x20-\xFF]/g,'?');
    page.drawText(clean((presentation?slide.title:doc.title).slice(0,100)),{x:32,y:ph-34,size:15,font,color:rgb(.09,.13,.19),maxWidth:pw-64});
    page.drawText(t('Diagramia · r{0}{1}',doc.revision,presentation?` · ${index+1}/${slides.length}`:''),{x:32,y:28,size:9,font,color:rgb(.36,.4,.46)});
  }
  const bytes=await pdf.save();saveFile(`${doc.id}${presentation?'-presentacion':''}.pdf`,new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),'application/pdf');
  notify(t('{0} exportado en PDF ({1} página{2}, imagen rasterizada).',presentation?t('Presentación'):t('Diagrama'),slides.length,slides.length===1?'':'s'));
}

const summarize=(report:InteropReport)=>[...report.unsupported.map(u=>u.line?t('línea {0}: {1}',u.line,u.reason):u.reason),...report.notes];
export type ExportFormat='json'|'svg'|'png1'|'png2'|'png3'|'pdf'|'presentation-pdf'|'animation-gif'|'animation-video'|'mermaid'|'drawio'|'dot'|'plantuml-class'|'plantuml-sequence'|'plantuml-state'|'bpmn'|'markdown'|'markdown-selection'|'timeline';
export const EXPORT_FORMATS:[ExportFormat,string][]=[['json',t('JSON de Diagramia (sin pérdidas)')],['svg',t('SVG autónomo')],['png1','PNG 1×'],['png2','PNG 2×'],['png3','PNG 3×'],['pdf',t('PDF del diagrama')],['presentation-pdf',t('PDF de la presentación')],['animation-video',t('Video de la animación')],['animation-gif',t('GIF de la animación')],['mermaid',t('Mermaid flowchart')],['drawio',t('draw.io XML')],['dot',t('Graphviz DOT')],['plantuml-class',t('PlantUML · clases')],['plantuml-sequence',t('PlantUML · secuencia')],['plantuml-state',t('PlantUML · estados')],['bpmn',t('BPMN · proceso básico')],['markdown',t('Markdown del documento')],['markdown-selection',t('Markdown de la selección')],['timeline',t('Timeline (JSON)')]];

/**
 * Animación como GIF o video (ADR 107). Tarda: el avance se va contando en la barra de estado y no se superponen dos exportaciones.
 * El módulo se carga recién al pedirlo, como el del PDF.
 */
let rendering=false;
async function exportAnimation(doc:DiagramDocument,format:'gif'|'video'){
  if(rendering){notify(t('Ya hay una animación exportándose. Esperá a que termine.'),'warn');return;}
  rendering=true;
  try{
    const {renderAnimation}=await import('./export/animation');
    let last=-1;
    const file=await renderAnimation(doc,format,(stage,done)=>{
      const percent=Math.floor(done*20)*5;
      if(percent===last)return;
      last=percent;
      notify(format==='gif'?t('Generando el GIF de la animación… {0}%',percent):stage==='frames'?t('Video, paso 1 de 2: dibujando los cuadros… {0}%',percent):t('Video, paso 2 de 2: grabando a ritmo real… {0}%. Dejá esta pestaña a la vista.',percent));
      if(stage==='frames'&&percent===100)last=-1;
    });
    saveFile(`${doc.id}-animacion.${file.extension}`,file.blob,file.blob.type);
    const size=(file.blob.size/1_000_000).toFixed(1),seconds=file.seconds.toFixed(1);
    notify(file.extension==='gif'?t('GIF de la animación exportado: {0} × {1}, {2} s, {3} MB.',file.width,file.height,seconds,size)
      :file.extension==='mp4'?t('Video de la animación exportado en MP4: {0} × {1}, {2} s, {3} MB.',file.width,file.height,seconds,size)
      :t('Video de la animación exportado en WebM: {0} × {1}, {2} s, {3} MB. Si donde lo vas a subir pide MP4, exportalo desde Chrome o Edge.',file.width,file.height,seconds,size),file.extension==='webm'?'warn':'info');
  }finally{rendering=false;}
}

export async function exportDocument(format:ExportFormat){
  const {doc}=documentStore.get();
  try{
    track('export',{format});trackUseful(doc,'exported');
    switch(format){
      case 'json':saveFile(`${doc.id}.diagramia.json`,JSON.stringify(doc,null,2)+'\n','application/json');notify(t('JSON exportado: es el único formato que conserva todo el documento.'));break;
      case 'svg':{
        // Sin tipografías incrustadas el SVG sigue siendo válido; sólo cambia la fuente en visores que no tengan Manrope.
        const fonts=await fontCss().catch(()=>'');
        saveFile(`${doc.id}.svg`,svgMarkup(doc,fonts).markup,'image/svg+xml');
        notify(fonts?t('SVG exportado con tipografías incrustadas. No incluye animación ni frames.'):t('SVG exportado sin tipografías incrustadas (no se pudieron leer).'),fonts?'info':'warn');break;
      }
      case 'png1':case 'png2':case 'png3':await exportPng(doc,Number(format.slice(3)));break;
      case 'pdf':await exportPdf(doc);break;
      case 'presentation-pdf':await exportPdf(doc,true);break;
      case 'animation-gif':await exportAnimation(doc,'gif');break;
      case 'animation-video':await exportAnimation(doc,'video');break;
      case 'mermaid':{
        const {text,report}=exportMermaid(doc);saveFile(`${doc.id}.mmd`,text,'text/plain');
        notify(t('Mermaid exportado. Pérdidas: {0}',summarize(report).join(' ')),'warn');break;
      }
      case 'drawio':{
        const {text,report}=exportDrawio(doc);saveFile(`${doc.id}.drawio`,text,'application/xml');
        notify(t('draw.io exportado. {0}',summarize(report).join(' ')),'warn');break;
      }
      case 'dot':{
        const {text,report}=exportDot(doc);saveFile(`${doc.id}.dot`,text,'text/vnd.graphviz');
        notify(t('DOT exportado. {0}',summarize(report).join(' ')),'warn');break;
      }
      case 'plantuml-class':case 'plantuml-sequence':case 'plantuml-state':{
        const kind=format.slice('plantuml-'.length) as 'class'|'sequence'|'state';
        const {text,report}=exportPlantUml(doc,kind);saveFile(`${doc.id}-${kind}.puml`,text,'text/plain');
        notify(t('PlantUML {0} exportado. {1}',kind,summarize(report).join(' ')),report.unsupported.length?'warn':'info');break;
      }
      case 'bpmn':{
        const {text,report}=exportBpmn(doc);saveFile(`${doc.id}.bpmn`,text,'application/xml');
        notify(t('BPMN básico exportado. {0}',summarize(report).join(' ')),report.unsupported.length?'warn':'info');break;
      }
      case 'markdown':saveFile(`${doc.id}.md`,exportMarkdown(doc),'text/markdown');notify(t('Markdown del documento exportado.'));break;
      case 'markdown-selection':{
        const {ids}=selectionStore.get();
        if(!ids.length){notify(t('Seleccioná los elementos que querés documentar.'),'warn');break;}
        saveFile(`${doc.id}-seleccion.md`,exportMarkdown(doc,ids),'text/markdown');notify(t('Markdown de la selección exportado.'));break;
      }
      case 'timeline':
        if(!doc.animations.length){notify(t('Este documento no tiene animaciones para exportar.'),'warn');break;}
        saveFile(`${doc.id}.timeline.json`,JSON.stringify({schemaVersion:doc.schemaVersion,documentId:doc.id,revision:doc.revision,animations:doc.animations},null,2)+'\n','application/json');
        notify(t('Timeline exportada: pasos y pistas refieren elementos por ID del documento.'));break;
    }
  }catch(e){notify(t('No se pudo exportar: {0}',describeError(e)),'error');}
}

/** Importa formatos editables reconocidos. Un error deja el documento actual intacto. */
export async function importFile(file:File){
  let format:'json'|'mermaid'|'drawio'|'dot'|'plantuml'|'bpmn'|'other'='other';
  try{
    if(file.size>3_000_000)throw new Error(t('El archivo supera 3 MB.'));
    const text=await file.text();
    if(text.trimStart().startsWith('{')){
      format='json';
      const {document,migratedFrom}=openDocument(JSON.parse(text));
      replaceDocument(document,migratedFrom?t('Documento importado y migrado del schema {0} sin cambiar IDs.',migratedFrom):t('Documento importado y validado.'));
    }else if(/\.bpmn$/i.test(file.name)||/xmlns(?::[A-Za-z0-9_-]+)?=["']http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/MODEL["']/.test(text)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      format='bpmn';
      const {document,report}=importBpmn(text,{id:base}),notes=summarize(report);
      replaceDocument(document,t('BPMN importado: {0} elementos, {1} secuencias. {2}',document.nodes.length,document.edges.length,notes.join(' ')),report.unsupported.length?'warn':'info');
    }else if(/\.(puml|plantuml)$/i.test(file.name)||/^\s*@startuml\b/.test(text)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      format='plantuml';
      const {document,report,kind}=importPlantUml(text,{id:base}),notes=summarize(report);
      replaceDocument(document,t('PlantUML {0} importado: {1} elementos, {2} relaciones. {3}',kind,document.nodes.length,document.edges.length,notes.join(' ')),report.unsupported.length?'warn':'info');
    }else if(text.trimStart().startsWith('<')||/\.(drawio|xml)$/i.test(file.name)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      format='drawio';
      const {document,report}=await importDrawio(text,{id:base}),notes=summarize(report);
      replaceDocument(document,t('draw.io importado: {0} nodos, {1} conexiones. {2}',document.nodes.length,document.edges.length,notes.join(' ')),report.unsupported.length?'warn':'info');
    }else if(/\.(dot|gv)$/i.test(file.name)||/^\s*(strict\s+)?(di)?graph\b/.test(text)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      format='dot';
      const {document,report}=importDot(text,{id:base}),notes=summarize(report);
      replaceDocument(document,t('DOT importado: {0} nodos, {1} conexiones. {2}',document.nodes.length,document.edges.length,notes.join(' ')),report.unsupported.length?'warn':'info');
    }else{
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      format='mermaid';
      const {document,report}=importMermaid(text,{id:base}),notes=summarize(report);
      replaceDocument(document,t('Mermaid importado: {0} nodos, {1} conexiones. {2}',document.nodes.length,document.edges.length,notes.join(' ')),report.unsupported.length?'warn':'info');
    }
    fit(documentBounds(documentStore.get().doc));
    track('import',{format,ok:true});
  }catch(e){track('import',{format,ok:false});notify(t('No se importó nada; el documento actual sigue intacto. {0}',describeError(e)),'error');}
}

const readDataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
async function loadImage(blob:Blob):Promise<HTMLImageElement>{
  const url=URL.createObjectURL(blob),image=new Image();
  try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error(t('El archivo no es una imagen legible.')));image.src=url;});return image;}
  finally{URL.revokeObjectURL(url);}
}
/** Una foto grande se reduce en el navegador hasta entrar en el tope del documento; un SVG se guarda tal cual o se rechaza. */
async function shrink(image:HTMLImageElement,file:Blob):Promise<{blob:Blob;width:number;height:number}>{
  let width=image.naturalWidth,height=image.naturalHeight,blob=file,scale=Math.min(1,1280/Math.max(width,height));
  for(let attempt=0;attempt<6&&(blob.size>MAX_ASSET_BYTES||scale<1&&attempt===0);attempt++,scale*=.75){
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    const next=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.85));
    if(!next)throw new Error(t('El navegador no pudo procesar la imagen.'));
    // Un navegador sin encoder WebP devuelve PNG: es un formato aceptado, así que se usa igual.
    blob=next;width=canvas.width;height=canvas.height;
  }
  if(blob.size>MAX_ASSET_BYTES)throw new Error(t('La imagen sigue superando {0} KB después de reducirla.',Math.round(MAX_ASSET_BYTES/1000)));
  return {blob,width,height};
}
/** Agrega una imagen como asset del documento y la ubica en el centro de la vista con un nodo que la usa. */
export async function addImage(file:File){
  try{
    if(!(ASSET_TYPES as readonly string[]).includes(file.type))throw new Error(t('Formato no admitido. Usá PNG, JPEG, WebP o SVG.'));
    if(file.size>20_000_000)throw new Error(t('El archivo supera 20 MB.'));
    const image=await loadImage(file),vector=file.type==='image/svg+xml';
    if(vector&&file.size>MAX_ASSET_BYTES)throw new Error(t('El SVG supera {0} KB.',Math.round(MAX_ASSET_BYTES/1000)));
    const fitted=vector?{blob:file as Blob,width:image.naturalWidth||300,height:image.naturalHeight||150}:await shrink(image,file);
    const label=file.name.replace(/\.[^.]+$/,'').trim().slice(0,200)||t('Imagen'),mediaType=fitted.blob.type as DiagramAsset['mediaType'];
    const asset:DiagramAsset={id:newId('asset'),label,mediaType,data:(await readDataUrl(fitted.blob)).split(',')[1],width:fitted.width,height:fitted.height};
    const ratio=Math.min(1,240/fitted.width,200/fitted.height),size={width:Math.max(24,Math.round(fitted.width*ratio)),height:Math.max(24,Math.round(fitted.height*ratio))};
    const {doc}=documentStore.get(),{camera,viewport}=viewStore.get(),id=newId('node');
    const place=resolveMembership(doc,{x:Math.round(camera.x+viewport.width/camera.zoom/2-size.width/2),y:Math.round(camera.y+viewport.height/camera.zoom/2-size.height/2),...size});
    if(transact([{type:'ADD_ASSET',asset},{type:'ADD_NODE',node:{id,kind:'image',label,position:place.position,size,zoneId:place.zoneId,assetId:asset.id}}],fitted.blob===file?t('Imagen agregada'):t('Imagen agregada, reducida a {0} × {1}',fitted.width,fitted.height)))select([id]);
  }catch(e){notify(t('No se agregó la imagen: {0}',describeError(e)),'error');}
}
