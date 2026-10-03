import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyBatch,autoFocus,documentBounds,emptyDocument,openDocument,resolveScenario,SCHEMA_VERSION,stepCamera,TRANSITION_MS,type ActionInput,type DiagramDocument} from '../src/index.js';

const architecture=():DiagramDocument=>openDocument(JSON.parse(readFileSync(new URL('../../../examples/architecture.diagramia.json',import.meta.url),'utf8'))).document;
let counter=0;
const run=(d:DiagramDocument,...actions:ActionInput[])=>applyBatch(d,{id:'cam-'+(++counter),baseRevision:d.revision,actions});
const step=(id:string,nodeIds:string[],extra:object={})=>({id,caption:id,durationMs:2000,nodeIds,edgeIds:[],...extra});
const area=(r:{width:number;height:number}|null)=>r?r.width*r.height:0;

test('steps saved before the camera fields open with automatic focus and a smooth transition',()=>{
  const raw=JSON.parse(readFileSync(new URL('../../../examples/architecture.diagramia.json',import.meta.url),'utf8'));
  raw.schemaVersion='1.6.0';raw.animations.forEach((a:any)=>a.steps.forEach((s:any)=>{delete s.focus;delete s.transition;}));
  const before=structuredClone(raw),{document:d,migratedFrom}=openDocument(raw);
  assert.equal(migratedFrom,'1.6.0');assert.equal(d.schemaVersion,SCHEMA_VERSION);assert.deepEqual(raw,before,'abrir no modifica la entrada');
  const restored=structuredClone(d);restored.schemaVersion='1.6.0' as never;
  restored.animations.forEach(a=>a.steps.forEach(s=>{delete (s as any).focus;delete (s as any).transition;}));
  assert.deepEqual(restored,before,'IDs, geometría, contenido e historial se conservan');
  assert.ok(d.animations[0]!.steps.every(s=>s.focus==='auto'&&s.transition==='smooth'));
});

test('each step frames what it highlights at the distance it asks for, and the transition sets the travel time',()=>{
  const d=run(architecture(),{type:'CREATE_FRAME',frame:{id:'f',label:'Back',bounds:{x:500,y:150,width:700,height:300}}},{type:'CREATE_ANIMATION',animation:{id:'a',label:'Cámara',steps:[
    step('close',['api'],{focus:'close',transition:'cut'}),step('medium',['api'],{focus:'medium'}),step('wide',['api'],{focus:'wide',transition:'slow'}),
    step('overview',['api'],{focus:'overview'}),step('stay',['user'],{focus:'stay'}),step('framed',['user'],{focus:'close',frameId:'f'}),step('empty',[],{focus:'close'})]}});
  const a=d.animations.find(x=>x.id==='a')!,shot=(i:number)=>stepCamera(d,a,i),all=documentBounds(d,[...d.nodes,...d.edges,...d.zones].map(x=>x.id));
  const api=d.nodes.find(n=>n.id==='api')!,close=shot(0).bounds!;
  // De cerca: sólo el elemento con un margen; cada nivel siguiente muestra más contexto, sin salir del diagrama.
  assert.deepEqual(close,{x:api.position.x-24,y:api.position.y-24,width:api.size.width+48,height:api.size.height+48});
  assert.ok(area(close)<area(shot(1).bounds)&&area(shot(1).bounds)<area(shot(2).bounds)&&area(shot(2).bounds)<=area(all));
  assert.deepEqual(shot(3).bounds,all);
  assert.deepEqual(shot(4).bounds,shot(3).bounds,'«mantener» conserva la vista del paso anterior aunque resalte otra cosa');
  assert.deepEqual(shot(5).bounds,{x:500,y:150,width:700,height:300},'un frame manda sobre el enfoque');
  assert.deepEqual(shot(6).bounds,all,'sin nada resaltado se ve todo');
  assert.deepEqual([0,1,2].map(i=>shot(i).transitionMs),[TRANSITION_MS.cut,TRANSITION_MS.smooth,TRANSITION_MS.slow]);
  assert.throws(()=>run(d,{type:'UPDATE_STEP',animationId:'a',stepId:'close',changes:{focus:'zoom-loco' as never}}));
});

test('automatic tours pick a focus by how much each step shows',()=>{
  const d=architecture();
  assert.equal(autoFocus(d,['api'],[]),'medium');
  assert.equal(autoFocus(d,d.nodes.map(n=>n.id),[]),'overview');
});

test('camera tracks override step frames, highlights affect focus, and stay follows the previous step in its scenario',()=>{
  const d=run(architecture(),{type:'CREATE_FRAME',frame:{id:'f',label:'Sólo API',bounds:{x:500,y:100,width:300,height:250}}},{type:'CREATE_FRAME',frame:{id:'f2',label:'Otra vista',bounds:{x:20,y:20,width:900,height:500}}},{type:'CREATE_ANIMATION',animation:{id:'a',label:'Ramas',scenarios:[{id:'yes',label:'Sí'},{id:'no',label:'No'}],steps:[
    step('first',['user'],{focus:'close'}),step('excluded',['db'],{focus:'overview',scenarioIds:['no']}),
    step('kept',['db'],{focus:'stay',scenarioIds:['yes']}),step('track',['user'],{focus:'close',frameId:'f'})],
    tracks:[{id:'camera-track',label:'Cámara',kind:'camera',clips:[{id:'cam-clip',stepId:'track',frameId:'f2'}]},
      {id:'highlight-track',label:'Resaltar',kind:'highlight',clips:[{id:'highlight-clip',stepId:'first',nodeIds:['api']}]}]}});
  const a=resolveScenario(d.animations.find(a=>a.id==='a')!,'yes'),first=stepCamera(d,a,0).bounds!;
  assert.ok(first.x<=d.nodes.find(n=>n.id==='user')!.position.x&&first.x+first.width>=d.nodes.find(n=>n.id==='api')!.position.x,'el encuadre incluye el resaltado de la pista');
  assert.deepEqual(stepCamera(d,a,1).bounds,first,'mantener sigue el paso previo de la rama visible');
  assert.deepEqual(stepCamera(d,a,2).bounds,d.frames.find(f=>f.id==='f2')!.bounds,'la pista de cámara manda sobre el frame del paso');
  assert.deepEqual(stepCamera(d,a,999).bounds,stepCamera(d,a,2).bounds,'índice fuera de rango se acota');
});

test('a frame-only animation still frames its content and an overview includes free drawings',()=>{
  const framed=run(emptyDocument('frames','Sólo frames'),{type:'CREATE_FRAME',frame:{id:'f',label:'Encuadre',bounds:{x:500,y:150,width:700,height:300}}},{type:'CREATE_ANIMATION',animation:{id:'a',label:'Frame',steps:[step('s',[],{frameId:'f'})]}});
  assert.deepEqual(stepCamera(framed,framed.animations[0],0).bounds,framed.frames[0].bounds);
  const d=run(architecture(),{type:'ADD_DRAWING',drawing:{id:'far',kind:'line',points:[{x:3000,y:150},{x:3300,y:450}],style:{}}},{type:'CREATE_ANIMATION',animation:{id:'a',label:'Todo',steps:[step('s',[],{focus:'overview'})]}});
  const bounds=stepCamera(d,d.animations.find(a=>a.id==='a')!,0).bounds!;
  assert.ok(bounds.x+bounds.width>=3300,'el recorrido no deja los trazos fuera del encuadre');
});
