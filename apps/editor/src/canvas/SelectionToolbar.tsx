import {useLayoutEffect,useRef,useState} from 'react';
import {documentBounds,rootGroupId,selectionUnits,smoothInk,type ActionInput} from '@diagramia/core';
import {copy,duplicate,group,ungroup} from '../commands';
import {documentStore,notify,transact} from '../store/documentStore';
import {playbackStore} from '../store/playbackStore';
import {selectionStore} from '../store/selectionStore';
import {useStore} from '../store/createStore';
import {viewStore} from '../store/viewStore';
import {ColorPicker,readableText} from '../palette/ColorPicker';
import {HandwritingText} from './HandwritingText';
import {ArrangeSelection} from './ArrangeSelection';

/** Acciones pequeñas cerca de la selección. Los cambios siguen pasando por el motor canónico. */
export function SelectionToolbar({busy}:{busy:boolean}){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),{camera,viewport,tool,staging,editingId,connectFromId}=useStore(viewStore);
  const {playing}=useStore(playbackStore);
  const [colorsOpen,setColorsOpen]=useState(false),[textOpen,setTextOpen]=useState(false),[arrangeOpen,setArrangeOpen]=useState(false),[size,setSize]=useState({width:410,height:48}),ref=useRef<HTMLDivElement>(null);
  const nodes=doc.nodes.filter(n=>ids.includes(n.id)),edges=doc.edges.filter(e=>ids.includes(e.id)),drawings=doc.drawings.filter(d=>ids.includes(d.id)),zones=doc.zones.filter(z=>ids.includes(z.id));
  const textTarget=ids.length===1?[...doc.nodes,...doc.edges,...doc.zones,...doc.frames].find(x=>x.id===ids[0]):null;
  const hasGroup=ids.some(id=>Boolean(rootGroupId(doc,id))),editable=nodes.length+drawings.length+zones.length+doc.frames.filter(f=>ids.includes(f.id)).length;
  const unitCount=selectionUnits(doc,ids).length;
  const visible=Boolean(ids.length&&!busy&&!playing&&tool==='select'&&!staging&&!editingId&&!connectFromId),bounds=visible?documentBounds(doc,ids):null;
  const box=bounds?{left:(bounds.x-camera.x)*camera.zoom,top:(bounds.y-camera.y)*camera.zoom,right:(bounds.x+bounds.width-camera.x)*camera.zoom,bottom:(bounds.y+bounds.height-camera.y)*camera.zoom}:null;
  const onScreen=Boolean(box&&box.right>=0&&box.left<=viewport.width&&box.bottom>=0&&box.top<=viewport.height);
  useLayoutEffect(()=>{setColorsOpen(false);setTextOpen(false);setArrangeOpen(false);},[ids.join('|')]);
  useLayoutEffect(()=>{
    const element=ref.current;if(!element)return;
    const observer=new ResizeObserver(([entry])=>{
      const next={width:entry.borderBoxSize[0]?.inlineSize??element.offsetWidth,height:entry.borderBoxSize[0]?.blockSize??element.offsetHeight};
      setSize(previous=>previous.width===next.width&&previous.height===next.height?previous:next);
    });observer.observe(element);return()=>observer.disconnect();
  },[onScreen]);
  if(!box||!onScreen)return null;
  const centeredX=(box.left+box.right-size.width)/2,centeredY=(box.top+box.bottom-size.height)/2;
  // Al desplegar colores/texto se busca un lado libre para poder seguir viendo el objeto seleccionado.
  const position=box.top>=size.height+26?{x:centeredX,y:box.top-size.height-14}
    :box.left>=size.width+26?{x:box.left-size.width-14,y:centeredY}
    :viewport.width-box.right>=size.width+26?{x:box.right+14,y:centeredY}
    :{x:centeredX,y:box.bottom+14};
  const left=Math.max(12,Math.min(viewport.width-size.width-12,position.x)),top=Math.max(12,Math.min(viewport.height-size.height-12,position.y));
  const pause=()=>playbackStore.set({playing:false});
  const color=(fill:string)=>{
    const textColor=readableText(fill),stroke=fill;
    const actions:ActionInput[]=[
      ...nodes.map(n=>({type:'UPDATE_NODE' as const,id:n.id,changes:{style:{...n.style,fill,textColor}}})),
      ...edges.map(e=>({type:'UPDATE_EDGE' as const,id:e.id,changes:{style:{...e.style,stroke}}})),
      ...drawings.map(d=>({type:'UPDATE_DRAWING' as const,id:d.id,changes:{style:{...d.style,stroke}}})),
      ...zones.map(z=>({type:'UPDATE_ZONE' as const,id:z.id,changes:{style:{...z.style,fill,textColor}}}))
    ];pause();transact(actions,'Color de la selección cambiado');
  };
  const selectedColor=nodes[0]?.style.fill??drawings[0]?.style.stroke??edges[0]?.style.stroke??zones[0]?.style.fill;
  return <div ref={ref} className="selection-toolbar" role="toolbar" aria-label="Acciones de la selección" style={{left,top,maxWidth:viewport.width-24,width:colorsOpen||textOpen||arrangeOpen?Math.min(330,viewport.width-24):undefined}} onPointerDown={e=>e.stopPropagation()}
    onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();setColorsOpen(false);setTextOpen(false);setArrangeOpen(false);document.querySelector<SVGSVGElement>('.canvas')?.focus();}
      if(e.target instanceof HTMLInputElement)return;
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();e.stopPropagation();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
    }}>
    <div className="selection-actions">
      {textTarget&&<button onClick={()=>{pause();viewStore.set({editingId:textTarget.id});}}>Escribir</button>}
      {nodes.length+edges.length+drawings.length+zones.length>0&&<button aria-expanded={colorsOpen} onClick={()=>{setColorsOpen(!colorsOpen);setTextOpen(false);setArrangeOpen(false);}}>Color</button>}
      {editable>0&&<><button onClick={()=>{pause();duplicate();}}>Duplicar</button><button onClick={copy}>Copiar</button></>}
      {nodes.length+drawings.length>1&&unitCount>1&&<button onClick={()=>{pause();group();}}>Agrupar</button>}
      {hasGroup&&unitCount===1&&<button onClick={()=>{pause();ungroup();}}>Desagrupar</button>}
      {unitCount>1&&<button aria-expanded={arrangeOpen} onClick={()=>{setArrangeOpen(!arrangeOpen);setColorsOpen(false);setTextOpen(false);}}>Acomodar</button>}
      {ids.length===1&&nodes.length===1&&<button onClick={()=>{pause();viewStore.set({tool:'connect',connectFromId:nodes[0].id});notify('Elegí el elemento que querés unir. Esc cancela.');}}>Unir</button>}
      {nodes.length===0&&drawings.some(d=>d.kind==='freehand')&&<button onClick={()=>{pause();transact(drawings.filter(d=>d.kind==='freehand').map(d=>({type:'UPDATE_DRAWING',id:d.id,changes:{points:smoothInk(d.points)}})),'Trazos emprolijados');}}>Emprolijar</button>}
      {drawings.length===ids.length&&drawings.every(d=>d.kind==='freehand')&&<button aria-expanded={textOpen} onClick={()=>{setColorsOpen(false);setArrangeOpen(false);setTextOpen(!textOpen);}}>Pasar a texto</button>}
      {drawings.length===1&&ids.length===1&&<button onClick={()=>viewStore.set({tool:drawings[0].kind,penColor:drawings[0].style.stroke??'#141619',penWidth:drawings[0].style.strokeWidth??2})}>Usar este lápiz</button>}
      <button onClick={()=>viewStore.set({panel:'inspector',sideOpen:true,focusMode:false})}>Más</button>
    </div>
    {colorsOpen&&<div className="selection-colors"><ColorPicker value={selectedColor} onChange={color}/></div>}
    {textOpen&&<HandwritingText doc={doc} drawings={drawings} onClose={()=>setTextOpen(false)}/>}
    {arrangeOpen&&<ArrangeSelection/>}
  </div>;
}
