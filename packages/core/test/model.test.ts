import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyBatch,fitSize,openDocument,validateDocument,previewBatch,getContext,routeEdge,edgePoints,instantiateComponent,validateLibrary,BUILTIN_LIBRARY,DiagramError,SCHEMA_VERSION,resolveScenario,sampleTrackEffects,stepStarts,type ActionInput,type DiagramDocument} from '../src/index.js';

const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const initial=():DiagramDocument=>validateDocument(read('../../../examples/architecture.diagramia.json'));
let counter=0;
const run=(d:DiagramDocument,...actions:ActionInput[])=>applyBatch(d,{id:'t-'+(++counter),baseRevision:d.revision,actions});
const code=(fn:()=>unknown)=>{try{fn();}catch(e){return e instanceof DiagramError?e.code:'OTHER:'+String(e);}return 'NO_ERROR';};
const node=(id:string,x:number,y:number,extra:object={})=>({id,kind:'service' as const,label:id,position:{x,y},size:{width:150,height:82},...extra});
const hits=(points:{x:number;y:number}[],n:{position:{x:number;y:number};size:{width:number;height:number}})=>points.slice(1).some((p,i)=>Math.max(p.x,points[i].x)>n.position.x&&Math.min(p.x,points[i].x)<n.position.x+n.size.width&&Math.max(p.y,points[i].y)>n.position.y&&Math.min(p.y,points[i].y)<n.position.y+n.size.height);

test('documents saved with schema 1.0.0 migrate without changing IDs, geometry or animations',()=>{
  for(const name of ['architecture','checkout-success','checkout-failure']){
    const old=read(`./fixtures/v1.0.0/${name}.diagramia.json`),{document,migratedFrom}=openDocument(old);
    assert.equal(migratedFrom,'1.0.0');assert.equal(document.schemaVersion,SCHEMA_VERSION);assert.equal(old.schemaVersion,'1.0.0','el input no se muta');
    for(const key of ['nodes','edges','zones','animations'] as const)assert.deepEqual(document[key].map(x=>x.id),old[key].map((x:{id:string})=>x.id));
    assert.deepEqual(document.nodes.map(n=>n.position),old.nodes.map((n:{position:object})=>n.position));
    assert.deepEqual(document.edges.map(e=>e.points),old.edges.map((e:{points?:object})=>e.points));
    assert.equal(openDocument(document).migratedFrom,null);
  }
});
test('schema 1.3.0 migrates to free drawings without changing stable element IDs',()=>{
  const old={...initial(),schemaVersion:'1.3.0'} as Record<string,unknown>;delete old.drawings;
  const opened=openDocument(old);
  assert.equal(opened.migratedFrom,'1.3.0');assert.equal(opened.document.schemaVersion,SCHEMA_VERSION);assert.deepEqual(opened.document.drawings,[]);
  assert.deepEqual(opened.document.nodes.map(n=>n.id),initial().nodes.map(n=>n.id));
});
test('schema 1.4.0 adds empty tracks without changing old steps or their IDs',()=>{
  const old={...initial(),schemaVersion:'1.4.0',animations:initial().animations.map(({tracks:_tracks,...a})=>a)};
  const {document,migratedFrom}=openDocument(old);
  assert.equal(migratedFrom,'1.4.0');assert.deepEqual(document.animations[0].tracks,[]);
  assert.deepEqual(document.animations[0].steps.map(s=>s.id),initial().animations[0].steps.map(s=>s.id));
});
test('schema 1.5.0 opens unchanged as 1.6.0; the new icons and the large icon size are valid and need room for the name',()=>{
  const old={...initial(),schemaVersion:'1.5.0'},{document,migratedFrom}=openDocument(old);
  assert.equal(migratedFrom,'1.5.0');assert.equal(document.schemaVersion,'1.6.0');
  assert.deepEqual(document,initial(),'sólo cambia la versión: el ejemplo ya es 1.6.0 y el contenido es el mismo');
  const card=run(initial(),{type:'ADD_NODE',node:node('idea',0,600,{kind:'custom',shape:'rounded',icon:'idea',style:{fill:'#fff3b0',iconSize:'large'}})}).nodes.at(-1)!;
  assert.equal(card.icon,'idea');assert.equal(card.style.iconSize,'large');
  const small=fitSize({...card,style:{fill:'#fff3b0'}}),large=fitSize(card);
  assert.ok(large.height>=small.height+28,`el icono grande suma alto: ${small.height} → ${large.height}`);
  assert.throws(()=>run(initial(),{type:'ADD_NODE',node:node('x',0,600,{icon:'unicornio'})} as unknown as ActionInput),/icon/,'un icono fuera del catálogo se rechaza');
});
test('an unknown schema version is rejected with a recoverable error instead of being guessed',()=>{
  const future={...initial(),schemaVersion:'9.0.0'};
  assert.equal(code(()=>openDocument(future)),'UNSUPPORTED_VERSION');
  assert.equal(code(()=>openDocument({nodes:[]})),'INVALID_DOCUMENT');
});
test('partial updates keep every field that was not mentioned',()=>{
  const api=run(initial(),{type:'UPDATE_NODE',id:'api',changes:{label:'API v2'}}).nodes.find(n=>n.id==='api')!;
  assert.equal(api.zoneId,'backend');assert.equal(api.subtitle,'BACKEND');assert.equal(api.label,'API v2');
});
test('free lines, arrows and hand drawn paths are canonical editable content with stable IDs',()=>{
  const path=[{x:12,y:20},{x:80,y:65},{x:140,y:25}],drawing={id:'stroke-1',kind:'freehand' as const,points:path};
  let d=run(initial(),{type:'ADD_DRAWING',drawing});
  assert.deepEqual(d.drawings[0].points,path);
  d=run(d,{type:'UPDATE_DRAWING',id:'stroke-1',changes:{kind:'arrow',style:{stroke:'#245cf6'}}});
  assert.equal(d.drawings[0].id,'stroke-1');assert.equal(d.drawings[0].kind,'arrow');
  assert.equal(code(()=>run(d,{type:'ADD_DRAWING',drawing})),'DUPLICATE_ID');
  assert.equal(run(d,{type:'DELETE_DRAWING',id:'stroke-1'}).drawings.length,0);
  assert.notEqual(code(()=>run(initial(),{type:'ADD_DRAWING',drawing:{id:'bad',kind:'line',points:[{x:0,y:0}]}})),'NO_ERROR');
});
test('a new animation that references a missing element fails instead of being silently pruned',()=>{
  assert.equal(code(()=>run(initial(),{type:'CREATE_ANIMATION',animation:{id:'bad',label:'Bad',steps:[{id:'s1',caption:'',durationMs:500,nodeIds:['ghost'],edgeIds:[]}]}})),'DANGLING_ANIMATION');
});
test('relative placement skips occupied space and explains when the zone has no room',()=>{
  const below={inside:'backend',below:'api',gap:20};
  let d=run(initial(),{type:'ADD_NODE',node:node('redis',0,0),placement:below});
  d=run(d,{type:'ADD_NODE',node:node('worker',0,0),placement:below});
  const [redis,worker]=['redis','worker'].map(id=>d.nodes.find(n=>n.id===id)!);
  assert.deepEqual(redis.position,{x:540,y:322});assert.deepEqual(worker.position,{x:540,y:424});
  assert.equal(code(()=>run(d,{type:'ADD_NODE',node:node('third',0,0),placement:below})),'NO_SPACE');
  assert.equal(code(()=>run(d,{type:'ADD_NODE',node:node('x',0,0),placement:{below:'api',rightOf:'db'}})),'AMBIGUOUS_PLACEMENT');
});
test('two zones with the same label require disambiguation by ID',()=>{
  const d=run(initial(),{type:'CREATE_ZONE',zone:{id:'backend-2',label:'backend ',bounds:{x:0,y:700,width:400,height:300}}});
  assert.equal(code(()=>run(d,{type:'ADD_NODE',node:node('redis',0,0),placement:{insideLabel:'Backend'}})),'AMBIGUOUS_ZONE');
  assert.equal(run(d,{type:'ADD_NODE',node:node('redis',0,0),placement:{inside:'backend-2'}}).nodes.at(-1)!.zoneId,'backend-2');
  const context=getContext(d,['api'],{scope:'selection'});
  assert.ok('otherZones' in context&&context.otherZones.some(z=>z.id==='backend-2'));
});
test('zones move with their members, refuse bounds that exclude them and release them on delete',()=>{
  const moved=run(initial(),{type:'MOVE_ZONE',id:'backend',position:{x:500,y:190}});
  assert.deepEqual(moved.nodes.find(n=>n.id==='api')!.position,{x:560,y:320});
  assert.deepEqual(moved.nodes.find(n=>n.id==='user')!.position,{x:40,y:220});
  assert.equal(code(()=>run(initial(),{type:'UPDATE_ZONE',id:'backend',changes:{bounds:{x:480,y:90,width:300,height:500}}})),'OUTSIDE_ZONE');
  const released=run(initial(),{type:'DELETE_ZONE',id:'backend'});
  assert.equal(released.nodes.length,4);assert.ok(released.nodes.every(n=>n.zoneId===null));
  assert.deepEqual(run(initial(),{type:'DELETE_ZONE',id:'backend',members:'delete'}).nodes.map(n=>n.id),['user','frontend']);
});
test('groups nest, survive moves and disappear when their last member is deleted',()=>{
  let d=run(initial(),{type:'CREATE_GROUP',group:{id:'g-data'},nodeIds:['api','db']});
  d=run(d,{type:'CREATE_GROUP',group:{id:'g-all'},nodeIds:['frontend','api']});
  assert.equal(d.groups.find(g=>g.id==='g-data')!.parentId,'g-all');
  assert.equal(d.nodes.find(n=>n.id==='frontend')!.groupId,'g-all');assert.equal(d.nodes.find(n=>n.id==='db')!.groupId,'g-data');
  d=run(d,{type:'MOVE_NODES',ids:['api','db'],dx:10,dy:10});
  assert.equal(d.nodes.find(n=>n.id==='db')!.groupId,'g-data');assert.ok(d.edges.some(e=>e.id==='api-db'));
  d=run(d,{type:'DELETE_NODE',id:'api'},{type:'DELETE_NODE',id:'db'});
  assert.deepEqual(d.groups.map(g=>g.id),['g-all']);
  d=run(d,{type:'DELETE_GROUP',id:'g-all'});
  assert.equal(d.nodes.find(n=>n.id==='frontend')!.groupId,null);
});
test('timeline edits are actions: add, reorder, retime and delete steps; frames can be removed safely',()=>{
  let d=run(initial(),{type:'CREATE_FRAME',frame:{id:'f-back',label:'Backend',bounds:{x:460,y:70,width:730,height:540}}});
  d=run(d,{type:'ADD_STEP',animationId:'request',index:1,step:{id:'s-new',caption:'Nuevo',durationMs:900,nodeIds:['api'],edgeIds:[],frameId:'f-back'}});
  d=run(d,{type:'MOVE_STEP',animationId:'request',stepId:'s-new',index:4},{type:'UPDATE_STEP',animationId:'request',stepId:'s-user',changes:{durationMs:500}});
  const steps=d.animations[0].steps;
  assert.deepEqual(steps.map(s=>s.id),['s-user','s-front','s-api','s-db','s-new']);
  assert.equal(steps[0].durationMs,500);assert.equal(steps[0].caption,'El usuario abre la aplicación.');
  const preview=previewBatch(d,{id:'drop-frame',baseRevision:d.revision,actions:[{type:'DELETE_FRAME',id:'f-back'},{type:'DELETE_EDGE',id:'api-db'}]});
  assert.equal(preview.document.animations[0].steps.at(-1)!.frameId,null);
  assert.deepEqual(preview.prunedReferences.map(p=>p.stepId).sort(),['s-api','s-new']);
  const single=run(initial(),{type:'CREATE_ANIMATION',animation:{id:'one',label:'One',steps:[{id:'only',caption:'',durationMs:500,nodeIds:[],edgeIds:[]}]}});
  assert.equal(code(()=>run(single,{type:'DELETE_STEP',animationId:'one',stepId:'only'})),'EMPTY_ANIMATION');
});
test('independent highlight, caption and camera tracks follow step IDs under retiming and deletion',()=>{
  let d=run(initial(),{type:'CREATE_FRAME',frame:{id:'focus',label:'Usuario',bounds:{x:0,y:100,width:300,height:300}}},
    {type:'ADD_TRACK',animationId:'request',track:{id:'visual',label:'Resaltado',kind:'highlight',clips:[{id:'clip-user',stepId:'s-user',nodeIds:['user']},{id:'clip-front',stepId:'s-front',nodeIds:['frontend']}]}},
    {type:'ADD_TRACK',animationId:'request',track:{id:'words',label:'Notas',kind:'caption',clips:[{id:'clip-note',stepId:'s-user',caption:'Abrir formulario'}]}},
    {type:'ADD_TRACK',animationId:'request',track:{id:'camera',label:'Cámara',kind:'camera',clips:[{id:'clip-camera',stepId:'s-user',frameId:'focus'}]}});
  let animation=d.animations[0],first=sampleTrackEffects(animation,0);
  assert.deepEqual(first.nodeIds,['user']);assert.deepEqual(first.captions,['Abrir formulario']);assert.equal(first.frameId,'focus');
  d=run(d,{type:'UPDATE_STEP',animationId:'request',stepId:'s-user',changes:{durationMs:3000}});
  animation=d.animations[0];assert.deepEqual(sampleTrackEffects(animation,2999).nodeIds,['user']);assert.deepEqual(sampleTrackEffects(animation,stepStarts(animation)[1]).nodeIds,['frontend']);
  assert.equal(code(()=>run(d,{type:'ADD_TRACK_CLIP',animationId:'request',trackId:'visual',clip:{id:'duplicate',stepId:'s-front',nodeIds:['api']}})),'DUPLICATE_TRACK_CLIP');
  const preview=previewBatch(d,{id:'prune-track',baseRevision:d.revision,actions:[{type:'DELETE_NODE',id:'user'}]});
  assert.deepEqual(preview.document.animations[0].tracks[0].clips[0].nodeIds,[]);
  assert.ok(preview.prunedReferences.some(ref=>ref.stepId==='visual/clip-user'&&ref.removed.includes('user')));
  d=run(d,{type:'DELETE_STEP',animationId:'request',stepId:'s-user'});
  assert.ok(d.animations[0].tracks.every(t=>t.clips.every(c=>c.stepId!=='s-user')));
});
test('scenario branches keep only effects whose steps are in the chosen route',()=>{
  const base=validateDocument(read('../../../examples/checkout-failure.diagramia.json'));
  const d=run(base,{type:'ADD_TRACK',animationId:'main-flow',track:{id:'branch-notes',label:'Resultado',kind:'caption',clips:[{id:'expired-note',stepId:'step-timeout',caption:'Tiempo vencido'},{id:'recovered-note',stepId:'step-choose',caption:'Pago recuperado'}]}});
  const expired=resolveScenario(d.animations[0],'expired'),recovered=resolveScenario(d.animations[0],'recovered');
  assert.deepEqual(expired.tracks[0].clips.map(c=>c.id),['expired-note']);assert.deepEqual(recovered.tracks[0].clips.map(c=>c.id),['recovered-note']);
  assert.deepEqual(sampleTrackEffects(expired,stepStarts(expired)[9]).captions,['Tiempo vencido']);
});
test('layout actions are deterministic and never move nodes outside the given list',()=>{
  const base=run(initial(),{type:'ADD_NODE',node:node('a',40,700)},{type:'ADD_NODE',node:node('b',900,640)},{type:'ADD_NODE',node:node('c',300,900)},{type:'ADD_EDGE',edge:{id:'a-b',from:'a',to:'b'}},{type:'ADD_EDGE',edge:{id:'b-c',from:'b',to:'c'}},{type:'ADD_EDGE',edge:{id:'c-a',from:'c',to:'a'}});
  const layout:ActionInput={type:'LAYOUT_NODES',ids:['c','a','b'],direction:'right',gap:50};
  const once=run(base,layout),again=run(base,{...layout,ids:['a','b','c']});
  const pos=(d:DiagramDocument,id:string)=>d.nodes.find(n=>n.id===id)!.position;
  assert.deepEqual(['a','b','c'].map(id=>pos(once,id)),['a','b','c'].map(id=>pos(again,id)));
  assert.deepEqual(['a','b','c'].map(id=>pos(once,id)),[{x:40,y:640},{x:240,y:640},{x:440,y:640}]);
  for(const id of ['user','frontend','api','db'])assert.deepEqual(pos(once,id),pos(base,id));
  const aligned=run(base,{type:'ALIGN_NODES',ids:['a','b','c'],mode:'top'});
  assert.deepEqual(['a','b','c'].map(id=>pos(aligned,id).y),[640,640,640]);
  const spread=run(aligned,{type:'DISTRIBUTE_NODES',ids:['a','b','c'],axis:'horizontal'});
  assert.deepEqual(['a','c','b'].map(id=>pos(spread,id).x),[40,470,900]);
  assert.equal(code(()=>run(base,{type:'LAYOUT_NODES',ids:['api','db'],direction:'right',gap:400})),'OUTSIDE_ZONE');
});
test('automatic routes avoid a node placed between both ends and honour explicit ports',()=>{
  const d=run(initial(),{type:'ADD_NODE',node:node('left',0,700)},{type:'ADD_NODE',node:node('wall',250,680,{size:{width:100,height:140}})},{type:'ADD_NODE',node:node('right',500,700)},{type:'ADD_EDGE',edge:{id:'l-r',from:'left',to:'right'}},{type:'ADD_EDGE',edge:{id:'ported',from:'left',to:'right',fromPort:'bottom',toPort:'bottom'}});
  const edge=d.edges.find(e=>e.id==='l-r')!,route=routeEdge(edge,d);
  assert.ok(!hits(route,d.nodes.find(n=>n.id==='wall')!),JSON.stringify(route));
  assert.deepEqual(routeEdge(edge,d),route);
  const ported=edgePoints(d.edges.find(e=>e.id==='ported')!,d);
  assert.deepEqual(ported[0],{x:75,y:782});assert.deepEqual(ported.at(-1),{x:575,y:782});
  const straight=edgePoints(initial().edges[0],initial());
  assert.deepEqual(straight,[{x:190,y:261},{x:270,y:261}]);
});
test('library components instantiate with fresh IDs and independent copies',()=>{
  validateLibrary(JSON.parse(JSON.stringify(BUILTIN_LIBRARY)));
  const component=BUILTIN_LIBRARY.components.find(c=>c.id==='three-tier')!;
  const first=instantiateComponent(initial(),component,{x:0,y:1000});
  let d=run(initial(),...first.actions);
  const second=instantiateComponent(d,component,{x:0,y:1400});
  d=run(d,...second.actions);
  assert.deepEqual(first.nodeIds,['client-1','web-1','api-1','db-1']);assert.deepEqual(second.nodeIds,['client-2','web-2','api-2','db-2']);
  assert.equal(d.nodes.find(n=>n.id==='api-2')!.zoneId,'backend-2');
  d=run(d,{type:'UPDATE_NODE',id:'api-1',changes:{label:'Editada'}});
  assert.equal(d.nodes.find(n=>n.id==='api-2')!.label,'API');assert.equal(component.nodes.find(n=>n.id==='api')!.label,'API');
});
test('selection context keeps the focus and its neighbours, and respects the element budget',()=>{
  const d=validateDocument(read('../../../examples/checkout-success.diagramia.json'));
  const all=getContext(d),focused=getContext(d,[d.nodes[3].id],{scope:'selection'});
  assert.ok(focused.nodes.length<all.nodes.length);assert.ok(focused.nodes.some(n=>n.id===d.nodes[3].id));
  assert.ok(focused.edges.every(e=>focused.nodes.some(n=>n.id===e.from)&&focused.nodes.some(n=>n.id===e.to)));
  const tight=getContext(d,[],{maxElements:6});
  assert.equal(tight.truncated,true);assert.ok(tight.nodes.length<=3);assert.equal(tight.total.nodes,d.nodes.length);
});
