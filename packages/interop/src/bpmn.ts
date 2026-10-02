import {SaxesParser} from 'saxes';
import {DiagramError,EdgeSchema,NodeSchema,SCHEMA_VERSION,arrangeBlocks,fitSize,validateDocument,type DiagramDocument,type DiagramNode} from '@diagramia/core';
import type {InteropReport} from './mermaid.js';

const MODEL='http://www.omg.org/spec/BPMN/20100524/MODEL';
const invalid=(message:string):never=>{throw new DiagramError('INVALID_BPMN',message);};
const supported:Record<string,{kind:DiagramNode['kind'];shape:DiagramNode['shape'];label:string}>={
  startEvent:{kind:'custom',shape:'start',label:'Inicio'},endEvent:{kind:'custom',shape:'end',label:'Fin'},
  task:{kind:'service',shape:'rounded',label:'Tarea'},userTask:{kind:'service',shape:'rounded',label:'Tarea de usuario'},
  serviceTask:{kind:'service',shape:'rounded',label:'Tarea de servicio'},
  exclusiveGateway:{kind:'decision',shape:'diamond',label:'Decisión'},parallelGateway:{kind:'decision',shape:'hexagon',label:'Paralelo'}
};
type Element={rawId:string;type:string;name:string};
type Flow={rawId:string;from:string;to:string;name:string};
const attributes=(tag:{attributes:Record<string,unknown>})=>Object.fromEntries(Object.entries(tag.attributes).map(([key,item])=>[key.includes(':')?key.slice(key.indexOf(':')+1):key,typeof item==='string'?item:String((item as {value?:unknown}).value??'')])) as Record<string,string>;

/** Lee sólo el primer proceso ejecutable básico. No interpreta expresiones, scripts ni extensiones XML. */
export function importBpmn(source:string,options:{id?:string;title?:string}={}):{document:DiagramDocument;report:InteropReport}{
  if(source.length>500_000)invalid('El XML BPMN supera 500 KB.');
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))invalid('DOCTYPE y entidades XML están prohibidos.');
  const report:InteropReport={unsupported:[],notes:[]},parser=new SaxesParser({xmlns:true}),stack:{local:string;uri:string}[]=[],elements:Element[]=[],flows:Flow[]=[],bounds=new Map<string,{x:number;y:number;width:number;height:number}>();
  let root=false,processes=0,processDepth=0,processName='',shapeRef:string|null=null,shapeDepth=0;
  const attr=(tag:{attributes:Record<string,unknown>})=>attributes(tag);
  parser.on('doctype',()=>invalid('DOCTYPE está prohibido.'));
  parser.on('opentag',tag=>{
    stack.push({local:tag.local,uri:tag.uri});
    if(stack.length>40)invalid('El XML BPMN excede la profundidad permitida.');
    if(stack.length===1){if(tag.local!=='definitions'||tag.uri!==MODEL)invalid('Se esperaba definitions en el namespace BPMN 2.0.');root=true;}
    const a=attr(tag);
    if(tag.local==='process'&&tag.uri===MODEL){processes++;if(processes===1){processDepth=stack.length;processName=a.name??a.id??'';}return;}
    if(tag.local==='BPMNShape'){shapeRef=a.bpmnElement??null;shapeDepth=stack.length;return;}
    if(tag.local==='Bounds'&&shapeRef&&shapeDepth>0){
      const x=Number(a.x),y=Number(a.y),width=Number(a.width),height=Number(a.height);
      if([x,y,width,height].every(Number.isFinite)&&width>=24&&height>=24&&width<=4000&&height<=4000)bounds.set(shapeRef,{x,y,width,height});
      else report.unsupported.push({line:0,text:shapeRef,reason:'BPMN DI tiene límites geométricos inválidos; se calculará layout.'});
      return;
    }
    if(processes!==1||!processDepth||stack.length!==processDepth+1||tag.uri!==MODEL)return;
    if(tag.local==='sequenceFlow'){
      if(flows.length>=4000)invalid('El proceso supera 4000 conexiones.');
      if(!a.id||!a.sourceRef||!a.targetRef)invalid('sequenceFlow requiere id, sourceRef y targetRef.');
      flows.push({rawId:a.id,from:a.sourceRef,to:a.targetRef,name:a.name??''});
    }else if(supported[tag.local]){
      if(elements.length>=2000)invalid('El proceso supera 2000 elementos.');
      if(!a.id)invalid(`${tag.local} requiere ID.`);
      elements.push({rawId:a.id,type:tag.local,name:a.name??''});
    }else report.unsupported.push({line:0,text:tag.local,reason:'Elemento BPMN fuera del subconjunto del proceso; no se importó.'});
  });
  parser.on('closetag',tag=>{
    if(tag.local==='BPMNShape'&&stack.length===shapeDepth){shapeRef=null;shapeDepth=0;}
    if(tag.local==='process'&&stack.length===processDepth)processDepth=0;
    stack.pop();
  });
  try{parser.write(source).close();}catch(error){if(error instanceof DiagramError)throw error;invalid(`XML BPMN inválido: ${error instanceof Error?error.message:String(error)}`);}
  if(!root||!processes)invalid('No se encontró un proceso BPMN 2.0.');
  if(!elements.length)invalid('No se encontraron tareas, eventos o gateways del subconjunto.');
  if(processes>1)report.unsupported.push({line:0,text:'process',reason:`Se omitieron ${processes-1} procesos adicionales.`});
  if(elements.some(element=>element.type==='parallelGateway'))report.notes.push('Los gateways paralelos se muestran como hexágonos para distinguirlos de los exclusivos; no se ejecutan ramas BPMN.');
  const rawIds=new Set<string>(),used=new Set<string>(),ids=new Map<string,string>();
  const idFor=(raw:string)=>{
    if(ids.has(raw))return ids.get(raw)!;
    const base=(raw.replace(/[^A-Za-z0-9_-]/g,'_').replace(/^_+/,'x_').slice(0,72)||'element');let id=base;
    for(let n=2;used.has(id);n++)id=`${base.slice(0,70)}_${n}`;
    if(id!==raw)report.notes.push(`ID «${raw}» convertido a «${id}».`);
    ids.set(raw,id);used.add(id);return id;
  };
  for(const element of [...elements,...flows]){if(rawIds.has(element.rawId))invalid(`ID BPMN duplicado: ${element.rawId}.`);rawIds.add(element.rawId);idFor(element.rawId);}
  const elementIds=new Set(elements.map(element=>element.rawId));
  for(const flow of flows)if(!elementIds.has(flow.from)||!elementIds.has(flow.to))invalid(`La conexión ${flow.rawId} apunta a un elemento omitido o inexistente. No se importó parcialmente.`);
  const nodes=elements.map(element=>{
    const mapped=supported[element.type]!,g=bounds.get(element.rawId),raw=NodeSchema.parse({id:ids.get(element.rawId),kind:mapped.kind,shape:mapped.shape,label:(element.name||mapped.label).slice(0,200),position:g?{x:g.x,y:g.y}:{x:0,y:0},size:g?{width:g.width,height:g.height}:{width:144,height:72}});
    if(g)return raw;
    const need=fitSize(raw);return {...raw,size:{width:Math.max(raw.size.width,need.width),height:Math.max(raw.size.height,need.height)}};
  });
  const edges=flows.map(flow=>EdgeSchema.parse({id:ids.get(flow.rawId),from:ids.get(flow.from),to:ids.get(flow.to),label:flow.name.slice(0,160)}));
  const complete=elements.every(element=>bounds.has(element.rawId));
  if(!complete){
    const {positions}=arrangeBlocks(nodes,[],edges,'right',{x:80,y:80});
    for(const node of nodes)node.position=positions.get(node.id)!;
    report.notes.push('BPMN DI ausente o incompleto: se calculó un layout; las posiciones parciales no se conservaron.');
  }else report.notes.push('Se conservaron las posiciones y tamaños de BPMN DI.');
  const document=validateDocument({schemaVersion:SCHEMA_VERSION,id:options.id??'imported',title:options.title??(processName.slice(0,200)||'Proceso BPMN'),revision:0,nodes,edges,zones:[],groups:[],frames:[],animations:[],assets:[],annotations:[],appliedBatches:[]});
  report.notes.push('Se importan tareas, eventos de inicio/fin, gateways y secuencias; la semántica ejecutable de BPMN no se simula.');
  return {document,report};
}

/** Exporta un proceso BPMN no ejecutable. Sólo usa tareas, inicio/fin, gateway y sequenceFlow. */
export function exportBpmn(input:DiagramDocument):{text:string;report:InteropReport}{
  const doc=validateDocument(input),report:InteropReport={unsupported:[],notes:['Proceso BPMN no ejecutable: se exportan sólo tareas, eventos, gateways y sequenceFlow.']};
  const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const ids=new Map<string,string>(),used=new Set<string>();
  for(const item of [...doc.nodes,...doc.edges]){
    const base=/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(item.id)?item.id:`x_${item.id}`;let id=base;
    for(let n=2;used.has(id);n++)id=`${base}_${n}`;
    if(id!==item.id)report.notes.push(`ID XML «${item.id}» convertido a «${id}».`);
    ids.set(item.id,id);used.add(id);
  }
  const fresh=(base:string)=>{let value=base;for(let n=2;used.has(value);n++)value=`${base}_${n}`;used.add(value);return value;};
  const process=fresh('Process_Diagramia'),diagram=fresh('Diagram_Diagramia'),plane=fresh('Plane_Diagramia');
  const tag=(node:DiagramNode)=>node.shape==='start'?'startEvent':node.shape==='end'?'endEvent':node.kind==='decision'&&node.shape==='hexagon'?'parallelGateway':node.kind==='decision'?'exclusiveGateway':node.kind==='actor'?'userTask':node.kind==='service'?'task':'task';
  const out=['<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" targetNamespace="https://diagramia.local/bpmn">',
    `<bpmn:process id="${xml(process)}" name="${xml(doc.title)}" isExecutable="false">`];
  for(const node of doc.nodes){const type=tag(node);out.push(`<bpmn:${type} id="${xml(ids.get(node.id)!)}" name="${xml(node.label)}"/>`);
    if(type==='task'&&node.kind!=='service')report.unsupported.push({line:0,text:node.id,reason:`El tipo ${node.kind} se simplificó a tarea BPMN.`});
  }
  for(const edge of doc.edges)out.push(`<bpmn:sequenceFlow id="${xml(ids.get(edge.id)!)}" sourceRef="${xml(ids.get(edge.from)!)}" targetRef="${xml(ids.get(edge.to)!)}"${edge.label?` name="${xml(edge.label)}"`:''}/>`);
  out.push('</bpmn:process>',`<bpmndi:BPMNDiagram id="${diagram}"><bpmndi:BPMNPlane id="${plane}" bpmnElement="${process}">`);
  for(const node of doc.nodes)out.push(`<bpmndi:BPMNShape id="Shape_${xml(ids.get(node.id)!)}" bpmnElement="${xml(ids.get(node.id)!)}"><dc:Bounds x="${node.position.x}" y="${node.position.y}" width="${node.size.width}" height="${node.size.height}"/></bpmndi:BPMNShape>`);
  for(const edge of doc.edges){const from=doc.nodes.find(n=>n.id===edge.from)!,to=doc.nodes.find(n=>n.id===edge.to)!;
    const x1=from.position.x+from.size.width/2,y1=from.position.y+from.size.height/2,x2=to.position.x+to.size.width/2,y2=to.position.y+to.size.height/2;
    out.push(`<bpmndi:BPMNEdge id="Edge_${xml(ids.get(edge.id)!)}" bpmnElement="${xml(ids.get(edge.id)!)}"><di:waypoint x="${x1}" y="${y1}"/><di:waypoint x="${x2}" y="${y2}"/></bpmndi:BPMNEdge>`);
  }
  out.push('</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>','</bpmn:definitions>');
  for(const [count,what] of [[doc.zones.length,'zonas'],[doc.animations.length,'animaciones'],[doc.frames.length,'frames'],[doc.groups.length,'grupos'],[doc.drawings.length,'trazos libres'],[doc.assets.length,'imágenes'],[doc.annotations.length,'anotaciones']]as const)if(count)report.unsupported.push({line:0,text:what,reason:`${count} ${what} no se exportan a BPMN.`});
  return {text:out.join('\n')+'\n',report};
}
