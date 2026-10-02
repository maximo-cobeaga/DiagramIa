import {renderToStaticMarkup} from 'react-dom/server';
import {ASSET_TYPES,MAX_ASSET_BYTES,describeError,documentBounds,openDocument,resolveMembership,resolveScenario,sampleAnimation,sampleTrackEffects,statesAt,stepStarts,type DiagramAsset,type DiagramDocument,type Rect} from '@diagramia/core';
import {exportMarkdown,exportMermaid,importMermaid,exportDrawio,importDrawio,exportDot,importDot,exportPlantUml,importPlantUml,exportBpmn,importBpmn,type InteropReport} from '@diagramia/interop';
import {DIAGRAM_CSS,DiagramLayer,type LayerProps} from './canvas/DiagramLayer';
import {documentStore,newId,notify,replaceDocument,transact} from './store/documentStore';
import {select,selectionStore} from './store/selectionStore';
import {fit,viewStore} from './store/viewStore';
import {playbackStore} from './store/playbackStore';
import {saveFile} from './ui';

const PADDING=32,MAX_CANVAS=8192;
const FONTS=[['Manrope','/fonts/Manrope.ttf','200 800'],['Plex','/fonts/IBMPlexMono-Regular.ttf','400']] as const;

async function dataUrl(path:string):Promise<string>{
  const response=await fetch(path);if(!response.ok)throw new Error(`No se pudo leer ${path}`);
  const blob=await response.blob();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
}
/** Las tipografías (licencia OFL) se incrustan para que el archivo se vea igual fuera del editor. */
async function fontCss():Promise<string>{
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
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('El navegador no pudo rasterizar el SVG.'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=Math.round(width*fitted);canvas.height=Math.round(height*fitted);
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    return {canvas,fitted};
  }finally{URL.revokeObjectURL(url);}
}
async function exportPng(doc:DiagramDocument,scale:number){
  const {markup,width,height}=svgMarkup(doc,await fontCss());
  const {canvas,fitted}=await rasterize(markup,width,height,scale);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('El navegador no pudo generar el PNG.');
    saveFile(`${doc.id}.png`,blob,'image/png');
    notify(fitted<scale?`PNG exportado a ${canvas.width} × ${canvas.height}: la escala se redujo para respetar el límite de ${MAX_CANVAS} px.`:`PNG exportado a ${canvas.width} × ${canvas.height}.`,fitted<scale?'warn':'info');
}

/** PDF A4 ajustado al contenido; las páginas contienen una imagen rasterizada del diagrama. */
async function exportPdf(doc:DiagramDocument,presentation=false){
  const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),fonts=await fontCss();
  const playback=playbackStore.get(),raw=doc.animations.find(a=>a.id===playback.animationId)??doc.animations[0];
  const animation=presentation&&raw?resolveScenario(raw,playback.scenarioId):null;
  const slides:{title:string;bounds?:Rect;layer?:Partial<LayerProps>}[]=animation?animation.steps.map((step,index)=>{
    const time=stepStarts(animation)[index]+Math.min(1,step.durationMs-1),sample=sampleAnimation(animation,time),effects=sampleTrackEffects(animation,time);
    const frameId=effects.frameId??step.frameId;
    return {title:[step.caption,...effects.captions].filter(Boolean).join(' · '),bounds:doc.frames.find(f=>f.id===frameId)?.bounds,
      layer:{states:statesAt(animation,index),activeNodes:new Set([...sample.step.nodeIds,...effects.nodeIds]),activeEdges:new Set([...sample.step.edgeIds,...effects.edgeIds]),failed:step.tone==='failure',progress:.65}};
  }):presentation&&doc.frames.length?doc.frames.map(frame=>({title:frame.label,bounds:frame.bounds})): [{title:doc.title}];
  if(slides.length>100)throw new Error('La presentación supera 100 páginas. Dividila antes de exportarla.');
  for(let index=0;index<slides.length;index++){
    const slide=slides[index]!,{markup,width,height}=svgMarkup(doc,fonts,{bounds:slide.bounds,layer:slide.layer});
    const {canvas}=await rasterize(markup,width,height,1.5,4096);
    const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
    if(!jpeg)throw new Error('El navegador no pudo preparar una página del PDF.');
    const image=await pdf.embedJpg(await jpeg.arrayBuffer()),landscape=width>=height;
    const page=pdf.addPage(landscape?[841.89,595.28]:[595.28,841.89]),pw=page.getWidth(),ph=page.getHeight();
    page.drawRectangle({x:0,y:0,width:pw,height:ph,color:rgb(1,1,1)});
    const boxW=pw-64,boxH=ph-112,ratio=Math.min(boxW/width,boxH/height),drawW=width*ratio,drawH=height*ratio;
    page.drawImage(image,{x:(pw-drawW)/2,y:72+(boxH-drawH)/2,width:drawW,height:drawH});
    const clean=(value:string)=>value.replace(/[^\x20-\xFF]/g,'?');
    page.drawText(clean((presentation?slide.title:doc.title).slice(0,100)),{x:32,y:ph-34,size:15,font,color:rgb(.09,.13,.19),maxWidth:pw-64});
    page.drawText(`Diagramia · r${doc.revision}${presentation?` · ${index+1}/${slides.length}`:''}`,{x:32,y:28,size:9,font,color:rgb(.36,.4,.46)});
  }
  const bytes=await pdf.save();saveFile(`${doc.id}${presentation?'-presentacion':''}.pdf`,new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),'application/pdf');
  notify(`${presentation?'Presentación':'Diagrama'} exportado en PDF (${slides.length} página${slides.length===1?'':'s'}, imagen rasterizada).`);
}

const summarize=(report:InteropReport)=>[...report.unsupported.map(u=>u.line?`línea ${u.line}: ${u.reason}`:u.reason),...report.notes];
export type ExportFormat='json'|'svg'|'png1'|'png2'|'png3'|'pdf'|'presentation-pdf'|'mermaid'|'drawio'|'dot'|'plantuml-class'|'plantuml-sequence'|'plantuml-state'|'bpmn'|'markdown'|'markdown-selection'|'timeline';
export const EXPORT_FORMATS:[ExportFormat,string][]=[['json','JSON de Diagramia (sin pérdidas)'],['svg','SVG autónomo'],['png1','PNG 1×'],['png2','PNG 2×'],['png3','PNG 3×'],['pdf','PDF del diagrama'],['presentation-pdf','PDF de la presentación'],['mermaid','Mermaid flowchart'],['drawio','draw.io XML'],['dot','Graphviz DOT'],['plantuml-class','PlantUML · clases'],['plantuml-sequence','PlantUML · secuencia'],['plantuml-state','PlantUML · estados'],['bpmn','BPMN · proceso básico'],['markdown','Markdown del documento'],['markdown-selection','Markdown de la selección'],['timeline','Timeline (JSON)']];

export async function exportDocument(format:ExportFormat){
  const {doc}=documentStore.get();
  try{
    switch(format){
      case 'json':saveFile(`${doc.id}.diagramia.json`,JSON.stringify(doc,null,2)+'\n','application/json');notify('JSON exportado: es el único formato que conserva todo el documento.');break;
      case 'svg':{
        // Sin tipografías incrustadas el SVG sigue siendo válido; sólo cambia la fuente en visores que no tengan Manrope.
        const fonts=await fontCss().catch(()=>'');
        saveFile(`${doc.id}.svg`,svgMarkup(doc,fonts).markup,'image/svg+xml');
        notify(fonts?'SVG exportado con tipografías incrustadas. No incluye animación ni frames.':'SVG exportado sin tipografías incrustadas (no se pudieron leer).',fonts?'info':'warn');break;
      }
      case 'png1':case 'png2':case 'png3':await exportPng(doc,Number(format.slice(3)));break;
      case 'pdf':await exportPdf(doc);break;
      case 'presentation-pdf':await exportPdf(doc,true);break;
      case 'mermaid':{
        const {text,report}=exportMermaid(doc);saveFile(`${doc.id}.mmd`,text,'text/plain');
        notify(`Mermaid exportado. Pérdidas: ${summarize(report).join(' ')}`,'warn');break;
      }
      case 'drawio':{
        const {text,report}=exportDrawio(doc);saveFile(`${doc.id}.drawio`,text,'application/xml');
        notify(`draw.io exportado. ${summarize(report).join(' ')}`,'warn');break;
      }
      case 'dot':{
        const {text,report}=exportDot(doc);saveFile(`${doc.id}.dot`,text,'text/vnd.graphviz');
        notify(`DOT exportado. ${summarize(report).join(' ')}`,'warn');break;
      }
      case 'plantuml-class':case 'plantuml-sequence':case 'plantuml-state':{
        const kind=format.slice('plantuml-'.length) as 'class'|'sequence'|'state';
        const {text,report}=exportPlantUml(doc,kind);saveFile(`${doc.id}-${kind}.puml`,text,'text/plain');
        notify(`PlantUML ${kind} exportado. ${summarize(report).join(' ')}`,report.unsupported.length?'warn':'info');break;
      }
      case 'bpmn':{
        const {text,report}=exportBpmn(doc);saveFile(`${doc.id}.bpmn`,text,'application/xml');
        notify(`BPMN básico exportado. ${summarize(report).join(' ')}`,report.unsupported.length?'warn':'info');break;
      }
      case 'markdown':saveFile(`${doc.id}.md`,exportMarkdown(doc),'text/markdown');notify('Markdown del documento exportado.');break;
      case 'markdown-selection':{
        const {ids}=selectionStore.get();
        if(!ids.length){notify('Seleccioná los elementos que querés documentar.','warn');break;}
        saveFile(`${doc.id}-seleccion.md`,exportMarkdown(doc,ids),'text/markdown');notify('Markdown de la selección exportado.');break;
      }
      case 'timeline':
        if(!doc.animations.length){notify('Este documento no tiene animaciones para exportar.','warn');break;}
        saveFile(`${doc.id}.timeline.json`,JSON.stringify({schemaVersion:doc.schemaVersion,documentId:doc.id,revision:doc.revision,animations:doc.animations},null,2)+'\n','application/json');
        notify('Timeline exportada: pasos y pistas refieren elementos por ID del documento.');break;
    }
  }catch(e){notify(`No se pudo exportar: ${describeError(e)}`,'error');}
}

/** Importa formatos editables reconocidos. Un error deja el documento actual intacto. */
export async function importFile(file:File){
  try{
    if(file.size>3_000_000)throw new Error('El archivo supera 3 MB.');
    const text=await file.text();
    if(text.trimStart().startsWith('{')){
      const {document,migratedFrom}=openDocument(JSON.parse(text));
      replaceDocument(document,migratedFrom?`Documento importado y migrado del schema ${migratedFrom} sin cambiar IDs.`:'Documento importado y validado.');
    }else if(/\.bpmn$/i.test(file.name)||/xmlns(?::[A-Za-z0-9_-]+)?=["']http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/MODEL["']/.test(text)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      const {document,report}=importBpmn(text,{id:base}),notes=summarize(report);
      replaceDocument(document,`BPMN importado: ${document.nodes.length} elementos, ${document.edges.length} secuencias. ${notes.join(' ')}`,report.unsupported.length?'warn':'info');
    }else if(/\.(puml|plantuml)$/i.test(file.name)||/^\s*@startuml\b/.test(text)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      const {document,report,kind}=importPlantUml(text,{id:base}),notes=summarize(report);
      replaceDocument(document,`PlantUML ${kind} importado: ${document.nodes.length} elementos, ${document.edges.length} relaciones. ${notes.join(' ')}`,report.unsupported.length?'warn':'info');
    }else if(text.trimStart().startsWith('<')||/\.(drawio|xml)$/i.test(file.name)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      const {document,report}=await importDrawio(text,{id:base}),notes=summarize(report);
      replaceDocument(document,`draw.io importado: ${document.nodes.length} nodos, ${document.edges.length} conexiones. ${notes.join(' ')}`,report.unsupported.length?'warn':'info');
    }else if(/\.(dot|gv)$/i.test(file.name)||/^\s*(strict\s+)?(di)?graph\b/.test(text)){
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      const {document,report}=importDot(text,{id:base}),notes=summarize(report);
      replaceDocument(document,`DOT importado: ${document.nodes.length} nodos, ${document.edges.length} conexiones. ${notes.join(' ')}`,report.unsupported.length?'warn':'info');
    }else{
      const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+/,'').slice(0,60)||'imported';
      const {document,report}=importMermaid(text,{id:base}),notes=summarize(report);
      replaceDocument(document,`Mermaid importado: ${document.nodes.length} nodos, ${document.edges.length} conexiones. ${notes.join(' ')}`,report.unsupported.length?'warn':'info');
    }
    fit(documentBounds(documentStore.get().doc));
  }catch(e){notify(`No se importó nada; el documento actual sigue intacto. ${describeError(e)}`,'error');}
}

const readDataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
async function loadImage(blob:Blob):Promise<HTMLImageElement>{
  const url=URL.createObjectURL(blob),image=new Image();
  try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('El archivo no es una imagen legible.'));image.src=url;});return image;}
  finally{URL.revokeObjectURL(url);}
}
/** Una foto grande se reduce en el navegador hasta entrar en el tope del documento; un SVG se guarda tal cual o se rechaza. */
async function shrink(image:HTMLImageElement,file:Blob):Promise<{blob:Blob;width:number;height:number}>{
  let width=image.naturalWidth,height=image.naturalHeight,blob=file,scale=Math.min(1,1280/Math.max(width,height));
  for(let attempt=0;attempt<6&&(blob.size>MAX_ASSET_BYTES||scale<1&&attempt===0);attempt++,scale*=.75){
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
    const next=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.85));
    if(!next)throw new Error('El navegador no pudo procesar la imagen.');
    // Un navegador sin encoder WebP devuelve PNG: es un formato aceptado, así que se usa igual.
    blob=next;width=canvas.width;height=canvas.height;
  }
  if(blob.size>MAX_ASSET_BYTES)throw new Error(`La imagen sigue superando ${Math.round(MAX_ASSET_BYTES/1000)} KB después de reducirla.`);
  return {blob,width,height};
}
/** Agrega una imagen como asset del documento y la ubica en el centro de la vista con un nodo que la usa. */
export async function addImage(file:File){
  try{
    if(!(ASSET_TYPES as readonly string[]).includes(file.type))throw new Error('Formato no admitido. Usá PNG, JPEG, WebP o SVG.');
    if(file.size>20_000_000)throw new Error('El archivo supera 20 MB.');
    const image=await loadImage(file),vector=file.type==='image/svg+xml';
    if(vector&&file.size>MAX_ASSET_BYTES)throw new Error(`El SVG supera ${Math.round(MAX_ASSET_BYTES/1000)} KB.`);
    const fitted=vector?{blob:file as Blob,width:image.naturalWidth||300,height:image.naturalHeight||150}:await shrink(image,file);
    const label=file.name.replace(/\.[^.]+$/,'').trim().slice(0,200)||'Imagen',mediaType=fitted.blob.type as DiagramAsset['mediaType'];
    const asset:DiagramAsset={id:newId('asset'),label,mediaType,data:(await readDataUrl(fitted.blob)).split(',')[1],width:fitted.width,height:fitted.height};
    const ratio=Math.min(1,240/fitted.width,200/fitted.height),size={width:Math.max(24,Math.round(fitted.width*ratio)),height:Math.max(24,Math.round(fitted.height*ratio))};
    const {doc}=documentStore.get(),{camera,viewport}=viewStore.get(),id=newId('node');
    const place=resolveMembership(doc,{x:Math.round(camera.x+viewport.width/camera.zoom/2-size.width/2),y:Math.round(camera.y+viewport.height/camera.zoom/2-size.height/2),...size});
    if(transact([{type:'ADD_ASSET',asset},{type:'ADD_NODE',node:{id,kind:'image',label,position:place.position,size,zoneId:place.zoneId,assetId:asset.id}}],fitted.blob===file?'Imagen agregada':`Imagen agregada, reducida a ${fitted.width} × ${fitted.height}`))select([id]);
  }catch(e){notify(`No se agregó la imagen: ${describeError(e)}`,'error');}
}
