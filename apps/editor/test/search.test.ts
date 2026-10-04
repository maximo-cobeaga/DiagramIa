import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBatch,emptyDocument,type ActionInput} from '@diagramia/core';
import {canvasIndex,findCanvas} from '../src/canvas/search.js';

const scene=()=>{
  const actions:ActionInput[]=[
    {type:'CREATE_ZONE',zone:{id:'zone',label:'Educación',bounds:{x:0,y:0,width:600,height:400}}},
    {type:'ADD_NODE',node:{id:'context',kind:'note',label:'Otra idea',details:'Repasar la acción de caché',position:{x:20,y:20},size:{width:100,height:50},zoneId:'zone'}},
    {type:'ADD_NODE',node:{id:'prefix',kind:'cache',label:'Caché secundaria',position:{x:160,y:20},size:{width:100,height:50}}},
    {type:'ADD_NODE',node:{id:'exact',kind:'cache',label:'Caché',position:{x:300,y:20},size:{width:100,height:50}}},
    {type:'ADD_NODE',node:{id:'duplicate',kind:'note',label:'Caché',position:{x:300,y:220},size:{width:100,height:50}}},
    {type:'ADD_DRAWING',drawing:{id:'ink',kind:'freehand',points:[{x:20,y:100},{x:100,y:140}]}},
    {type:'CREATE_GROUP',group:{id:'group',label:'Mis apuntes'},nodeIds:['context'],drawingIds:['ink']},
    {type:'ADD_EDGE',edge:{id:'edge',from:'context',to:'exact'}},
    {type:'CREATE_FRAME',frame:{id:'frame',label:'Repaso final',bounds:{x:0,y:0,width:600,height:400}}}
  ];
  const doc=emptyDocument('search','Búsqueda');return applyBatch(doc,{id:'setup',baseRevision:doc.revision,actions});
};

test('buscar ignora tildes/caso, exige todas las palabras y prioriza nombres sin perder duplicados',()=>{
  const doc=scene(),before=structuredClone(doc),index=canvasIndex(doc);
  assert.deepEqual(findCanvas(index,'  CACHE ').slice(0,3).map(x=>x.id),['exact','duplicate','prefix']);
  assert.deepEqual(findCanvas(index,'ACCION repasar').map(x=>x.id),['context']);
  assert.equal(findCanvas(index,'caché imposible').length,0);
  assert.equal(findCanvas(index,'educacion').find(x=>x.id==='context')?.context,'Educación · Mis apuntes');
  assert.deepEqual(doc,before,'buscar no modifica contenido, IDs ni revisión');
});

test('el índice permite encontrar grupos, trazos, encuadres y conexiones sin nombre y se renueva con el documento',()=>{
  const doc=scene(),index=canvasIndex(doc);
  assert.equal(findCanvas(index,'mis apuntes').find(x=>x.id==='ink')?.kind,'Dibujo');
  assert.equal(findCanvas(index,'mis apuntes')[0].id,'group');
  assert.equal(findCanvas(index,'repaso final')[0].id,'frame');
  assert.equal(findCanvas(index,'conexion otra cache')[0].id,'edge');
  assert.equal(findCanvas(index,'  ').length,index.length);
  doc.drawings=[];assert.ok(!canvasIndex(doc).some(x=>x.id==='ink'));
  assert.equal(findCanvas(canvasIndex(emptyDocument('empty','Vacío')),'idea').length,0);
});
