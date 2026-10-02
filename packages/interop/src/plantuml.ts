import {DiagramError,EdgeSchema,NodeSchema,SCHEMA_VERSION,arrangeBlocks,fitSize,validateDocument,type DiagramDocument,type DiagramNode} from '@diagramia/core';
import type {InteropReport} from './mermaid.js';

export type PlantUmlKind='class'|'sequence'|'state';
const invalid=(message:string):never=>{throw new DiagramError('INVALID_PLANTUML',message);};
const simple=/^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const maxLine=1200;

/** Subset cerrado: nunca ejecuta directivas, includes, macros ni el renderer de PlantUML. */
export function importPlantUml(source:string,options:{id?:string;title?:string;kind?:PlantUmlKind}={}):{document:DiagramDocument;report:InteropReport;kind:PlantUmlKind}{
  if(source.length>200_000)invalid('El archivo PlantUML supera 200 KB.');
  const lines=source.replace(/\r\n?/g,'\n').split('\n');
  if(lines.length>6000||lines.some(line=>line.length>maxLine))invalid('El archivo PlantUML supera los límites de líneas.');
  const first=lines.findIndex(line=>/^\s*@startuml(?:\s+.*)?$/.test(line));
  const last=lines.findIndex((line,i)=>i>first&&/^\s*@enduml\s*$/.test(line));
  if(first<0||last<0)invalid('Se esperaba un bloque @startuml … @enduml.');
  const outside=[...lines.slice(0,first),...lines.slice(last+1)].filter(line=>line.trim()&&!line.trim().startsWith("'"));
  if(outside.length)invalid('Sólo se admite un bloque PlantUML por archivo.');
  const body=lines.slice(first+1,last),report:InteropReport={unsupported:[],notes:[]};
  const kind=options.kind??(body.some(line=>/^\s*(?:class|interface|enum|abstract class)\s+/i.test(line))?'class':body.some(line=>/^\s*(?:state\s+|\[\*\]\s*[-.]+>|\S+\s*[-.]+>\s*\[\*\])/.test(line))?'state':'sequence');
  report.notes.push(`Importado como diagrama UML de ${kind==='class'?'clases':kind==='sequence'?'secuencia':'estados'}; la geometría se calculó automáticamente.`);
  const used=new Set<string>(),byRaw=new Map<string,string>(),nodes=new Map<string,DiagramNode>(),relations:{from:string;to:string;label:string;style:'solid'|'dashed';arrow:'arrow'|'triangle'|'none'}[]=[];
  const idFor=(raw:string)=>{
    if(byRaw.has(raw))return byRaw.get(raw)!;
    const base=(raw.replace(/[^A-Za-z0-9_-]/g,'_').replace(/^_+/,'x_').slice(0,72)||'item');let id=base;
    for(let n=2;used.has(id);n++)id=`${base.slice(0,70)}_${n}`;
    if(id!==raw)report.notes.push(`ID «${raw}» convertido a «${id}».`);
    used.add(id);byRaw.set(raw,id);return id;
  };
  const touch=(raw:string,label=raw,nodeKind:DiagramNode['kind']='service',shape:DiagramNode['shape']=kind==='class'?'class':kind==='state'?'rounded':'rectangle')=>{
    const id=idFor(raw);
    if(!nodes.has(id))nodes.set(id,NodeSchema.parse({id,kind:nodeKind,shape,label:label.slice(0,200)||id,position:{x:0,y:0},size:{width:150,height:72}}));
    else if(label!==raw){const node=nodes.get(id)!;nodes.set(id,{...node,label:label.slice(0,200),kind:nodeKind,shape});}
    return id;
  };
  const alias=(raw:string):{label:string;id:string}|null=>{
    const match=raw.match(/^(?:"([^"]{1,200})"\s+as\s+([A-Za-z0-9_-]+)|([A-Za-z0-9_-]+)(?:\s+as\s+"([^"]{1,200})")?)$/);
    return match?{label:match[1]??match[4]??match[3]!,id:match[2]??match[3]!}:null;
  };
  let classBody:string|null=null,sequence=0;
  for(let i=0;i<body.length;i++){
    const text=body[i]!.trim(),line=first+i+2;
    if(!text||text.startsWith("'"))continue;
    if(classBody){
      if(text==='}')classBody=null;
      else if(text.length<=200){const node=nodes.get(classBody)!;node.details=(node.details?node.details+'\n':'')+text;}
      else report.unsupported.push({line,text:text.slice(0,80),reason:'Miembro de clase demasiado largo.'});
      continue;
    }
    if(/^title\s+/i.test(text)){if(!options.title)options={...options,title:text.slice(6).trim().slice(0,200)};continue;}
    if(kind==='class'){
      const declaration=text.match(/^(abstract class|class|interface|enum)\s+(.+?)(\s*\{)?$/i);
      if(declaration){
        const named=alias(declaration[2]!.trim());if(!named){report.unsupported.push({line,text,reason:'Declaración de clase fuera del subconjunto.'});continue;}
        const id=touch(named.id,named.label,declaration[1]!.toLowerCase()==='interface'?'custom':'service','class');
        if(declaration[3])classBody=id;
        continue;
      }
      const member=text.match(/^([A-Za-z0-9_-]+)\s*:\s*(.{1,200})$/);
      if(member){const node=nodes.get(touch(member[1]!))!;node.details=(node.details?node.details+'\n':'')+member[2];continue;}
      const relation=text.match(/^([A-Za-z0-9_-]+)\s+(<\|--|<\|\.\.|-->|\.\.>|\*--|o--|--|\.\.)\s+([A-Za-z0-9_-]+)(?:\s*:\s*(.*))?$/);
      if(relation){
        const left=touch(relation[1]!),right=touch(relation[3]!),op=relation[2]!;
        relations.push({from:op.startsWith('<')?right:left,to:op.startsWith('<')?left:right,label:(relation[4]??'').slice(0,160),style:op.includes('.')?'dashed':'solid',arrow:op.startsWith('<')?'triangle':op.includes('>')?'arrow':'none'});
        continue;
      }
    }else if(kind==='sequence'){
      const declaration=text.match(/^(actor|participant|database|entity|boundary|control|collections|queue)\s+(.+)$/i);
      if(declaration){const named=alias(declaration[2]!.trim());if(!named){report.unsupported.push({line,text,reason:'Participante fuera del subconjunto.'});continue;}
        const role=declaration[1]!.toLowerCase();touch(named.id,named.label,role==='actor'?'actor':role==='database'?'database':'service',role==='actor'?'actor':role==='database'?'cylinder':'rectangle');continue;}
      const message=text.match(/^([A-Za-z0-9_-]+)\s*(-->|->|<--|<-)\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if(message){const backwards=message[2]!.startsWith('<'),from=touch(backwards?message[3]!:message[1]!),to=touch(backwards?message[1]!:message[3]!);
        relations.push({from,to,label:message[4]!.slice(0,160),style:message[2]!.includes('--')?'dashed':'solid',arrow:'arrow'});sequence++;continue;}
    }else{
      const declaration=text.match(/^state\s+(.+)$/i);
      if(declaration){const named=alias(declaration[1]!.trim());if(!named){report.unsupported.push({line,text,reason:'Estado compuesto o declaración fuera del subconjunto.'});continue;}
        touch(named.id,named.label,'custom','rounded');continue;}
      const transition=text.match(/^(\[\*\]|[A-Za-z0-9_-]+)\s*(-->|->)\s*(\[\*\]|[A-Za-z0-9_-]+)(?:\s*:\s*(.*))?$/);
      if(transition){const start=transition[1]==='[*]',end=transition[3]==='[*]';
        const from=touch(start?'start':transition[1]!,start?'Inicio':transition[1]!,start?'custom':'custom',start?'start':'rounded');
        const to=touch(end?'end':transition[3]!,end?'Fin':transition[3]!,end?'custom':'custom',end?'end':'rounded');
        relations.push({from,to,label:(transition[4]??'').slice(0,160),style:'solid',arrow:'arrow'});continue;}
    }
    report.unsupported.push({line,text:text.slice(0,160),reason:'Sintaxis PlantUML fuera del subconjunto; no se ejecutó.'});
  }
  if(classBody)invalid('Bloque de clase sin cierre.');
  if(!nodes.size)invalid('No se encontraron elementos editables en el subconjunto PlantUML.');
  if(nodes.size>2000||relations.length>4000)invalid('El diagrama supera los límites del documento.');
  const edges=relations.map((r,i)=>EdgeSchema.parse({id:idFor(`relation-${i+1}`),from:r.from,to:r.to,label:r.label,endArrow:r.arrow,line:'straight',style:r.style==='dashed'?{dash:'dashed'}:{}}));
  const sized=[...nodes.values()].map(node=>{const need=fitSize(node);return {...node,size:{width:Math.max(node.size.width,need.width),height:Math.max(node.size.height,need.height)}};});
  const {positions}=arrangeBlocks(sized,[],edges,kind==='sequence'?'right':'down',{x:80,y:80});
  const document=validateDocument({schemaVersion:SCHEMA_VERSION,id:options.id??'imported',title:options.title??`UML de ${kind}`,revision:0,nodes:sized.map(node=>({...node,position:positions.get(node.id)!})),edges,zones:[],groups:[],frames:[],animations:[],assets:[],annotations:[],appliedBatches:[]});
  if(kind==='sequence')report.notes.push(`${sequence} mensajes se importaron como conexiones; la posición vertical y el tiempo de los mensajes no se conservan.`);
  return {document,report,kind};
}

/** Export textual del subconjunto; no pretende conservar posición, estilos ni semántica temporal. */
export function exportPlantUml(input:DiagramDocument,kind:PlantUmlKind='class'):{text:string;report:InteropReport}{
  const doc=validateDocument(input),report:InteropReport={unsupported:[],notes:[`PlantUML ${kind}: se omiten posiciones, tamaños, estilos y rutas.`]};
  const safe=(value:string)=>value.replace(/[\r\n]+/g,' ').replace(/"/g,'”').slice(0,200);
  for(const [id,value] of [[doc.id,doc.title],...doc.nodes.map(n=>[n.id,n.label]),...doc.edges.map(e=>[e.id,e.label])])if(value!==safe(value))
    report.unsupported.push({line:0,text:id!,reason:'Comillas, saltos de línea o longitud de etiqueta normalizados para PlantUML.'});
  const out=['@startuml',`title ${safe(doc.title)}`];
  if(kind==='class'){
    for(const node of doc.nodes){
      out.push(`class "${safe(node.label)}" as ${node.id}${node.details?' {':''}`);
      if(node.details){
        const members=node.details.split('\n');
        for(const member of members){
          if(member.length<=160&&!/[{}]/.test(member)&&!/^\s*[!@]/.test(member))out.push('  '+member);
          else report.unsupported.push({line:0,text:node.id,reason:'Un miembro de clase no se exportó por sintaxis o longitud.'});
        }
        out.push('}');
      }
      if(node.shape!=='class')report.unsupported.push({line:0,text:node.id,reason:'Forma convertida a clase.'});
    }
    for(const edge of doc.edges)out.push(`${edge.from} --> ${edge.to}${edge.label?` : ${safe(edge.label)}`:''}`);
  }else if(kind==='sequence'){
    for(const node of doc.nodes)out.push(`${node.kind==='actor'?'actor':node.kind==='database'?'database':'participant'} "${safe(node.label)}" as ${node.id}`);
    for(const edge of doc.edges)out.push(`${edge.from} ${edge.style.dash==='dashed'?'-->':'->'} ${edge.to}: ${safe(edge.label)||'mensaje'}`);
    report.notes.push('Las conexiones se ordenan según el documento; no se recuperan tiempo ni activaciones de lifeline.');
  }else{
    for(const node of doc.nodes)if(node.shape!=='start'&&node.shape!=='end')out.push(`state "${safe(node.label)}" as ${node.id}`);
    for(const edge of doc.edges){const from=doc.nodes.find(n=>n.id===edge.from),to=doc.nodes.find(n=>n.id===edge.to);
      out.push(`${from?.shape==='start'?'[*]':edge.from} --> ${to?.shape==='end'?'[*]':edge.to}${edge.label?` : ${safe(edge.label)}`:''}`);
    }
    if(doc.nodes.some(node=>node.kind!=='custom'))report.notes.push('Los tipos no estatales se representaron como estados simples.');
  }
  out.push('@enduml');
  for(const [count,what] of [[doc.zones.length,'zonas'],[doc.animations.length,'animaciones'],[doc.frames.length,'frames'],[doc.groups.length,'grupos'],[doc.drawings.length,'trazos libres'],[doc.assets.length,'imágenes'],[doc.annotations.length,'anotaciones']]as const)if(count)report.unsupported.push({line:0,text:what,reason:`${count} ${what} no se exportan a PlantUML.`});
  return {text:out.join('\n')+'\n',report};
}
