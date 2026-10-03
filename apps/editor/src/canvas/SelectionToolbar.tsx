import {useLayoutEffect,useRef,useState} from 'react';
import {documentBounds,type ActionInput} from '@diagramia/core';
import {duplicate} from '../commands';
import {documentStore,notify,transact} from '../store/documentStore';
import {playbackStore} from '../store/playbackStore';
import {selectionStore} from '../store/selectionStore';
import {useStore} from '../store/createStore';
import {viewStore} from '../store/viewStore';

const COLORS=[['Papel','#ffffff','#606975'],['Lima','#d4f246','#778c00'],['Cielo','#e5ecff','#245cf6'],['Rosa','#fde2ef','#ad3974'],['Durazno','#ffe4d6','#a54d20'],['Azul','#245cf6','#245cf6']] as const;

/** Acciones pequeñas cerca de la selección. Los cambios siguen pasando por el motor canónico. */
export function SelectionToolbar({busy}:{busy:boolean}){
  const {doc}=useStore(documentStore),{ids}=useStore(selectionStore),{camera,viewport,tool,staging,editingId,connectFromId}=useStore(viewStore);
  const {playing}=useStore(playbackStore);
  const [colorsOpen,setColorsOpen]=useState(false),[size,setSize]=useState({width:410,height:48}),ref=useRef<HTMLDivElement>(null);
  const nodes=doc.nodes.filter(n=>ids.includes(n.id)),edges=doc.edges.filter(e=>ids.includes(e.id)),drawings=doc.drawings.filter(d=>ids.includes(d.id)),zones=doc.zones.filter(z=>ids.includes(z.id));
  const textTarget=ids.length===1?[...doc.nodes,...doc.edges,...doc.zones,...doc.frames].find(x=>x.id===ids[0]):null;
  const visible=Boolean(ids.length&&!busy&&!playing&&tool==='select'&&!staging&&!editingId&&!connectFromId),bounds=visible?documentBounds(doc,ids):null;
  const box=bounds?{left:(bounds.x-camera.x)*camera.zoom,top:(bounds.y-camera.y)*camera.zoom,right:(bounds.x+bounds.width-camera.x)*camera.zoom,bottom:(bounds.y+bounds.height-camera.y)*camera.zoom}:null;
  const onScreen=Boolean(box&&box.right>=0&&box.left<=viewport.width&&box.bottom>=0&&box.top<=viewport.height);
  useLayoutEffect(()=>{setColorsOpen(false);},[ids.join('|')]);
  useLayoutEffect(()=>{
    const element=ref.current;if(!element)return;
    const observer=new ResizeObserver(([entry])=>{
      const next={width:entry.borderBoxSize[0]?.inlineSize??element.offsetWidth,height:entry.borderBoxSize[0]?.blockSize??element.offsetHeight};
      setSize(previous=>previous.width===next.width&&previous.height===next.height?previous:next);
    });observer.observe(element);return()=>observer.disconnect();
  },[onScreen]);
  if(!box||!onScreen)return null;
  const left=Math.max(12,Math.min(viewport.width-size.width-12,(box.left+box.right-size.width)/2));
  const top=Math.max(12,Math.min(viewport.height-size.height-12,box.top>=size.height+20?box.top-size.height-14:box.bottom+14));
  const pause=()=>playbackStore.set({playing:false});
  const color=(fill:string,stroke:string)=>{
    const textColor=fill==='#245cf6'?'#ffffff':'#141619';
    const actions:ActionInput[]=[
      ...nodes.map(n=>({type:'UPDATE_NODE' as const,id:n.id,changes:{style:{...n.style,fill,textColor}}})),
      ...edges.map(e=>({type:'UPDATE_EDGE' as const,id:e.id,changes:{style:{...e.style,stroke}}})),
      ...drawings.map(d=>({type:'UPDATE_DRAWING' as const,id:d.id,changes:{style:{...d.style,stroke}}})),
      ...zones.map(z=>({type:'UPDATE_ZONE' as const,id:z.id,changes:{style:{...z.style,fill,textColor}}}))
    ];pause();transact(actions,'Color de la selección cambiado');
  };
  return <div ref={ref} className="selection-toolbar" role="toolbar" aria-label="Acciones de la selección" style={{left,top,maxWidth:viewport.width-24}} onPointerDown={e=>e.stopPropagation()}
    onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();setColorsOpen(false);document.querySelector<SVGSVGElement>('.canvas')?.focus();}
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();e.stopPropagation();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
    }}>
    <div className="selection-actions">
      {textTarget&&<button onClick={()=>{pause();viewStore.set({editingId:textTarget.id});}}>Escribir</button>}
      {nodes.length+edges.length+drawings.length+zones.length>0&&<button aria-expanded={colorsOpen} onClick={()=>setColorsOpen(!colorsOpen)}>Color</button>}
      {nodes.length>0&&<button onClick={()=>{pause();duplicate();}}>Duplicar</button>}
      {ids.length===1&&nodes.length===1&&<button onClick={()=>{pause();viewStore.set({tool:'connect',connectFromId:nodes[0].id});notify('Elegí el elemento que querés unir. Esc cancela.');}}>Unir</button>}
      <button onClick={()=>viewStore.set({panel:'inspector',sideOpen:true,focusMode:false})}>Más</button>
    </div>
    {colorsOpen&&<div className="selection-colors" role="group" aria-label="Elegir un color">{COLORS.map(([name,fill,stroke])=><button key={name} style={{background:fill}} aria-label={`Color ${name}`} title={name} onClick={()=>color(fill,stroke)}/>)}</div>}
  </div>;
}
