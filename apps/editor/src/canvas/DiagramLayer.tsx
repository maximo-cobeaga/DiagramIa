import type {CSSProperties,ReactNode} from 'react';
import {ICON_LARGE,LABEL_BELOW_SHAPES,detailBlock,PILL_ICON,SHAPE_INSET,assetDataUrl,detailLines,edgeLabelLayout,pointOnPolyline,routeAll,shapeOf,usableFraction,wrapLabel,type DiagramAnnotation,type DiagramDocument,type DiagramEdge,type DiagramNode,type Point} from '@diagramia/core';

export {wrapLabel};
type Shape=ReturnType<typeof shapeOf>;
type Box={x:number;y:number;w:number;h:number};
// Glifos de 16 × 16 dibujados con trazo: son parte del documento (campo `icon`), no decoración de la interfaz.
export const ICON_PATHS:Record<NonNullable<DiagramNode['icon']>,string>={
  user:'M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5',
  server:'M2.5 3h11v4h-11zM2.5 9h11v4h-11zM5 5h.01M5 11h.01',
  database:'M3 4.5c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2ZM3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M3 8c0 1.1 2.2 2 5 2s5-.9 5-2',
  cloud:'M4.5 12.5a3 3 0 0 1-.4-5.97A4 4 0 0 1 11.9 7.1a2.75 2.75 0 0 1-.4 5.4z',
  lock:'M4 7.5h8v6H4zM5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2',
  queue:'M2.5 4h11M2.5 8h11M2.5 12h11',
  globe:'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2.5 8h11M8 2.5c-2 2-2 9 0 11M8 2.5c2 2 2 9 0 11',
  bolt:'M9 2 4 9h3.5L7 14l5-7H8.5z',
  mail:'M2.5 4h11v8h-11zM2.5 4.5 8 9l5.5-4.5',
  gear:'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1',
  // Personas, ideas y estados.
  users:'M6 7a2.25 2.25 0 1 0 0-4.5A2.25 2.25 0 0 0 6 7ZM1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 7a2 2 0 1 0 0-4M12 9.6c1.6.4 2.5 1.7 2.5 3.9',
  heart:'M8 13.5S2.5 10.2 2.5 6.3A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5 1.3C13.5 10.2 8 13.5 8 13.5Z',
  idea:'M6 12h4M6.5 14h3M8 2a4 4 0 0 0-2.4 7.2c.5.4.9 1 .9 1.8h3c0-.8.4-1.4.9-1.8A4 4 0 0 0 8 2Z',
  star:'M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2l-3.6 1.9.7-4-2.9-2.8 4-.6Z',
  target:'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 8h.01',
  flag:'M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8',
  question:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2ZM6.2 6.3a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.7M8 11.3h.01',
  check:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2ZM5.2 8.2l1.9 1.9 3.7-3.9',
  alert:'M8 2.2 14.2 13H1.8ZM8 6.5v3M8 11.3h.01',
  // Negocio y logística.
  coin:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2ZM9.8 5.8C9.4 5.2 8.7 5 8 5c-1 0-1.9.5-1.9 1.4 0 2 3.8 1.2 3.8 3.2 0 .9-.9 1.4-1.9 1.4-.8 0-1.5-.3-1.9-.9M8 4v1M8 11v1',
  cart:'M1.5 2.5h2l1.6 7.5h7l1.4-5.5H4.2M6 13.2h.01M11.5 13.2h.01',
  store:'M2.5 6.5 3.5 2.5h9l1 4M2.5 6.5c0 .9.8 1.5 1.8 1.5s1.9-.6 1.9-1.5c0 .9.8 1.5 1.8 1.5s1.8-.6 1.8-1.5c0 .9.9 1.5 1.9 1.5s1.8-.6 1.8-1.5M3.5 8v5.5h9V8M6.5 13.5v-3h3v3',
  chart:'M2.5 2.5v11h11M5.5 11V8M8.5 11V5.5M11.5 11V7',
  trend:'M2 12l4-4 2.5 2.5L14 5M10.5 5H14v3.5',
  briefcase:'M2 5.5h12v8H2zM5.5 5.5v-2h5v2M2 9h12',
  file:'M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5',
  calendar:'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  clock:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2ZM8 4.5V8l2.5 1.5',
  tag:'M2 2.5v5l6.5 6.5 5-5L7 2.5ZM5 5h.01',
  box:'M8 1.8l5.5 2.8v6.8L8 14.2l-5.5-2.8V4.6ZM2.5 4.6 8 7.4l5.5-2.8M8 7.4v6.8',
  truck:'M1.5 3.5H10V11H1.5zM10 6h2.5l2 2.5V11H10M4.5 11.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8ZM11.5 11.2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z',
  // Comunicación y dispositivos.
  chat:'M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5z',
  phone:'M5 1.5h6v13H5zM7.3 12.5h1.4',
  bell:'M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8ZM6.6 14a1.5 1.5 0 0 0 2.8 0',
  laptop:'M3.5 3.5h9V10h-9zM1.5 12.5h13',
  wifi:'M2 6.3a8.5 8.5 0 0 1 12 0M4.2 8.6a5.3 5.3 0 0 1 7.6 0M6.4 10.9a2.2 2.2 0 0 1 3.2 0M8 13h.01',
  // Lugares y educación.
  home:'M2 7.5 8 2.5l6 5M3.5 6.3v7.2h9V6.3M6.5 13.5V10h3v3.5',
  building:'M3 14V2.5h7V14M10 6h3v8M1.5 14h13M5 5h.01M7.5 5h.01M5 7.5h.01M7.5 7.5h.01M5 10h.01M7.5 10h.01',
  pin:'M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8ZM8 4.8a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z',
  book:'M8 4C6.5 3 4.5 2.5 2 2.5v10c2.5 0 4.5.5 6 1.5 1.5-1 3.5-1.5 6-1.5v-10c-2.5 0-4.5.5-6 1.5ZM8 4v10',
  graduation:'M8 3 1 6.5 8 10l7-3.5ZM4 8v3.2c1 .9 2.4 1.3 4 1.3s3-.4 4-1.3V8M14.5 6.5v4',
  pencil:'M11 2.5 13.5 5l-8 8H3v-2.5ZM9.5 4 12 6.5',
  // Otros.
  search:'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM10.3 10.3 14 14',
  key:'M5.5 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM7.6 7.9 13.5 2M11.5 4l2 2M10 5.5 11.5 7',
  shield:'M8 1.8 13 3.8v4c0 3-2.2 5.3-5 6.4-2.8-1.1-5-3.4-5-6.4v-4Z',
  leaf:'M3 13c0-6 3.5-10 10.5-10.5C13 9.5 9 13 3 13ZM3 13l6-6',
  play:'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2ZM6.5 5.5v5l4-2.5Z',
  link:'M6.8 9.2a2.7 2.7 0 0 0 3.8 0l2.1-2.1a2.7 2.7 0 0 0-3.8-3.8l-.8.8M9.2 6.8a2.7 2.7 0 0 0-3.8 0L3.3 8.9a2.7 2.7 0 0 0 3.8 3.8l.8-.8',
  photo:'M2 3h12v10H2zM2 11l3.5-3.5 3 3 2-2L14 12M10.5 5.5h.01',
  // Viajes, ocio y vida cotidiana.
  car:'M2.5 10.5V8l1.6-3.5h7.8L13.5 8v2.5ZM2.5 10.5v2h2v-2M11.5 10.5v2h2v-2M3.5 8h9M5 9.4h.01M11 9.4h.01',
  bus:'M3 2.5h10v9.5H3zM3 7.5h10M3 4.8h10M5 12v1.5M11 12v1.5M5.2 9.8h.01M10.8 9.8h.01',
  train:'M4 2h8a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a1 1 0 0 1 1-1ZM3 7h10M5.5 9.5h.01M10.5 9.5h.01M5 12l-1.5 2.5M11 12l1.5 2.5',
  plane:'M8 1.5c.8 0 1.2.8 1.2 1.8v3.2l5 2.8v1.5l-5-1.5v3l1.6 1.2v1.2L8 14l-2.8.7v-1.2l1.6-1.2v-3l-5 1.5V8.3l5-2.8V3.3c0-1 .4-1.8 1.2-1.8Z',
  ship:'M2 10.5h12l-2 3H4ZM4 10.5V7h8v3.5M6 7V4.5h4V7M8 2.5v2',
  bike:'M4 9a2.75 2.75 0 1 0 0 5.5A2.75 2.75 0 0 0 4 9ZM12 9a2.75 2.75 0 1 0 0 5.5A2.75 2.75 0 0 0 12 9ZM4 11.75 6.5 6.5H11l1 5.25M6.5 6.5l2 5.25H4M5.5 4.5h2',
  umbrella:'M8 2.5a6 6 0 0 1 6 5.5H2a6 6 0 0 1 6-5.5ZM8 8v5a1.5 1.5 0 0 1-3 0',
  sun:'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1',
  wave:'M1.5 6c1.6 0 1.6-1.5 3.25-1.5S6.4 6 8 6s1.6-1.5 3.25-1.5S12.9 6 14.5 6M1.5 10c1.6 0 1.6-1.5 3.25-1.5S6.4 10 8 10s1.6-1.5 3.25-1.5S12.9 10 14.5 10M1.5 14c1.6 0 1.6-1.5 3.25-1.5S6.4 14 8 14s1.6-1.5 3.25-1.5S12.9 14 14.5 14',
  mountain:'M1.5 13.5 6 5l3 5 1.8-2.8 3.7 6.3ZM4.6 7.6 6 8.6l1.2-1',
  food:'M4 1.5v4a1.5 1.5 0 0 0 3 0v-4M5.5 1.5v13M11.5 14.5v-13c-1.7 1-2.5 3-2.5 5.5h2.5',
  coffee:'M2.5 6h9v4a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10ZM11.5 7h1a1.75 1.75 0 0 1 0 3.5h-1M5 1.5v2M8 1.5v2',
  bed:'M1.5 4v9.5M1.5 11h13v2.5M1.5 8.5h13V11M4.5 8.5V7a1.5 1.5 0 0 1 3 0v1.5',
  camera:'M2 5h3l1.2-2h3.6L11 5h3v8.5H2ZM8 6.8a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z',
  map:'M1.5 4 5.5 2.5l5 1.5 4-1.5V12l-4 1.5-5-1.5-4 1.5ZM5.5 2.5V12M10.5 4v9.5',
  ticket:'M2 4.5h12v2.2a1.3 1.3 0 0 0 0 2.6v2.2H2V9.3a1.3 1.3 0 0 0 0-2.6ZM10 4.5v7',
  music:'M6 12.5V3l7.5-1.5v9M6 12.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM13.5 10.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM6 6l7.5-1.5',
  bag:'M3 5h10l-.8 9.5H3.8ZM5.5 5V4a2.5 2.5 0 0 1 5 0v1',
  sparkle:'M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z'
};
const SEVERITY_RANK={info:0,warning:1,risk:2} as const,SEVERITY_GLYPH={info:'i',warning:'!',risk:'‼'} as const;
// Formas cuyo nombre se escribe debajo y no adentro.
const LABEL_BELOW=new Set<Shape>(LABEL_BELOW_SHAPES);
// Formas que ubican el icono en su propio dibujo (encabezado, círculo o centro), no en la esquina.
const OWN_ICON=new Set<Shape>(['card','pill','avatar','badge']);
const poly=(points:[number,number][])=>points.map(p=>p.join(',')).join(' ');

/** Contorno de cada forma dentro de su caja. `main` es la pieza que recibe relleno y estado; `extra`, sus detalles. */
export function shapeParts(shape:Shape,{x,y,w,h}:Box):{main:ReactNode;extra?:ReactNode}{
  const cls='node-shape';
  switch(shape){
    case 'rectangle':return {main:<rect className={cls} x={x} y={y} width={w} height={h}/>};
    case 'ellipse':return {main:<ellipse className={cls} cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2}/>};
    case 'circle':{const r=Math.min(w,h)/2;return {main:<circle className={cls} cx={x+w/2} cy={y+h/2} r={r}/>};}
    case 'diamond':return {main:<polygon className={cls} points={poly([[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]])}/>};
    case 'triangle':return {main:<polygon className={cls} points={poly([[x+w/2,y],[x+w,y+h],[x,y+h]])}/>};
    case 'hexagon':{const q=Math.min(w*.2,h/2);return {main:<polygon className={cls} points={poly([[x+q,y],[x+w-q,y],[x+w,y+h/2],[x+w-q,y+h],[x+q,y+h],[x,y+h/2]])}/>};}
    case 'parallelogram':{const q=w*.16;return {main:<polygon className={cls} points={poly([[x+q,y],[x+w,y],[x+w-q,y+h],[x,y+h]])}/>};}
    case 'trapezoid':{const q=w*.15;return {main:<polygon className={cls} points={poly([[x+q,y],[x+w-q,y],[x+w,y+h],[x,y+h]])}/>};}
    case 'star':{
      const cx=x+w/2,cy=y+h/2,points:[number,number][]=[];
      for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,k=i%2?.42:1;points.push([cx+Math.cos(angle)*w/2*k,cy+Math.sin(angle)*h/2*k]);}
      return {main:<polygon className={cls} points={poly(points)}/>};
    }
    case 'cloud':return {main:<path className={cls} d={`M${x+w*.2} ${y+h*.86}C${x-w*.04} ${y+h*.86} ${x-w*.02} ${y+h*.42} ${x+w*.2} ${y+h*.42}C${x+w*.2} ${y+h*.1} ${x+w*.55} ${y+h*.02} ${x+w*.62} ${y+h*.3}C${x+w*.85} ${y+h*.16} ${x+w*1.04} ${y+h*.46} ${x+w*.85} ${y+h*.6}C${x+w} ${y+h*.86} ${x+w*.8} ${y+h*.93} ${x+w*.7} ${y+h*.86}Z`}/>};
    case 'cylinder':{const r=Math.min(12,h/5);return {main:<path className={cls} d={`M${x} ${y+r}A${w/2} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${w/2} ${r} 0 0 1 ${x} ${y+h-r}Z`}/>,extra:<path className="node-detail" d={`M${x} ${y+r}A${w/2} ${r} 0 0 0 ${x+w} ${y+r}`}/>};}
    case 'note':return {main:<path className={cls+' note'} d={`M${x} ${y}H${x+w-14}L${x+w} ${y+14}V${y+h}H${x}Z`}/>,extra:<path className="node-detail" d={`M${x+w-14} ${y}V${y+14}H${x+w}`}/>};
    case 'text':return {main:<rect className={cls+' bare'} x={x} y={y} width={w} height={h}/>};
    case 'terminator':return {main:<rect className={cls} x={x} y={y} width={w} height={h} rx={h/2}/>};
    case 'document':return {main:<path className={cls} d={`M${x} ${y}H${x+w}V${y+h*.86}Q${x+w*.75} ${y+h*.7} ${x+w/2} ${y+h*.86}T${x} ${y+h*.86}Z`}/>};
    case 'predefined':return {main:<rect className={cls} x={x} y={y} width={w} height={h}/>,extra:<path className="node-detail" d={`M${x+10} ${y}V${y+h}M${x+w-10} ${y}V${y+h}`}/>};
    case 'manual-input':return {main:<polygon className={cls} points={poly([[x,y+h*.26],[x+w,y],[x+w,y+h],[x,y+h]])}/>};
    case 'delay':return {main:<path className={cls} d={`M${x} ${y}H${x+w-h/2}A${h/2} ${h/2} 0 0 1 ${x+w-h/2} ${y+h}H${x}Z`}/>};
    case 'actor':{
      const cx=x+w/2,r=Math.min(w,h)*.16,neck=y+r*2,hip=y+h*.66;
      return {main:<circle className={cls} cx={cx} cy={y+r} r={r}/>,extra:<><rect className="node-shape bare" x={x} y={y} width={w} height={h}/><path className="node-detail" d={`M${cx} ${neck}V${hip}M${x+w*.15} ${y+h*.42}H${x+w*.85}M${cx} ${hip}L${x+w*.2} ${y+h}M${cx} ${hip}L${x+w*.8} ${y+h}`}/></>};
    }
    case 'class':return {main:<rect className={cls} x={x} y={y} width={w} height={h}/>};
    case 'package':{const tab=Math.min(16,h/4);return {main:<path className={cls} d={`M${x} ${y+tab}H${x+w}V${y+h}H${x}Z`}/>,extra:<path className="node-shape" d={`M${x} ${y+tab}V${y}H${x+w*.42}V${y+tab}`}/>};}
    case 'component':return {main:<rect className={cls} x={x+8} y={y} width={w-8} height={h}/>,extra:<><rect className="node-shape" x={x} y={y+h*.22} width="16" height="9"/><rect className="node-shape" x={x} y={y+h*.6} width="16" height="9"/></>};
    case 'start':return {main:<circle className={cls+' solid'} cx={x+w/2} cy={y+h/2} r={Math.min(w,h)/2}/>};
    case 'end':{const r=Math.min(w,h)/2;return {main:<circle className={cls} cx={x+w/2} cy={y+h/2} r={r}/>,extra:<circle className="node-shape solid" cx={x+w/2} cy={y+h/2} r={r*.58}/>};}
    // Formas con dibujo propio (1.6.0). La pieza «main» recibe relleno y estado; los detalles usan el color del borde como acento.
    case 'sticky':return {main:<path className={cls} d={`M${x} ${y}H${x+w}V${y+h-14}Q${x+w-3} ${y+h-3} ${x+w-16} ${y+h}H${x}Z`}/>,
      extra:<><path className="sticky-curl" d={`M${x+w} ${y+h-14}Q${x+w-10} ${y+h-12} ${x+w-16} ${y+h}`}/><rect className="sticky-tape" x={x+w/2-23} y={y-8} width="46" height="15" rx="2" transform={`rotate(-4 ${x+w/2} ${y})`}/></>};
    case 'card':return {main:<rect className={cls} x={x} y={y} width={w} height={h} rx="12"/>,
      extra:<path className="node-band" d={`M${x} ${y+30}V${y+12}A12 12 0 0 1 ${x+12} ${y}H${x+w-12}A12 12 0 0 1 ${x+w} ${y+12}V${y+30}Z`}/>};
    case 'bubble':{const body=h-16,r=Math.min(16,body/2);
      return {main:<path className={cls} d={`M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+body-r}Q${x+w} ${y+body} ${x+w-r} ${y+body}H${x+46}L${x+20} ${y+h}L${x+26} ${y+body}H${x+r}Q${x} ${y+body} ${x} ${y+body-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`}/>};}
    case 'pill':return {main:<rect className={cls} x={x} y={y} width={w} height={h} rx={h/2}/>};
    case 'avatar':{const s=Math.min(w,h),cx=x+w/2,cy=y+h/2;
      return {main:<circle className={cls} cx={cx} cy={cy} r={s/2-5}/>,extra:<circle className="node-ring" cx={cx} cy={cy} r={s/2-1}/>};}
    case 'badge':{
      const s=Math.min(w,h),cx=x+w/2,cy=y+h/2,R=s/2,points:[number,number][]=[];
      for(let i=0;i<24;i++){const angle=-Math.PI/2+i*Math.PI/12,k=i%2?.9:1;points.push([cx+Math.cos(angle)*R*k,cy+Math.sin(angle)*R*k]);}
      return {main:<polygon className={cls} points={poly(points)}/>,extra:<circle className="node-ring inner" cx={cx} cy={cy} r={R*.7}/>};
    }
    case 'ribbon':{const k=Math.min(18,w*.12);return {main:<polygon className={cls} points={poly([[x,y],[x+w,y],[x+w-k,y+h/2],[x+w,y+h],[x,y+h],[x+k,y+h/2]])}/>};}
    case 'folder':{const tab=Math.min(w*.4,120);
      return {main:<path className={cls} d={`M${x} ${y+16}V${y+6}Q${x} ${y} ${x+6} ${y}H${x+tab}L${x+tab+12} ${y+10}H${x+w-6}Q${x+w} ${y+10} ${x+w} ${y+16}V${y+h-6}Q${x+w} ${y+h} ${x+w-6} ${y+h}H${x+6}Q${x} ${y+h} ${x} ${y+h-6}Z`}/>,
        extra:<path className="node-detail" d={`M${x} ${y+16}H${x+w}`}/>};}
    case 'browser':return {main:<rect className={cls} x={x} y={y} width={w} height={h} rx="10"/>,
      extra:<><path className="node-detail" d={`M${x} ${y+24}H${x+w}`}/>{[0,1,2].map(i=><circle key={i} className={`browser-dot d${i}`} cx={x+14+i*12} cy={y+12} r="3.5"/>)}</>};
    case 'map':{
      const a=x+w/3,b=x+w*2/3,z=Math.min(8,h*.08),px=x+w*.84,py=y+h*.36;
      return {main:<polygon className={cls} points={poly([[x,y+z],[a,y],[b,y+z],[x+w,y],[x+w,y+h-z],[b,y+h],[a,y+h-z],[x,y+h]])}/>,
        extra:<><path className="map-fold" d={'M'+a+' '+y+'V'+(y+h-z)+'M'+b+' '+(y+z)+'V'+(y+h)}/>
          <path className="map-route" d={'M'+(x+w*.12)+' '+(y+h*.78)+'C'+(x+w*.3)+' '+(y+h*.35)+' '+(x+w*.45)+' '+(y+h*.9)+' '+(x+w*.6)+' '+(y+h*.5)+'S'+(x+w*.78)+' '+(y+h*.2)+' '+px+' '+py}/>
          <path className="map-pin" d={'M'+px+' '+py+'c-3.6-4.2-5.4-7-5.4-9.4a5.4 5.4 0 0 1 10.8 0c0 2.4-1.8 5.2-5.4 9.4Z'}/><circle className="map-pin-dot" cx={px} cy={py-9.6} r="2"/>
          <circle className="map-start" cx={x+w*.12} cy={y+h*.78} r="3.5"/></>};
    }
    case 'chevron':{const k=Math.min(h*.38,w*.25);return {main:<polygon className={cls} points={poly([[x,y],[x+w-k,y],[x+w,y+h/2],[x+w-k,y+h],[x,y+h],[x+k,y+h/2]])}/>};}
    default:return {main:<rect className={cls} x={x} y={y} width={w} height={h} rx="10"/>};
  }
}

/**
 * Icono de las formas que le reservan un lugar: blanco sobre el encabezado de la tarjeta o el círculo de la píldora,
 * y centrado en el avatar y la insignia. Un avatar sin icono muestra la inicial del nombre.
 */
function ownIconParts(shape:Shape,n:DiagramNode,{x,y,w,h}:Box):ReactNode{
  const glyph=(cx:number,cy:number,side:number,className:string)=>n.icon?<path className={className} strokeDasharray="none" d={ICON_PATHS[n.icon]} transform={`translate(${cx-side/2} ${cy-side/2}) scale(${side/16})`}/>:null;
  switch(shape){
    case 'card':return glyph(x+18,y+15,16,'node-icon on-band');
    case 'pill':{if(!n.icon)return null;const d=Math.min(PILL_ICON,h-10),cx=x+h/2,cy=y+h/2;return <><circle className="node-band" cx={cx} cy={cy} r={d/2}/>{glyph(cx,cy,d*.56,'node-icon on-band')}</>;}
    case 'avatar':case 'badge':{
      const s=Math.min(w,h),cx=x+w/2,cy=y+h/2;
      return n.icon?glyph(cx,cy,s*.42,'node-icon centered'):shape==='avatar'?<text className="avatar-initial" x={cx} y={cy+s*.13} fontSize={s*.36} textAnchor="middle">{(n.label.trim()[0]??'?').toUpperCase()}</text>:null;
    }
  }
  return null;
}

const domainOf=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};
/**
 * Enlace del nodo: un botón ↗ que abre la página en otra pestaña, y el dominio a la vista (en la barra de la ventana
 * o en el borde inferior). El esquema ya garantiza http(s); igual se abre sin acceso a esta ventana.
 */
function LinkMark({url,shape,x,y,w,h,interactive}:{url:string;shape:Shape;x:number;y:number;w:number;h:number;interactive:boolean}){
  const open=(e:React.SyntheticEvent)=>{e.stopPropagation();e.preventDefault();window.open(url,'_blank','noopener,noreferrer');};
  const cx=x+w-12,cy=y+12,domain=domainOf(url),inBar=shape==='browser';
  return <>
    <text className="node-domain" x={inBar?x+50:x+w/2} y={inBar?y+15.5:y+h-7} textAnchor={inBar?'start':'middle'}>{domain.length>34?domain.slice(0,33)+'…':domain}</text>
    <g className="node-link" role={interactive?'link':undefined} tabIndex={interactive?0:undefined} aria-label={'Abrir '+domain} onPointerDown={e=>e.stopPropagation()} onClick={open} onKeyDown={e=>{if(e.key==='Enter')open(e);}}>
      <title>{url}</title><circle cx={cx} cy={cy} r="8"/><path d={'M'+(cx-2.5)+' '+(cy+2.5)+'L'+(cx+2.5)+' '+(cy-2.5)+'M'+(cx-1)+' '+(cy-2.5)+'H'+(cx+2.5)+'V'+(cy+1)}/>
    </g>
  </>;
}

/** Polilínea con esquinas redondeadas. */
export function edgePath(points:Point[],radius=8):string{
  let d=`M${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],inLen=Math.hypot(b.x-a.x,b.y-a.y),outLen=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(radius,inLen/2,outLen/2);
    if(r<1){d+=`L${b.x} ${b.y}`;continue;}
    d+=`L${b.x-(b.x-a.x)/inLen*r} ${b.y-(b.y-a.y)/inLen*r}Q${b.x} ${b.y} ${b.x+(c.x-b.x)/outLen*r} ${b.y+(c.y-b.y)/outLen*r}`;
  }
  const last=points[points.length-1];
  return d+`L${last.x} ${last.y}`;
}
const DASH={solid:undefined,dashed:'7 5',dotted:'2 4'} as const;
/** Punta de flecha en `tip`, orientada según viene la línea desde `from`. */
function arrowHead(type:DiagramEdge['endArrow'],tip:Point,from:Point,size:number):ReactNode{
  if(type==='none')return null;
  const length=Math.hypot(tip.x-from.x,tip.y-from.y)||1,ux=(tip.x-from.x)/length,uy=(tip.y-from.y)/length,px=-uy,py=ux;
  const at=(back:number,side:number)=>`${tip.x-ux*back+px*side} ${tip.y-uy*back+py*side}`;
  switch(type){
    case 'arrow':return <path className="arrow-fill" d={`M${at(0,0)}L${at(size,size*.45)}L${at(size,-size*.45)}Z`}/>;
    case 'open':return <path className="arrow-line" d={`M${at(size,size*.5)}L${at(0,0)}L${at(size,-size*.5)}`}/>;
    case 'triangle':return <path className="arrow-hollow" d={`M${at(0,0)}L${at(size*1.2,size*.6)}L${at(size*1.2,-size*.6)}Z`}/>;
    case 'diamond':case 'diamond-filled':return <path className={type==='diamond'?'arrow-hollow':'arrow-fill'} d={`M${at(0,0)}L${at(size*.8,size*.42)}L${at(size*1.6,0)}L${at(size*.8,-size*.42)}Z`}/>;
    case 'circle':return <circle className="arrow-hollow" cx={tip.x-ux*size*.45} cy={tip.y-uy*size*.45} r={size*.45}/>;
  }
}

/** La edición y el dibujo comparten la caja del título; la forma queda visible mientras se escribe. */
export function nodeTitleLayout(n:DiagramNode,asset=false){
  const {x,y}=n.position,{width:w,height:h}=n.size,shape=shapeOf(n);
  const size=n.style.fontSize??15,lineHeight=Math.round(size*1.2),below=asset||LABEL_BELOW.has(shape),[fw]=usableFraction(shape);
  const extra=shape==='class'?detailLines(n.details):below?[]:detailBlock(n.details,w*fw-(shape==='pill'&&n.icon?PILL_ICON+10:0)-24);
  const lead=shape==='pill'&&n.icon?PILL_ICON+10:0,inset=SHAPE_INSET[shape]??{};
  const align=n.style.align??'center',pad=(shape==='class'?10:12)+lead,tx=align==='left'?x+pad:align==='right'?x+w-12:x+lead+(w-lead)/2,anchorAt=align==='left'?'start':align==='right'?'end':'middle';
  const ownIcon=OWN_ICON.has(shape),bigIcon=Boolean(n.icon)&&n.style.iconSize==='large'&&!asset&&!below&&shape!=='class'&&!ownIcon,iconShift=bigIcon?(ICON_LARGE+8)/2:0;
  const width=below?Math.max(w,140):Math.max(40,w*fw-lead-(n.icon&&!bigIcon&&!ownIcon?40:20)),lines=wrapLabel(n.label,width,size,shape==='class'?1:4);
  const blockHeight=lines.length*lineHeight+(n.subtitle?15:0)+(shape==='class'?0:extra.length*16);
  const top=below?y+h+size+3:shape==='class'?y+size+6:y+h/2-blockHeight/2+size*.82+iconShift+((inset.top??0)-(inset.bottom??0))/2+(shape==='cylinder'?Math.min(12,h/5)/2:shape==='triangle'?h*.16:0);
  const textStyle:CSSProperties={fontWeight:n.style.bold?700:undefined,fontStyle:n.style.italic?'italic':undefined};
  // Un título debajo de la figura se lee sobre el lienzo, no sobre el relleno: sin color elegido usa la tinta del tema.
  if(below&&!n.style.textColor)textStyle.fill='var(--d-ink,#141619)';
  return {size,lineHeight,below,extra,tx,anchorAt:anchorAt as 'start'|'end'|'middle',ownIcon,bigIcon,iconShift,lines,top,textStyle,color:n.style.textColor??(n.style.fill&&!below?readableOn(n.style.fill):undefined),box:{x:align==='left'?tx:align==='right'?tx-width:tx-width/2,y:top-size*.82,width,height:Math.max(lineHeight,lines.length*lineHeight)}};
}

export type LayerProps={
  doc:DiagramDocument;selected?:Set<string>;activeNodes?:Set<string>;activeEdges?:Set<string>;failed?:boolean;
  /** Progreso 0..1 del paso activo; null oculta las partículas. */
  progress?:number|null;interactive?:boolean;showFrames?:boolean;
  /** Estado que cada nodo muestra en este punto del recorrido. */
  states?:Map<string,{label:string;tone:'normal'|'failure'}>;
  /** Elementos que una propuesta en vista previa agrega o modifica. */
  staged?:Set<string>;
  /** Marcadores de anotaciones sin resolver. Son ayuda de edición: no se exportan ni se presentan. */
  showAnnotations?:boolean;
  /** Elemento cuyo texto se está editando en el lugar: se dibuja sin texto para no duplicarlo. */
  editing?:string|null;
};

/** Negro o blanco, el que mejor se lee sobre un color de relleno. */
function readableOn(fill:string){
  const [r,g,b]=[1,3,5].map(i=>parseInt(fill.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:((c+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b>.4?'#141619':'#ffffff';
}
// Los colores propios viajan como variables CSS: así los estados (activo, seleccionado) siguen pudiendo imponerse desde las clases.
// Con relleno propio y sin color de texto elegido, el texto toma el color que contrasta: se lee igual en modo claro y oscuro.
const vars=(style:{fill?:string;stroke?:string;textColor?:string;strokeWidth?:number}):CSSProperties=>({
  ...(style.fill?{'--fill':style.fill}:{}),...(style.stroke?{'--stroke':style.stroke}:{}),...(style.textColor?{'--ink':style.textColor,'--icon':style.textColor}:style.fill?{'--ink':readableOn(style.fill),'--icon':readableOn(style.fill)}:{}),...(style.strokeWidth!==undefined?{'--sw':String(style.strokeWidth)}:{})
} as CSSProperties);

/**
 * Dibujo puro del documento. No guarda estado ni genera IDs: el canvas, la presentación y el export
 * usan este mismo componente, así que lo exportado coincide con lo que se ve.
 */
export function DiagramLayer({doc,selected,activeNodes,activeEdges,failed=false,progress=null,interactive=false,showFrames=true,states,showAnnotations=false,staged,editing=null}:LayerProps){
  const has=(set:Set<string>|undefined,id:string)=>set?.has(id)??false;
  const routes=routeAll(doc),assets=new Map(doc.assets.map(a=>[a.id,a]));
  // Un marcador por elemento anotado, con la severidad más alta entre sus anotaciones abiertas.
  const marks=new Map<string,DiagramAnnotation[]>();
  if(showAnnotations)for(const note of doc.annotations)if(note.targetId&&!note.resolved)marks.set(note.targetId,[...(marks.get(note.targetId)??[]),note]);
  const anchor=(id:string):{at:Point;type:string}|null=>{
    const n=doc.nodes.find(x=>x.id===id);if(n)return {at:{x:n.position.x,y:n.position.y},type:'node'};
    const zone=doc.zones.find(x=>x.id===id);if(zone)return {at:{x:zone.bounds.x+zone.bounds.width,y:zone.bounds.y},type:'zone'};
    const frame=doc.frames.find(x=>x.id===id);if(frame)return {at:{x:frame.bounds.x+frame.bounds.width,y:frame.bounds.y},type:'frame'};
    const route=routes.get(id);return route?{at:pointOnPolyline(route.points,.3),type:'edge'}:null;
  };
  return <g className="diagram">
    {doc.drawings.map(d=>{
      const pts=d.points,path='M'+pts.map(p=>`${p.x} ${p.y}`).join('L'),first=pts[0],last=pts[pts.length-1],prev=pts[pts.length-2],angle=Math.atan2(last.y-prev.y,last.x-prev.x),size=10+(d.style.strokeWidth??2)*2;
      const head=d.kind==='arrow'?<path className="drawing-head" d={`M${last.x} ${last.y}L${last.x-size*Math.cos(angle-.45)} ${last.y-size*Math.sin(angle-.45)}L${last.x-size*Math.cos(angle+.45)} ${last.y-size*Math.sin(angle+.45)}Z`}/>:null;
      return <g key={d.id} data-id={d.id} data-type="drawing" style={vars(d.style)} className={'free-drawing'+(has(selected,d.id)?' selected':'')} {...(interactive?{role:'button',tabIndex:0,'aria-label':d.kind==='freehand'?'Dibujo a mano':d.kind==='arrow'?'Flecha dibujada':'Línea dibujada'}:{})}>
        <path className="free-drawing-path" d={path}/>{head}{interactive&&<path className="free-drawing-hit" d={path}/>}
      </g>;
    })}
    {doc.zones.map(z=><g key={z.id} data-id={z.id} data-type="zone" style={vars(z.style)} className={'zone-group'+(has(selected,z.id)?' selected':'')+(has(staged,z.id)?' staged':'')}>
      <rect className="zone" {...z.bounds} rx="12" strokeDasharray={z.style.dash?DASH[z.style.dash]??'none':undefined}/>
      {interactive&&<rect className="hit-border" {...z.bounds} rx="12"/>}
      {editing!==z.id&&<text className="zone-label" x={z.bounds.x+18} y={z.bounds.y+26}>{z.label}</text>}
    </g>)}
    {showFrames&&doc.frames.map(f=><g key={f.id} data-id={f.id} data-type="frame" className={'frame-group'+(has(selected,f.id)?' selected':'')+(has(staged,f.id)?' staged':'')}>
      <rect className="frame" {...f.bounds}/>
      {interactive&&<rect className="hit-border" {...f.bounds}/>}
      <text className="frame-label" x={f.bounds.x} y={f.bounds.y-8}>▣ {f.label}</text>
    </g>)}
    {doc.edges.map(e=>{
      const routed=routes.get(e.id);if(!routed||routed.points.length<2)return null;
      const {points}=routed,state=has(activeEdges,e.id)?' active':has(selected,e.id)?' selected':'',width=e.style.strokeWidth??2,head=6+width*2;
      const d=e.line==='orthogonal'?edgePath(points):'M'+points.map(p=>`${p.x} ${p.y}`).join('L'),dash=e.style.dash?DASH[e.style.dash]:e.alternative?DASH.dashed:undefined;
      return <g key={e.id} data-id={e.id} data-type="edge" style={vars(e.style)} className={`edge-group${state}${has(staged,e.id)?' staged':''}`}>
        <path className="edge" d={d} strokeDasharray={dash}/>
        {arrowHead(e.endArrow,points[points.length-1],points[points.length-2],head)}
        {arrowHead(e.startArrow,points[0],points[1],head)}
        {interactive&&<path className="hit-edge" d={d}/>}
        {e.label&&routed.label&&editing!==e.id&&(()=>{const label=edgeLabelLayout(e.label,e.style.fontSize??11);return <text className="edge-label" x={routed.label.x} y={routed.label.y-(label.lines.length-1)*label.lineHeight} fontSize={e.style.fontSize}><title>{e.label}</title>{label.lines.map((line,i)=><tspan key={i} x={routed.label!.x} dy={i?label.lineHeight:0}>{line}</tspan>)}</text>;})()}
      </g>;
    })}
    {doc.nodes.map(n=>{
      const {x,y}=n.position,{width:w,height:h}=n.size,active=has(activeNodes,n.id),shape=shapeOf(n),asset=n.assetId?assets.get(n.assetId):undefined,state=states?.get(n.id);
      const {size,lineHeight,below,extra,tx,anchorAt,ownIcon,bigIcon,iconShift,lines,top,textStyle}=nodeTitleLayout(n,Boolean(asset));
      const parts=shapeParts(shape,{x,y,w,h}),dash=n.style.dash?DASH[n.style.dash]:undefined,header=y+lineHeight+12;
      return <g key={n.id} data-id={n.id} data-type="node" style={vars(n.style)} strokeDasharray={dash}
        className={`graph-node kind-${n.kind} shape-${shape}${has(selected,n.id)?' selected':''}${has(staged,n.id)?' staged':''}${active?' active':''}${active&&failed?' failed':''}`}
        {...(interactive?{role:'button',tabIndex:0,'aria-label':`${n.label}, ${n.kind}${n.zoneId?', en zona '+(doc.zones.find(z=>z.id===n.zoneId)?.label??n.zoneId):''}`}:{})}>
        {asset?<><rect className="node-shape bare" x={x} y={y} width={w} height={h}/><image href={assetDataUrl(asset)} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet"/></>:<>{parts.main}{parts.extra}</>}
        {!asset&&!n.shape&&n.kind==='cache'&&<path className="node-accent" d={`M${x+5} ${y+12}V${y+h-12}`}/>}
        {!asset&&!n.shape&&n.kind==='queue'&&<path className="node-detail" d={[12,22,32].map(o=>`M${x+w-o} ${y+10}V${y+h-10}`).join('')}/>}
        {!asset&&ownIcon&&ownIconParts(shape,n,{x,y,w,h})}
        {n.icon&&!asset&&!ownIcon&&(bigIcon
          ?<path className="node-icon large" strokeDasharray="none" d={ICON_PATHS[n.icon]} transform={`translate(${x+w/2-ICON_LARGE/2} ${top-size*.82-iconShift*2}) scale(${ICON_LARGE/16})`}/>
          :<path className="node-icon" strokeDasharray="none" d={ICON_PATHS[n.icon]} transform={`translate(${x+8} ${y+8})`}/>)}
        {state&&<text className={'node-state'+(state.tone==='failure'?' failure':'')} x={x+w/2} y={y-8}>{state.tone==='failure'?'✕ ':'● '}{state.label}</text>}
        {editing!==n.id&&<text className="node-title" x={tx} y={top} fontSize={size} textAnchor={anchorAt} style={textStyle}>{lines.map((line,i)=><tspan key={i} x={tx} dy={i?lineHeight:0}>{line}</tspan>)}</text>}
        {n.subtitle&&!below&&shape!=='diamond'&&shape!=='class'&&<text className="node-subtitle" x={tx} y={top+(lines.length-1)*lineHeight+15} textAnchor={anchorAt}>{n.subtitle}</text>}
        {shape==='class'&&<>
          {(extra.length>0||n.subtitle)&&<path className="node-detail" d={`M${x} ${header}H${x+w}`}/>}
          {extra.map((line,i)=>line.trim()==='--'?<path key={i} className="node-detail" d={`M${x} ${header+i*16+10}H${x+w}`}/>:<text key={i} className="node-details mono" x={x+10} y={header+i*16+16}>{line}</text>)}
        </>}
        {shape!=='class'&&!below&&extra.map((line,i)=><text key={i} className="node-details" x={tx} y={top+(lines.length-1)*lineHeight+(n.subtitle?15:0)+18+i*16} textAnchor={anchorAt}>{line}</text>)}
        {active&&failed&&<text className="node-flag" x={x+w-10} y={y+16}>✕</text>}
        {n.link&&!asset&&<LinkMark url={n.link} shape={shape} x={x} y={y} w={w} h={h} interactive={interactive}/>}
      </g>;
    })}
    {[...marks].map(([id,notes])=>{
      const place=anchor(id);if(!place)return null;
      const severity=notes.reduce<DiagramAnnotation['severity']>((top,note)=>SEVERITY_RANK[note.severity]>SEVERITY_RANK[top]?note.severity:top,'info');
      return <g key={id} data-id={id} data-type={place.type} className={`annotation-mark ${severity}`}><title>{notes.map(note=>note.text).join('\n')}</title><circle cx={place.at.x} cy={place.at.y} r="10"/><text x={place.at.x} y={place.at.y+4}>{SEVERITY_GLYPH[severity]}{notes.length>1?notes.length:''}</text></g>;
    })}
    {progress!==null&&[...(activeEdges??[])].map(id=>{const routed=routes.get(id);if(!routed)return null;const p=pointOnPolyline(routed.points,progress);return <circle key={id} className="particle" cx={p.x} cy={p.y} r="6"/>;})}
  </g>;
}

/**
 * CSS del dibujo. Se inyecta también en los exports para que el archivo sea autónomo. Los colores base son variables con
 * su valor claro por defecto: el editor las redefine en modo oscuro, y un export (que no las define) sale siempre claro.
 */
export const DIAGRAM_CSS=`
.diagram{font-family:Manrope,Arial,sans-serif;fill:var(--d-ink,#141619)}
.zone{fill:var(--fill,var(--d-zone,#f4f6f8));stroke:var(--stroke,var(--d-zone-line,#a0abba));stroke-dasharray:6 6}
.zone-label{font:12px Plex,'IBM Plex Mono',monospace;fill:var(--ink,var(--d-muted,#606975))}
.frame{fill:none;stroke:var(--d-ink,#141619);stroke-width:1;stroke-opacity:.45}
.frame-label{font:11px Plex,'IBM Plex Mono',monospace;fill:var(--d-muted,#606975)}
.edge{fill:none;stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,2);stroke-linejoin:round}
.free-drawing-path{fill:none;stroke:var(--stroke,var(--d-ink,#141619));stroke-width:var(--sw,2);stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.free-drawing-hit{fill:none;stroke:transparent;stroke-width:14;pointer-events:stroke;cursor:pointer}
.drawing-head{fill:var(--stroke,var(--d-ink,#141619));pointer-events:none}
.arrow-fill{fill:var(--stroke,var(--d-line,#7b8799));stroke:none}
.arrow-line{fill:none;stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,2)}
.arrow-hollow{fill:var(--d-node,#fff);stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,2)}
.active .edge{stroke:#245cf6;stroke-width:3}
.active .arrow-fill{fill:#245cf6}.active .arrow-line,.active .arrow-hollow{stroke:#245cf6}
.edge-label{font:11px Plex,'IBM Plex Mono',monospace;fill:var(--ink,var(--d-muted,#606975));text-anchor:middle;paint-order:stroke;stroke:var(--d-halo,#fff);stroke-width:5}
.node-shape{fill:var(--fill,var(--d-node,#fff));stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,1.5)}
.kind-external .node-shape{stroke-dasharray:5 4}
.node-shape.note{fill:var(--fill,var(--d-note,#f7fbdc))}
.node-shape.bare{fill:transparent;stroke:none}
.node-shape.solid{fill:var(--fill,var(--d-ink,#141619))}
.node-detail{fill:none;stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:var(--sw,1.5)}
.node-accent{fill:none;stroke:#245cf6;stroke-width:4;stroke-linecap:round}
.node-title{fill:var(--ink,var(--d-ink,#141619))}
.node-subtitle{font:10px Plex,'IBM Plex Mono',monospace;fill:var(--ink,var(--d-muted,#606975))}
.node-details{font-size:12px;fill:var(--ink,var(--d-ink,#141619))}
.node-details.mono{font-family:Plex,'IBM Plex Mono',monospace}
.active .node-shape{fill:#d4f246;stroke:#141619}
.active .node-shape.bare{fill:transparent;stroke:none}
.active .node-title,.active .node-subtitle,.active .node-details{fill:#141619}
.failed .node-shape{fill:#f6c8bc;stroke-dasharray:4 3}
.node-flag{font-size:13px;font-weight:700;text-anchor:middle;fill:#141619}
.node-icon{fill:none;stroke:var(--icon,#245cf6);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.node-icon.large{stroke-width:1.15}
.node-icon.on-band{stroke:#fff}
.node-icon.centered{stroke-width:1.2}
.node-band{fill:var(--stroke,#245cf6);stroke:none}
.node-ring{fill:none;stroke:var(--stroke,var(--d-line,#7b8799));stroke-width:2}
.node-ring.inner{stroke-width:1.2;stroke-dasharray:3 3;opacity:.7}
.avatar-initial{font-weight:750;fill:var(--ink,var(--d-ink,#141619))}
.sticky-tape{fill:rgba(255,255,255,.6);stroke:rgba(20,22,25,.1);stroke-width:1}
.sticky-curl{fill:rgba(20,22,25,.07);stroke:none}
.map-fold{fill:none;stroke:var(--stroke,#7b8799);stroke-width:1;opacity:.35}
.map-route{fill:none;stroke:var(--stroke,#245cf6);stroke-width:2.2;stroke-dasharray:5 4;stroke-linecap:round}
.map-pin{fill:#e5484d;stroke:#fff;stroke-width:1.2}.map-pin-dot{fill:#fff}.map-start{fill:var(--stroke,#245cf6)}
.node-link{cursor:pointer}.node-link circle{fill:#fff;stroke:var(--stroke,#245cf6);stroke-width:1.3}.node-link path{fill:none;stroke:var(--stroke,#245cf6);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.node-domain{font:10px Plex,monospace;fill:var(--ink,var(--d-muted,#606975));opacity:.7}
.browser-dot.d0{fill:#ff6b5f}.browser-dot.d1{fill:#ffbd2e}.browser-dot.d2{fill:#29c840}
/* Relieve suave en las piezas con aspecto de papel o tarjeta. */
.graph-node:is(.shape-sticky,.shape-card,.shape-bubble,.shape-browser,.shape-pill,.shape-folder)>.node-shape{filter:drop-shadow(0 3px 5px rgba(20,22,25,.13))}
.graph-node.shape-sticky>.node-shape{filter:drop-shadow(0 6px 8px rgba(20,22,25,.16))}
.node-state{font:10px Plex,'IBM Plex Mono',monospace;fill:#245cf6;text-anchor:middle;paint-order:stroke;stroke:var(--d-halo,#fff);stroke-width:4;letter-spacing:.04em}
.node-state.failure{fill:#b42318}
.particle{fill:#245cf6;stroke:#fff;stroke-width:2}
`;
