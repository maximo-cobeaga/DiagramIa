import {DocumentSchema,BatchSchema,SCHEMA_VERSION,READABLE_VERSIONS,MAX_ASSET_BYTES,type Action,type DiagramAnimation,type DiagramDocument,type DiagramNode,type DiagramZone,type Placement} from './schema.js';
import {DiagramError,fail,find} from './errors.js';
import {contains,nodeRect,overlaps,type Point,type Rect} from './geometry.js';
import {alignNodes,arrangeBlocks,distributeNodes,layeredLayout} from './layout.js';
import {assetBytes,digest,inspectAsset} from './assets.js';

const unique=(ids:string[])=>new Set(ids).size===ids.length;

export function validateDocument(input:unknown):DiagramDocument{
  const d=DocumentSchema.parse(input);
  const elements=[...d.nodes,...d.edges,...d.drawings,...d.zones,...d.groups,...d.frames],all=[...elements,...d.animations,...d.animations.flatMap(a=>a.tracks.flatMap(t=>[t,...t.clips])),...d.assets,...d.annotations];
  if(!unique(all.map(n=>n.id)))fail('DUPLICATE_ID','Los IDs deben ser únicos en todo el documento.');
  if(!unique(d.appliedBatches.map(b=>b.id)))fail('DUPLICATE_TRANSACTION','Lote duplicado en el registro.');
  const nodes=new Set(d.nodes.map(n=>n.id)),edges=new Set(d.edges.map(e=>e.id)),frames=new Set(d.frames.map(f=>f.id));
  const zones=new Map(d.zones.map(z=>[z.id,z])),groups=new Map(d.groups.map(g=>[g.id,g])),assets=new Set(d.assets.map(a=>a.id)),targets=new Set(elements.map(x=>x.id));
  for(const asset of d.assets)if(assetBytes(asset.data)>MAX_ASSET_BYTES)fail('ASSET_TOO_LARGE',`El asset «${asset.label}» supera ${Math.round(MAX_ASSET_BYTES/1000)} KB.`);
  for(const note of d.annotations)if(note.targetId&&!targets.has(note.targetId))fail('DANGLING_ANNOTATION',`La anotación ${note.id} refiere un elemento inexistente.`);
  for(const e of d.edges)if(!nodes.has(e.from)||!nodes.has(e.to))fail('DANGLING_EDGE',`Conexión ${e.id} sin extremos válidos.`);
  for(const g of d.groups){
    const seen=new Set([g.id]);
    for(let parent=g.parentId;parent;parent=groups.get(parent)!.parentId){
      if(!groups.has(parent))fail('DANGLING_GROUP',`El grupo ${g.id} refiere un grupo padre inexistente.`);
      if(seen.has(parent))fail('GROUP_CYCLE',`El grupo ${g.id} no puede contenerse a sí mismo.`);
      seen.add(parent);
    }
  }
  for(const n of d.nodes){
    if(n.groupId&&!groups.has(n.groupId))fail('DANGLING_GROUP',`Grupo de ${n.id} inexistente.`);
    if(n.assetId&&!assets.has(n.assetId))fail('DANGLING_ASSET',`La imagen de ${n.id} no existe en el documento.`);
    if(!n.zoneId)continue;
    const zone=zones.get(n.zoneId)??fail('DANGLING_ZONE',`Zona de ${n.id} inexistente.`);
    if(!contains(zone.bounds,nodeRect(n)))fail('OUTSIDE_ZONE',`«${n.label}» (${n.id}) debe caber dentro de la zona «${zone.label}» (${zone.id}). Agrandá la zona, mové el nodo o quitá la pertenencia.`);
  }
  for(const drawing of d.drawings)if(drawing.groupId&&!groups.has(drawing.groupId))fail('DANGLING_GROUP',`Grupo de ${drawing.id} inexistente.`);
  for(const a of d.animations){
    if(!unique(a.steps.map(s=>s.id)))fail('DUPLICATE_STEP',`Pasos duplicados en ${a.id}.`);
    if(a.steps.reduce((sum,s)=>sum+s.durationMs,0)>600000)fail('ANIMATION_TOO_LONG','La animación supera diez minutos.');
    const scenarios=new Set(a.scenarios.map(s=>s.id));
    if(scenarios.size!==a.scenarios.length)fail('DUPLICATE_SCENARIO',`Escenarios duplicados en ${a.id}.`);
    for(const scenario of a.scenarios)if(!a.steps.some(s=>!s.scenarioIds.length||s.scenarioIds.includes(scenario.id)))fail('EMPTY_SCENARIO',`El escenario «${scenario.label}» de ${a.id} no tiene ningún paso.`);
    for(const s of a.steps){
      if(s.nodeIds.some(id=>!nodes.has(id))||s.edgeIds.some(id=>!edges.has(id)))fail('DANGLING_ANIMATION',`El paso ${s.id} refiere elementos inexistentes.`);
      if(s.frameId&&!frames.has(s.frameId))fail('DANGLING_ANIMATION',`El paso ${s.id} refiere un frame inexistente.`);
      if(s.scenarioIds.some(id=>!scenarios.has(id)))fail('DANGLING_ANIMATION',`El paso ${s.id} refiere un escenario inexistente.`);
      if(s.states.some(state=>!nodes.has(state.nodeId)))fail('DANGLING_ANIMATION',`El paso ${s.id} asigna un estado a un nodo inexistente.`);
    }
    const stepIds=new Set(a.steps.map(s=>s.id));
    if(!unique(a.tracks.map(t=>t.id)))fail('DUPLICATE_TRACK',`Pistas duplicadas en ${a.id}.`);
    for(const track of a.tracks){
      if(!unique(track.clips.map(c=>c.id))||!unique(track.clips.map(c=>c.stepId)))fail('DUPLICATE_TRACK_CLIP',`La pista «${track.label}» tiene dos efectos en el mismo paso o IDs repetidos.`);
      for(const clip of track.clips){
        if(!stepIds.has(clip.stepId)||clip.nodeIds.some(id=>!nodes.has(id))||clip.edgeIds.some(id=>!edges.has(id))||(clip.frameId&&!frames.has(clip.frameId)))fail('DANGLING_TRACK',`El efecto ${clip.id} de «${track.label}» refiere un elemento inexistente.`);
      }
    }
  }
  return d;
}

type Raw=Record<string,unknown>;
// Cada migración recibe una copia y devuelve el documento en la versión siguiente. Nunca regenera IDs.
const MIGRATIONS:Record<string,{to:string;run:(d:Raw)=>Raw}>={
  '1.0.0':{to:'1.1.0',run:d=>({...d,schemaVersion:'1.1.0',groups:[],frames:[]})},
  '1.1.0':{to:'1.2.0',run:d=>({...d,schemaVersion:'1.2.0',assets:[],annotations:[]})},
  // 1.3.0 sólo agrega campos opcionales (forma, estilo, enganches, puntas): los valores por defecto conservan el aspecto anterior.
  '1.2.0':{to:'1.3.0',run:d=>({...d,schemaVersion:'1.3.0'})},
  // 1.4.0 añade una colección de trazos independiente; documentos viejos conservan contenido e IDs.
  '1.3.0':{to:'1.4.0',run:d=>({...d,schemaVersion:'1.4.0',drawings:[]})},
  '1.4.0':{to:'1.5.0',run:d=>({...d,schemaVersion:'1.5.0',animations:(d.animations as Raw[]).map(a=>({...a,tracks:[]}))})},
  // 1.6.0 sólo amplía los iconos y agrega un estilo opcional: un documento 1.5.0 ya es válido tal cual.
  '1.5.0':{to:'1.6.0',run:d=>({...d,schemaVersion:'1.6.0'})},
  // 1.7.0 añade intención de cámara por paso; los defaults mantienen el encuadre automático anterior.
  '1.6.0':{to:'1.7.0',run:d=>({...d,schemaVersion:'1.7.0'})},
  // Pertenencia opcional de trazos a grupos; IDs, revisión y geometría originales conservados.
  '1.7.0':{to:'1.8.0',run:d=>({...d,schemaVersion:'1.8.0'})}
};
/** Abre un documento de cualquier versión legible y lo lleva al schema vigente. */
export function openDocument(input:unknown):{document:DiagramDocument;migratedFrom:string|null}{
  if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_DOCUMENT','El archivo no contiene un documento de Diagramia.');
  let raw=structuredClone(input)as Raw;const original=raw.schemaVersion;
  if(typeof original!=='string')fail('INVALID_DOCUMENT','El documento no declara schemaVersion.');
  for(let hops=0;raw.schemaVersion!==SCHEMA_VERSION;hops++){
    const migration=MIGRATIONS[raw.schemaVersion as string];
    if(!migration||hops>20)fail('UNSUPPORTED_VERSION',`Versión de schema ${String(original)} no soportada. Este engine lee ${READABLE_VERSIONS.join(', ')}. El archivo no se modificó: conservalo y abrilo con una versión compatible de Diagramia.`);
    raw=migration.run(raw);
  }
  const document=validateDocument(raw);
  // El contenido de las imágenes se inspecciona al abrir y al agregarlas, no en cada validación.
  document.assets.forEach(inspectAsset);
  return {document,migratedFrom:original===SCHEMA_VERSION?null:original as string};
}

export const emptyDocument=(id:string,title:string):DiagramDocument=>validateDocument({schemaVersion:SCHEMA_VERSION,id,title,revision:0,nodes:[],edges:[],drawings:[],zones:[],groups:[],frames:[],animations:[],appliedBatches:[]});

export function canonical(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}

/** Resuelve una zona por label; con labels repetidos exige desambiguar por ID en vez de adivinar. */
export function findZoneByLabel(d:DiagramDocument,label:string):DiagramZone{
  const wanted=label.trim().toLowerCase(),matches=d.zones.filter(z=>z.label.trim().toLowerCase()===wanted);
  if(!matches.length)fail('NOT_FOUND',`No existe una zona llamada «${label}».`);
  if(matches.length>1)fail('AMBIGUOUS_ZONE',`Hay ${matches.length} zonas llamadas «${label}»: ${matches.map(z=>z.id).join(', ')}. Indicá cuál por ID.`);
  return matches[0];
}

const SIDES=['below','above','rightOf','leftOf'] as const;
function place(d:DiagramDocument,n:DiagramNode,p:Placement){
  const sides=SIDES.filter(side=>p[side]);
  if(sides.length>1)fail('AMBIGUOUS_PLACEMENT','Elegí una sola referencia: below, above, rightOf o leftOf.');
  if(p.inside&&p.insideLabel)fail('AMBIGUOUS_PLACEMENT','Usá inside (ID) o insideLabel, no ambos.');
  // Los mensajes nombran las opciones válidas: un modelo que confundió un nodo con una zona puede corregirse solo.
  const zone=p.inside?d.zones.find(z=>z.id===p.inside)??fail('NOT_FOUND',`«${p.inside}» no es una zona. ${d.zones.length?`Zonas disponibles (ID): ${d.zones.map(z=>z.id).join(', ')}`:'El documento no tiene zonas'}.`):p.insideLabel?findZoneByLabel(d,p.insideLabel):undefined;
  if(zone)n.zoneId=zone.id;
  const others=d.nodes.filter(o=>o.id!==n.id).map(nodeRect),at=(pos:Point):Rect=>({...pos,...n.size});
  const blocker=(pos:Point)=>others.find(o=>overlaps(at(pos),o));
  const side=sides[0];
  if(side){
    const anchor=d.nodes.find(node=>node.id===p[side])??fail('NOT_FOUND',`«${p[side]}» no es un nodo: ${side} necesita el ID de un nodo existente.`);
    if(anchor.id===n.id)fail('AMBIGUOUS_PLACEMENT','Un nodo no puede ubicarse respecto de sí mismo.');
    const a=nodeRect(anchor);
    let pos:Point=side==='below'?{x:a.x,y:a.y+a.height+p.gap}:side==='above'?{x:a.x,y:a.y-n.size.height-p.gap}:side==='rightOf'?{x:a.x+a.width+p.gap,y:a.y}:{x:a.x-n.size.width-p.gap,y:a.y};
    // Si el lugar está ocupado, se sigue en la misma dirección hasta pasar el obstáculo.
    for(let tries=0,hit=blocker(pos);hit;hit=blocker(pos)){
      if(++tries>200)fail('NO_SPACE',`No se encontró lugar libre para «${n.label}» junto a «${anchor.label}».`);
      pos=side==='below'?{x:pos.x,y:hit.y+hit.height+p.gap}:side==='above'?{x:pos.x,y:hit.y-n.size.height-p.gap}:side==='rightOf'?{x:hit.x+hit.width+p.gap,y:pos.y}:{x:hit.x-n.size.width-p.gap,y:pos.y};
    }
    if(zone&&!contains(zone.bounds,at(pos)))fail('NO_SPACE',`No hay lugar para «${n.label}» ${side} de «${anchor.label}» dentro de la zona «${zone.label}». Agrandá la zona o elegí otra referencia.`);
    n.position=pos;
    // Sin zona indicada, el nodo acompaña a su referencia: queda en la zona del nodo vecino si cabe en ella.
    const shared=!zone&&!n.zoneId&&anchor.zoneId?d.zones.find(z=>z.id===anchor.zoneId):undefined;
    if(shared&&contains(shared.bounds,at(pos)))n.zoneId=shared.id;
  }else if(zone){
    const b=zone.bounds;
    for(let y=b.y+48;y+n.size.height<=b.y+b.height-16;y+=24)for(let x=b.x+32;x+n.size.width<=b.x+b.width-16;x+=24)if(!blocker({x,y})){n.position={x,y};return;}
    fail('NO_SPACE',`La zona «${zone.label}» no tiene lugar libre para «${n.label}». Agrandá la zona.`);
  }
}

function invalidateRoutes(d:DiagramDocument,ids:Iterable<string>){const moved=new Set(ids);for(const e of d.edges)if(moved.has(e.from)||moved.has(e.to))delete e.points;}
// Sólo se llama al eliminar: una referencia inexistente en una acción nueva debe fallar, no podarse en silencio.
function pruneAnimationRefs(d:DiagramDocument){
  const nodes=new Set(d.nodes.map(n=>n.id)),edges=new Set(d.edges.map(e=>e.id)),frames=new Set(d.frames.map(f=>f.id));
  for(const a of d.animations)for(const step of a.steps){
    step.nodeIds=step.nodeIds.filter(id=>nodes.has(id));step.edgeIds=step.edgeIds.filter(id=>edges.has(id));
    if(step.frameId&&!frames.has(step.frameId))step.frameId=null;
    step.states=step.states.filter(state=>nodes.has(state.nodeId));
  }
  for(const a of d.animations)for(const track of a.tracks)for(const clip of track.clips){
    clip.nodeIds=clip.nodeIds.filter(id=>nodes.has(id));clip.edgeIds=clip.edgeIds.filter(id=>edges.has(id));
    if(clip.frameId&&!frames.has(clip.frameId))clip.frameId=null;
  }
  detachAnnotations(d);
}
// Una anotación sobrevive a su elemento: queda a nivel de documento en vez de perderse.
function detachAnnotations(d:DiagramDocument){
  const alive=new Set([...d.nodes,...d.edges,...d.drawings,...d.zones,...d.groups,...d.frames].map(x=>x.id));
  for(const note of d.annotations)if(note.targetId&&!alive.has(note.targetId))note.targetId=null;
}
function pruneEmptyGroups(d:DiagramDocument){
  // Un grupo sin nodos ni subgrupos deja de existir; se repite porque vaciar uno puede vaciar a su padre.
  for(let changed=true;changed;){
    const used=new Set([...d.nodes.map(n=>n.groupId),...d.drawings.map(n=>n.groupId),...d.groups.map(g=>g.parentId)]);
    const kept=d.groups.filter(g=>used.has(g.id));changed=kept.length!==d.groups.length;d.groups=kept;
    // Sólo al desaparecer un grupo: una anotación nueva con destino inexistente debe fallar en la validación.
    if(changed)detachAnnotations(d);
  }
}
function deleteNodes(d:DiagramDocument,ids:Set<string>){d.nodes=d.nodes.filter(n=>!ids.has(n.id));d.edges=d.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to));pruneAnimationRefs(d);}
function reposition(d:DiagramDocument,positions:Map<string,Point>){for(const [id,position] of positions)find(d.nodes,id).position=position;invalidateRoutes(d,positions.keys());}
const pick=(d:DiagramDocument,ids:string[])=>{if(!unique(ids))fail('DUPLICATE_ID','La lista de nodos repite IDs.');return ids.map(id=>find(d.nodes,id));};
const stepOf=(d:DiagramDocument,animationId:string,stepId:string)=>{const animation=find(d.animations,animationId);return {animation,step:find(animation.steps,stepId)};};
const trackOf=(d:DiagramDocument,animationId:string,trackId:string)=>find(find(d.animations,animationId).tracks,trackId);

function mutate(d:DiagramDocument,a:Action){
  switch(a.type){
    case 'UPDATE_DOCUMENT':Object.assign(d,a.changes);break;
    case 'ADD_NODE':{const n=structuredClone(a.node);if(a.placement)place(d,n,a.placement);d.nodes.push(n);break;}
    case 'UPDATE_NODE':{Object.assign(find(d.nodes,a.id),structuredClone(a.changes));if(a.changes.position||a.changes.size)invalidateRoutes(d,[a.id]);break;}
    case 'MOVE_NODE':{const n=find(d.nodes,a.id);if(a.position)n.position={...a.position};else if(a.placement)place(d,n,a.placement);invalidateRoutes(d,[a.id]);break;}
    case 'MOVE_NODES':{for(const n of pick(d,a.ids))n.position={x:n.position.x+a.dx,y:n.position.y+a.dy};invalidateRoutes(d,a.ids);break;}
    case 'RESIZE_NODE':{const n=find(d.nodes,a.id);n.size={...a.size};if(a.position)n.position={...a.position};invalidateRoutes(d,[a.id]);break;}
    case 'DELETE_NODE':find(d.nodes,a.id);deleteNodes(d,new Set([a.id]));break;
    case 'ADD_EDGE':d.edges.push(structuredClone(a.edge));break;
    case 'UPDATE_EDGE':{
      const e=find(d.edges,a.id),{points,...rest}=structuredClone(a.changes);Object.assign(e,rest);
      // Cambiar extremos o puertos descarta la ruta manual anterior, salvo que el mismo cambio traiga una nueva.
      if(points)e.points=points;else if(points===null||rest.from||rest.to||rest.fromPort||rest.toPort)delete e.points;
      break;
    }
    case 'DELETE_EDGE':find(d.edges,a.id);d.edges=d.edges.filter(e=>e.id!==a.id);pruneAnimationRefs(d);break;
    case 'ADD_DRAWING':d.drawings.push(structuredClone(a.drawing));break;
    case 'UPDATE_DRAWING':Object.assign(find(d.drawings,a.id),structuredClone(a.changes));break;
    case 'DELETE_DRAWING':find(d.drawings,a.id);d.drawings=d.drawings.filter(x=>x.id!==a.id);break;
    case 'CREATE_ZONE':d.zones.push(structuredClone(a.zone));break;
    case 'UPDATE_ZONE':Object.assign(find(d.zones,a.id),structuredClone(a.changes));break;
    case 'MOVE_ZONE':{
      const z=find(d.zones,a.id),dx=a.position.x-z.bounds.x,dy=a.position.y-z.bounds.y,members=d.nodes.filter(n=>n.zoneId===z.id);
      z.bounds={...z.bounds,...a.position};
      for(const n of members)n.position={x:n.position.x+dx,y:n.position.y+dy};
      invalidateRoutes(d,members.map(n=>n.id));break;
    }
    case 'DELETE_ZONE':{
      find(d.zones,a.id);d.zones=d.zones.filter(z=>z.id!==a.id);
      if(a.members==='delete')deleteNodes(d,new Set(d.nodes.filter(n=>n.zoneId===a.id).map(n=>n.id)));
      else for(const n of d.nodes)if(n.zoneId===a.id)n.zoneId=null;
      detachAnnotations(d);break;
    }
    case 'CREATE_GROUP':{
      const group=structuredClone(a.group),byId=new Map(d.groups.map(g=>[g.id,g]));d.groups.push(group);
      // Agrupar nodos ya agrupados anida su grupo raíz, en vez de sacarlos de él.
      if(!unique([...a.nodeIds,...a.drawingIds]))fail('DUPLICATE_ID','La lista de miembros repite IDs.');
      for(const n of [...pick(d,a.nodeIds),...a.drawingIds.map(id=>find(d.drawings,id))]){
        if(!n.groupId||n.groupId===group.parentId){n.groupId=group.id;continue;}
        let root=byId.get(n.groupId)!;
        for(let hops=0;root.parentId&&byId.has(root.parentId)&&hops<600;hops++)root=byId.get(root.parentId)!;
        if(root.id!==group.parentId)root.parentId=group.id;
      }
      break;
    }
    case 'UPDATE_GROUP':Object.assign(find(d.groups,a.id),a.changes);break;
    case 'DELETE_GROUP':{
      const g=find(d.groups,a.id);d.groups=d.groups.filter(x=>x.id!==a.id);
      for(const n of d.nodes)if(n.groupId===a.id)n.groupId=g.parentId;
      for(const drawing of d.drawings)if(drawing.groupId===a.id)drawing.groupId=g.parentId;
      for(const child of d.groups)if(child.parentId===a.id)child.parentId=g.parentId;
      detachAnnotations(d);
      break;
    }
    case 'CREATE_FRAME':d.frames.push(structuredClone(a.frame));break;
    case 'UPDATE_FRAME':Object.assign(find(d.frames,a.id),structuredClone(a.changes));break;
    case 'DELETE_FRAME':find(d.frames,a.id);d.frames=d.frames.filter(f=>f.id!==a.id);pruneAnimationRefs(d);break;
    case 'CREATE_ANIMATION':d.animations.push(structuredClone(a.animation));break;
    case 'UPDATE_ANIMATION':Object.assign(find(d.animations,a.id),a.changes);break;
    case 'DELETE_ANIMATION':find(d.animations,a.id);d.animations=d.animations.filter(x=>x.id!==a.id);break;
    case 'ADD_STEP':{const animation=find(d.animations,a.animationId);animation.steps.splice(Math.min(a.index??animation.steps.length,animation.steps.length),0,structuredClone(a.step));break;}
    case 'UPDATE_STEP':Object.assign(stepOf(d,a.animationId,a.stepId).step,structuredClone(a.changes));break;
    case 'MOVE_STEP':{const {animation,step}=stepOf(d,a.animationId,a.stepId);animation.steps=animation.steps.filter(s=>s!==step);animation.steps.splice(Math.min(a.index,animation.steps.length),0,step);break;}
    case 'DELETE_STEP':{
      const {animation,step}=stepOf(d,a.animationId,a.stepId);
      if(animation.steps.length===1)fail('EMPTY_ANIMATION','Una animación necesita al menos un paso. Eliminá la animación completa.');
      animation.steps=animation.steps.filter(s=>s!==step);for(const track of animation.tracks)track.clips=track.clips.filter(c=>c.stepId!==step.id);break;
    }
    case 'ADD_TRACK':find(d.animations,a.animationId).tracks.push(structuredClone(a.track));break;
    case 'UPDATE_TRACK':Object.assign(trackOf(d,a.animationId,a.trackId),a.changes);break;
    case 'DELETE_TRACK':{const animation=find(d.animations,a.animationId);find(animation.tracks,a.trackId);animation.tracks=animation.tracks.filter(t=>t.id!==a.trackId);break;}
    case 'ADD_TRACK_CLIP':trackOf(d,a.animationId,a.trackId).clips.push(structuredClone(a.clip));break;
    case 'UPDATE_TRACK_CLIP':Object.assign(find(trackOf(d,a.animationId,a.trackId).clips,a.clipId),structuredClone(a.changes));break;
    case 'DELETE_TRACK_CLIP':{const track=trackOf(d,a.animationId,a.trackId);find(track.clips,a.clipId);track.clips=track.clips.filter(c=>c.id!==a.clipId);break;}
    case 'ADD_SCENARIO':find(d.animations,a.animationId).scenarios.push(structuredClone(a.scenario));break;
    case 'UPDATE_SCENARIO':Object.assign(find(find(d.animations,a.animationId).scenarios,a.scenarioId),a.changes);break;
    case 'DELETE_SCENARIO':{
      const animation=find(d.animations,a.animationId);find(animation.scenarios,a.scenarioId);
      animation.scenarios=animation.scenarios.filter(s=>s.id!==a.scenarioId);
      // Los pasos exclusivos de la rama se van con ella; los compartidos sólo dejan de referirla.
      animation.steps=animation.steps.filter(s=>!(s.scenarioIds.length===1&&s.scenarioIds[0]===a.scenarioId));
      for(const s of animation.steps)s.scenarioIds=s.scenarioIds.filter(id=>id!==a.scenarioId);
      const kept=new Set(animation.steps.map(s=>s.id));for(const track of animation.tracks)track.clips=track.clips.filter(c=>kept.has(c.stepId));
      if(!animation.steps.length)fail('EMPTY_ANIMATION','Todos los pasos pertenecían a ese escenario. Eliminá la animación completa.');
      break;
    }
    case 'ADD_ASSET':inspectAsset(a.asset);d.assets.push(structuredClone(a.asset));break;
    case 'ADD_ANNOTATION':d.annotations.push(structuredClone(a.annotation));break;
    case 'UPDATE_ANNOTATION':Object.assign(find(d.annotations,a.id),a.changes);break;
    case 'DELETE_ANNOTATION':find(d.annotations,a.id);d.annotations=d.annotations.filter(x=>x.id!==a.id);break;
    case 'ALIGN_NODES':reposition(d,alignNodes(pick(d,a.ids),a.mode));break;
    case 'DISTRIBUTE_NODES':reposition(d,distributeNodes(pick(d,a.ids),a.axis));break;
    case 'ARRANGE_DOCUMENT':{
      // Reordena todo: nodos, zonas con sus miembros y rutas. Es la única acción de layout que mueve zonas.
      const box=d.nodes.length?{x:Math.min(...d.nodes.map(n=>n.position.x),...d.zones.map(z=>z.bounds.x)),y:Math.min(...d.nodes.map(n=>n.position.y),...d.zones.map(z=>z.bounds.y))}:{x:80,y:80};
      const {positions,zoneBounds}=arrangeBlocks(d.nodes,d.zones,d.edges,a.direction,box);
      for(const n of d.nodes)n.position=positions.get(n.id)!;
      for(const z of d.zones)z.bounds=zoneBounds.get(z.id)??z.bounds;
      for(const e of d.edges)delete e.points;
      break;
    }
    case 'LAYOUT_NODES':reposition(d,layeredLayout(pick(d,a.ids),d.edges,a.direction,a.gap));break;
  }
}

export function applyBatch(input:unknown,batchInput:unknown):DiagramDocument{
  const current=validateDocument(input),batch=BatchSchema.parse(batchInput);
  // La imagen de un ADD_ASSET se registra por su huella: el ledger no guarda una copia del archivo.
  const signature=canonical(batch.actions.map(a=>a.type==='ADD_ASSET'?{...a,asset:{...a.asset,data:digest(a.asset.data)}}:a));
  if(signature.length>150000)fail('BATCH_TOO_LARGE','Reducí el tamaño del lote.');
  const prior=current.appliedBatches.find(b=>b.id===batch.id);
  if(prior){if(prior.signature!==signature)fail('IDEMPOTENCY_CONFLICT','El ID del lote ya se usó con otro contenido.');return current;}
  if(current.revision!==batch.baseRevision)fail('REVISION_CONFLICT',`Esperada ${batch.baseRevision}; actual ${current.revision}. Volvé a leer el documento.`);
  const next=structuredClone(current);
  batch.actions.forEach((a,i)=>{
    try{mutate(next,a);}catch(e){if(e instanceof DiagramError)throw new DiagramError(e.code,batch.actions.length>1?`Acción ${i+1} (${a.type}): ${e.message}`:`${a.type}: ${e.message}`);throw e;}
  });
  pruneEmptyGroups(next);
  // Un asset vive mientras algún nodo lo use. Agregar uno sin usarlo en el mismo lote es un error, no una poda silenciosa.
  const used=new Set(next.nodes.map(n=>n.assetId)),known=new Set(current.assets.map(a=>a.id)),orphan=next.assets.find(a=>!used.has(a.id)&&!known.has(a.id));
  if(orphan)fail('UNUSED_ASSET',`El asset ${orphan.id} no lo usa ningún nodo. Agregalo junto con el nodo de imagen que lo refiere (assetId).`);
  next.assets=next.assets.filter(a=>used.has(a.id));
  next.revision++;next.appliedBatches=[...next.appliedBatches,{id:batch.id,signature}].slice(-100);
  return validateDocument(next);
}

const COLLECTIONS=['nodes','edges','drawings','zones','groups','frames','animations','assets','annotations'] as const;
/** Referencias de animación que un cambio dejó sin destino: las captions pueden necesitar revisión. */
export function prunedReferences(before:DiagramDocument,after:DiagramDocument){
  const alive=new Set([...after.nodes,...after.edges,...after.drawings,...after.frames].map(x=>x.id)),steps=new Set(after.animations.flatMap(a=>a.steps.map(s=>a.id+'/'+s.id)));
  return before.animations.flatMap(a=>[
    ...a.steps.filter(s=>steps.has(a.id+'/'+s.id)).map(s=>({animationId:a.id,stepId:s.id,caption:s.caption,removed:[...s.nodeIds,...s.edgeIds,...(s.frameId?[s.frameId]:[])].filter(id=>!alive.has(id))})),
    ...a.tracks.flatMap(t=>t.clips.filter(c=>steps.has(a.id+'/'+c.stepId)).map(c=>({animationId:a.id,stepId:`${t.id}/${c.id}`,caption:c.caption||t.label,removed:[...c.nodeIds,...c.edgeIds,...(c.frameId?[c.frameId]:[])].filter(id=>!alive.has(id))})))
  ]).filter(s=>s.removed.length);
}
export function previewBatch(doc:unknown,batch:unknown){
  const before=validateDocument(doc),after=applyBatch(before,batch);
  const changes=(key:typeof COLLECTIONS[number])=>{
    const old=new Map(before[key].map(n=>[n.id,canonical(n)])),fresh=new Map(after[key].map(n=>[n.id,canonical(n)]));
    return {added:[...fresh.keys()].filter(id=>!old.has(id)),removed:[...old.keys()].filter(id=>!fresh.has(id)),updated:[...fresh.keys()].filter(id=>old.has(id)&&old.get(id)!==fresh.get(id))};
  };
  return {beforeRevision:before.revision,afterRevision:after.revision,changes:Object.fromEntries(COLLECTIONS.map(key=>[key,changes(key)]))as Record<typeof COLLECTIONS[number],ReturnType<typeof changes>>,prunedReferences:prunedReferences(before,after),document:after};
}

/** Ancestro más externo del grupo de un nodo, o null si no está agrupado. */
export function rootGroupId(d:DiagramDocument,nodeId:string):string|null{
  const byId=new Map(d.groups.map(g=>[g.id,g]));let id=d.nodes.find(n=>n.id===nodeId)?.groupId??d.drawings.find(n=>n.id===nodeId)?.groupId??null;
  for(let hops=0;id&&byId.get(id)?.parentId&&hops<600;hops++)id=byId.get(id)!.parentId;
  return id;
}
/** Nodos de un grupo y de todos sus subgrupos. */
export function groupMembers(d:DiagramDocument,groupId:string):string[]{
  const inside=new Set([groupId]);
  for(let grew=true;grew;){grew=false;for(const g of d.groups)if(g.parentId&&inside.has(g.parentId)&&!inside.has(g.id)){inside.add(g.id);grew=true;}}
  return [...d.nodes,...d.drawings].filter(n=>n.groupId&&inside.has(n.groupId)).map(n=>n.id);
}

type ContextOptions={scope?:'document'|'selection';maxElements?:number};
/**
 * Contexto para una IA. `selection` devuelve los elementos elegidos, sus vecinos directos y sus zonas,
 * con un resumen de lo que quedó afuera; `maxElements` acota el tamaño de la respuesta.
 */
export function getContext(input:unknown,selectedIds:string[]=[],options:ContextOptions={}){
  const d=validateDocument(input),known=new Set([...d.nodes,...d.zones,...d.edges,...d.drawings,...d.groups,...d.frames].map(x=>x.id));
  if(selectedIds.some(id=>!known.has(id)))fail('INVALID_SELECTION','La selección contiene IDs desconocidos.');
  // Las imágenes se describen, no se envían: su contenido no aporta a una IA de texto y agotaría el presupuesto.
  const assets=d.assets.map(({data,...asset})=>({...asset,bytes:assetBytes(data)}));
  const base={schemaVersion:d.schemaVersion,documentId:d.id,title:d.title,revision:d.revision,selectedIds,assets};
  const total={nodes:d.nodes.length,edges:d.edges.length,drawings:d.drawings.length,zones:d.zones.length,groups:d.groups.length,frames:d.frames.length,animations:d.animations.length};
  if(options.scope!=='selection'||!selectedIds.length){
    const max=options.maxElements;
    if(max===undefined||d.nodes.length+d.edges.length+d.drawings.length<=max)return {...base,scope:'document' as const,truncated:false,total,nodes:d.nodes,edges:d.edges,drawings:d.drawings,zones:d.zones,groups:d.groups,frames:d.frames,animations:d.animations,annotations:d.annotations};
    const nodes=d.nodes.slice(0,Math.ceil(max/2)),ids=new Set(nodes.map(n=>n.id));
    return {...base,scope:'document' as const,truncated:true,total,nodes,edges:d.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).slice(0,Math.floor(max/2)),drawings:d.drawings.slice(0,Math.max(0,max-nodes.length)),zones:d.zones,groups:d.groups,frames:d.frames,animations:d.animations.map(a=>({id:a.id,label:a.label,steps:a.steps.length})),annotations:d.annotations.filter(note=>!note.targetId||ids.has(note.targetId))};
  }
  const picked=new Set(selectedIds),nodeIds=new Set<string>();
  for(const group of d.groups)if(picked.has(group.id))for(const id of groupMembers(d,group.id))picked.add(id);
  for(const n of d.nodes)if(picked.has(n.id)||(n.zoneId&&picked.has(n.zoneId))||(n.groupId&&picked.has(n.groupId)))nodeIds.add(n.id);
  for(const e of d.edges)if(picked.has(e.id)){nodeIds.add(e.from);nodeIds.add(e.to);}
  const focus=new Set(nodeIds),edges=d.edges.filter(e=>picked.has(e.id)||focus.has(e.from)||focus.has(e.to));
  for(const e of edges){nodeIds.add(e.from);nodeIds.add(e.to);}
  let nodes=d.nodes.filter(n=>nodeIds.has(n.id));const limit=options.maxElements;
  // Con presupuesto ajustado, el foco se conserva y se recortan primero los vecinos.
  const truncated=limit!==undefined&&nodes.length>limit;
  if(truncated)nodes=[...nodes.filter(n=>focus.has(n.id)),...nodes.filter(n=>!focus.has(n.id))].slice(0,Math.max(limit!,focus.size));
  const kept=new Set(nodes.map(n=>n.id)),zoneIds=new Set([...nodes.map(n=>n.zoneId),...selectedIds]);
  return {...base,scope:'selection' as const,truncated,total,
    drawings:d.drawings.filter(drawing=>picked.has(drawing.id)),
    focusNodeIds:[...focus],nodes,edges:edges.filter(e=>kept.has(e.from)&&kept.has(e.to)),
    zones:d.zones.filter(z=>zoneIds.has(z.id)),groups:d.groups.filter(g=>picked.has(g.id)||nodes.some(n=>n.groupId===g.id)||d.drawings.some(n=>picked.has(n.id)&&n.groupId===g.id)),frames:d.frames.filter(f=>picked.has(f.id)),
    // Las zonas fuera del foco se listan por ID y label para que la IA pueda nombrarlas sin adivinar entre homónimas.
    otherZones:d.zones.filter(z=>!zoneIds.has(z.id)).map(z=>({id:z.id,label:z.label})),
    animations:d.animations.map(a=>({id:a.id,label:a.label,steps:a.steps.length})),
    annotations:d.annotations.filter(note=>note.targetId&&(kept.has(note.targetId)||picked.has(note.targetId)||zoneIds.has(note.targetId)))};
}

/**
 * Rama de una animación: los pasos comunes más los propios del escenario, en su orden original.
 * Sin escenario (o con uno inexistente) se devuelven todos los pasos. Es determinista: no evalúa ni ejecuta nada.
 */
export function resolveScenario(animation:DiagramAnimation,scenarioId:string|null|undefined):DiagramAnimation{
  if(!scenarioId||!animation.scenarios.some(s=>s.id===scenarioId))return animation;
  const steps=animation.steps.filter(s=>!s.scenarioIds.length||s.scenarioIds.includes(scenarioId)),kept=new Set(steps.map(s=>s.id));
  return {...animation,steps,tracks:animation.tracks.map(t=>({...t,clips:t.clips.filter(c=>kept.has(c.stepId))}))};
}
/** Efectos de todas las pistas que comparten el paso actual. El orden de pistas decide el último encuadre. */
export function sampleTrackEffects(animation:DiagramAnimation,timeMs:number){
  const {step}=sampleAnimation(animation,timeMs),active=animation.tracks.flatMap(track=>track.clips.filter(clip=>clip.stepId===step.id).map(clip=>({track,clip})));
  return {nodeIds:active.filter(x=>x.track.kind==='highlight').flatMap(x=>x.clip.nodeIds),edgeIds:active.filter(x=>x.track.kind==='highlight').flatMap(x=>x.clip.edgeIds),captions:active.filter(x=>x.track.kind==='caption'&&x.clip.caption).map(x=>x.clip.caption),frameId:active.filter(x=>x.track.kind==='camera'&&x.clip.frameId).at(-1)?.clip.frameId??null};
}
/** Estado visible de cada nodo al llegar al paso `index` (inclusive): gana la última asignación del recorrido. */
export function statesAt(animation:DiagramAnimation,index:number){
  const states=new Map<string,{label:string;tone:'normal'|'failure'}>();
  for(const step of animation.steps.slice(0,index+1))for(const state of step.states)states.set(state.nodeId,{label:state.label,tone:state.tone});
  return states;
}

export function animationDuration(animation:DiagramDocument['animations'][number]){return animation.steps.reduce((sum,s)=>sum+s.durationMs,0);}
/** Momento de inicio de cada paso; el seek a ese valor cae exactamente en el paso. */
export function stepStarts(animation:DiagramDocument['animations'][number]){let elapsed=0;return animation.steps.map(s=>{const start=elapsed;elapsed+=s.durationMs;return start;});}
export function sampleAnimation(animation:DiagramDocument['animations'][number],timeMs:number){
  const duration=animationDuration(animation);const t=Math.max(0,Math.min(duration,timeMs));let elapsed=0;
  for(let i=0;i<animation.steps.length;i++){const step=animation.steps[i];if(t<elapsed+step.durationMs||i===animation.steps.length-1)return {step,index:i,progress:Math.max(0,Math.min(1,(t-elapsed)/step.durationMs)),duration};elapsed+=step.durationMs;}
  throw new Error('Animation without steps');
}
