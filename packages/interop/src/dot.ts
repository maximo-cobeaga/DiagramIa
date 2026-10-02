import {DiagramError,EdgeSchema,NodeSchema,SCHEMA_VERSION,ZoneSchema,arrangeBlocks,fitSize,validateDocument,type DiagramDocument,type DiagramNode} from '@diagramia/core';
import type {InteropReport} from './mermaid.js';

type Token={text:string;line:number};
const invalid=(message:string):never=>{throw new DiagramError('INVALID_DOT',message);};
const quote=(value:string)=>`"${value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]+/g,' ')}"`;
function lex(source:string):Token[]{
  if(source.length>200_000)invalid('El archivo DOT supera 200 KB.');
  const out:Token[]=[];let i=0,line=1;
  const push=(text:string)=>{if(out.length>=20_000)invalid('DOT contiene demasiados tokens.');out.push({text,line});};
  while(i<source.length){
    const c=source[i]!;
    if(/\s/.test(c)){if(c==='\n')line++;i++;continue;}
    if(c==='#'||source.startsWith('//',i)){while(i<source.length&&source[i]!=='\n')i++;continue;}
    if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)invalid('Comentario DOT sin cierre.');line+=(source.slice(i,end+2).match(/\n/g)??[]).length;i=end+2;continue;}
    if(source.startsWith('->',i)||source.startsWith('--',i)){push(source.slice(i,i+2));i+=2;continue;}
    if('{}[]=;,'.includes(c)){push(c);i++;continue;}
    if(c==='"'){
      const start=line;let value='';i++;
      while(i<source.length&&source[i]!=='"'){
        if(source[i]==='\\'&&i+1<source.length){const next=source[i+1]!;value+=next==='n'?'\n':next;i+=2;continue;}
        if(source[i]==='\n')line++;value+=source[i++];
      }
      if(source[i]!=='"')invalid(`Línea ${start}: string DOT sin cierre.`);
      i++;push(value);continue;
    }
    if(c==='<'){
      // Labels HTML no se ejecutan ni se interpretan en este subset.
      let depth=0,start=i;
      do{if(source[i]==='<')depth++;else if(source[i]==='>')depth--;if(source[i]==='\n')line++;i++;}while(i<source.length&&depth>0);
      if(depth)invalid('Label HTML DOT sin cierre.');push(source.slice(start,i));continue;
    }
    const word=source.slice(i).match(/^[\p{L}\p{N}_.$:-]+/u);
    if(word){push(word[0]);i+=word[0].length;continue;}
    invalid(`Línea ${line}: carácter DOT no reconocido «${c}».`);
  }
  return out;
}

/** Subset DOT: nodos, aristas, cadenas, clusters y atributos label/shape/rankdir. */
export function importDot(source:string,options:{id?:string;title?:string}={}):{document:DiagramDocument;report:InteropReport}{
  const tokens=lex(source),report:InteropReport={unsupported:[],notes:[]};let cursor=0,direction:'right'|'down'='down',directed=true,title=options.title??'Grafo DOT';
  const peek=()=>tokens[cursor]?.text,read=()=>tokens[cursor++]?.text;
  const expect=(value:string)=>{if(read()!==value)invalid(`Se esperaba «${value}» cerca de la línea ${tokens[cursor-1]?.line??1}.`);};
  if(peek()==='strict'){read();report.notes.push('La restricción strict de aristas duplicadas se simplifica al importar.');}
  const graphType=read();if(graphType!=='graph'&&graphType!=='digraph')invalid('Se esperaba graph o digraph.');directed=graphType==='digraph';
  if(peek()!=='{')read();expect('{');
  const taken=new Set<string>(),ids=new Map<string,string>(),nodes=new Map<string,{label:string;kind:DiagramNode['kind'];zone:string|null}>(),zones=new Map<string,{id:string;label:string}>(),edges:{from:string;to:string;label:string}[]=[];
  const idOf=(raw:string,key=raw)=>{
    if(ids.has(key))return ids.get(key)!;
    const base=(raw.replace(/[^A-Za-z0-9_-]/g,'_').replace(/^_+/,'x_').slice(0,70)||'node');let id=base;
    for(let n=2;taken.has(id);n++)id=`${base.slice(0,70)}_${n}`;
    if(id!==raw)report.notes.push(`ID «${raw}» convertido a «${id}».`);
    taken.add(id);ids.set(key,id);return id;
  };
  const touch=(raw:string,zone:string|null)=>{
    const name=raw.includes(':')?raw.split(':')[0]!:raw;
    if(name!==raw)report.notes.push(`Puerto DOT «${raw}» omitido; se conserva el nodo «${name}».`);
    const id=idOf(name);if(!nodes.has(id))nodes.set(id,{label:name.slice(0,200)||id,kind:'service',zone});return id;
  };
  const attributes=()=>{
    const result:Record<string,string>={};
    while(peek()==='['){read();while(peek()&&peek()!==']'){
      if(peek()===','||peek()===';'){read();continue;}
      const key=read()!;if(peek()==='='){read();result[key.toLowerCase()]=read()??'';}else report.unsupported.push({line:tokens[cursor-1]?.line??0,text:key,reason:'Atributo sin valor.'});
    }expect(']');}
    return result;
  };
  const noteAttrs=(attrs:Record<string,string>,allowed:string[])=>{for(const key of Object.keys(attrs))if(!allowed.includes(key))report.unsupported.push({line:tokens[cursor-1]?.line??0,text:key,reason:'Atributo DOT no importado.'});};
  const parseStatements=(zone:string|null,depth:number)=>{
    if(depth>10)invalid('DOT excede la profundidad permitida.');
    while(peek()&&peek()!=='}'){
      if(peek()===';'||peek()===','){read();continue;}
      if(peek()==='subgraph'||peek()==='{'){
        let raw='cluster';if(peek()==='subgraph'){read();if(peek()!=='{')raw=read()!;}
        expect('{');
        const base=raw.replace(/^cluster_?/,'')||raw,id=idOf(base,`zone:${raw}`);zones.set(id,{id,label:base});
        if(zone)report.notes.push(`Cluster anidado «${raw}» importado como zona independiente.`);
        parseStatements(id,depth+1);expect('}');continue;
      }
      const first=read()!;
      if(['graph','node','edge'].includes(first)&&peek()==='['){const attrs=attributes();if(first==='graph'){
        if(attrs.rankdir)direction=['LR','RL'].includes(attrs.rankdir.toUpperCase())?'right':'down';
        if(attrs.label){if(zone)zones.get(zone)!.label=attrs.label.slice(0,200);else if(!options.title)title=attrs.label.slice(0,200);}
      }else report.unsupported.push({line:tokens[cursor-1]?.line??0,text:first,reason:'Atributos por defecto no importados.'});
        noteAttrs(attrs,first==='graph'?['rankdir','label']:[]);if(peek()===';')read();continue;
      }
      if(peek()==='='){
        read();const value=read()??'';
        if(first==='rankdir')direction=['LR','RL'].includes(value.toUpperCase())?'right':'down';
        else if(first==='label'){if(zone)zones.get(zone)!.label=value.slice(0,200);else if(!options.title)title=value.slice(0,200);}
        else report.unsupported.push({line:tokens[cursor-1]?.line??0,text:first,reason:'Asignación DOT no importada.'});
        if(peek()===';')read();continue;
      }
      let last=touch(first,zone),isEdge=false;const chain:{from:string;to:string}[]=[];
      while(peek()==='->'||peek()==='--'){
        const operator=read()!;
        if(directed&&operator!=='->'||!directed&&operator!=='--')report.notes.push(`Operador ${operator} convertido a conexión simple.`);
        const raw=read();if(!raw||'{}[]=;,'.includes(raw))invalid('Falta destino de arista DOT.');
        const next=touch(raw,zone);chain.push({from:last,to:next});last=next;isEdge=true;
      }
      const attrs=attributes();noteAttrs(attrs,isEdge?['label']:['label','shape']);
      if(isEdge){for(const item of chain)edges.push({...item,label:(attrs.label??'').slice(0,160)});}
      else{
        const node=nodes.get(last)!;
        if(attrs.label!==undefined)node.label=attrs.label.slice(0,200)||last;
        const shapes:Record<string,DiagramNode['kind']>={box:'service',ellipse:'service',cylinder:'database',diamond:'decision',note:'note',component:'custom',actor:'actor'};
        if(attrs.shape){node.kind=shapes[attrs.shape.toLowerCase()]??'custom';if(!shapes[attrs.shape.toLowerCase()])report.notes.push(`Forma DOT «${attrs.shape}» importada como custom.`);}
      }
      if(peek()===';')read();
    }
  };
  parseStatements(null,0);expect('}');if(peek())invalid('Hay contenido DOT después del cierre del grafo.');
  if(!nodes.size)invalid('No se encontraron nodos para importar.');
  const finalEdges=edges.map((e,i)=>EdgeSchema.parse({id:idOf(`edge-${i+1}`),...e,endArrow:directed?'arrow':'none'}));
  const sized=[...nodes].map(([id,n],i)=>{
    const base=NodeSchema.parse({id,kind:n.kind,label:n.label,zoneId:n.zone,position:{x:i,y:i},size:{width:120,height:64}}),need=fitSize(base);
    return {...base,size:{width:Math.max(120,need.width),height:Math.max(64,need.height)}};
  });
  for(const [id,z] of zones)if(!sized.some(n=>n.zoneId===id)){zones.delete(id);report.notes.push(`Cluster vacío «${z.label}» omitido.`);}
  const zoneList=[...zones.values()].map((z,i)=>ZoneSchema.parse({id:z.id,label:z.label,bounds:{x:i,y:i,width:100,height:100}}));
  const {positions,zoneBounds}=arrangeBlocks(sized,zoneList,finalEdges,direction,{x:80,y:80});
  const document=validateDocument({schemaVersion:SCHEMA_VERSION,id:options.id??'imported',title,revision:0,nodes:sized.map(n=>({...n,position:positions.get(n.id)!})),edges:finalEdges,zones:zoneList.map(z=>({...z,bounds:zoneBounds.get(z.id)!})),groups:[],frames:[],animations:[],assets:[],annotations:[],appliedBatches:[]});
  report.notes.push('DOT no define posiciones: se calculó un layout al importar.');
  return {document,report};
}

export function exportDot(input:DiagramDocument):{text:string;report:InteropReport}{
  const d=validateDocument(input),report:InteropReport={unsupported:[],notes:['DOT no conserva posiciones, tamaños ni rutas manuales.']};
  const out=[`digraph ${quote(d.id)} {`,`  graph [label=${quote(d.title)}, rankdir=LR];`];
  const shape:Record<string,string>={database:'cylinder',decision:'diamond',note:'note',actor:'ellipse'};
  const declare=(n:DiagramNode,prefix:string)=>out.push(`${prefix}${quote(n.id)} [label=${quote(n.label)}, shape=${shape[n.kind]??'box'}];`);
  for(const z of d.zones){out.push(`  subgraph ${quote(`cluster_${z.id}`)} {`,`    label=${quote(z.label)};`);for(const n of d.nodes)if(n.zoneId===z.id)declare(n,'    ');out.push('  }');}
  for(const n of d.nodes)if(!n.zoneId)declare(n,'  ');
  for(const e of d.edges)out.push(`  ${quote(e.from)} -> ${quote(e.to)} [label=${quote(e.label)}];`);
  out.push('}');
  for(const [count,what] of [[d.animations.length,'animaciones'],[d.frames.length,'frames'],[d.groups.length,'grupos'],[d.drawings.length,'trazos libres'],[d.assets.length,'imágenes'],[d.annotations.length,'anotaciones']]as const)if(count)report.unsupported.push({line:0,text:what,reason:`${count} ${what} no se exportan a DOT.`});
  if(d.edges.some(e=>e.endArrow==='none'))report.notes.push('Las conexiones sin flecha se exportan como aristas dirigidas.');
  return {text:out.join('\n')+'\n',report};
}
