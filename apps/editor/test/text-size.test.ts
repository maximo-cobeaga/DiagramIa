import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBatch,emptyDocument,nodeVisualRect} from '@diagramia/core';
import {textSizeActions} from '../src/commands/textSize.js';
import {nodeTitleLayout} from '../src/canvas/DiagramLayer.js';

test('agrandar texto conserva el nombre, amplía la pieza cuando hace falta y se deshace con un solo lote',()=>{
  const before=applyBatch(emptyDocument('font-size','Tamaño de texto'),{id:'add',baseRevision:0,actions:[
    {type:'ADD_NODE',node:{id:'note',kind:'note',label:'Una idea larga que necesita más espacio para seguir siendo legible',position:{x:20,y:20},size:{width:120,height:60}}},
    {type:'ADD_NODE',node:{id:'other',kind:'note',label:'Otra',position:{x:900,y:900},size:{width:120,height:60}}}
  ]});
  const actions=textSizeActions([before.nodes[0]!],30),after=applyBatch(before,{id:'font',baseRevision:before.revision,actions});
  assert.equal(after.revision,before.revision+1);
  assert.equal(after.nodes[0]!.style.fontSize,30);
  assert.equal(after.nodes[0]!.label,before.nodes[0]!.label);
  assert.ok(after.nodes[0]!.size.width>before.nodes[0]!.size.width||after.nodes[0]!.size.height>before.nodes[0]!.size.height);
  assert.deepEqual(after.nodes[1],before.nodes[1]);
  assert.deepEqual(textSizeActions([after.nodes[0]!],30),[]);
  assert.equal(textSizeActions([after.nodes[0]!],100)[0]?.type,'UPDATE_NODE');
  assert.equal((textSizeActions([after.nodes[0]!],100)[0] as Extract<typeof actions[number],{type:'UPDATE_NODE'}>).changes.style?.fontSize,48);
});

test('la leyenda bajo un icono crece con la letra y coincide con su huella visual',()=>{
  const before=applyBatch(emptyDocument('caption-size','Caption'),{id:'add',baseRevision:0,actions:[{type:'ADD_NODE',node:{id:'person',kind:'actor',shape:'avatar',label:'Responsable de operaciones y coordinación',position:{x:40,y:30},size:{width:88,height:88}}}]});
  const node=before.nodes[0]!,after=applyBatch(before,{id:'font',baseRevision:before.revision,actions:textSizeActions([node],32)}).nodes[0]!;
  const title=nodeTitleLayout(after),visual=nodeVisualRect(after);
  assert.ok(title.box.width>nodeTitleLayout(node).box.width);
  assert.equal(title.size,32);
  assert.ok(title.box.x>=visual.x&&title.box.x+title.box.width<=visual.x+visual.width);
  assert.ok(title.box.y+title.box.height<=visual.y+visual.height+1);
});
