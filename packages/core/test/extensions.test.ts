import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyBatch,openDocument,validateDocument,getContext,resolveScenario,statesAt,sampleAnimation,animationDuration,DiagramError,SCHEMA_VERSION,type ActionInput,type DiagramDocument} from '../src/index.js';

const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const example=(name:string):DiagramDocument=>validateDocument(read(`../../../examples/${name}.diagramia.json`));
let counter=0;
const run=(d:DiagramDocument,...actions:ActionInput[])=>applyBatch(d,{id:'x-'+(++counter),baseRevision:d.revision,actions});
const code=(fn:()=>unknown)=>{try{fn();}catch(e){return e instanceof DiagramError?e.code:'OTHER:'+String(e);}return 'NO_ERROR';};
const b64=(text:string)=>Buffer.from(text).toString('base64');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const asset=(id:string,mediaType:'image/png'|'image/svg+xml'|'image/jpeg',data:string)=>({id,label:id,mediaType,data,width:64,height:64});
const imageNode=(id:string,assetId:string)=>({id,kind:'image' as const,label:id,position:{x:40,y:700},size:{width:120,height:120},assetId});

test('documents saved with schema 1.1.0 migrate to the current version without touching content',()=>{
  for(const name of ['architecture','checkout-success','checkout-failure']){
    const old=read(`./fixtures/v1.1.0/${name}.diagramia.json`),{document,migratedFrom}=openDocument(old);
    assert.equal(migratedFrom,'1.1.0');assert.equal(document.schemaVersion,SCHEMA_VERSION);
    assert.deepEqual(document.nodes.map(n=>[n.id,n.position,n.zoneId]),old.nodes.map((n:{id:string;position:object;zoneId:string|null})=>[n.id,n.position,n.zoneId]));
    assert.deepEqual(document.animations.map(a=>a.steps.map(s=>[s.id,s.caption,s.durationMs])),old.animations.map((a:{steps:{id:string;caption:string;durationMs:number}[]})=>a.steps.map(s=>[s.id,s.caption,s.durationMs])));
    assert.ok(document.animations.every(a=>a.scenarios.length===0&&a.steps.every(s=>s.scenarioIds.length===0)));
  }
});
test('scenarios are real branches: normal recovery and expiry traverse different topology and end in different states',()=>{
  const flow=example('checkout-failure').animations[0];
  const recovered=resolveScenario(flow,'recovered'),expired=resolveScenario(flow,'expired');
  const edges=(a:typeof flow)=>new Set(a.steps.flatMap(s=>s.edgeIds));
  assert.ok(edges(recovered).has('retry-loop')&&!edges(recovered).has('release-stock'));
  assert.ok(edges(expired).has('release-stock')&&!edges(expired).has('retry-loop'));
  assert.deepEqual(recovered.steps.slice(0,9).map(s=>s.id),expired.steps.slice(0,9).map(s=>s.id),'el tramo común es el mismo');
  // El reintento vuelve a la pasarela pero el pedido se confirma una sola vez.
  assert.equal(recovered.steps.filter(s=>s.nodeIds.includes('gateway')).length,2);
  assert.equal(recovered.steps.filter(s=>s.states.some(state=>state.nodeId==='order')).length,1);
  const end=(a:typeof flow)=>Object.fromEntries([...statesAt(a,a.steps.length-1)].map(([id,state])=>[id,state.label]));
  assert.deepEqual(end(recovered),{inventory:'RESERVADO',pending:'RESUELTO',order:'CONFIRMADO'});
  assert.deepEqual(end(expired),{inventory:'LIBERADO',pending:'CANCELADO'});
  assert.equal(statesAt(expired,7).get('pending')!.label,'PENDIENTE');
  // Cada rama tiene su propia duración y su propio seek exacto.
  assert.equal(animationDuration(expired),13*1800);assert.equal(sampleAnimation(expired,9*1800).step.id,'step-timeout');
  assert.equal(resolveScenario(flow,'no-existe').steps.length,flow.steps.length);
});
test('scenario edits keep the animation coherent',()=>{
  const d=example('checkout-failure');
  const dropped=run(d,{type:'DELETE_SCENARIO',animationId:'main-flow',scenarioId:'expired'}).animations[0];
  assert.deepEqual(dropped.scenarios.map(s=>s.id),['recovered']);assert.ok(!dropped.steps.some(s=>s.id==='step-freed'));assert.ok(dropped.steps.some(s=>s.id==='step-8'));
  assert.equal(code(()=>run(d,...['step-timeout','step-expire','step-release','step-freed'].map(stepId=>({type:'UPDATE_STEP' as const,animationId:'main-flow',stepId,changes:{scenarioIds:['recovered']}})),{type:'UPDATE_STEP',animationId:'main-flow',stepId:'step-8',changes:{scenarioIds:['recovered']}},...['step-0','step-1','step-2','step-3','step-4','step-5','step-6','step-7'].map(stepId=>({type:'UPDATE_STEP' as const,animationId:'main-flow',stepId,changes:{scenarioIds:['recovered']}})))),'EMPTY_SCENARIO');
  assert.equal(code(()=>run(d,{type:'UPDATE_STEP',animationId:'main-flow',stepId:'step-0',changes:{scenarioIds:['ghost']}})),'DANGLING_ANIMATION');
  assert.equal(code(()=>run(d,{type:'UPDATE_STEP',animationId:'main-flow',stepId:'step-0',changes:{states:[{nodeId:'ghost',label:'X'}]}})),'DANGLING_ANIMATION');
  const pruned=run(d,{type:'DELETE_NODE',id:'inventory'}).animations[0];
  assert.ok(pruned.steps.every(s=>s.states.every(state=>state.nodeId!=='inventory')));
});
test('image assets must be real, static and used; they leave with their last node',()=>{
  const base=example('architecture');
  const withImage=run(base,{type:'ADD_ASSET',asset:asset('logo','image/png',PNG)},{type:'ADD_NODE',node:imageNode('pic','logo')});
  assert.equal(withImage.assets.length,1);
  assert.ok(withImage.appliedBatches.at(-1)!.signature.length<2000,'el ledger guarda la huella, no la imagen');
  assert.equal(code(()=>run(base,{type:'ADD_ASSET',asset:asset('logo','image/png',PNG)})),'UNUSED_ASSET');
  assert.equal(code(()=>run(base,{type:'ADD_NODE',node:imageNode('pic','ghost')})),'DANGLING_ASSET');
  assert.equal(code(()=>run(base,{type:'ADD_ASSET',asset:asset('fake','image/jpeg',PNG)},{type:'ADD_NODE',node:imageNode('pic','fake')})),'INVALID_ASSET');
  const svg=(body:string)=>b64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);
  for(const hostile of ['<script>alert(1)</script>','<rect onload="alert(1)"/>','<image href="https://evil.example/x.png"/>','<a href="javascript:alert(1)"><rect/></a>','<foreignObject><p>x</p></foreignObject>','<rect style="fill:url(https://evil.example/a)"/>'])
    assert.equal(code(()=>run(base,{type:'ADD_ASSET',asset:asset('bad','image/svg+xml',svg(hostile))},{type:'ADD_NODE',node:imageNode('pic','bad')})),'UNSAFE_ASSET',hostile);
  const safe=run(base,{type:'ADD_ASSET',asset:asset('icon','image/svg+xml',svg('<defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/>'))},{type:'ADD_NODE',node:imageNode('pic','icon')});
  assert.equal(safe.assets[0].id,'icon');
  assert.equal(run(withImage,{type:'DELETE_NODE',id:'pic'}).assets.length,0);
  const context=getContext(withImage);
  assert.deepEqual(context.assets,[{id:'logo',label:'logo',mediaType:'image/png',width:64,height:64,bytes:70}]);assert.ok(!JSON.stringify(context).includes(PNG));
  const tampered=JSON.parse(JSON.stringify(withImage));tampered.assets[0].mediaType='image/webp';
  assert.equal(code(()=>openDocument(tampered)),'INVALID_ASSET');
});
test('annotations stay bound to existing elements and survive their deletion as document-level notes',()=>{
  const base=example('architecture');
  let d=run(base,{type:'ADD_ANNOTATION',annotation:{id:'note-1',targetId:'db',severity:'warning',text:'Sin réplica.',suggestion:'Agregar réplica de lectura.',source:'ai'}},{type:'ADD_ANNOTATION',annotation:{id:'note-2',targetId:'backend',text:'Revisar límites.'}});
  assert.equal(code(()=>run(base,{type:'ADD_ANNOTATION',annotation:{id:'n',targetId:'ghost',text:'x'}})),'DANGLING_ANNOTATION');
  assert.deepEqual(getContext(d,['api'],{scope:'selection'}).annotations.map(n=>n.id),['note-1','note-2']);
  d=run(d,{type:'UPDATE_ANNOTATION',id:'note-1',changes:{resolved:true}},{type:'DELETE_NODE',id:'db'},{type:'DELETE_ZONE',id:'backend'});
  assert.deepEqual(d.annotations.map(n=>[n.id,n.targetId,n.resolved,n.text]),[['note-1',null,true,'Sin réplica.'],['note-2',null,false,'Revisar límites.']]);
  assert.equal(run(d,{type:'DELETE_ANNOTATION',id:'note-2'}).annotations.length,1);
});

test('a node placed next to a zoned node joins that zone when it fits, and stays free when it does not',()=>{
  const base=example('architecture'),node=(id:string)=>({id,kind:'cache' as const,label:id,position:{x:0,y:0},size:{width:150,height:82}});
  assert.equal(run(base,{type:'ADD_NODE',node:node('redis'),placement:{below:'api',gap:60}}).nodes.at(-1)!.zoneId,'backend');
  assert.equal(run(base,{type:'ADD_NODE',node:node('far'),placement:{below:'api',gap:400}}).nodes.at(-1)!.zoneId,null);
  assert.equal(run(base,{type:'ADD_NODE',node:node('side'),placement:{below:'user'}}).nodes.at(-1)!.zoneId,null);
});
