import {BatchSchema,type Action,type ActionBatch,type DiagramDocument,type DiagramNode,type DiagramZone} from './schema.js';
import {applyBatch,findZoneByLabel,validateDocument} from './engine.js';
import {DiagramError} from './errors.js';
import {contains,inflate,nodeRect,nodeVisualRect,overlaps,routeAll,segmentHitsRect,unionRects,type Point,type Rect} from './geometry.js';
import {arrangeBlocks} from './layout.js';
import {edgeLabelLayout,fitSize,shapeOf,textWidth} from './text.js';

export type IssueType='node-overlap'|'zone-intrusion'|'zone-label'|'zone-overlap'|'text-overflow'|'edge-through-node'|'label-overlap';
export type Issue={type:IssueType;ids:string[];message:string};
const GAP=16,LABEL_STRIP=40,SIZE_TOLERANCE=12;
// Superposiciones que el ordenador debe resolver sí o sí; el resto son avisos sobre flechas y etiquetas.
const BLOCKING:ReadonlySet<IssueType>=new Set(['node-overlap','zone-intrusion','zone-label','zone-overlap','text-overflow']);

/**
 * Todo lo que se pisa en un documento: nodos entre sí, nodos sobre zonas ajenas o sobre el título de su zona, zonas entre sí,
 * texto que no entra en su nodo, conexiones que atraviesan nodos y etiquetas tapadas. Los frames no cuentan: existen para superponerse.
 */
export function findOverlaps(d:DiagramDocument):Issue[]{
  const issues:Issue[]=[],rects=d.nodes.map(n=>({n,r:nodeVisualRect(n)}));
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(overlaps(rects[i].r,rects[j].r))issues.push({type:'node-overlap',ids:[rects[i].n.id,rects[j].n.id],message:`«${rects[i].n.label}» y «${rects[j].n.label}» se superponen.`});
  for(const zone of d.zones)for(const {n,r} of rects){
    // El título ocupa la esquina superior izquierda de la zona, no toda la franja.
    const title={x:zone.bounds.x+8,y:zone.bounds.y+6,width:textWidth(zone.label,12,true)+20,height:28};
    if(n.zoneId===zone.id){if(overlaps(r,title))issues.push({type:'zone-label',ids:[n.id,zone.id],message:`«${n.label}» tapa el título de la zona «${zone.label}».`});}
    else if(overlaps(r,zone.bounds))issues.push({type:'zone-intrusion',ids:[n.id,zone.id],message:`«${n.label}» pisa la zona «${zone.label}» sin pertenecer a ella.`});
  }
  for(let i=0;i<d.zones.length;i++)for(let j=i+1;j<d.zones.length;j++){
    const a=d.zones[i].bounds,b=d.zones[j].bounds;
    if(overlaps(a,b)&&!contains(a,b)&&!contains(b,a))issues.push({type:'zone-overlap',ids:[d.zones[i].id,d.zones[j].id],message:`Las zonas «${d.zones[i].label}» y «${d.zones[j].label}» se superponen.`});
  }
  for(const {n} of rects){
    const need=fitSize(n);
    if(need.width>n.size.width+SIZE_TOLERANCE||need.height>n.size.height+SIZE_TOLERANCE)issues.push({type:'text-overflow',ids:[n.id],message:`El texto de «${n.label}» no entra en su tamaño.`});
  }
  const routes=routeAll(d);
  for(const e of d.edges){
    const routed=routes.get(e.id);if(!routed)continue;
    const through=rects.filter(({n,r})=>n.id!==e.from&&n.id!==e.to&&shapeOf(n)!=='text'&&routed.points.slice(1).some((p,i)=>segmentHitsRect(routed.points[i],p,{x:r.x+1,y:r.y+1,width:r.width-2,height:r.height-2})));
    if(through.length)issues.push({type:'edge-through-node',ids:[e.id,...through.map(t=>t.n.id)],message:`La conexión ${e.from} → ${e.to} pasa por encima de «${through[0].n.label}».`});
    if(e.label&&routed.label){
      const {width,height}=edgeLabelLayout(e.label,e.style.fontSize??11);
      const box={x:routed.label.x-width/2,y:routed.label.y-height+3,width,height},hit=rects.find(({r})=>overlaps(r,box));
      if(hit)issues.push({type:'label-overlap',ids:[e.id,hit.n.id],message:`La etiqueta «${e.label}» queda sobre «${hit.n.label}».`});
    }
  }
  return issues;
}

const interior=(zone:DiagramZone):Rect=>({x:zone.bounds.x+GAP,y:zone.bounds.y+LABEL_STRIP+4,width:zone.bounds.width-GAP*2,height:zone.bounds.height-LABEL_STRIP-4-GAP});
function conflicts(d:DiagramDocument,n:DiagramNode,rect=nodeVisualRect(n),gap=GAP):boolean{
  if(d.nodes.some(o=>o.id!==n.id&&overlaps(inflate(rect,gap),nodeVisualRect(o))))return true;
  const zone=n.zoneId?d.zones.find(z=>z.id===n.zoneId):undefined;
  if(zone&&!contains(interior(zone),rect))return true;
  // Una zona que contiene a la zona del nodo (zonas anidadas) no es ajena.
  return d.zones.some(z=>z.id!==n.zoneId&&!(zone&&contains(z.bounds,zone.bounds))&&overlaps(inflate(rect,gap/2),z.bounds));
}
/** Lugar libre más cercano a la posición actual del nodo, buscando en anillos crecientes. null si su zona no tiene lugar. */
function freeSpot(d:DiagramDocument,n:DiagramNode):Point|null{
  const step=24,origin=n.position;
  for(let ring=1;ring<=90;ring++){
    // Orden fijo dentro del anillo: derecha, abajo, izquierda, arriba y después las diagonales.
    const candidates:Point[]=[];
    for(let k=-ring;k<=ring;k++)candidates.push({x:ring,y:k},{x:k,y:ring},{x:-ring,y:k},{x:k,y:-ring});
    candidates.sort((p,q)=>Math.abs(p.x)+Math.abs(p.y)-Math.abs(q.x)-Math.abs(q.y)||q.x-p.x||q.y-p.y);
    for(const c of candidates){
      const position={x:origin.x+c.x*step,y:origin.y+c.y*step};
      if(!conflicts(d,n,nodeVisualRect({...n,position})))return position;
    }
  }
  return null;
}

/**
 * Deja un lote sin superposiciones antes de mostrarlo o aplicarlo: agranda nodos cuyo texto no entra, corre los nodos nuevos o
 * movidos a un lugar libre, agranda su zona si hace falta y, si el lote crea un diagrama, lo ordena completo.
 * Las acciones originales se conservan en su orden; las correcciones se agregan al final. No mueve lo que el lote no tocó,
 * salvo como último recurso (y lo informa en `notes`).
 */
export function tidyBatch(docInput:unknown,batchInput:unknown):{batch:ActionBatch;notes:string[];issues:Issue[]}{
  const doc=validateDocument(docInput),original=BatchSchema.parse(batchInput),notes:string[]=[];
  // Una IA suele declarar la zona de un nodo nuevo sin darle una posición que caiga adentro. Para poder simular el lote,
  // el nodo entra libre y su pertenencia se restituye al final, ya ubicado.
  const wanted=new Map<string,string>();
  // Lo mismo con `placement.inside`: se conserva la referencia (debajo de, a la derecha de…) y la zona se resuelve después,
  // agrandándola si hace falta, en vez de fallar porque hoy no hay lugar.
  const batch={...original,actions:original.actions.map(a=>{
    if(a.type!=='ADD_NODE')return a;
    if(a.placement&&(a.placement.inside||a.placement.insideLabel)){
      const {inside,insideLabel,...placement}=a.placement;
      wanted.set(a.node.id,inside??findZoneByLabel(doc,insideLabel!).id);
      return {...a,node:{...a.node,zoneId:null},placement};
    }
    if(!a.node.zoneId||a.placement)return a;
    wanted.set(a.node.id,a.node.zoneId);
    return {...a,node:{...a.node,zoneId:null}};
  })};
  const after=applyBatch(doc,batch),before=new Map(doc.nodes.map(n=>[n.id,n])),oldZones=new Set(doc.zones.map(z=>z.id));
  for(const [id,zoneId] of wanted)if(!after.zones.some(z=>z.id===zoneId))throw new DiagramError('DANGLING_ZONE',`Zona de ${id} inexistente.`);
  const added=after.nodes.filter(n=>!before.has(n.id)),touched=after.nodes.filter(n=>{const o=before.get(n.id);return o&&(o.position.x!==n.position.x||o.position.y!==n.position.y||o.size.width!==n.size.width||o.size.height!==n.size.height||o.label!==n.label||o.subtitle!==n.subtitle||o.details!==n.details||o.zoneId!==n.zoneId||o.shape!==n.shape||o.icon!==n.icon||o.assetId!==n.assetId||o.style.fontSize!==n.style.fontSize||o.style.iconSize!==n.style.iconSize);});
  const movable=new Set([...added,...touched].map(n=>n.id)),work=structuredClone(after);
  const node=(id:string)=>work.nodes.find(n=>n.id===id)!;
  for(const [id,zoneId] of wanted)node(id).zoneId=zoneId;
  const membership:Action[]=[...wanted].map(([id,zoneId])=>({type:'UPDATE_NODE',id,changes:{zoneId}}));
  // 1. El texto tiene que entrar en su nodo.
  const sizes:Action[]=[];
  for(const id of movable){
    const n=node(id),need=fitSize(n);
    if(need.width<=n.size.width&&need.height<=n.size.height)continue;
    n.size={width:Math.max(n.size.width,need.width),height:Math.max(n.size.height,need.height)};
    sizes.push({type:'RESIZE_NODE',id,size:n.size});
  }
  const finish=(fixes:Action[])=>{
    const actions=[...batch.actions,...fixes];
    if(actions.length>200)throw new DiagramError('TIDY_LIMIT',`La propuesta necesita ${actions.length} acciones para evitar superposiciones; el máximo por lote es 200. Dividí el pedido en partes más chicas.`);
    const tidy={...batch,actions},result=applyBatch(doc,tidy);
    return {tidy,result,issues:findOverlaps(result)};
  };
  const everything=()=>finish([...sizes,...membership,{type:'ARRANGE_DOCUMENT',direction:'right'}]);
  // 2. Un lote que arma un diagrama desde cero se ordena completo.
  const newZones=work.zones.filter(z=>!oldZones.has(z.id));
  if(added.length&&doc.nodes.length===0){const out=everything();return {batch:out.tidy,notes,issues:out.issues};}
  const fixes:Action[]=[...sizes];
  if(added.length>=4&&added.length>=doc.nodes.length){
    // El bloque nuevo (nodos libres y zonas nuevas con sus nodos) va ordenado debajo del contenido existente.
    const fresh=new Set(newZones.map(z=>z.id)),block=added.map(n=>node(n.id)).filter(n=>!n.zoneId||fresh.has(n.zoneId)),existing=unionRects([...doc.nodes.map(nodeRect),...doc.zones.map(z=>z.bounds)])!;
    const {positions,zoneBounds}=arrangeBlocks(block,newZones,work.edges,'right',{x:existing.x,y:existing.y+existing.height+96});
    for(const z of newZones){const bounds=zoneBounds.get(z.id)!;work.zones.find(w=>w.id===z.id)!.bounds=bounds;fixes.push({type:'UPDATE_ZONE',id:z.id,changes:{bounds}});}
    for(const n of block){n.position=positions.get(n.id)!;fixes.push({type:'MOVE_NODE',id:n.id,position:n.position});}
  }
  // 3. Cada nodo nuevo o movido que pisa algo se corre al lugar libre más cercano; si su zona está llena, la zona crece.
  for(const id of movable){
    const n=node(id),old=before.get(id),zone=n.zoneId?work.zones.find(z=>z.id===n.zoneId):undefined;
    // Un nodo existente sólo se corre si el lote lo dejó pisando algo; lo que ya estaba así no se toca.
    if(old?!conflicts(work,n,nodeRect(n),0)||conflicts(doc,old,nodeRect(old),0):!conflicts(work,n))continue;
    // Un nodo que quedó lejos de su zona empieza a buscar lugar desde adentro de ella.
    if(zone&&!overlaps(zone.bounds,nodeRect(n)))n.position={x:zone.bounds.x+GAP*2,y:zone.bounds.y+LABEL_STRIP+8};
    const spot=conflicts(work,n)?freeSpot(work,n):n.position;
    if(spot){n.position=spot;fixes.push({type:'MOVE_NODE',id,position:spot});continue;}
    if(!zone)continue;
    const members=work.nodes.filter(m=>m.zoneId===zone.id&&m.id!==id),floor=Math.max(zone.bounds.y+LABEL_STRIP+8,...members.map(m=>m.position.y+m.size.height+GAP*2));
    const grown={...zone.bounds,width:Math.max(zone.bounds.width,n.size.width+GAP*4),height:Math.max(zone.bounds.height,floor+n.size.height+GAP*2-zone.bounds.y)};
    if(work.nodes.some(o=>o.zoneId!==zone.id&&overlaps(nodeRect(o),grown))||work.zones.some(z=>z.id!==zone.id&&overlaps(z.bounds,grown)&&!contains(grown,z.bounds)&&!contains(z.bounds,grown)))continue;
    zone.bounds=grown;n.position={x:zone.bounds.x+GAP*2,y:floor};
    fixes.push({type:'UPDATE_ZONE',id:zone.id,changes:{bounds:grown}},{type:'MOVE_NODE',id,position:n.position});
    notes.push(`Se agrandó la zona «${zone.label}» para que entre «${n.label}».`);
  }
  // 4. Si algo quedó pisado (o el resultado ni siquiera es válido), reordenar todo garantiza que nada se superponga.
  const mine=(issue:Issue)=>BLOCKING.has(issue.type)&&issue.ids.some(id=>movable.has(id)||newZones.some(z=>z.id===id));
  let out:ReturnType<typeof finish>|null=null;
  try{out=finish([...fixes,...membership]);}catch(error){if(!(error instanceof DiagramError))throw error;}
  if(!out||out.issues.some(mine)){
    out=everything();
    notes.push('No había lugar libre cerca: se reordenó todo el diagrama para que nada se superponga.');
  }
  return {batch:out.tidy,notes,issues:out.issues};
}
