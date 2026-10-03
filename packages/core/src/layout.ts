import type {DiagramNode,DiagramZone} from './schema.js';
import {fail} from './errors.js';
import {nodeRect,unionRects,type Point,type Rect} from './geometry.js';
import {textWidth} from './text.js';

/** Lo mínimo que el layout necesita de un elemento: sirve para nodos y para bloques (una zona con sus nodos). */
export type LayoutItem={id:string;position:Point;size:{width:number;height:number}};
type Link={from:string;to:string;label?:string;style?:{fontSize?:number}};

type AlignMode='left'|'center'|'right'|'top'|'middle'|'bottom';
const round=(p:Point):Point=>({x:Math.round(p.x),y:Math.round(p.y)});

export function alignNodes(nodes:DiagramNode[],mode:AlignMode):Map<string,Point>{
  if(nodes.length<2)fail('LAYOUT_NEEDS_MORE','Alinear necesita al menos dos nodos.');
  const box=unionRects(nodes.map(nodeRect))!,out=new Map<string,Point>();
  for(const n of nodes){
    const {x,y}=n.position,{width:w,height:h}=n.size;
    out.set(n.id,round(mode==='left'?{x:box.x,y}:mode==='right'?{x:box.x+box.width-w,y}:mode==='center'?{x:box.x+(box.width-w)/2,y}:mode==='top'?{x,y:box.y}:mode==='bottom'?{x,y:box.y+box.height-h}:{x,y:box.y+(box.height-h)/2}));
  }
  return out;
}

export function distributeNodes(nodes:DiagramNode[],axis:'horizontal'|'vertical'):Map<string,Point>{
  if(nodes.length<3)fail('LAYOUT_NEEDS_MORE','Distribuir necesita al menos tres nodos.');
  const h=axis==='horizontal',start=(n:DiagramNode)=>h?n.position.x:n.position.y,extent=(n:DiagramNode)=>h?n.size.width:n.size.height;
  const sorted=[...nodes].sort((a,b)=>start(a)-start(b)||a.id.localeCompare(b.id));
  const first=sorted[0],last=sorted[sorted.length-1];
  const gap=(start(last)+extent(last)-start(first)-sorted.reduce((sum,n)=>sum+extent(n),0))/(sorted.length-1);
  const out=new Map<string,Point>();let cursor=start(first);
  for(const n of sorted){out.set(n.id,round(h?{x:cursor,y:n.position.y}:{x:n.position.x,y:cursor}));cursor+=extent(n)+gap;}
  return out;
}

/**
 * Auto-layout por capas, determinista: mismo input, mismo resultado. Sólo posiciona los nodos recibidos,
 * anclados a la esquina superior izquierda que ya ocupaban; los ciclos se resuelven ignorando la arista de retorno.
 */
export function layeredLayout(nodes:LayoutItem[],edges:Link[],direction:'right'|'down',gap:number):Map<string,Point>{
  const right=direction==='right';
  const main=(n:LayoutItem)=>right?n.position.x:n.position.y,cross=(n:LayoutItem)=>right?n.position.y:n.position.x;
  const mainSize=(n:LayoutItem)=>right?n.size.width:n.size.height,crossSize=(n:LayoutItem)=>right?n.size.height:n.size.width;
  const ordered=[...nodes].sort((a,b)=>main(a)-main(b)||cross(a)-cross(b)||a.id.localeCompare(b.id));
  const ids=new Set(ordered.map(n=>n.id)),next=new Map<string,string[]>(ordered.map(n=>[n.id,[]]));
  for(const e of edges)if(e.from!==e.to&&ids.has(e.from)&&ids.has(e.to)&&!next.get(e.from)!.includes(e.to))next.get(e.from)!.push(e.to);
  // DFS iterativo: las aristas hacia un nodo todavía abierto cierran un ciclo y se descartan.
  const state=new Map<string,1|2>(),forward=new Map<string,string[]>(ordered.map(n=>[n.id,[]])),finished:string[]=[];
  for(const root of ordered){
    if(state.has(root.id))continue;
    const stack:{id:string;i:number}[]=[{id:root.id,i:0}];state.set(root.id,1);
    while(stack.length){
      const top=stack[stack.length-1],targets=next.get(top.id)!;
      if(top.i>=targets.length){state.set(top.id,2);finished.push(top.id);stack.pop();continue;}
      const target=targets[top.i++];
      if(state.get(target)===1)continue;
      forward.get(top.id)!.push(target);
      if(!state.has(target)){state.set(target,1);stack.push({id:target,i:0});}
    }
  }
  const layer=new Map<string,number>(ordered.map(n=>[n.id,0])),preds=new Map<string,string[]>(ordered.map(n=>[n.id,[]]));
  for(const id of finished.reverse())for(const target of forward.get(id)!){layer.set(target,Math.max(layer.get(target)!,layer.get(id)!+1));preds.get(target)!.push(id);}
  const layers:LayoutItem[][]=[];
  for(const n of ordered)(layers[layer.get(n.id)!]??=[]).push(n);
  const rank=new Map<string,number>();
  for(const members of layers){
    const key=(n:LayoutItem)=>{const p=preds.get(n.id)!.filter(id=>rank.has(id));return p.length?p.reduce((sum,id)=>sum+rank.get(id)!,0)/p.length:Infinity;};
    const keys=new Map(members.map(n=>[n.id,key(n)]));
    members.sort((a,b)=>{const ka=keys.get(a.id)!,kb=keys.get(b.id)!;return (ka===kb?0:ka-kb)||cross(a)-cross(b)||a.id.localeCompare(b.id);});
    members.forEach((n,i)=>rank.set(n.id,i));
  }
  const origin=unionRects(nodes.map(nodeRect))??{x:0,y:0,width:0,height:0};
  const extents=layers.map(members=>members.reduce((sum,n)=>sum+crossSize(n),0)+gap*(members.length-1)),tallest=Math.max(0,...extents);
  const out=new Map<string,Point>();let offset=right?origin.x:origin.y;
  layers.forEach((members,i)=>{
    let cursor=(right?origin.y:origin.x)+(tallest-extents[i])/2;const thickness=Math.max(...members.map(mainSize));
    for(const n of members){
      const m=offset+(thickness-mainSize(n))/2;
      out.set(n.id,round(right?{x:m,y:cursor}:{x:cursor,y:m}));cursor+=crossSize(n)+gap;
    }
    offset+=thickness+gap;
  });
  return out;
}

const ZONE_PAD={x:32,top:56,bottom:32};
/** Grilla en orden de lectura con celdas del tamaño del elemento más grande: listas y calendarios, no columnas infinitas. */
function gridLayout(items:LayoutItem[],columns:number,gap:number):Map<string,Point>{
  const cellW=Math.max(...items.map(n=>n.size.width)),cellH=Math.max(...items.map(n=>n.size.height)),out=new Map<string,Point>();
  items.forEach((n,i)=>{const col=i%columns,row=Math.floor(i/columns);out.set(n.id,round({x:col*(cellW+gap)+(cellW-n.size.width)/2,y:row*(cellH+gap)+(cellH-n.size.height)/2}));});
  return out;
}
/** Columnas para una lista suelta: una fila si son pocos, después una grilla cerca de cuadrada. */
const columnsFor=(count:number)=>count<=3?count:count===4?2:count<=9?3:4;
/** Si los nodos forman una sola fila encadenada (A→B→C…), devuelve ese orden. */
function singleChain(items:LayoutItem[],edges:Link[]):LayoutItem[]|null{
  const ids=new Set(items.map(n=>n.id)),inner=edges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&e.from!==e.to);
  if(inner.length!==items.length-1)return null;
  const next=new Map<string,string>(),hasIn=new Set<string>();
  for(const e of inner){if(next.has(e.from)||hasIn.has(e.to))return null;next.set(e.from,e.to);hasIn.add(e.to);}
  const start=items.find(n=>!hasIn.has(n.id));if(!start)return null;
  const order:LayoutItem[]=[];let at:string|undefined=start.id;
  while(at&&order.length<=items.length){order.push(items.find(n=>n.id===at)!);at=next.get(at);}
  return order.length===items.length?order:null;
}
/**
 * Layout de los miembros de un bloque. Una secuencia larga se parte en filas de hasta cinco (como un calendario),
 * una lista sin conexiones va en grilla y el resto usa capas.
 */
function innerLayout(items:LayoutItem[],edges:Link[],direction:'right'|'down',gap:number):Map<string,Point>{
  const ids=new Set(items.map(n=>n.id)),linked=edges.some(e=>ids.has(e.from)&&ids.has(e.to)&&e.from!==e.to);
  const chain=items.length>=6?singleChain(items,edges):null;
  if(chain)return gridLayout(chain,Math.min(5,Math.ceil(chain.length/2)),gap);
  if(!linked&&items.length>=4)return gridLayout(items,columnsFor(items.length),Math.min(gap,40));
  return layeredLayout(items,edges,direction,gap);
}
/** Bloques sin conexiones entre sí, en estantes de un ancho parecido al de una pantalla apaisada. */
function shelfLayout(blocks:LayoutItem[],gap:number):Map<string,Point>{
  const area=blocks.reduce((sum,b)=>sum+(b.size.width+gap)*(b.size.height+gap),0),widest=Math.max(...blocks.map(b=>b.size.width));
  const target=Math.max(widest,Math.sqrt(area*1.7)),out=new Map<string,Point>();
  let x=0,y=0,row=0;
  for(const b of blocks){
    if(x>0&&x+b.size.width>target){x=0;y+=row+gap;row=0;}
    out.set(b.id,round({x,y}));x+=b.size.width+gap;row=Math.max(row,b.size.height);
  }
  return out;
}
/**
 * Layout de dos niveles que nunca superpone nada: cada zona se ordena por dentro y después se ordenan los bloques
 * (zonas completas y nodos libres) como si fueran nodos. Las zonas quedan separadas entre sí y contienen a sus nodos.
 */
export function arrangeBlocks(nodes:DiagramNode[],zones:DiagramZone[],edges:Link[],direction:'right'|'down',origin:Point,gap=72):{positions:Map<string,Point>;zoneBounds:Map<string,Rect>}{
  // Las etiquetas viven sobre las conexiones: reservar su ancho entre capas evita que terminen encima de los nodos.
  const spacing=Math.max(gap,...edges.map(e=>e.label?textWidth(e.label,e.style?.fontSize??11,true)+32:0));
  const blocks:LayoutItem[]=[],owner=new Map<string,string>(),local=new Map<string,Point>();
  for(const zone of zones){
    const members=nodes.filter(n=>n.zoneId===zone.id);
    if(!members.length){blocks.push({id:zone.id,position:{x:zone.bounds.x,y:zone.bounds.y},size:{width:zone.bounds.width,height:zone.bounds.height}});continue;}
    const placed=innerLayout(members,edges,direction,spacing),box=unionRects(members.map(n=>nodeRect({position:placed.get(n.id)!,size:n.size})))!;
    for(const n of members){const p=placed.get(n.id)!;local.set(n.id,{x:p.x-box.x+ZONE_PAD.x,y:p.y-box.y+ZONE_PAD.top});owner.set(n.id,zone.id);}
    blocks.push({id:zone.id,position:{x:zone.bounds.x,y:zone.bounds.y},size:{width:Math.max(100,box.width+ZONE_PAD.x*2),height:Math.max(100,box.height+ZONE_PAD.top+ZONE_PAD.bottom)}});
  }
  const zoneIds=new Set(zones.map(z=>z.id));
  for(const n of nodes)if(!n.zoneId||!zoneIds.has(n.zoneId)){blocks.push({id:n.id,position:n.position,size:n.size});owner.set(n.id,n.id);}
  const links=edges.filter(e=>owner.has(e.from)&&owner.has(e.to)).map(e=>({from:owner.get(e.from)!,to:owner.get(e.to)!})).filter(e=>e.from!==e.to);
  // Zonas que no se conectan entre sí no tienen un orden que respetar: se acomodan en estantes, no en una sola columna.
  let placed=!links.length&&blocks.length>=3?shelfLayout(blocks,spacing):layeredLayout(blocks,links,direction,spacing);
  // Una cadena larga de zonas conectadas queda como una tira que no entra en pantalla: se acomoda en estantes,
  // respetando el orden de lectura de las capas (izquierda a derecha, arriba a abajo).
  if(links.length&&blocks.length>=3){
    const box=unionRects(blocks.map(b=>nodeRect({position:placed.get(b.id)!,size:b.size})))!;
    if(box.width>box.height*2.4){const order=[...blocks].sort((a,b)=>placed.get(a.id)!.x-placed.get(b.id)!.x||placed.get(a.id)!.y-placed.get(b.id)!.y);placed=shelfLayout(order,spacing);}
  }
  const all=[...placed.values()];
  const shift=all.length?{x:origin.x-Math.min(...all.map(p=>p.x)),y:origin.y-Math.min(...all.map(p=>p.y))}:{x:0,y:0};
  const at=(id:string):Point=>{const p=placed.get(id)!;return {x:p.x+shift.x,y:p.y+shift.y};};
  const positions=new Map<string,Point>(),zoneBounds=new Map<string,Rect>();
  for(const block of blocks)if(zoneIds.has(block.id))zoneBounds.set(block.id,{...at(block.id),...block.size});
  for(const n of nodes){const inside=local.get(n.id);positions.set(n.id,inside?{x:at(owner.get(n.id)!).x+inside.x,y:at(owner.get(n.id)!).y+inside.y}:at(n.id));}
  return {positions,zoneBounds};
}
