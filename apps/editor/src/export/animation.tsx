import {renderToStaticMarkup} from 'react-dom/server';
import {animationDuration,documentBounds,resolveScenario,sampleAnimation,sampleTrackEffects,statesAt,stepCamera,stepStarts,type DiagramDocument} from '@diagramia/core';
import {DIAGRAM_CSS,DiagramLayer,type LayerProps} from '../canvas/DiagramLayer';
import {cameraAt,cameraFor,easeCamera,type Camera} from '../store/viewStore';
import {playbackStore} from '../store/playbackStore';
import {fontCss} from '../io';
import {t} from '../i18n';
import {GifWriter,quantizeFrame} from './gif';

/**
 * Exporta la animación como GIF o video (ADR 107). Los cuadros salen del mismo dibujo que el canvas y la presentación:
 * cada instante se dibuja como SVG, con la cámara y el resaltado de ese momento, y se le agrega abajo el texto del paso.
 * Todo ocurre en el navegador; el diagrama no se envía a ningún servidor.
 */
export type AnimationFormat='gif'|'video';
type Animation=DiagramDocument['animations'][number];
type Shot={key:string;camera:Camera;layer:Partial<LayerProps>;counter:string;caption:string};
type Stage={width:number;height:number;stageHeight:number;unit:number};
export type AnimationFile={blob:Blob;extension:'gif'|'mp4'|'webm';width:number;height:number;seconds:number};

// El GIF va a 12,5 cuadros por segundo (80 ms es un múltiplo exacto de su unidad de tiempo) y más chico: pesa mucho más que un video.
const SPECS={gif:{width:960,height:540,frameMs:80,maxMs:45_000},video:{width:1280,height:720,frameMs:40,maxMs:90_000}} as const;
// El último cuadro queda un momento a la vista: en un GIF que se repite, el final se tiene que poder leer.
const HOLD_MS=1500,BAR=.16;
const VIDEO_TYPES=['video/mp4;codecs=avc1.42E01F','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,Math.max(0,ms)));

/** Qué se ve en cada instante: el mismo cálculo que la presentación, con la cámara viajando entre un paso y el siguiente. */
function shots(doc:DiagramDocument,animation:Animation,stage:Stage){
  const viewport={width:stage.width,height:stage.stageHeight},starts=stepStarts(animation);
  const everything=documentBounds(doc,[...doc.nodes,...doc.edges,...doc.drawings,...doc.zones].map(x=>x.id))??{x:0,y:0,width:800,height:500};
  const cameras=animation.steps.map((_,index)=>{
    const {bounds,transitionMs}=stepCamera(doc,animation,index);
    return {goal:cameraFor(bounds??everything,viewport,48*stage.unit,2.5*stage.unit),transitionMs};
  });
  return (time:number):Shot=>{
    const sample=sampleAnimation(animation,time),effects=sampleTrackEffects(animation,time),index=sample.index,{goal,transitionMs}=cameras[index]!;
    const travel=index>0&&transitionMs>0?Math.min(1,(time-starts[index]!)/transitionMs):1;
    const camera=travel<1?cameraAt(cameras[index-1]!.goal,goal,viewport,easeCamera(travel)):goal;
    const activeNodes=new Set([...sample.step.nodeIds,...effects.nodeIds]),activeEdges=new Set([...sample.step.edgeIds,...effects.edgeIds]);
    const caption=[sample.step.caption,...effects.captions].filter(Boolean).join(' · ');
    return {camera,caption,counter:`${index+1} / ${animation.steps.length}`+(sample.step.tone==='failure'?t(' · FALLA'):''),
      layer:{states:statesAt(animation,index),activeNodes,activeEdges,failed:sample.step.tone==='failure',progress:sample.progress},
      // Dos instantes con la misma clave se dibujan igual: el avance sólo se ve si hay una conexión resaltada por la que viaja el punto.
      key:[index,camera.x.toFixed(2),camera.y.toFixed(2),camera.zoom.toFixed(4),activeEdges.size?sample.progress.toFixed(3):'',[...activeNodes].join(','),[...activeEdges].join(','),caption].join('|')};
  };
}

async function loadImage(source:string):Promise<HTMLImageElement>{
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error(t('El navegador no pudo dibujar un cuadro de la animación.')));image.src=source;});
  return image;
}
/** Parte un texto en renglones que entren en `maxWidth`; si no alcanza con `maxLines`, el último termina en puntos suspensivos. */
function wrap(context:CanvasRenderingContext2D,text:string,maxWidth:number,maxLines:number):string[]{
  const lines:string[]=[];let line='';
  for(const word of text.split(/\s+/).filter(Boolean)){
    const candidate=line?`${line} ${word}`:word;
    if(!line||context.measureText(candidate).width<=maxWidth){line=candidate;continue;}
    lines.push(line);line=word;
  }
  if(line)lines.push(line);
  if(lines.length<=maxLines)return lines;
  let last=lines[maxLines-1]!;
  while(last&&context.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);
  return [...lines.slice(0,maxLines-1),last.trimEnd()+'…'];
}

/** Dibuja un cuadro completo: el diagrama arriba y, abajo, el paso, su texto y la marca. */
async function draw(context:CanvasRenderingContext2D,doc:DiagramDocument,shot:Shot,stage:Stage,css:string,brand:HTMLImageElement|null){
  const {width,height,stageHeight,unit}=stage,{camera}=shot;
  const body=renderToStaticMarkup(<DiagramLayer {...shot.layer} doc={doc} showFrames={false}/>);
  const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stageHeight}" viewBox="${camera.x} ${camera.y} ${width/camera.zoom} ${stageHeight/camera.zoom}"><style>${css}</style>${body}</svg>`;
  const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));
  try{
    const image=await loadImage(url);
    context.fillStyle='#fff';context.fillRect(0,0,width,height);
    context.drawImage(image,0,0,width,stageHeight);
  }finally{URL.revokeObjectURL(url);}
  const bar=height-stageHeight,pad=28*unit;
  context.fillStyle='#f4f6f8';context.fillRect(0,stageHeight,width,bar);
  context.fillStyle='#d7dce2';context.fillRect(0,stageHeight,width,Math.max(1,Math.round(unit)));
  // Marca, a la derecha: es lo que le dice a quien ve el video de dónde salió.
  context.textBaseline='middle';context.textAlign='left';
  context.font=`750 ${22*unit}px Manrope, Arial, sans-serif`;
  const name='diagramia',icon=26*unit,nameWidth=context.measureText(name).width,brandWidth=icon+8*unit+nameWidth,brandX=width-pad-brandWidth,middle=stageHeight+bar/2;
  if(brand)context.drawImage(brand,brandX,middle-icon/2,icon,icon);
  context.fillStyle='#141619';context.fillText(name,brandX+icon+8*unit,middle+unit);
  // Paso y texto, a la izquierda.
  const size=24*unit,maxWidth=brandX-pad*2;
  context.font=`600 ${size}px Manrope, Arial, sans-serif`;
  const lines=wrap(context,shot.caption,maxWidth,2),block=lines.length*size*1.25,counterHeight=20*unit,top=middle-(block+counterHeight)/2;
  context.font=`${14*unit}px Plex, monospace`;context.fillStyle='#606975';context.fillText(shot.counter,pad,top+counterHeight/2);
  context.font=`600 ${size}px Manrope, Arial, sans-serif`;context.fillStyle='#141619';
  lines.forEach((line,index)=>context.fillText(line,pad,top+counterHeight+size*1.25*(index+.5)));
}

export function videoType():string|null{
  if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||!('captureStream' in HTMLCanvasElement.prototype))return null;
  return VIDEO_TYPES.find(type=>MediaRecorder.isTypeSupported(type))??null;
}

/**
 * Genera el archivo de la animación elegida en el reproductor (o la primera), con su escenario.
 * `progress` recibe la etapa y el avance 0..1. El video se graba en tiempo real: tarda lo que dura la animación.
 */
export async function renderAnimation(doc:DiagramDocument,format:AnimationFormat,progress:(stage:'frames'|'recording',done:number)=>void):Promise<AnimationFile>{
  const playback=playbackStore.get(),raw=doc.animations.find(a=>a.id===playback.animationId)??doc.animations[0];
  if(!raw)throw new Error(t('Este diagrama no tiene una animación. Creala en «Dale movimiento» y volvé a exportar.'));
  const animation=resolveScenario(raw,playback.scenarioId);
  if(!animation.steps.length)throw new Error(t('La animación no tiene pasos para exportar.'));
  const spec=SPECS[format],duration=animationDuration(animation);
  if(duration>spec.maxMs)throw new Error(t('La animación dura {0} s y el máximo para exportarla así es {1} s. Acortá los pasos o elegí un escenario.',Math.round(duration/1000),spec.maxMs/1000));
  const type=format==='video'?videoType():null;
  if(format==='video'&&!type)throw new Error(t('Este navegador no puede grabar video. Exportá el GIF, o probá con Chrome, Edge o Firefox actualizados.'));
  const {width,height,frameMs}=spec,stage:Stage={width,height,stageHeight:height-Math.round(height*BAR),unit:height/720};
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:format==='gif'});
  if(!context)throw new Error(t('El navegador no pudo preparar el lienzo para exportar.'));
  // Sin tipografías incrustadas los cuadros igual se dibujan, con la fuente del sistema.
  const css=await fontCss().catch(()=>'')+DIAGRAM_CSS;
  await Promise.all([document.fonts.load(`600 ${24*stage.unit}px Manrope`),document.fonts.load(`${14*stage.unit}px Plex`)]).catch(()=>undefined);
  const brand=await loadImage('/favicon.svg').catch(()=>null);
  const shotAt=shots(doc,animation,stage),count=Math.ceil(duration/frameMs)+1,seconds=(duration+HOLD_MS)/1000;

  if(format==='gif'){
    const writer=new GifWriter(width,height);
    let previous:Uint8ClampedArray|null=null,pending:{frame:NonNullable<ReturnType<typeof quantizeFrame>>;delay:number}|null=null,lastKey='';
    for(let i=0;i<count;i++){
      const shot=shotAt(Math.min(duration,i*frameMs));
      if(shot.key!==lastKey){
        lastKey=shot.key;await draw(context,doc,shot,stage,css,brand);
        const pixels=context.getImageData(0,0,width,height).data,frame=quantizeFrame(pixels,previous,width,height);
        // Un cuadro igual al anterior no se guarda: el anterior simplemente dura más.
        if(frame){if(pending)writer.add(pending.frame,pending.delay);pending={frame,delay:0};previous=pixels;}
      }
      pending!.delay+=frameMs;
      progress('frames',(i+1)/count);
    }
    writer.add(pending!.frame,pending!.delay+HOLD_MS);
    return {blob:new Blob(writer.finish() as BlobPart[],{type:'image/gif'}),extension:'gif',width,height,seconds};
  }

  // Video, en dos etapas. Primero se dibujan los cuadros sin apuro; después se graban a ritmo real, porque el grabador
  // del navegador mide el tiempo con el reloj: dibujar y grabar a la vez daría un video más lento que la animación.
  const stills:Blob[]=[],order:number[]=[];let lastKey='';
  for(let i=0;i<count;i++){
    const shot=shotAt(Math.min(duration,i*frameMs));
    if(shot.key!==lastKey){
      lastKey=shot.key;await draw(context,doc,shot,stage,css,brand);
      const still=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));
      if(!still)throw new Error(t('El navegador no pudo dibujar un cuadro de la animación.'));
      stills.push(still);
    }
    order.push(stills.length-1);
    progress('frames',(i+1)/count);
  }
  for(let i=Math.ceil(HOLD_MS/frameMs);i>0;i--)order.push(stills.length-1);
  const stream=canvas.captureStream(0),videoTrack=stream.getVideoTracks()[0]!;
  // Chrome y Safari piden el cuadro a la pista; Firefox, al stream.
  const capture=()=>{const target=(videoTrack as {requestFrame?:()=>void}).requestFrame?videoTrack:stream;(target as unknown as {requestFrame?:()=>void}).requestFrame?.();};
  const recorder=new MediaRecorder(stream,{mimeType:type!,videoBitsPerSecond:6_000_000}),chunks:Blob[]=[];
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  const stopped=new Promise<void>((resolve,reject)=>{recorder.onstop=()=>resolve();recorder.onerror=()=>reject(new Error(t('El navegador interrumpió la grabación del video.')));});
  const show=async(index:number)=>{const bitmap=await createImageBitmap(stills[index]!);context.drawImage(bitmap,0,0,width,height);bitmap.close();};
  try{
    await show(order[0]!);
    recorder.start();
    const started=performance.now();let shown=order[0]!;
    for(let n=0;n<order.length;n++){
      // En segundo plano el navegador frena los relojes y el video saldría estirado: mejor avisar que entregar algo mal.
      if(document.hidden)throw new Error(t('La pestaña quedó en segundo plano y el video se habría grabado mal. Volvé a exportarlo y dejá esta pestaña a la vista hasta que termine.'));
      if(order[n]!==shown){shown=order[n]!;await show(shown);}
      // El grabador descarta los cuadros iguales al anterior, y con ellos el final quieto del video: un píxel de la esquina
      // alterna entre dos tonos vecinos del fondo de la franja para que cada cuadro cuente. No se llega a ver.
      context.fillStyle=n%2?'#f4f6f8':'#f3f5f7';context.fillRect(width-1,height-1,1,1);
      capture();
      progress('recording',(n+1)/order.length);
      await sleep(started+(n+1)*frameMs-performance.now());
    }
    recorder.stop();await stopped;
  }catch(error){
    if(recorder.state!=='inactive'){recorder.onstop=null;recorder.stop();}
    throw error;
  }finally{videoTrack.stop();}
  const mime=type!.split(';')[0]!;
  return {blob:new Blob(chunks,{type:mime}),extension:mime==='video/mp4'?'mp4':'webm',width,height,seconds};
}
