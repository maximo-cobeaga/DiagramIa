import {SaxesParser} from 'saxes';
import {DiagramError,EdgeSchema,NodeSchema,SCHEMA_VERSION,ZoneSchema,validateDocument,type DiagramDocument,type DiagramNode} from '@diagramia/core';
import type {InteropReport} from './mermaid.js';

type Cell={id:string;value:string;style:string;parent:string;vertex:boolean;edge:boolean;source:string;target:string;geometry?:{x:number;y:number;width:number;height:number}};
const invalid=(reason:string):never=>{throw new DiagramError('INVALID_DRAWIO',reason);};
const MAX_XML=500_000;
const xmlEscape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const finite=(raw:string|undefined,fallback:number)=>{const value=Number(raw);return raw!==undefined&&Number.isFinite(value)?value:fallback;};
const attrs=(tag:{attributes:Record<string,unknown>})=>Object.fromEntries(Object.entries(tag.attributes).map(([key,value])=>[key,String(value)]))as Record<string,string>;
const plain=(value:string)=>value.replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const idFor=(raw:string,taken:Set<string>,report:InteropReport):string=>{
  const base=(raw.replace(/[^A-Za-z0-9_-]/g,'_').replace(/^_+/,'x_').slice(0,70)||'item');
  let id=base;
  for(let n=2;taken.has(id);n++)id=`${base.slice(0,72)}_${n}`;
  if(id!==raw)report.notes.push(`ID «${raw}» convertido a «${id}».`);
  taken.add(id);return id;
};

async function decompress(encoded:string):Promise<string>{
  if(encoded.length>MAX_XML)invalid('La página comprimida supera el límite de entrada.');
  let binary:Uint8Array;
  try{binary=Uint8Array.from(atob(encoded.trim()),c=>c.charCodeAt(0));}catch{return invalid('La página no contiene base64 válido.');}
  let stream:ReadableStream<Uint8Array>;
  try{stream=new Blob([binary! as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
  catch{return invalid('El entorno no puede descomprimir esta página draw.io.');}
  const reader=stream!.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_XML){await reader.cancel();invalid('La página descomprimida supera 500 KB.');}chunks.push(value);}
  }catch(error){if(error instanceof DiagramError)throw error;return invalid('La página draw.io comprimida es inválida.');}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return decodeURIComponent(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return invalid('La página draw.io contiene texto comprimido inválido.');}
}

function parseXml(source:string):{cells:Cell[];compressed:string|null;pages:number}{
  if(source.length>MAX_XML)invalid('El XML draw.io supera 500 KB.');
  // No aceptamos DTD ni declaraciones de entidades. El parser SAX no resuelve recursos externos.
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))invalid('DOCTYPE y entidades XML están prohibidos.');
  const parser=new SaxesParser(),cells:Cell[]=[],stack:string[]=[];
  let current:Cell|null=null,modelDepth=0,pages=0,compressed='',insideDiagram=false,root='';
  parser.on('doctype',()=>invalid('DOCTYPE está prohibido.'));
  parser.on('opentag',tag=>{
    stack.push(tag.name);if(stack.length>30)invalid('El XML draw.io excede la profundidad permitida.');
    if(stack.length===1)root=tag.name;
    if(tag.name==='diagram'){pages++;insideDiagram=true;}
    if(tag.name==='mxGraphModel'){if(modelDepth===0&&pages<=1)modelDepth=stack.length;}
    if(modelDepth&&pages<=1&&tag.name==='mxCell'){
      if(cells.length>=8000)invalid('El XML draw.io tiene demasiadas celdas.');
      const a=attrs(tag);current={id:a.id??'',value:a.value??'',style:a.style??'',parent:a.parent??'',vertex:a.vertex==='1',edge:a.edge==='1',source:a.source??'',target:a.target??''};
      cells.push(current);
    }
    if(current&&tag.name==='mxGeometry'){
      const a=attrs(tag);current.geometry={x:finite(a.x,0),y:finite(a.y,0),width:finite(a.width,160),height:finite(a.height,80)};
    }
  });
  parser.on('text',text=>{if(insideDiagram&&pages===1&&!modelDepth)compressed+=text;});
  parser.on('closetag',tag=>{
    if(tag.name==='mxCell')current=null;
    if(tag.name==='mxGraphModel'&&stack.length===modelDepth)modelDepth=0;
    if(tag.name==='diagram')insideDiagram=false;
    stack.pop();
  });
  try{parser.write(source).close();}catch(error){if(error instanceof DiagramError)throw error;invalid(`XML draw.io inválido: ${error instanceof Error?error.message:String(error)}`);}
  if(root!=='mxfile'&&root!=='mxGraphModel')invalid('Se esperaba un mxfile o mxGraphModel.');
  return {cells,compressed:cells.length?null:compressed.trim()||null,pages};
}

/** Importa la primera página de draw.io, comprimida o XML plano, sin ejecutar HTML ni resolver entidades. */
export async function importDrawio(source:string,options:{id?:string;title?:string}={}):Promise<{document:DiagramDocument;report:InteropReport}>{
  const report:InteropReport={unsupported:[],notes:[]};
  let parsed=parseXml(source);
  if(!parsed.cells.length&&parsed.compressed){parsed=parseXml(await decompress(parsed.compressed));report.notes.push('Se descomprimió la primera página draw.io.');}
  if(parsed.pages>1)report.unsupported.push({line:0,text:'Páginas adicionales',reason:`${parsed.pages-1} páginas adicionales no se importan.`});
  const {cells}=parsed;if(!cells.length)invalid('No se encontraron celdas editables en la primera página.');
  const byRaw=new Map(cells.map(cell=>[cell.id,cell])),taken=new Set<string>();
  const ancestors=(cell:Cell)=>{
    const seen=new Set([cell.id]),parents:Cell[]=[];let parent=cell.parent;
    while(parent&&parent!=='0'&&parent!=='1'){
      if(seen.has(parent))invalid(`Jerarquía circular en la celda ${cell.id}.`);
      seen.add(parent);const item=byRaw.get(parent);if(!item)break;parents.push(item);parent=item.parent;
      if(parents.length>30)invalid('Jerarquía de celdas demasiado profunda.');
    }
    return parents;
  };
  const absolute=(cell:Cell)=>{
    const g=cell.geometry??{x:0,y:0,width:160,height:80},parents=ancestors(cell);
    return {x:g.x+parents.reduce((sum,p)=>sum+(p.geometry?.x??0),0),y:g.y+parents.reduce((sum,p)=>sum+(p.geometry?.y??0),0)};
  };
  const zoneCells=cells.filter(c=>c.vertex&&/(?:^|;)(?:swimlane|container)(?:=1)?(?:;|$)/.test(c.style));
  const zones=zoneCells.map(c=>{
    const id=idFor(c.id,taken,report),g=c.geometry??{x:0,y:0,width:300,height:200},at=absolute(c);
    if(!c.geometry)report.notes.push(`Zona «${c.id}» sin geometría: se usó una caja básica.`);
    return ZoneSchema.parse({id,label:plain(c.value).slice(0,200)||id,bounds:{x:at.x,y:at.y,width:Math.max(100,g.width),height:Math.max(100,g.height)}});
  });
  const zoneIds=new Map(zoneCells.map((c,i)=>[c.id,zones[i]!.id]));
  const nodeCells=cells.filter(c=>c.vertex&&!zoneIds.has(c.id));
  const nodeIds=new Map<string,string>();
  const nodes=nodeCells.map(c=>{
    const id=idFor(c.id,taken,report);nodeIds.set(c.id,id);
    const g=c.geometry??{x:0,y:0,width:160,height:80},style=c.style;
    if(!c.geometry)report.notes.push(`Nodo «${c.id}» sin geometría: se usó una caja básica.`);
    let kind:DiagramNode['kind']='service';
    if(/(?:^|;)shape=(?:cylinder|database)(?:;|$)/.test(style))kind='database';
    else if(/(?:^|;)shape=rhombus(?:;|$)/.test(style))kind='decision';
    else if(/(?:^|;)shape=actor(?:;|$)/.test(style))kind='actor';
    else if(/(?:^|;)shape=note(?:;|$)/.test(style))kind='note';
    const parents=ancestors(c),zoneId=parents.map(parent=>zoneIds.get(parent.id)).find(Boolean)??null,at=absolute(c);
    if(c.parent&&c.parent!=='1'&&c.parent!=='0'&&!byRaw.has(c.parent))report.unsupported.push({line:0,text:c.id,reason:'Celda con padre inexistente; se usó posición local.'});
    if(parents.some(parent=>parent.vertex&&!zoneIds.has(parent.id)))report.unsupported.push({line:0,text:c.id,reason:'Grupo padre aplanado; sólo se conserva la posición absoluta.'});
    return NodeSchema.parse({id,kind,label:plain(c.value).slice(0,200)||id,zoneId,position:at,size:{width:Math.max(24,g.width),height:Math.max(24,g.height)}});
  });
  const edges=cells.filter(c=>c.edge).flatMap(c=>{
    const from=nodeIds.get(c.source),to=nodeIds.get(c.target);
    if(!from||!to){report.unsupported.push({line:0,text:c.id,reason:'Conexión sin dos nodos importados.'});return [];}
    const id=idFor(c.id,taken,report);
    return [EdgeSchema.parse({id,from,to,label:plain(c.value).slice(0,160)})];
  });
  for(const c of cells)if(!c.vertex&&!c.edge&&c.id!=='0'&&c.id!=='1')report.unsupported.push({line:0,text:c.id,reason:'Celda no reconocida.'});
  if(!nodes.length)invalid('No se encontraron nodos para importar.');
  const document=validateDocument({schemaVersion:SCHEMA_VERSION,id:options.id??'imported',title:options.title??'Diagrama draw.io',revision:0,nodes,edges,zones,groups:[],frames:[],animations:[],assets:[],annotations:[],appliedBatches:[]});
  report.notes.push('Se importan nodos, zonas, conexiones y geometría de la primera página; estilos avanzados, grupos y rutas no se conservan.');
  return {document,report};
}

/** XML draw.io plano: conserva IDs, labels, endpoints, zonas y geometría del subset. */
export function exportDrawio(d:DiagramDocument):{text:string;report:InteropReport}{
  const doc=validateDocument(d),report:InteropReport={unsupported:[],notes:['Se exporta una página XML sin compresión. Los estilos avanzados y las rutas manuales se simplifican.']};
  const out=['<mxfile host="Diagramia" compressed="false"><diagram id="page-1" name="Página 1"><mxGraphModel><root>','<mxCell id="0"/>','<mxCell id="1" parent="0"/>'];
  for(const z of doc.zones)out.push(`<mxCell id="${xmlEscape(z.id)}" value="${xmlEscape(z.label)}" style="swimlane=1;html=0;" vertex="1" parent="1"><mxGeometry x="${z.bounds.x}" y="${z.bounds.y}" width="${z.bounds.width}" height="${z.bounds.height}" as="geometry"/></mxCell>`);
  const shape:Record<string,string>={database:'cylinder',decision:'rhombus',actor:'actor',note:'note'};
  for(const n of doc.nodes){
    const z=doc.zones.find(zone=>zone.id===n.zoneId),x=n.position.x-(z?.bounds.x??0),y=n.position.y-(z?.bounds.y??0);
    out.push(`<mxCell id="${xmlEscape(n.id)}" value="${xmlEscape(n.label)}" style="${shape[n.kind]?`shape=${shape[n.kind]};`:''}html=0;" vertex="1" parent="${xmlEscape(z?.id??'1')}"><mxGeometry x="${x}" y="${y}" width="${n.size.width}" height="${n.size.height}" as="geometry"/></mxCell>`);
  }
  for(const e of doc.edges)out.push(`<mxCell id="${xmlEscape(e.id)}" value="${xmlEscape(e.label)}" style="edgeStyle=orthogonalEdgeStyle;html=0;" edge="1" source="${xmlEscape(e.from)}" target="${xmlEscape(e.to)}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  out.push('</root></mxGraphModel></diagram></mxfile>');
  for(const [count,what] of [[doc.animations.length,'animaciones'],[doc.frames.length,'frames'],[doc.groups.length,'grupos'],[doc.drawings.length,'trazos libres'],[doc.assets.length,'imágenes'],[doc.annotations.length,'anotaciones']]as const)if(count)report.unsupported.push({line:0,text:what,reason:`${count} ${what} no se exportan a draw.io.`});
  return {text:out.join('\n')+'\n',report};
}
