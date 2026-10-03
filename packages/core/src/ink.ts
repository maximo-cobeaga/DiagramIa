import type {Point} from './geometry.js';

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** La longitud recorrida acepta trazos cerrados, aunque inicio y fin coincidan. */
export const inkLength=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
/** Mantiene extremos y geometría bajo el límite del contrato. Nunca descarta el final de un trazo. */
export function limitInk(points:Point[],limit=500):Point[]{
  if(points.length<=limit)return points;
  return Array.from({length:limit},(_,i)=>points[Math.round(i*(points.length-1)/(limit-1))]);
}
/** Filtra el temblor por distancia recorrida, no por la cantidad de eventos del dispositivo. */
export function smoothInk(points:Point[]):Point[]{
  if(points.length<4)return points;
  const lengths=[0];
  for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
  const length=lengths.at(-1)!;
  if(!length)return points;
  const radius=Math.min(10,Math.max(3,length/18));
  const at=(position:number):Point=>{
    const target=Math.max(0,Math.min(length,position));let lo=0,hi=lengths.length-1;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(lengths[mid]<target)lo=mid+1;else hi=mid;}
    if(!lo)return points[0];
    const a=points[lo-1],b=points[lo],span=lengths[lo]-lengths[lo-1],t=span?(target-lengths[lo-1])/span:0;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
  };
  return points.map((p,i)=>{
    if(i===0||i===points.length-1)return p;
    const window=Math.min(radius,lengths[i],length-lengths[i]),a=at(lengths[i]-window),b=at(lengths[i]+window);
    if(distance(a,b)<(distance(a,p)+distance(p,b))*.82)return p; // Esquina a escala del trazo, no del temblor.
    let x=0,y=0;
    for(let j=-3;j<=3;j++){const sample=at(lengths[i]+j*window/3),weight=4-Math.abs(j);x+=sample.x*weight;y+=sample.y*weight;}
    return {x:x/16,y:y/16};
  });
}
export function straightInk(from:Point,to:Point,constrain=false):Point[]{
  if(!constrain)return [from,to];
  const angle=Math.round(Math.atan2(to.y-from.y,to.x-from.x)/(Math.PI/4))*Math.PI/4,length=distance(from,to);
  return [from,{x:from.x+Math.cos(angle)*length,y:from.y+Math.sin(angle)*length}];
}
/** Reconocimiento geométrico conservador para la vista previa y para soltar en modo guiado. */
export function guideInk(points:Point[]):{label:string;points:Point[]}|null{
  if(points.length<3)return null;
  points=smoothInk(points);
  const length=inkLength(points),first=points[0],last=points.at(-1)!;
  if(length<8)return null;
  const chord=distance(first,last);
  if(chord>8&&chord/length>.8){
    const errors=points.map(p=>Math.abs((last.x-first.x)*(first.y-p.y)-(first.x-p.x)*(last.y-first.y))/chord);
    if(Math.max(...errors)<chord*.055&&Math.sqrt(errors.reduce((sum,e)=>sum+e*e,0)/errors.length)<chord*.025)return {label:'Línea',points:[first,last]};
  }
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  const w=Math.max(...points.map(p=>p.x))-x,h=Math.max(...points.map(p=>p.y))-y;
  if(w<8||h<8||distance(first,last)>Math.min(w,h)*.3)return null;
  const perimeter=2*(w+h);
  const borderError=points.reduce((sum,p)=>sum+Math.min(p.x-x,x+w-p.x,p.y-y,y+h-p.y),0)/points.length;
  const corners=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  if(borderError<Math.min(w,h)*.055&&length>perimeter*.85&&length<perimeter*1.18&&corners.every(c=>points.some(p=>distance(p,c)<Math.min(w,h)*.18))){
    return {label:'Rectángulo',points:[...corners,corners[0]]};
  }
  const cx=x+w/2,cy=y+h/2,rx=w/2,ry=h/2;
  const radialError=points.reduce((sum,p)=>sum+Math.abs(Math.hypot((p.x-cx)/rx,(p.y-cy)/ry)-1),0)/points.length;
  const ellipseLength=Math.PI*(3*(rx+ry)-Math.sqrt((3*rx+ry)*(rx+3*ry)));
  const quadrants=new Set(points.map(p=>(p.x>=cx?1:0)+(p.y>=cy?2:0)));
  if(radialError<.12&&quadrants.size===4&&length>ellipseLength*.8&&length<ellipseLength*1.22){
    const circle=Math.abs(w-h)/Math.max(w,h)<.12,r=circle?(rx+ry)/2:0;
    const start=Math.atan2((first.y-cy)/ry,(first.x-cx)/rx);
    return {label:circle?'Círculo':'Óvalo',points:Array.from({length:81},(_,i)=>{const a=start+i*Math.PI*2/80;return {x:cx+Math.cos(a)*(r||rx),y:cy+Math.sin(a)*(r||ry)};})};
  }
  return null;
}
