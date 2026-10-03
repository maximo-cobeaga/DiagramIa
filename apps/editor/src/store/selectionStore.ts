import type {DiagramDocument} from '@diagramia/core';
import {createStore} from './createStore';
import {trackThrottled} from '../telemetry';

// Los IDs son únicos en todo el documento, así que una sola lista alcanza para todas las piezas seleccionables.
export const selectionStore=createStore({ids:[] as string[]});
export const select=(ids:string[])=>{
  const unique=[...new Set(ids)];
  if(unique.length>1)trackThrottled('multi_select',{count:unique.length});
  selectionStore.set({ids:unique});
};
export function pruneSelection(d:DiagramDocument){
  const alive=new Set([...d.nodes,...d.edges,...d.drawings,...d.zones,...d.frames].map(x=>x.id)),{ids}=selectionStore.get();
  if(ids.some(id=>!alive.has(id)))selectionStore.set({ids:ids.filter(id=>alive.has(id))});
}
export type SelectionKind='node'|'edge'|'drawing'|'zone'|'frame';
export function kindOf(d:DiagramDocument,id:string):SelectionKind|null{
  return d.nodes.some(n=>n.id===id)?'node':d.edges.some(e=>e.id===id)?'edge':d.drawings.some(d=>d.id===id)?'drawing':d.zones.some(z=>z.id===id)?'zone':d.frames.some(f=>f.id===id)?'frame':null;
}
