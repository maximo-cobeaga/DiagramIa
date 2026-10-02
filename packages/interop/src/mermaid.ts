import {DiagramError,EdgeSchema,NodeSchema,SCHEMA_VERSION,ZoneSchema,arrangeBlocks,fitSize,validateDocument,type DiagramDocument,type DiagramNode} from '@diagramia/core';

/**
 * Subset soportado de Mermaid flowchart: encabezado flowchart/graph con dirección, nodos con forma y label,
 * conexiones con flecha/label/punteado, cadenas, `&`, IDs de conexión (`id@-->`), subgraph → zona y comentarios.
 * Todo lo demás se informa en el reporte; nunca se descarta en silencio.
 */
export type InteropReport={unsupported:{line:number;text:string;reason:string}[];notes:string[]};
type Kind=DiagramNode['kind'];

const SHAPES:[open:string,close:string,kind:Kind][]=[['[(',')]','database'],['[[',']]','queue'],['([','])','actor'],['((','))','custom'],['{{','}}','external'],['[/','/]','custom'],['[',']','service'],['(',')','service'],['{','}','decision'],['>',']','note']];
const EXPORT_SHAPE:Record<Kind,[string,string]>={service:['[',']'],database:['[(',')]'],cache:['[(',')]'],queue:['[[',']]'],external:['{{','}}'],actor:['([','])'],decision:['{','}'],note:['>',']'],text:['[',']'],image:['[',']'],custom:['((','))']};
const IGNORED=/^(style|classDef|class|click|linkStyle|direction|accTitle|accDescr)\b/;
const ID=/^[A-Za-z0-9_]+(?:-(?![-.>])[A-Za-z0-9_]+)*/;
const INLINE_LINK=/^(--|==|-\.)\s*([^-=.|>\s][^|]*?)\s*(-{2,}>?|={2,}>?|\.-+>?)(?=\s|[A-Za-z0-9_])/;
const LINK=/^(<|o|x)?(-{2,}|={2,}|-\.+-)(>|o|x)?(?:\s*\|([^|]*)\|)?/;
const unquote=(text:string)=>text.trim().replace(/^"([\s\S]*)"$/,'$1').replaceAll('#quot;','"').trim();
const invalid=(message:string):never=>{throw new DiagramError('INVALID_MERMAID',message);};

export function importMermaid(source:string,options:{id?:string;title?:string}={}):{document:DiagramDocument;report:InteropReport}{
  if(source.length>200_000)invalid('El texto Mermaid supera 200 KB.');
  const report:InteropReport={unsupported:[],notes:[]};
  let lines=source.split(/\r?\n/),title=options.title??'Diagrama importado';
  if(lines.length>5000)invalid('El texto Mermaid supera 5000 líneas.');
  let offset=0;
  if(lines[0]?.trim()==='---'){
    const close=lines.indexOf('---',1);
    if(close>0){const found=lines.slice(1,close).map(l=>l.match(/^\s*title:\s*(.+)$/)?.[1]).find(Boolean);if(found&&!options.title)title=unquote(found).slice(0,200);offset=close+1;lines=lines.slice(close+1);}
  }
  let direction:'right'|'down'|null=null;
  const nodes=new Map<string,{label:string;kind:Kind;zoneId:string|null;shaped:boolean}>(),zones=new Map<string,string>(),edges:{id?:string;from:string;to:string;label:string;alternative:boolean}[]=[],zoneStack:string[]=[];
  const sanitize=(raw:string,line:number)=>{
    const id=raw.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,70);
    if(id!==raw)report.notes.push(`Línea ${line}: el ID «${raw}» se normalizó a «${id}».`);
    return id;
  };
  const touch=(id:string)=>{if(!nodes.has(id))nodes.set(id,{label:id,kind:'service',zoneId:zoneStack.at(-1)??null,shaped:false});return nodes.get(id)!;};

  lines.forEach((rawLine,index)=>{
    const line=index+1+offset,text=rawLine.replace(/%%.*$/,'').trim();
    if(!text)return;
    const skip=(reason:string)=>{report.unsupported.push({line,text:text.slice(0,160),reason});};
    if(direction===null){
      const header=text.match(/^(flowchart|graph)\s+(TB|TD|BT|RL|LR)\s*;?$/i);
      if(!header)invalid(`Línea ${line}: se esperaba «flowchart LR» o «flowchart TD». Sólo se importa el subset flowchart.`);
      const way=header![2].toUpperCase();direction=way==='LR'||way==='RL'?'right':'down';
      if(way==='RL'||way==='BT')report.notes.push(`La dirección ${way} se importó como ${way==='RL'?'LR':'TD'}.`);
      return;
    }
    if(IGNORED.test(text))return skip('Estilos, clases, enlaces y direcciones locales no se importan.');
    if(/^end\s*;?$/.test(text)){if(!zoneStack.pop())skip('«end» sin subgraph abierto.');return;}
    const sub=text.match(/^subgraph\s+(.+)$/);
    if(sub){
      const named=sub[1].match(/^([A-Za-z0-9_-]+)\s*\[(.+)\]\s*$/),raw=named?named[1]:sub[1].trim();
      let id=sanitize(named?raw:unquote(raw).replace(/\s+/g,'_'),line)||'zona';
      if(nodes.has(id)||zones.has(id))id=`${id}-zone`;
      if(zoneStack.length)report.notes.push(`Línea ${line}: el subgraph anidado «${id}» se importó como zona independiente; las zonas no se anidan.`);
      zones.set(id,unquote(named?named[2]:raw).slice(0,200)||id);zoneStack.push(id);return;
    }
    for(const statement of text.split(';').map(s=>s.trim()).filter(Boolean)){
      let rest=statement;
      const eat=(pattern:RegExp)=>{const m=rest.match(pattern);if(m)rest=rest.slice(m[0].length).trimStart();return m;};
      const readNode=():string|null=>{
        const m=eat(ID);if(!m)return null;
        const id=sanitize(m[0],line),entry=touch(id);
        if(rest.startsWith('@{')){const close=rest.indexOf('}');rest=close<0?'':rest.slice(close+1).trimStart();report.notes.push(`Línea ${line}: los atributos @{…} de «${id}» no se importan.`);return id;}
        const shape=SHAPES.find(([open])=>rest.startsWith(open));
        if(!shape)return id;
        const body=rest.slice(shape[0].length),quoted=body.match(/^\s*"((?:[^"])*)"\s*/);
        const end=quoted?(body.slice(quoted[0].length).startsWith(shape[1])?quoted[0].length:-1):body.indexOf(shape[1]);
        if(end<0)throw new Error('forma sin cerrar');
        const label=unquote(quoted?quoted[1]:body.slice(0,end)).replace(/<br\s*\/?>/gi,' ').slice(0,200);
        if(!entry.shaped){entry.label=label||id;entry.kind=shape[2];entry.shaped=true;}
        rest=body.slice(end+shape[1].length).trimStart();
        return id;
      };
      const readGroup=():string[]|null=>{const first=readNode();if(!first)return null;const ids=[first];while(eat(/^&\s*/)){const more=readNode();if(!more)throw new Error('se esperaba un nodo después de &');ids.push(more);}return ids;};
      try{
        let left=readGroup();
        if(!left)throw new Error('no se reconoce la sentencia');
        while(rest){
          const edgeId=eat(/^([A-Za-z0-9_-]+)@(?=[-=<ox.])/)?.[1];
          const inline=eat(INLINE_LINK),link=inline?null:eat(LINK);
          if(!inline&&!link)throw new Error(`no se reconoce «${rest.slice(0,24)}»`);
          const style=inline?inline[1]:link![2],arrow=inline?inline[3].endsWith('>'):link![3]==='>';
          if(link&&(link[1]||link[3]==='o'||link[3]==='x'))report.notes.push(`Línea ${line}: los extremos bidireccionales, círculo o cruz se importan como una conexión simple.`);
          if(!arrow&&!(link&&link[3]))report.notes.push(`Línea ${line}: una conexión sin flecha se importó con dirección de izquierda a derecha.`);
          const right=readGroup();
          if(!right)throw new Error('falta el destino de la conexión');
          const label=unquote(inline?inline[2]:link![4]??'').slice(0,160);
          for(const from of left)for(const to of right)edges.push({id:left.length*right.length===1?edgeId:undefined,from,to,label,alternative:style.includes('.')});
          left=right;
        }
      }catch(e){skip(e instanceof Error?e.message:String(e));}
    }
  });
  if(direction===null)invalid('El texto está vacío o no tiene encabezado «flowchart».');
  if(zoneStack.length)report.notes.push(`Quedaron ${zoneStack.length} subgraph sin «end»; se cerraron al final.`);
  if(!nodes.size)invalid('No se encontró ningún nodo para importar.');

  const taken=new Set([...nodes.keys(),...zones.keys()]);
  const finalEdges=edges.map(e=>{
    let id=e.id&&!taken.has(e.id)?e.id:`${e.from}-${e.to}`;
    if(e.id&&taken.has(e.id))report.notes.push(`El ID de conexión «${e.id}» ya estaba en uso; se generó otro.`);
    for(let n=2;taken.has(id)||id.length>80;n++)id=`${`${e.from}-${e.to}`.slice(0,70)}-${n}`;
    taken.add(id);
    return EdgeSchema.parse({id,from:e.from,to:e.to,label:e.label,alternative:e.alternative});
  });

  // Mermaid no trae geometría: cada nodo toma el tamaño que necesita su texto y el layout de bloques ubica zonas y nodos sin superponer nada.
  const sized=[...nodes].map(([id,n],i)=>{
    const base=NodeSchema.parse({id,kind:n.kind,label:n.label,zoneId:n.zoneId,position:{x:i,y:i},size:{width:120,height:64}}),need=fitSize(base);
    return {...base,size:{width:Math.max(120,need.width),height:Math.max(64,need.height)}};
  });
  for(const [zoneId,label] of [...zones])if(!sized.some(n=>n.zoneId===zoneId)){report.notes.push(`La zona «${label}» quedó vacía y no se importó.`);zones.delete(zoneId);}
  const zoneList=[...zones].map(([id,label],i)=>ZoneSchema.parse({id,label,bounds:{x:i,y:i,width:100,height:100}}));
  const {positions,zoneBounds}=arrangeBlocks(sized,zoneList,finalEdges,direction!,{x:80,y:80});
  const document=validateDocument({
    schemaVersion:SCHEMA_VERSION,id:options.id??'imported',title,revision:0,
    nodes:sized.map(n=>({...n,position:positions.get(n.id)!})),edges:finalEdges,zones:zoneList.map(z=>({...z,bounds:zoneBounds.get(z.id)!})),
    groups:[],frames:[],animations:[],assets:[],annotations:[],appliedBatches:[]
  });
  report.notes.push('Mermaid no define posiciones: el layout se calculó al importar.');
  return {document,report};
}

const quote=(text:string)=>`"${text.replaceAll('"','#quot;').replace(/[\r\n]+/g,' ')}"`;
export function exportMermaid(d:DiagramDocument,options:{direction?:'LR'|'TD'}={}):{text:string;report:InteropReport}{
  const report:InteropReport={unsupported:[],notes:['Mermaid no conserva posiciones, tamaños ni rutas manuales.']};
  const out=['---',`title: ${quote(d.title)}`,'---',`flowchart ${options.direction??'LR'}`];
  const declare=(n:DiagramNode,indent:string)=>{const [open,close]=EXPORT_SHAPE[n.kind];out.push(`${indent}${n.id}${open}${quote(n.label)}${close}`);};
  for(const z of d.zones){
    out.push(`  subgraph ${z.id}[${quote(z.label)}]`);
    for(const n of d.nodes)if(n.zoneId===z.id)declare(n,'    ');
    out.push('  end');
  }
  for(const n of d.nodes)if(!n.zoneId)declare(n,'  ');
  for(const e of d.edges)out.push(`  ${e.from} ${e.id}@${e.alternative?'-.->':'-->'}${e.label?`|${quote(e.label)}|`:''} ${e.to}`);
  const lossyKinds=[...new Set(d.nodes.filter(n=>['cache','text','image','custom'].includes(n.kind)).map(n=>n.kind))];
  if(lossyKinds.length)report.notes.push(`Los tipos ${lossyKinds.join(', ')} no tienen forma equivalente y cambian al reimportar.`);
  if(d.nodes.some(n=>n.subtitle))report.notes.push('Los subtítulos de los nodos no se exportan.');
  if(d.edges.some(e=>e.fromPort!=='auto'||e.toPort!=='auto'))report.notes.push('Los puertos de las conexiones no se exportan.');
  if(d.nodes.some(n=>n.id==='end')||d.zones.some(z=>z.id==='end'))report.notes.push('El ID «end» es palabra reservada en Mermaid y puede fallar en otros visores.');
  const dropped=(count:number,what:string)=>{if(count)report.unsupported.push({line:0,text:what,reason:`${count} ${what} no se pueden representar en Mermaid flowchart.`});};
  dropped(d.animations.length,'animaciones');dropped(d.frames.length,'frames');dropped(d.groups.length,'grupos');dropped(d.drawings.length,'trazos libres');dropped(d.assets.length,'imágenes');dropped(d.annotations.length,'anotaciones');
  if(d.nodes.some(n=>n.icon))report.notes.push('Los iconos de los nodos no se exportan.');
  return {text:out.join('\n')+'\n',report};
}
