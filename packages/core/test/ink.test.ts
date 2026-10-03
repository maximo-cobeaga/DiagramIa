import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBatch,emptyDocument,guideInk,inkLength,limitInk,smoothInk,straightInk} from '../src/index.js';

test('un círculo cerrado se guarda como trazo editable, sin perder extremo ni puntos del contrato',()=>{
  const circle=Array.from({length:1401},(_,i)=>({x:80+Math.cos(i*Math.PI*2/1400)*50,y:80+Math.sin(i*Math.PI*2/1400)*50}));
  const points=limitInk(circle);
  assert.ok(inkLength(points)>300);assert.deepEqual(points[0],circle[0]);assert.deepEqual(points.at(-1),circle.at(-1));
  const doc=applyBatch(emptyDocument('ink','Dibujo'),{id:'draw',baseRevision:0,actions:[{type:'ADD_DRAWING',drawing:{id:'loop',kind:'freehand',points,style:{stroke:'#bc3571',strokeWidth:4}}}]});
  assert.equal(doc.drawings[0].id,'loop');assert.equal(doc.drawings[0].style.stroke,'#bc3571');assert.equal(doc.drawings[0].points.length,500);
});
test('el lápiz guiado reconoce geometría cerrada y no convierte letras o bucles parciales en formas',()=>{
  const ellipse=Array.from({length:81},(_,i)=>({x:120+Math.cos(i*Math.PI*2/80)*70,y:100+Math.sin(i*Math.PI*2/80)*40}));
  assert.equal(guideInk(ellipse)?.label,'Óvalo');
  const circle=ellipse.map(p=>({x:p.x,y:100+(p.y-100)*70/40}));assert.equal(guideInk(circle)?.label,'Círculo');
  assert.equal(guideInk(ellipse.slice(0,50)),null);
  assert.equal(guideInk([{x:0,y:50},{x:15,y:5},{x:30,y:50},{x:7,y:30},{x:24,y:30}]),null);
  const rectangle=[{x:0,y:0},{x:50,y:0},{x:100,y:0},{x:100,y:25},{x:100,y:50},{x:50,y:50},{x:0,y:50},{x:0,y:25},{x:0,y:0}];
  assert.equal(guideInk(rectangle)?.label,'Rectángulo');
});
test('suavizar conserva extremos y esquinas y Shift restringe la línea a 45 grados',()=>{
  const stroke=[{x:0,y:0},{x:10,y:1},{x:20,y:-1},{x:30,y:0},{x:30,y:30}];
  const before=structuredClone(stroke),smooth=smoothInk(stroke);assert.deepEqual(stroke,before);
  assert.deepEqual(smooth[0],stroke[0]);assert.deepEqual(smooth.at(-1),stroke.at(-1));assert.deepEqual(smooth[3],stroke[3]);
  assert.ok(Math.abs(smooth[1].y)<Math.abs(stroke[1].y));
  const diagonal=straightInk({x:0,y:0},{x:30,y:24},true);assert.ok(Math.abs(diagonal[1].x-diagonal[1].y)<.0001);
});

test('el guiado tolera temblor de mano sin aplanar curvas deliberadas ni trazos abiertos',()=>{
  const line=Array.from({length:81},(_,i)=>({x:i*2,y:i===0||i===80?0:Math.sin(i*2.3)*3}));
  const before=structuredClone(line),guided=guideInk(line);
  assert.equal(guided?.label,'Línea');assert.deepEqual(guided?.points,[line[0],line.at(-1)]);assert.deepEqual(line,before);
  const circle=Array.from({length:91},(_,i)=>{const a=i*Math.PI*2/90,r=60+Math.sin(i*1.7)*2;return {x:100+Math.cos(a)*r,y:100+Math.sin(a)*r};});
  assert.equal(guideInk(circle)?.label,'Círculo');
  assert.equal(guideInk(circle.slice(0,60)),null);
  const curve=Array.from({length:81},(_,i)=>({x:i*2,y:35*Math.sin(i*Math.PI/80)}));
  assert.equal(guideInk(curve),null,'un arco no debe convertirse en línea');
  const smooth=smoothInk(line),jitter=(ps:typeof line)=>ps.reduce((sum,p)=>sum+Math.abs(p.y),0);
  assert.ok(jitter(smooth)<jitter(line)*.6,'el suavizado debe reducir de forma perceptible el temblor');
  assert.deepEqual(smooth[0],line[0]);assert.deepEqual(smooth.at(-1),line.at(-1));
});
