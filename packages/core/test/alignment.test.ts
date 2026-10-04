import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alignSelectionActions,applyBatch,emptyDocument,snapSelection,selectionUnits,type ActionInput,type DiagramDocument} from '../src/index.js';
let seq=0;const run=(d:DiagramDocument,...actions:ActionInput[])=>applyBatch(d,{id:'align-'+seq++,baseRevision:d.revision,actions});
const scene=()=>run(emptyDocument('align','Alinear'),...['a','b','c'].map((id,i)=>({type:'ADD_NODE' as const,node:{id,kind:'note' as const,label:id,position:{x:20+i*i*90,y:20+i*50},size:{width:80,height:40}}})),{type:'ADD_DRAWING',drawing:{id:'ink',kind:'line',points:[{x:20,y:90},{x:100,y:90}]}},{type:'CREATE_GROUP',group:{id:'piece'},nodeIds:['a'],drawingIds:['ink']});

test('guías ajustan centros y bordes con tolerancia proporcional al zoom sin mover vecinos',()=>{
  const d=scene(),snapshot=structuredClone(d),adjusted=snapSelection(d,['b'],3,-47,6);
  assert.equal(adjusted.dy,-50);assert.ok(adjusted.guides.some(g=>g.axis==='y'));
  assert.deepEqual(d,snapshot);assert.equal(snapSelection(d,['b'],3,-35,2).dy,-35);
  assert.equal(snapSelection(d,['a','b','c','ink'],0,0,6).guides.length,0);
});

test('alinear piezas mixtas conserva la posición relativa de un dibujo agrupado',()=>{
  const d=scene(),ids=['a','ink','b'],units=selectionUnits(d,ids);assert.equal(units.length,2);
  const result=run(d,...alignSelectionActions(d,ids,'top'));
  assert.equal(result.nodes.find(n=>n.id==='b')!.position.y,20);
  assert.deepEqual(result.drawings[0].points,d.drawings[0].points);
  const bottom=run(d,...alignSelectionActions(d,ids,'bottom'));
  assert.equal(bottom.drawings[0].points[0].y-bottom.nodes.find(n=>n.id==='a')!.position.y,70);
  assert.deepEqual(bottom.nodes.find(n=>n.id==='c'),d.nodes.find(n=>n.id==='c'));
});

test('distribuir tres piezas produce distancias uniformes y no modifica elementos externos',()=>{
  const d=scene(),result=run(d,...alignSelectionActions(d,['a','ink','b','c'],'horizontal'));
  const [a,b,c]=result.nodes;assert.equal(b.position.x-a.position.x-80,c.position.x-b.position.x-80);
  assert.equal(result.drawings[0].points[0].x-a.position.x,0);
  assert.deepEqual(alignSelectionActions(d,['a','ink','b'],'horizontal'),[]);
});
