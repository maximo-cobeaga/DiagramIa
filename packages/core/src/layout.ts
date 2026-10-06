import type {DiagramNode,DiagramZone} from './schema.js';
import {fail} from './errors.js';
import {inflate,nodeRect,nodeVisualRect,overlaps,segmentsCross,unionRects,type Point,type Rect} from './geometry.js';
import {edgeLabelLayout,textWidth} from './text.js';

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
  untangleLayers(layers,forward,layer);
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

/**
 * Reordena cada capa con barridos de baricentro (hacia adelante y hacia atrás) y se queda con el orden que menos cruces
 * deja entre capas vecinas. Los barridos sólo aceptan mejoras estrictas: si el primer orden ya era el mejor, no cambia nada.
 */
function untangleLayers(layers:LayoutItem[][],forward:Map<string,string[]>,layer:Map<string,number>){
  if(layers.length<2)return;
  const back=new Map<string,string[]>();
  for(const [from,targets] of forward)for(const to of targets)if(layer.get(to)===layer.get(from)!+1)(back.get(to)??back.set(to,[]).get(to)!).push(from);
  const index=new Map<string,number>();
  const reindex=()=>layers.forEach(members=>members.forEach((n,i)=>index.set(n.id,i)));
  const crossings=()=>{
    let total=0;
    for(const members of layers.slice(0,-1)){
      const pairs:[number,number][]=[];
      for(const n of members)for(const to of forward.get(n.id)!)if(layer.get(to)===layer.get(n.id)!+1)pairs.push([index.get(n.id)!,index.get(to)!]);
      for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++)if((pairs[i][0]-pairs[j][0])*(pairs[i][1]-pairs[j][1])<0)total++;
    }
    return total;
  };
  const sortBy=(members:LayoutItem[],neighbors:(id:string)=>string[])=>{
    const key=new Map(members.map(n=>{const near=neighbors(n.id);return [n.id,near.length?near.reduce((sum,id)=>sum+index.get(id)!,0)/near.length:index.get(n.id)!];}));
    members.sort((a,b)=>key.get(a.id)!-key.get(b.id)!||index.get(a.id)!-index.get(b.id)!);
    members.forEach((n,i)=>index.set(n.id,i));
  };
  reindex();
  let best=crossings(),bestOrder=layers.map(m=>[...m]);
  for(let sweep=0;sweep<8&&best>0;sweep++){
    if(sweep%2===0)for(let i=1;i<layers.length;i++)sortBy(layers[i],id=>back.get(id)??[]);
    else for(let i=layers.length-2;i>=0;i--)sortBy(layers[i],id=>(forward.get(id)??[]).filter(to=>layer.get(to)===i+1));
    const now=crossings();
    if(now<best){best=now;bestOrder=layers.map(m=>[...m]);}
  }
  bestOrder.forEach((members,i)=>{layers[i]=members;});
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
/** Una conexión entre dos bloques, con el centro de cada extremo relativo a la esquina de su bloque. */
type BlockLink={from:string;to:string;fromNode:string;toNode:string;a:Point;b:Point};
type Members=Map<string,{id:string;rect:Rect}[]>;
/** Si el segmento pasa por dentro del rectángulo (recorte de Liang–Barsky); tocar el borde no cuenta. */
function segmentCrosses(a:Point,b:Point,r:Rect):boolean{
  let t0=0,t1=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.width-a.x],[-dy,a.y-r.y],[dy,r.y+r.height-a.y]] as const){
    if(p===0){if(q<=0)return false;continue;}
    const t=q/p;
    if(p<0){if(t>t1)return false;t0=Math.max(t0,t);}else{if(t<t0)return false;t1=Math.min(t1,t);}
  }
  return t1-t0>1e-6;
}
/**
 * Costo de una disposición de bloques, en píxeles equivalentes: largo de las conexiones entre bloques, más un recargo por
 * cada cruce entre ellas, por cada bloque ajeno o nodo que atraviesan, y por lo que crece y se estira el conjunto.
 * Mide con rectas entre centros: es una aproximación de las rutas reales, suficiente para comparar disposiciones.
 */
function arrangementCost(blocks:LayoutItem[],placed:Map<string,Point>,links:BlockLink[],members:Members):number{
  const here=blocks.filter(b=>placed.has(b.id));if(!here.length)return 0;
  const rect=(b:LayoutItem):Rect=>({...placed.get(b.id)!,...b.size});
  const segments=links.filter(l=>placed.has(l.from)&&placed.has(l.to)).map(l=>{const p=placed.get(l.from)!,q=placed.get(l.to)!;return {l,a:{x:p.x+l.a.x,y:p.y+l.a.y},b:{x:q.x+l.b.x,y:q.y+l.b.y}};});
  let cost=0;
  for(const {l,a,b} of segments){
    cost+=Math.hypot(b.x-a.x,b.y-a.y);
    for(const block of here){
      if(block.id!==l.from&&block.id!==l.to){if(segmentCrosses(a,b,inflate(rect(block),-4)))cost+=900;continue;}
      const origin=placed.get(block.id)!;
      for(const m of members.get(block.id)??[])if(m.id!==l.fromNode&&m.id!==l.toNode&&segmentCrosses(a,b,{...m.rect,x:origin.x+m.rect.x,y:origin.y+m.rect.y}))cost+=350;
    }
  }
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const p=segments[i],q=segments[j];
    if(p.l.fromNode===q.l.fromNode||p.l.fromNode===q.l.toNode||p.l.toNode===q.l.fromNode||p.l.toNode===q.l.toNode)continue;
    if(segmentsCross(p.a,p.b,q.a,q.b))cost+=500;
  }
  const box=unionRects(here.map(rect))!;
  return cost+(box.width+box.height)*.35+Math.max(0,box.width-box.height*2.4)*.5+Math.max(0,box.height-box.width*1.6)*.5;
}
/**
 * Disposición alrededor de la zona más conectada: cada bloque se pega al costado de uno ya ubicado (arriba, abajo, a la
 * izquierda o a la derecha), alineado con los nodos a los que se conecta, en el lugar libre de menor costo. Los bloques
 * sin conexiones van en un estante debajo. Determinista: los empates se resuelven por el orden de los bloques.
 */
function attachLayout(blocks:LayoutItem[],links:BlockLink[],members:Members,gap:number):Map<string,Point>{
  const weight=new Map(blocks.map(b=>[b.id,links.filter(l=>l.from===b.id||l.to===b.id).length]));
  const order=new Map(blocks.map((b,i)=>[b.id,i])),area=(b:LayoutItem)=>b.size.width*b.size.height;
  const connected=blocks.filter(b=>weight.get(b.id)!>0),loose=blocks.filter(b=>!weight.get(b.id));
  const start=[...connected].sort((p,q)=>weight.get(q.id)!-weight.get(p.id)!||area(q)-area(p)||order.get(p.id)!-order.get(q.id)!)[0]!;
  const placed=new Map<string,Point>([[start.id,{x:0,y:0}]]),byId=new Map(blocks.map(b=>[b.id,b]));
  const rectOf=(id:string):Rect=>({...placed.get(id)!,...byId.get(id)!.size});
  while(placed.size<connected.length){
    const toPlaced=(b:LayoutItem)=>links.filter(l=>l.from===b.id&&placed.has(l.to)||l.to===b.id&&placed.has(l.from)).length;
    const next=connected.filter(b=>!placed.has(b.id)).sort((p,q)=>toPlaced(q)-toPlaced(p)||weight.get(q.id)!-weight.get(p.id)!||order.get(p.id)!-order.get(q.id)!)[0]!;
    const {width:w,height:h}=next.size,box=unionRects([...placed.keys()].map(rectOf))!;
    // Hacia dónde tira el bloque: el promedio de los extremos ya ubicados y el de sus propios extremos.
    const ends=links.flatMap(l=>l.from===next.id&&placed.has(l.to)?[{own:l.a,other:{x:placed.get(l.to)!.x+l.b.x,y:placed.get(l.to)!.y+l.b.y}}]:l.to===next.id&&placed.has(l.from)?[{own:l.b,other:{x:placed.get(l.from)!.x+l.a.x,y:placed.get(l.from)!.y+l.a.y}}]:[]);
    const mean=(points:Point[],fallback:Point)=>points.length?{x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length}:fallback;
    const target=mean(ends.map(e=>e.other),{x:box.x+box.width/2,y:box.y+box.height/2}),anchor=mean(ends.map(e=>e.own),{x:w/2,y:h/2});
    const candidates:Point[]=[];
    for(const r of [...[...placed.keys()].map(rectOf),box]){
      const xs=[r.x,r.x+(r.width-w)/2,r.x+r.width-w,target.x-anchor.x],ys=[r.y,r.y+(r.height-h)/2,r.y+r.height-h,target.y-anchor.y];
      for(const x of xs)candidates.push({x,y:r.y-gap-h},{x,y:r.y+r.height+gap});
      for(const y of ys)candidates.push({x:r.x-gap-w,y},{x:r.x+r.width+gap,y});
    }
    let best:Point|null=null,bestCost=Infinity;
    for(const c of candidates.map(round)){
      const rect={...c,width:w,height:h};
      if([...placed.keys()].some(id=>overlaps(rect,inflate(rectOf(id),gap-1))))continue;
      placed.set(next.id,c);
      const cost=arrangementCost(blocks,placed,links,members);
      placed.delete(next.id);
      if(cost<bestCost){best=c;bestCost=cost;}
    }
    // El costado del conjunto completo siempre está libre: nunca falta un candidato.
    placed.set(next.id,best??round({x:box.x+box.width+gap,y:box.y}));
  }
  if(loose.length){
    const box=unionRects([...placed.keys()].map(rectOf))!,shelf=shelfLayout(loose,gap);
    for(const b of loose){const p=shelf.get(b.id)!;placed.set(b.id,{x:box.x+p.x,y:box.y+box.height+gap+p.y});}
  }
  return placed;
}
/**
 * Layout de dos niveles que nunca superpone nada: cada zona se ordena por dentro y después se ordenan los bloques
 * (zonas completas y nodos libres) como si fueran nodos. Las zonas quedan separadas entre sí y contienen a sus nodos.
 */
export function arrangeBlocks(nodes:DiagramNode[],zones:DiagramZone[],edges:Link[],direction:'right'|'down',origin:Point,gap=72):{positions:Map<string,Point>;zoneBounds:Map<string,Rect>}{
  const offsets=new Map<string,Point>();
  nodes=nodes.map(n=>{const box=nodeVisualRect(n);offsets.set(n.id,{x:n.position.x-box.x,y:n.position.y-box.y});return {...n,position:{x:box.x,y:box.y},size:{width:box.width,height:box.height}};});
  // Las etiquetas viven sobre las conexiones: reservar su ancho entre capas evita que terminen encima de los nodos.
  const spacing=Math.max(gap,...edges.map(e=>{if(!e.label)return 0;const label=edgeLabelLayout(e.label,e.style?.fontSize??11);return (direction==='right'?label.width:label.height)+32;}));
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
    // Con conexiones entre zonas, probar también una disposición alrededor de la zona más conectada y quedarse con la que
    // tenga conexiones más cortas, menos cruces y menos zonas o nodos atravesados.
    const nodeOf=new Map(nodes.map(n=>[n.id,n])),members=new Map<string,{id:string;rect:Rect}[]>();
    for(const n of nodes){const inside=local.get(n.id)??{x:0,y:0};(members.get(owner.get(n.id)!)??members.set(owner.get(n.id)!,[]).get(owner.get(n.id)!)!).push({id:n.id,rect:{...inside,...n.size}});}
    const crossLinks:BlockLink[]=edges.filter(e=>owner.has(e.from)&&owner.has(e.to)&&owner.get(e.from)!==owner.get(e.to)).map(e=>{
      const at=(id:string):Point=>{const n=nodeOf.get(id)!,p=local.get(id)??{x:0,y:0};return {x:p.x+n.size.width/2,y:p.y+n.size.height/2};};
      return {from:owner.get(e.from)!,to:owner.get(e.to)!,fromNode:e.from,toNode:e.to,a:at(e.from),b:at(e.to)};
    });
    if(crossLinks.length<=120&&blocks.length<=16){
      const around=attachLayout(blocks,crossLinks,members,spacing);
      if(arrangementCost(blocks,around,crossLinks,members)<arrangementCost(blocks,placed,crossLinks,members)*.95)placed=around;
    }
  }
  const all=[...placed.values()];
  const shift=all.length?{x:origin.x-Math.min(...all.map(p=>p.x)),y:origin.y-Math.min(...all.map(p=>p.y))}:{x:0,y:0};
  const at=(id:string):Point=>{const p=placed.get(id)!;return {x:p.x+shift.x,y:p.y+shift.y};};
  const positions=new Map<string,Point>(),zoneBounds=new Map<string,Rect>();
  for(const block of blocks)if(zoneIds.has(block.id))zoneBounds.set(block.id,{...at(block.id),...block.size});
  for(const n of nodes){const inside=local.get(n.id);positions.set(n.id,inside?{x:at(owner.get(n.id)!).x+inside.x,y:at(owner.get(n.id)!).y+inside.y}:at(n.id));}
  for(const [id,p] of positions){const offset=offsets.get(id)!;positions.set(id,{x:p.x+offset.x,y:p.y+offset.y});}
  return {positions,zoneBounds};
}
