import type {Point} from '@diagramia/core';
type Camera={x:number;y:number;zoom:number};
export type PinchGesture={distance:number;zoom:number;anchor:Point};
const midpoint=(a:Point,b:Point)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
/** Guarda el punto del documento bajo el centro de los dedos al empezar. */
export function beginPinch(a:Point,b:Point,camera:Camera,origin:Point):PinchGesture{
  const center=midpoint(a,b);
  return {distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:camera.zoom,anchor:{x:camera.x+(center.x-origin.x)/camera.zoom,y:camera.y+(center.y-origin.y)/camera.zoom}};
}
/** Pellizco y desplazamiento comparten el ancla; no se acumula deriva entre eventos. */
export function pinchCamera(gesture:PinchGesture,a:Point,b:Point,origin:Point,clamp:(zoom:number)=>number):Camera{
  const center=midpoint(a,b),zoom=clamp(gesture.zoom*Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))/gesture.distance);
  return {zoom,x:gesture.anchor.x-(center.x-origin.x)/zoom,y:gesture.anchor.y-(center.y-origin.y)/zoom};
}
