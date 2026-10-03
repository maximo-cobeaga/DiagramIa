import type {DiagramDocument,DiagramEdge,DiagramNode,Port} from './schema.js';
import {find} from './errors.js';
import {shapeOf,textWidth} from './text.js';

export type Point={x:number;y:number};
export type Rect={x:number;y:number;width:number;height:number};
export type Side=Exclude<Port,'auto'>;
export type Routed={points:Point[];label:Point|null};

export const nodeRect=(n:Pick<DiagramNode,'position'|'size'>):Rect=>({x:n.position.x,y:n.position.y,width:n.size.width,height:n.size.height});
export const contains=(outer:Rect,inner:Rect)=>inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;
export const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
export const inflate=(r:Rect,by:number):Rect=>({x:r.x-by,y:r.y-by,width:r.width+by*2,height:r.height+by*2});
export function unionRects(rects:Rect[]):Rect|null{
  if(!rects.length)return null;
  const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y));
  return {x,y,width:Math.max(...rects.map(r=>r.x+r.width))-x,height:Math.max(...rects.map(r=>r.y+r.height))-y};
}

const DIR:Record<Side,Point>={top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}};
const STUB=16,CLEARANCE=16,LANE=14;
// Formas cuyo contorno no coincide con su caja: las conexiones llegan al centro de cada lado, que sí toca el contorno.
const ROUND_SHAPES=new Set(['diamond','ellipse','circle','triangle','hexagon','star','cloud','start','end','actor']);
function autoSides(a:Rect,b:Rect):[Side,Side]{
  if(b.x>=a.x+a.width)return ['right','left'];
  if(b.x+b.width<=a.x)return ['left','right'];
  if(b.y>=a.y+a.height)return ['bottom','top'];
  if(b.y+b.height<=a.y)return ['top','bottom'];
  return ['right','left'];
}
const sidePoint=(r:Rect,side:Side,t=.5):Point=>side==='top'?{x:r.x+r.width*t,y:r.y}:side==='bottom'?{x:r.x+r.width*t,y:r.y+r.height}:side==='left'?{x:r.x,y:r.y+r.height*t}:{x:r.x+r.width,y:r.y+r.height*t};
/** Lado y posición (0..1 a lo largo del lado) más cercanos a un punto relativo de la caja. */
export function anchorSide(anchor:Point):{side:Side;t:number}{
  const d={left:anchor.x,right:1-anchor.x,top:anchor.y,bottom:1-anchor.y},side=(Object.keys(d) as Side[]).reduce((best,s)=>d[s]<d[best]?s:best,'left' as Side);
  return {side,t:Math.max(.04,Math.min(.96,side==='left'||side==='right'?anchor.y:anchor.x))};
}
/** Punto de enganche relativo (0..1) más cercano al borde para una posición absoluta sobre el nodo. */
export function anchorAt(rect:Rect,point:Point):Point{
  const x=Math.max(0,Math.min(1,(point.x-rect.x)/rect.width)),y=Math.max(0,Math.min(1,(point.y-rect.y)/rect.height)),{side,t}=anchorSide({x,y});
  return side==='left'?{x:0,y:t}:side==='right'?{x:1,y:t}:side==='top'?{x:t,y:0}:{x:t,y:1};
}
const inset=(r:Rect,by:number):Rect=>({x:r.x+by,y:r.y+by,width:r.width-by*2,height:r.height-by*2});
const segmentHits=(a:Point,b:Point,r:Rect)=>Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height;
function simplify(points:Point[]):Point[]{
  const out:Point[]=[];
  for(const p of points){
    const last=out[out.length-1],prev=out[out.length-2];
    if(last&&last.x===p.x&&last.y===p.y)continue;
    if(prev&&((prev.x===last.x&&last.x===p.x)||(prev.y===last.y&&last.y===p.y)))out[out.length-1]=p;else out.push(p);
  }
  return out;
}
const pathLength=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y),0);
type Segment={a:Point;b:Point};
// Largo en que dos tramos paralelos van encimados (misma recta, con tolerancia).
function sharedLength(p:Segment,q:Segment){
  const vertical=p.a.x===p.b.x,other=q.a.x===q.b.x;
  if(vertical!==other||(!vertical&&p.a.y!==p.b.y)||(!other&&q.a.y!==q.b.y))return 0;
  if(Math.abs(vertical?p.a.x-q.a.x:p.a.y-q.a.y)>5)return 0;
  const [p1,p2]=vertical?[p.a.y,p.b.y]:[p.a.x,p.b.x],[q1,q2]=vertical?[q.a.y,q.b.y]:[q.a.x,q.b.x];
  return Math.max(0,Math.min(Math.max(p1,p2),Math.max(q1,q2))-Math.max(Math.min(p1,p2),Math.min(q1,q2)));
}
// Punto donde el segmento del centro de la caja hacia `toward` cruza su borde.
function borderToward(r:Rect,toward:Point):Point{
  const cx=r.x+r.width/2,cy=r.y+r.height/2,dx=toward.x-cx,dy=toward.y-cy;
  if(!dx&&!dy)return {x:cx,y:cy};
  const scale=Math.min(dx?r.width/2/Math.abs(dx):Infinity,dy?r.height/2/Math.abs(dy):Infinity);
  return {x:cx+dx*scale,y:cy+dy*scale};
}
function bezier(S:Point,dirS:Point,E:Point,dirE:Point):Point[]{
  const reach=Math.max(40,Math.hypot(E.x-S.x,E.y-S.y)/2.5),c1={x:S.x+dirS.x*reach,y:S.y+dirS.y*reach},c2={x:E.x+dirE.x*reach,y:E.y+dirE.y*reach},out:Point[]=[];
  for(let i=0;i<=20;i++){const t=i/20,u=1-t;out.push({x:u*u*u*S.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*E.x,y:u*u*u*S.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*E.y});}
  return out;
}

type End={side:Side;point:Point};
/**
 * Índice espacial en grilla. `query` devuelve, en orden creciente, un superconjunto de los elementos cuyo rectángulo
 * toca la zona pedida (bordes incluidos); quien consulta aplica después su propio criterio exacto. Así el resultado es
 * idéntico al de recorrer todo, pero cada consulta mira sólo los vecinos.
 */
class Grid{
  private cells=new Map<number,number[]>();private stamp=new Uint32Array(64);private epoch=0;
  constructor(private readonly size=256){}
  private span(r:Rect){return [Math.floor(r.x/this.size),Math.floor((r.x+r.width)/this.size),Math.floor(r.y/this.size),Math.floor((r.y+r.height)/this.size)] as const;}
  // Clave numérica por celda: las coordenadas del documento están acotadas muy por debajo de 2^20 celdas por eje.
  private key(x:number,y:number){return (x+1_048_576)*2_097_152+(y+1_048_576);}
  add(index:number,r:Rect){
    if(index>=this.stamp.length){const grown=new Uint32Array(Math.max(index+1,this.stamp.length*2));grown.set(this.stamp);this.stamp=grown;}
    const [x0,x1,y0,y1]=this.span(r);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=this.key(x,y),cell=this.cells.get(key);if(cell)cell.push(index);else this.cells.set(key,[index]);}
  }
  query(r:Rect):number[]{
    const [x0,x1,y0,y1]=this.span(r),found:number[]=[],epoch=++this.epoch;
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
      const cell=this.cells.get(this.key(x,y));if(!cell)continue;
      for(const index of cell)if(this.stamp[index]!==epoch){this.stamp[index]=epoch;found.push(index);}
    }
    return found.length>1?found.sort((a,b)=>a-b):found;
  }
}
const segmentBox=(s:Segment):Rect=>({x:Math.min(s.a.x,s.b.x),y:Math.min(s.a.y,s.b.y),width:Math.abs(s.a.x-s.b.x),height:Math.abs(s.a.y-s.b.y)});
type Obstacles={grid:Grid;rects:Rect[]};
/** Tramos ya trazados, indexados para contar rápido los que irían encimados. */
class Lanes{
  readonly list:Segment[]=[];private grid=new Grid();
  add(segment:Segment){this.grid.add(this.list.length,segmentBox(segment));this.list.push(segment);}
  /** Superconjunto de los tramos que sharedLength puede contar: paralelos a 5 px o menos, por eso la consulta se infla 5 px. */
  near(segment:Segment){const box=segmentBox(segment);return this.grid.query({x:box.x-5,y:box.y-5,width:box.width+10,height:box.height+10}).map(i=>this.list[i]!);}
}
/**
 * Rutas de todas las conexiones, calculadas juntas y de forma determinista. Las conexiones que comparten un lado de un nodo
 * se reparten a lo largo de ese lado; cada ruta evita cruzar nodos y, si puede, no va encimada sobre otra ya trazada.
 * También ubica cada etiqueta donde no tape nodos ni otras etiquetas.
 */
// Los documentos son inmutables: el resultado se reutiliza mientras el objeto sea el mismo.
const routeCache=new WeakMap<DiagramDocument,Map<string,Routed>>();
export function routeAll(d:DiagramDocument):Map<string,Routed>{
  const cached=routeCache.get(d);if(cached)return cached;
  const routed=computeRoutes(d);routeCache.set(d,routed);return routed;
}
function computeRoutes(d:DiagramDocument):Map<string,Routed>{
  const rects=new Map(d.nodes.map(n=>[n.id,nodeRect(n)])),nodes=new Map(d.nodes.map(n=>[n.id,n])),out=new Map<string,Routed>();
  const obstacles:Obstacles={grid:new Grid(),rects:d.nodes.map(nodeRect)};obstacles.rects.forEach((r,i)=>obstacles.grid.add(i,r));
  const center=(r:Rect):Point=>({x:r.x+r.width/2,y:r.y+r.height/2});
  // 1. Lado de salida y llegada de cada conexión, y reparto a lo largo de cada lado.
  const ends=new Map<string,{from:End;to:End}>(),slots=new Map<string,{edge:DiagramEdge;end:'from'|'to';order:number}[]>();
  for(const e of d.edges){
    if(e.points||e.from===e.to)continue;
    const a=rects.get(e.from),b=rects.get(e.to);if(!a||!b)continue;
    const auto=autoSides(a,b),fa=e.fromAnchor&&anchorSide(e.fromAnchor),ta=e.toAnchor&&anchorSide(e.toAnchor);
    const sideA:Side=fa?fa.side:e.fromPort==='auto'?auto[0]:e.fromPort,sideB:Side=ta?ta.side:e.toPort==='auto'?auto[1]:e.toPort;
    ends.set(e.id,{from:{side:sideA,point:sidePoint(a,sideA,fa?.t)},to:{side:sideB,point:sidePoint(b,sideB,ta?.t)}});
    if(e.line!=='orthogonal')continue;
    const along=(side:Side,r:Rect)=>side==='top'||side==='bottom'?center(r).x:center(r).y;
    if(!fa&&!ROUND_SHAPES.has(shapeOf(nodes.get(e.from)!)))(slots.get(`${e.from}|${sideA}`)??slots.set(`${e.from}|${sideA}`,[]).get(`${e.from}|${sideA}`)!).push({edge:e,end:'from',order:along(sideA,b)});
    if(!ta&&!ROUND_SHAPES.has(shapeOf(nodes.get(e.to)!)))(slots.get(`${e.to}|${sideB}`)??slots.set(`${e.to}|${sideB}`,[]).get(`${e.to}|${sideB}`)!).push({edge:e,end:'to',order:along(sideB,a)});
  }
  for(const [key,list] of slots){
    if(list.length<2)continue;
    const [nodeId,side]=key.split('|') as [string,Side],r=rects.get(nodeId)!;
    list.sort((p,q)=>p.order-q.order||p.edge.id.localeCompare(q.edge.id));
    list.forEach((slot,i)=>{ends.get(slot.edge.id)![slot.end].point=sidePoint(r,side,(i+1)/(list.length+1));});
  }
  // 2. Ruta de cada conexión, en el orden del documento.
  const used=new Lanes(),careful=d.edges.length<=250;
  for(const e of d.edges){
    const a=rects.get(e.from),b=rects.get(e.to);if(!a||!b)continue;
    let points:Point[];
    if(e.points)points=e.points;
    else if(e.from===e.to){
      const s=sidePoint(a,'right'),t=sidePoint(a,'top'),up=a.y-STUB*1.5;
      points=[s,{x:s.x+STUB*1.5,y:s.y},{x:s.x+STUB*1.5,y:up},{x:t.x,y:up},t];
    }else{
      const {from,to}=ends.get(e.id)!;
      if(e.line==='straight'){
        const S=e.fromAnchor||e.fromPort!=='auto'?from.point:borderToward(a,e.toAnchor||e.toPort!=='auto'?to.point:center(b)),E=e.toAnchor||e.toPort!=='auto'?to.point:borderToward(b,S);
        points=[S,E];
      }else if(e.line==='curved')points=bezier(from.point,DIR[from.side],to.point,DIR[to.side]);
      else points=orthogonal(d,e,a,b,from,to,careful?used:null,obstacles);
    }
    if(careful&&e.line==='orthogonal')for(let i=1;i<points.length;i++)used.add({a:points[i-1],b:points[i]});
    out.set(e.id,{points,label:null});
  }
  // 3. Etiquetas: sobre la ruta, en el primer lugar que no tape un nodo ni otra etiqueta.
  const placed:Rect[]=[],placedGrid=new Grid();
  for(const e of d.edges){
    const routed=out.get(e.id);if(!routed||!e.label)continue;
    const width=textWidth(e.label,e.style.fontSize??11,true)+10,height=(e.style.fontSize??11)+7;
    let chosen:Point|null=null,fallback:Point|null=null;
    for(const t of [.5,.38,.62,.26,.74,.16,.84]){
      const p=pointOnPolyline(routed.points,t),at={x:p.x,y:p.y-8},box={x:at.x-width/2,y:at.y-height+3,width,height};
      fallback??=at;
      if(obstacles.grid.query(box).some(i=>overlaps(obstacles.rects[i],box))||placedGrid.query(box).some(i=>overlaps(placed[i],box)))continue;
      chosen=at;placedGrid.add(placed.length,box);placed.push(box);break;
    }
    routed.label=chosen??fallback;
  }
  return out;
}

function orthogonal(d:DiagramDocument,e:DiagramEdge,a:Rect,b:Rect,from:End,to:End,used:Lanes|null,index:Obstacles):Point[]{
  const S=from.point,E=to.point,P={x:S.x+DIR[from.side].x*STUB,y:S.y+DIR[from.side].y*STUB},Q={x:E.x+DIR[to.side].x*STUB,y:E.y+DIR[to.side].y*STUB};
  const area:Rect={x:Math.min(S.x,E.x)-80,y:Math.min(S.y,E.y)-80,width:Math.abs(S.x-E.x)+160,height:Math.abs(S.y-E.y)+160};
  // Los primeros 24 en orden de documento, igual que al recorrer todos los nodos.
  const near=index.grid.query(area).filter(i=>{const n=d.nodes[i]!;return n.id!==e.from&&n.id!==e.to&&shapeOf(n)!=='text'&&overlaps(area,index.rects[i]!);}).slice(0,24).map(i=>index.rects[i]!);
  const obstacles=[...near.map(r=>inset(r,1)),inset(a,2),inset(b,2)];
  const crossings=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>sum+obstacles.filter(r=>segmentHits(points[i],p,r)).length,0);
  // Los tramos que tocan los nodos de los extremos pueden compartirse; se penaliza ir encimado en el resto del recorrido.
  const stacked=(points:Point[])=>used?.list.length?points.slice(1).reduce((sum,p,i)=>{const segment={a:points[i]!,b:p};return sum+used.near(segment).filter(u=>sharedLength(segment,u)>10).length;},0):0;
  const build=(middle:Point[])=>simplify([S,P,...middle,Q,E]);
  const viaX=(x:number)=>[{x,y:P.y},{x,y:Q.y}],viaY=(y:number)=>[{x:P.x,y},{x:Q.x,y}];
  const horizontal=DIR[from.side].x!==0,midX=(P.x+Q.x)/2,midY=(P.y+Q.y)/2;
  const preferred=horizontal?[viaX(midX),viaY(midY)]:[viaY(midY),viaX(midX)];
  const first=build(preferred[0]);
  if(!crossings(first)&&!stacked(first))return first;
  const candidates=[first,build(preferred[1]),build([{x:Q.x,y:P.y}]),build([{x:P.x,y:Q.y}])];
  for(const shift of [LANE,-LANE,LANE*2,-LANE*2,LANE*3,-LANE*3])candidates.push(build(horizontal?viaX(midX+shift):viaY(midY+shift)));
  for(const r of [...near,a,b])candidates.push(build(viaX(r.x-CLEARANCE)),build(viaX(r.x+r.width+CLEARANCE)),build(viaY(r.y-CLEARANCE)),build(viaY(r.y+r.height+CLEARANCE)));
  // Todos los términos del puntaje son no negativos: una candidata se descarta en cuanto lo ya sumado no puede ganarle a la mejor.
  // Mismo resultado que puntuar todo, sin contar cruces ni tramos encimados que no pueden cambiar la elección.
  const crossingsUpTo=(points:Point[],limit:number)=>{let count=0;for(let i=1;i<points.length;i++)for(const r of obstacles)if(segmentHits(points[i-1]!,points[i]!,r)&&++count>limit)return count;return count;};
  let best=first,bestScore=Infinity;
  for(const c of candidates){
    let score=(c.length-2)*30+pathLength(c);
    if(score>=bestScore)continue;
    score+=crossingsUpTo(c,Math.floor((bestScore-score)/100000))*100000;
    if(score>=bestScore)continue;
    score+=stacked(c)*4000;
    if(score<bestScore){best=c;bestScore=score;}
  }
  return best;
}

/** Ruta de una conexión dentro del documento. Para dibujar muchas, usar `routeAll` una sola vez. */
export function routeEdge(edge:DiagramEdge,d:DiagramDocument):Point[]{find(d.nodes,edge.from);find(d.nodes,edge.to);return routeAll(d).get(edge.id)?.points??[];}
export function edgePoints(edge:DiagramEdge,d:DiagramDocument):Point[]{return edge.points??routeEdge(edge,d);}
export function pointOnPolyline(points:Point[],progress:number):Point{
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));const total=lengths.reduce((a,b)=>a+b,0);let remaining=Math.max(0,Math.min(1,progress))*total;
  for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]||i===lengths.length-1){const a=points[i],b=points[i+1],t=lengths[i]===0?0:remaining/lengths[i];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}remaining-=lengths[i];}return points[0];
}

/** Límites de todo el contenido visible; null si el documento está vacío. */
export function documentBounds(d:DiagramDocument,ids?:string[]):Rect|null{
  const only=ids?new Set(ids):null,pick=(id:string)=>!only||only.has(id);
  const rects:Rect[]=[...d.nodes.filter(n=>pick(n.id)).map(nodeRect),...d.zones.filter(z=>pick(z.id)).map(z=>z.bounds),...d.frames.filter(f=>pick(f.id)).map(f=>f.bounds)];
  for(const drawing of d.drawings.filter(d=>pick(d.id))){const x=Math.min(...drawing.points.map(p=>p.x)),y=Math.min(...drawing.points.map(p=>p.y));rects.push({x,y,width:Math.max(1,Math.max(...drawing.points.map(p=>p.x))-x),height:Math.max(1,Math.max(...drawing.points.map(p=>p.y))-y)});}
  for(const [id,{points}] of routeAll(d))if(pick(id)&&points.length){
    const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
    rects.push({x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y});
  }
  return unionRects(rects);
}

/**
 * Regla de pertenencia al soltar un nodo: pertenece a la zona más chica que contiene su centro y en la que cabe.
 * La posición se ajusta para quedar dentro de esa zona; fuera de toda zona, queda libre.
 */
export function resolveMembership(d:DiagramDocument,rect:Rect):{zoneId:string|null;position:Point}{
  const cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
  const zone=d.zones
    .filter(z=>cx>=z.bounds.x&&cx<=z.bounds.x+z.bounds.width&&cy>=z.bounds.y&&cy<=z.bounds.y+z.bounds.height&&rect.width<=z.bounds.width&&rect.height<=z.bounds.height)
    .sort((p,q)=>p.bounds.width*p.bounds.height-q.bounds.width*q.bounds.height||p.id.localeCompare(q.id))[0];
  if(!zone)return {zoneId:null,position:{x:rect.x,y:rect.y}};
  const b=zone.bounds;
  return {zoneId:zone.id,position:{x:Math.max(b.x,Math.min(b.x+b.width-rect.width,rect.x)),y:Math.max(b.y,Math.min(b.y+b.height-rect.height,rect.y))}};
}
