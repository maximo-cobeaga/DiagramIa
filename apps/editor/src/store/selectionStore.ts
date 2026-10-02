import type {DiagramDocument} from '@diagramia/core';
import {createStore} from './createStore';

// Los IDs son únicos en todo el documento, así que una sola lista alcanza para todas las piezas seleccionables.
export const selectionStore=createStore({ids:[] as string[]});
export const select=(ids:string[])=>selectionStore.set({ids:[...new Set(ids)]});
export function pruneSelection(d:DiagramDocument){
  const alive=new Set([...d.nodes,...d.edges,...d.drawings,...d.zones,...d.frames].map(x=>x.id)),{ids}=selectionStore.get();
  if(ids.some(id=>!alive.has(id)))selectionStore.set({ids:ids.filter(id=>alive.has(id))});
}
export type SelectionKind='node'|'edge'|'zone'|'frame';
export function kindOf(d:DiagramDocument,id:string):SelectionKind|null{
  return d.nodes.some(n=>n.id===id)?'node':d.edges.some(e=>e.id===id)?'edge':d.zones.some(z=>z.id===id)?'zone':d.frames.some(f=>f.id===id)?'frame':null;
}
