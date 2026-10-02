import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {validateDocument,nodeRect,overlaps,DiagramError} from '@diagramia/core';
import {importMermaid,exportMermaid,exportMarkdown,importDrawio,exportDrawio,importDot,exportDot,importPlantUml,exportPlantUml,importBpmn,exportBpmn} from '../src/index.js';

const example=(name:string)=>validateDocument(JSON.parse(readFileSync(new URL(`../../../examples/${name}.diagramia.json`,import.meta.url),'utf8')));

test('lossy exports report free drawings instead of silently dropping them',async()=>{
  const source=example('architecture');source.drawings.push({id:'free-arrow',kind:'arrow',points:[{x:10,y:20},{x:80,y:90}],style:{}});
  assert.ok(exportMermaid(source).report.unsupported.some(item=>item.text==='trazos libres'));
  assert.ok(exportDot(source).report.unsupported.some(item=>item.text==='trazos libres'));
  assert.ok((await exportDrawio(source)).report.unsupported.some(item=>item.text==='trazos libres'));
  assert.match(exportMarkdown(source),/Flecha libre \(`free-arrow`, 2 puntos\)/);
});
test('Markdown preserves a readable description of the login example tracks',()=>{
  const text=exportMarkdown(example('login'));
  assert.match(text,/Pista: Explicación/);assert.match(text,/No se crea una sesión/);
  assert.match(text,/Pista: Cámara/);assert.match(text,/backend-focus/);
});

test('Mermaid round-trip keeps IDs, labels, zones and edges of the supported subset',()=>{
  for(const name of ['architecture','checkout-success','checkout-failure']){
    const source=example(name),{text,report}=exportMermaid(source),{document}=importMermaid(text);
    assert.deepEqual(document.nodes.map(n=>[n.id,n.label,n.zoneId]).sort(),source.nodes.map(n=>[n.id,n.label,n.zoneId]).sort());
    assert.deepEqual(document.edges.map(e=>[e.id,e.from,e.to,e.label,e.alternative]).sort(),source.edges.map(e=>[e.id,e.from,e.to,e.label,e.alternative]).sort());
    assert.deepEqual(document.zones.map(z=>[z.id,z.label]).sort(),source.zones.map(z=>[z.id,z.label]).sort());
    assert.equal(document.title,source.title);
    assert.ok(report.unsupported.some(u=>u.text==='animaciones'),'las animaciones se informan como pérdida');
    const rects=document.nodes.map(nodeRect);
    assert.ok(rects.every((r,i)=>rects.every((other,j)=>i===j||!overlaps(r,other))),'el layout importado no superpone nodos');
  }
});
test('hand-written Mermaid imports shapes, chains, labels and reports what it cannot represent',()=>{
  const {document,report}=importMermaid(`flowchart TD
    %% comentario
    A[Cliente web] --> B{¿Autenticado?}
    B -- sí --> C[(Pedidos)]
    B -.->|no| D([Login]) --> A
    subgraph Datos
      C & E[[Cola]] --> F
    end
    classDef rojo fill:#f00
    C ~~~ F
  `);
  const kind=(id:string)=>document.nodes.find(n=>n.id===id)!.kind;
  assert.deepEqual(['A','B','C','D','E','F'].map(kind),['service','decision','database','actor','queue','service']);
  assert.equal(document.nodes.find(n=>n.id==='A')!.label,'Cliente web');
  assert.deepEqual(document.edges.map(e=>`${e.from}>${e.to}:${e.label}:${e.alternative}`),['A>B::false','B>C:sí:false','B>D:no:true','D>A::false','C>F::false','E>F::false']);
  assert.deepEqual(document.nodes.filter(n=>n.zoneId==='Datos').map(n=>n.id),['E','F']);
  assert.deepEqual(report.unsupported.map(u=>u.line),[9,10]);
});
test('invalid Mermaid raises an error and never returns a partial document',()=>{
  for(const bad of ['','sequenceDiagram\n A->>B: hi','flowchart LR\n style A fill:#fff'])assert.throws(()=>importMermaid(bad),(e:unknown)=>e instanceof DiagramError&&e.code==='INVALID_MERMAID');
});
test('Markdown documents the whole diagram or only the selection',()=>{
  const d=example('architecture'),full=exportMarkdown(d),partial=exportMarkdown(d,['api']);
  assert.match(full,/### Backend \(`backend`\)/);assert.match(full,/- Usuario → React: HTTPS/);assert.match(full,/1\. El usuario abre la aplicación\. — 1\.8 s/);
  assert.match(partial,/\*\*API\*\*/);assert.doesNotMatch(partial,/\*\*Usuario\*\*/);assert.match(partial,/React → API: REST/);
});

test('draw.io XML round-trip preserves editable IDs, labels, endpoints, zones and geometry',async()=>{
  const source=example('architecture'),{text,report}=exportDrawio(source),{document}=await importDrawio(text,{id:source.id,title:source.title});
  assert.deepEqual(document.nodes.map(n=>[n.id,n.label,n.zoneId,n.position,n.size]).sort(),source.nodes.map(n=>[n.id,n.label,n.zoneId,n.position,n.size]).sort());
  assert.deepEqual(document.edges.map(e=>[e.id,e.from,e.to,e.label]).sort(),source.edges.map(e=>[e.id,e.from,e.to,e.label]).sort());
  assert.deepEqual(document.zones.map(z=>[z.id,z.label,z.bounds]).sort(),source.zones.map(z=>[z.id,z.label,z.bounds]).sort());
  assert.ok(report.unsupported.some(item=>item.text==='animaciones'));
});

test('draw.io accepts a real mxGraphModel-style fixture and a compressed first page',async()=>{
  // Estructura del ejemplo XML público de jgraph/drawio-libs, ampliada con una arista.
  const model='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="node-a" value="Cliente" style="html=1;" vertex="1" parent="1"><mxGeometry x="20" y="40" width="120" height="60" as="geometry"/></mxCell><mxCell id="node-b" value="Base" style="shape=cylinder;" vertex="1" parent="1"><mxGeometry x="280" y="40" width="120" height="60" as="geometry"/></mxCell><mxCell id="edge-a" value="consulta" edge="1" source="node-a" target="node-b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>';
  const compressed=deflateRawSync(Buffer.from(encodeURIComponent(model))).toString('base64');
  for(const xml of [model,`<mxfile><diagram id="p1" name="Página 1">${compressed}</diagram></mxfile>`]){
    const {document}=await importDrawio(xml);
    assert.deepEqual(document.nodes.map(n=>n.id),['node-a','node-b']);
    assert.equal(document.nodes[1].kind,'database');
    assert.deepEqual(document.edges.map(e=>[e.id,e.from,e.to,e.label]),[['edge-a','node-a','node-b','consulta']]);
  }
});

test('draw.io rejects external entities and over-depth XML without replacing any document',async()=>{
  await assert.rejects(importDrawio('<!DOCTYPE mxfile [<!ENTITY xxe SYSTEM "http://127.0.0.1:9/secret">]><mxfile/>'),(e:unknown)=>e instanceof DiagramError&&e.code==='INVALID_DRAWIO');
  await assert.rejects(importDrawio('<mxfile>'+('<a>'.repeat(35))+'</mxfile>'),(e:unknown)=>e instanceof DiagramError&&e.code==='INVALID_DRAWIO');
});

test('draw.io flattens a grouped child at its absolute position and reports the lost group',async()=>{
  const xml='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="group" value="Grupo" vertex="1" parent="1"><mxGeometry x="100" y="200" width="300" height="200" as="geometry"/></mxCell><mxCell id="child" value="Hijo" vertex="1" parent="group"><mxGeometry x="30" y="40" width="100" height="60" as="geometry"/></mxCell></root></mxGraphModel>';
  const {document,report}=await importDrawio(xml);
  assert.deepEqual(document.nodes.find(n=>n.id==='child')?.position,{x:130,y:240});
  assert.ok(report.unsupported.some(item=>item.text==='child'&&item.reason.includes('Grupo padre')));
});

test('DOT imports nodes, edge chains and clusters; round-trip reports structural losses',()=>{
  const input='digraph G { rankdir=LR; subgraph cluster_back { label="Backend"; api [label="API", shape=box]; db [label="Base", shape=cylinder]; } user [label="Usuario"]; user -> api -> db [label="consulta"]; }';
  const {document}=importDot(input),{text,report}=exportDot(example('architecture')),again=importDot(text).document;
  assert.equal(document.nodes.find(n=>n.id==='db')?.kind,'database');
  assert.equal(document.nodes.find(n=>n.id==='api')?.zoneId,'back');
  assert.deepEqual(document.edges.map(e=>[e.from,e.to,e.label]),[['user','api','consulta'],['api','db','consulta']]);
  assert.deepEqual(again.nodes.map(n=>[n.id,n.label,n.zoneId]).sort(),example('architecture').nodes.map(n=>[n.id,n.label,n.zoneId]).sort());
  assert.deepEqual(again.edges.map(e=>[e.from,e.to,e.label]),example('architecture').edges.map(e=>[e.from,e.to,e.label]));
  assert.ok(report.unsupported.some(item=>item.text==='animaciones'));
});

test('invalid DOT fails atomically with a clear parser error',()=>{
  for(const source of ['digraph G { A -> ; }','digraph G { A [label="open] }','digraph G { A -> B;'])assert.throws(()=>importDot(source),(e:unknown)=>e instanceof DiagramError&&e.code==='INVALID_DOT');
});

test('PlantUML class, sequence and state subsets keep editable relationships and report loss',()=>{
  const classes=importPlantUml('@startuml\ntitle Dominio\nclass "Usuario final" as User {\n  +id: UUID\n  +login()\n}\ninterface Auth\nUser --> Auth : usa\n!include https://example.test/remote.puml\n@enduml');
  assert.equal(classes.kind,'class');assert.equal(classes.document.title,'Dominio');
  assert.equal(classes.document.nodes.find(n=>n.id==='User')?.details,'+id: UUID\n+login()');
  assert.deepEqual(classes.document.edges.map(e=>[e.from,e.to,e.label]),[['User','Auth','usa']]);
  assert.ok(classes.report.unsupported.some(u=>u.text.startsWith('!include')),'las directivas no se ejecutan ni se pierden en silencio');
  const sequence=importPlantUml('@startuml\nactor "Persona" as U\nparticipant API\nU -> API: Login\nAPI --> U: OK\n@enduml');
  assert.equal(sequence.kind,'sequence');assert.equal(sequence.document.nodes.find(n=>n.id==='U')?.kind,'actor');
  assert.deepEqual(sequence.document.edges.map(e=>[e.from,e.to,e.label]),[['U','API','Login'],['API','U','OK']]);
  const states=importPlantUml('@startuml\n[*] --> Pendiente\nstate "En curso" as Curso\nPendiente --> Curso : comenzar\nCurso --> [*]\n@enduml');
  assert.equal(states.kind,'state');assert.equal(states.document.nodes.find(n=>n.id==='start')?.shape,'start');
  assert.equal(states.document.nodes.find(n=>n.id==='end')?.shape,'end');
  assert.deepEqual(states.document.edges.map(e=>[e.from,e.to]),[['start','Pendiente'],['Pendiente','Curso'],['Curso','end']]);
  for(const kind of ['class','sequence','state'] as const){
    const source=kind==='class'?classes.document:kind==='sequence'?sequence.document:states.document;
    const {text,report}=exportPlantUml(source,kind),again=importPlantUml(text,{kind}).document;
    assert.deepEqual(again.nodes.map(n=>n.id).sort(),source.nodes.map(n=>n.id).sort());
    assert.deepEqual(again.edges.map(e=>[e.from,e.to,e.label]),source.edges.map(e=>[e.from,e.to,e.label]));
    assert.ok(report.notes.length);
  }
});

test('PlantUML rejects malformed or unsupported-only documents without a partial result',()=>{
  for(const source of ['@startuml\nclass A {\n+id\n@enduml','@startuml\n!include remote.puml\n@enduml','@startuml\nA -> B: hola'])
    assert.throws(()=>importPlantUml(source),(e:unknown)=>e instanceof DiagramError&&e.code==='INVALID_PLANTUML');
});

test('BPMN basic process keeps IDs, flow references and DI bounds; exports a non-executable subset',()=>{
  const xml=`<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"><bpmn:process id="P" name="Ingreso"><bpmn:startEvent id="Start" name="Pedido"/><bpmn:userTask id="Review" name="Revisar"/><bpmn:exclusiveGateway id="Decision" name="Aprobado"/><bpmn:endEvent id="End" name="Listo"/><bpmn:sequenceFlow id="Flow1" sourceRef="Start" targetRef="Review"/><bpmn:sequenceFlow id="Flow2" sourceRef="Review" targetRef="Decision"/><bpmn:sequenceFlow id="Flow3" name="sí" sourceRef="Decision" targetRef="End"/><bpmn:scriptTask id="Script" name="No ejecutable"/></bpmn:process><bpmndi:BPMNDiagram><bpmndi:BPMNPlane><bpmndi:BPMNShape bpmnElement="Start"><dc:Bounds x="10" y="20" width="50" height="50"/></bpmndi:BPMNShape><bpmndi:BPMNShape bpmnElement="Review"><dc:Bounds x="100" y="20" width="130" height="70"/></bpmndi:BPMNShape><bpmndi:BPMNShape bpmnElement="Decision"><dc:Bounds x="280" y="20" width="60" height="60"/></bpmndi:BPMNShape><bpmndi:BPMNShape bpmnElement="End"><dc:Bounds x="390" y="20" width="50" height="50"/></bpmndi:BPMNShape></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>`;
  const {document,report}=importBpmn(xml,{id:'import-bpmn'});
  assert.equal(document.title,'Ingreso');assert.equal(document.nodes.find(n=>n.id==='Review')?.kind,'service');
  assert.deepEqual(document.nodes.find(n=>n.id==='Review')?.position,{x:100,y:20});
  assert.deepEqual(document.edges.map(e=>[e.id,e.from,e.to]),[['Flow1','Start','Review'],['Flow2','Review','Decision'],['Flow3','Decision','End']]);
  assert.ok(report.unsupported.some(u=>u.text==='scriptTask'));
  const exported=exportBpmn(document),again=importBpmn(exported.text,{id:'again'}).document;
  assert.deepEqual(again.nodes.map(n=>[n.id,n.label,n.position]).sort(),document.nodes.map(n=>[n.id,n.label,n.position]).sort());
  assert.deepEqual(again.edges.map(e=>[e.id,e.from,e.to,e.label]),document.edges.map(e=>[e.id,e.from,e.to,e.label]));
});

test('BPMN rejects external entities and dangling flows atomically',()=>{
  const head='<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P"><bpmn:startEvent id="A"/><bpmn:sequenceFlow id="F" sourceRef="A" targetRef="Missing"/></bpmn:process></bpmn:definitions>';
  for(const source of [`<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///secret">]>${head}`,head])
    assert.throws(()=>importBpmn(source),(e:unknown)=>e instanceof DiagramError&&e.code==='INVALID_BPMN');
});

test('BPMN parallel gateway keeps its semantic mapping across the supported export',()=>{
  const xml='<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="P"><startEvent id="Start"/><parallelGateway id="Fork" name="En paralelo"/><endEvent id="End"/><sequenceFlow id="A" sourceRef="Start" targetRef="Fork"/><sequenceFlow id="B" sourceRef="Fork" targetRef="End"/></process></definitions>';
  const {document}=importBpmn(xml);
  assert.equal(document.nodes.find(n=>n.id==='Fork')?.shape,'hexagon');
  const text=exportBpmn(document).text;
  assert.match(text,/<bpmn:parallelGateway id="Fork"/);
  assert.equal(importBpmn(text).document.nodes.find(n=>n.id==='Fork')?.shape,'hexagon');
});

test('supplied UML and BPMN examples open as editable documents',()=>{
  for(const [file,kind] of [['uml-classes.puml','class'],['uml-login-sequence.puml','sequence'],['uml-order-states.puml','state']] as const){
    const input=readFileSync(new URL(`../../../examples/${file}`,import.meta.url),'utf8');
    const result=importPlantUml(input);
    assert.equal(result.kind,kind);assert.ok(result.document.nodes.length>=3);assert.ok(result.document.edges.length>=2);
  }
  const input=readFileSync(new URL('../../../examples/basic-approval.bpmn',import.meta.url),'utf8');
  const result=importBpmn(input);
  assert.equal(result.document.nodes.length,5);assert.equal(result.document.edges.length,4);
  assert.equal(result.document.nodes.find(n=>n.id==='Review')?.position.x,150);
});
