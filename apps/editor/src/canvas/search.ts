import type {DiagramDocument} from '@diagramia/core';
import {KIND_LABELS} from '../ui';

export type CanvasResult={id:string;label:string;kind:string;context:string;labelKey:string;textKey:string};
const normalize=(text:string)=>text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();

/** Índice derivado del documento canónico. Sólo vive en memoria; no persiste consultas ni envía contenido. */
export function canvasIndex(doc:DiagramDocument):CanvasResult[]{
  const zones=new Map(doc.zones.map(z=>[z.id,z.label])),groups=new Map(doc.groups.map(g=>[g.id,g.label||'Grupo sin nombre'])),nodes=new Map(doc.nodes.map(n=>[n.id,n.label]));
  const result=(id:string,label:string,kind:string,context='',details=''):CanvasResult=>({id,label,kind,context,labelKey:normalize(label),textKey:normalize([label,kind,context,details].join(' '))});
  return [
    ...doc.nodes.map(n=>result(n.id,n.label,n.kind==='image'?'Imagen':KIND_LABELS[n.kind],[zones.get(n.zoneId??''),groups.get(n.groupId??''),n.subtitle].filter(Boolean).join(' · '),n.details)),
    ...doc.zones.map(z=>result(z.id,z.label,'Zona')),
    ...doc.groups.map(g=>result(g.id,g.label||'Grupo sin nombre','Grupo',groups.get(g.parentId??'')??'')),
    ...doc.frames.map(f=>result(f.id,f.label,'Encuadre')),
    ...doc.edges.map(e=>{const endpoints=`${nodes.get(e.from)??e.from} → ${nodes.get(e.to)??e.to}`;return result(e.id,e.label||endpoints,'Conexión',endpoints);}),
    ...doc.drawings.map(d=>result(d.id,d.kind==='line'?'Línea libre':d.kind==='arrow'?'Flecha libre':'Trazo de lápiz','Dibujo',groups.get(d.groupId??'')??''))
  ];
}

/** Todas las palabras deben coincidir; nombres exactos y prefijos aparecen antes que detalles. */
export function findCanvas(index:CanvasResult[],query:string):CanvasResult[]{
  const key=normalize(query),words=key.split(' ').filter(Boolean);
  if(!words.length)return index;
  const rank=(item:CanvasResult)=>item.labelKey===key?0:item.labelKey.startsWith(key)?1:words.every(word=>item.labelKey.includes(word))?2:3;
  return index.filter(item=>words.every(word=>item.textKey.includes(word))).sort((a,b)=>rank(a)-rank(b));
}
