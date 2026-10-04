import type {ActionInput,DiagramDocument} from './schema.js';
import {groupMembers} from './engine.js';
import {contains,nodeRect,resolveMembership} from './geometry.js';

/** Traslada una selección una sola vez, incluyendo miembros de zonas y rutas internas manuales. */
export function selectionMoveActions(doc:DiagramDocument,ids:string[],dx:number,dy:number):ActionInput[]{
  const picked=new Set(ids),zones=doc.zones.map(z=>picked.has(z.id)?{...z,bounds:{...z.bounds,x:z.bounds.x+dx,y:z.bounds.y+dy}}:z);
  const moving=doc.nodes.filter(n=>picked.has(n.id)||(n.zoneId&&picked.has(n.zoneId))),moved=new Set(moving.map(n=>n.id));
  const rigid=moving.length+doc.drawings.filter(d=>picked.has(d.id)).length>1;
  const actions:ActionInput[]=[...zones.filter(z=>picked.has(z.id)).map(z=>({type:'UPDATE_ZONE' as const,id:z.id,changes:{bounds:z.bounds}}))];
  for(const n of moving){
    const rect={...nodeRect(n),x:n.position.x+dx,y:n.position.y+dy},target=resolveMembership({...doc,zones},rect);
    // Una pieza compuesta conserva distancias internas al atravesar el borde de una zona.
    const position=rigid?{x:rect.x,y:rect.y}:target.position;
    const zoneId=target.zoneId&&contains(zones.find(z=>z.id===target.zoneId)!.bounds,{...rect,...position})?target.zoneId:null;
    actions.push({type:'UPDATE_NODE',id:n.id,changes:{position,zoneId}});
  }
  actions.push(...doc.drawings.filter(d=>picked.has(d.id)).map(d=>({type:'UPDATE_DRAWING' as const,id:d.id,changes:{points:d.points.map(p=>({x:p.x+dx,y:p.y+dy}))}})));
  actions.push(...doc.frames.filter(f=>picked.has(f.id)).map(f=>({type:'UPDATE_FRAME' as const,id:f.id,changes:{bounds:{...f.bounds,x:f.bounds.x+dx,y:f.bounds.y+dy}}})));
  for(const e of doc.edges)if(e.points&&moved.has(e.from)&&moved.has(e.to))actions.push({type:'UPDATE_EDGE',id:e.id,changes:{points:e.points.map(p=>({x:p.x+dx,y:p.y+dy}))}});
  return actions;
}

/** Vista previa de esas acciones sin revisión, historial ni validación por cuadro. Commit valida al soltar. */
export function selectionMovePreview(doc:DiagramDocument,ids:string[],dx:number,dy:number):DiagramDocument{
  const changes=selectionMoveActions(doc,ids,dx,dy);
  const nodeChanges=new Map(changes.filter(a=>a.type==='UPDATE_NODE').map(a=>[a.id,a.changes]));
  const drawingChanges=new Map(changes.filter(a=>a.type==='UPDATE_DRAWING').map(a=>[a.id,a.changes]));
  const zoneChanges=new Map(changes.filter(a=>a.type==='UPDATE_ZONE').map(a=>[a.id,a.changes]));
  const frameChanges=new Map(changes.filter(a=>a.type==='UPDATE_FRAME').map(a=>[a.id,a.changes]));
  const edgeChanges=new Map(changes.filter(a=>a.type==='UPDATE_EDGE').map(a=>[a.id,a.changes]));
  const nodes=doc.nodes.map(n=>nodeChanges.has(n.id)?{...n,...nodeChanges.get(n.id)}:n);
  const moved=new Set(nodes.filter((n,i)=>n!==doc.nodes[i]).map(n=>n.id));
  return {...doc,nodes,drawings:doc.drawings.map(d=>({...d,...drawingChanges.get(d.id)})),zones:doc.zones.map(z=>({...z,...zoneChanges.get(z.id)})),frames:doc.frames.map(f=>({...f,...frameChanges.get(f.id)})),edges:doc.edges.map(e=>{const points=edgeChanges.get(e.id)?.points;return {...e,...(moved.has(e.from)||moved.has(e.to)?{points:undefined}:{}),...(points?{points}:{})};})};
}

export type SelectionClipboard=Pick<DiagramDocument,'nodes'|'edges'|'drawings'|'zones'|'frames'|'groups'|'assets'>;
/** Copia autocontenida: incluye extremos de enlaces, imágenes y grupos completos, sin historial ni animaciones. */
export function captureSelection(doc:DiagramDocument,ids:string[]):SelectionClipboard|null{
  const picked=new Set(ids);
  for(const g of doc.groups)if(picked.has(g.id))for(const id of groupMembers(doc,g.id))picked.add(id);
  for(const n of doc.nodes)if(n.zoneId&&picked.has(n.zoneId))picked.add(n.id);
  for(const e of doc.edges)if(picked.has(e.id)){picked.add(e.from);picked.add(e.to);}
  const nodes=doc.nodes.filter(n=>picked.has(n.id)),drawings=doc.drawings.filter(d=>picked.has(d.id)),zones=doc.zones.filter(z=>picked.has(z.id)),frames=doc.frames.filter(f=>picked.has(f.id));
  if(!nodes.length&&!drawings.length&&!zones.length&&!frames.length)return null;
  const groups=doc.groups.filter(g=>{const members=groupMembers(doc,g.id);return members.length&&members.every(id=>picked.has(id));});
  return structuredClone({nodes,drawings,zones,frames,groups,edges:doc.edges.filter(e=>picked.has(e.from)&&picked.has(e.to)),assets:doc.assets.filter(a=>nodes.some(n=>n.assetId===a.id))});
}

/** Nuevos IDs sólo al clonar. Referencias, geometría, grupos y assets se remapean en un lote atómico. */
export function cloneSelectionActions(doc:DiagramDocument,clip:SelectionClipboard,offset:number,newId:(prefix:string)=>string):{actions:ActionInput[];ids:string[]}{
  const rename=new Map<string,string>(),actions:ActionInput[]=[];
  for(const [prefix,items] of [['node',clip.nodes],['drawing',clip.drawings],['zone',clip.zones],['frame',clip.frames],['group',clip.groups]] as const)for(const item of items)rename.set(item.id,newId(prefix));
  for(const asset of clip.assets){
    const existing=doc.assets.find(a=>a.mediaType===asset.mediaType&&a.data===asset.data&&a.width===asset.width&&a.height===asset.height);
    const id=existing?.id??newId('asset');rename.set(asset.id,id);if(!existing)actions.push({type:'ADD_ASSET',asset:{...asset,id}});
  }
  const zones=clip.zones.map(z=>({...z,id:rename.get(z.id)!,bounds:{...z.bounds,x:z.bounds.x+offset,y:z.bounds.y+offset}}));
  actions.push(...zones.map(zone=>({type:'CREATE_ZONE' as const,zone})));
  for(const n of clip.nodes){
    const position={x:n.position.x+offset,y:n.position.y+offset},rect={...nodeRect(n),...position};
    const zoneId=n.zoneId&&rename.has(n.zoneId)?rename.get(n.zoneId)!:doc.zones.find(z=>contains(z.bounds,rect))?.id??null;
    actions.push({type:'ADD_NODE',node:{...n,id:rename.get(n.id)!,groupId:null,zoneId,position,assetId:n.assetId?rename.get(n.assetId)??null:null}});
  }
  actions.push(...clip.drawings.map(d=>({type:'ADD_DRAWING' as const,drawing:{...d,id:rename.get(d.id)!,groupId:null,points:d.points.map(p=>({x:p.x+offset,y:p.y+offset}))}})));
  actions.push(...clip.frames.map(f=>({type:'CREATE_FRAME' as const,frame:{...f,id:rename.get(f.id)!,bounds:{...f.bounds,x:f.bounds.x+offset,y:f.bounds.y+offset}}})));
  actions.push(...clip.edges.map(e=>({type:'ADD_EDGE' as const,edge:{...e,id:newId('edge'),from:rename.get(e.from)!,to:rename.get(e.to)!,...(e.points?{points:e.points.map(p=>({x:p.x+offset,y:p.y+offset}))}:{})}})));
  const depth=(id:string):number=>{let count=0,g=clip.groups.find(g=>g.id===id);while(g?.parentId){count++;g=clip.groups.find(p=>p.id===g!.parentId);}return count;};
  for(const g of [...clip.groups].sort((a,b)=>depth(a.id)-depth(b.id))){
    const members=groupMembers({...doc,nodes:clip.nodes,drawings:clip.drawings,groups:clip.groups},g.id),inside=new Set(members);
    actions.push({type:'CREATE_GROUP',group:{...g,id:rename.get(g.id)!,parentId:g.parentId?rename.get(g.parentId)??null:null},nodeIds:clip.nodes.filter(n=>inside.has(n.id)).map(n=>rename.get(n.id)!),drawingIds:clip.drawings.filter(d=>inside.has(d.id)).map(d=>rename.get(d.id)!)});
  }
  const ids=[...clip.nodes,...clip.drawings,...clip.zones,...clip.frames].map(x=>rename.get(x.id)!);
  return {actions,ids};
}
