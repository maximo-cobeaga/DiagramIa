import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBatch,emptyDocument,type ActionInput,type DiagramDocument} from '@diagramia/core';
import {PRESETS,buildPreset} from '../src/timeline/presets.js';

const node=(id:string,label:string,x:number,y:number,zoneId?:string):ActionInput=>({type:'ADD_NODE',node:{id,kind:'service',label,position:{x,y},size:{width:120,height:60},...(zoneId?{zoneId}:{})}});
const edge=(id:string,from:string,to:string,label=''):ActionInput=>({type:'ADD_EDGE',edge:{id,from,to,label}});
const scene=():DiagramDocument=>{
  const actions:ActionInput[]=[
    {type:'CREATE_ZONE',zone:{id:'front',label:'Cliente',bounds:{x:0,y:0,width:300,height:200}}},
    {type:'CREATE_ZONE',zone:{id:'back',label:'Servidor',bounds:{x:400,y:0,width:300,height:200}}},
    node('user','Usuario',10,10,'front'),node('web','Web',160,10,'front'),node('api','API',420,10,'back'),node('db','Base',560,10,'back'),node('far','Suelto',10,400),
    edge('e1','user','web','abre'),edge('e2','web','api','pide'),edge('e3','api','db')
  ];
  return applyBatch(emptyDocument('presets','Presets'),{id:'b',baseRevision:0,actions});
};

test('every preset builds editable steps that only point at existing elements',()=>{
  const doc=scene(),known=new Set([...doc.nodes,...doc.edges].map(x=>x.id));
  for(const preset of PRESETS){
    const {steps,reason}=buildPreset(preset.kind,doc,[]);
    assert.ok(steps.length>0,`${preset.kind}: ${reason}`);
    for(const step of steps){
      assert.ok(step.caption.length>0&&step.caption.length<=500);
      assert.ok([...step.nodeIds,...step.edgeIds].every(id=>known.has(id)),`${preset.kind} refiere un ID inexistente`);
      assert.ok(step.nodeIds.length<=100&&step.durationMs>=100);
    }
    assert.equal(new Set(steps.map(s=>s.id)).size,steps.length,'IDs de paso únicos');
  }
});

test('walk goes by layers, build accumulates, edges explains each relation and spotlight shows every piece once',()=>{
  const doc=scene();
  const walk=buildPreset('walk',doc,[]).steps,build=buildPreset('build',doc,[]).steps;
  assert.deepEqual(walk[0]!.nodeIds.sort(),['far','user'],'los nodos sin entradas arrancan el recorrido');
  assert.equal(walk.length,build.length);
  assert.ok(build.at(-1)!.nodeIds.length>=build[0]!.nodeIds.length,'aparecer de a uno suma, no reemplaza');
  assert.deepEqual(new Set(walk.flatMap(s=>s.nodeIds)),new Set(doc.nodes.map(n=>n.id)),'ninguna pieza queda afuera, ni la suelta');
  const edges=buildPreset('edges',doc,[]).steps;
  assert.equal(edges.length,3);assert.match(edges[0]!.caption,/Usuario → Web: abre/);
  const spot=buildPreset('spotlight',doc,[]).steps;
  assert.equal(spot.length,doc.nodes.length);assert.ok(spot.every(s=>s.nodeIds.length===1&&s.focus==='close'));
});

test('zones add a closing overview, and diagrams that cannot support a style say why instead of creating nothing silently',()=>{
  const doc=scene(),zones=buildPreset('zones',doc,[]).steps;
  assert.equal(zones.length,3);assert.equal(zones.at(-1)!.caption,'Todo junto');assert.match(zones[0]!.caption,/^Cliente:/);
  const plain=applyBatch(emptyDocument('plain','Plano'),{id:'p',baseRevision:0,actions:[node('a','A',0,0)]});
  assert.match(buildPreset('zones',plain,[]).reason??'',/no tiene zonas/);
  assert.match(buildPreset('edges',plain,[]).reason??'',/no tiene conexiones/);
  assert.match(buildPreset('walk',emptyDocument('empty','Vacío'),[]).reason??'',/Agregá elementos/);
});

test('a selection of two or more nodes limits the animation to it',()=>{
  const steps=buildPreset('spotlight',scene(),['user','web']).steps;
  assert.deepEqual(steps.map(s=>s.nodeIds[0]),['user','web']);
});
