import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBatch,emptyDocument,nodeVisualRect,type DiagramNode} from '@diagramia/core';
import {nodeTitleLayout} from '../src/canvas/DiagramLayer.js';

test('nombres largos bajo iconos: texto completo conservado y huella compartida con render y export',()=>{
  const label='Responsable de coordinación de las operaciones internacionales y seguimiento de todas las entregas';
  const doc=applyBatch(emptyDocument('captions','Captions'),{id:'add',baseRevision:0,actions:[{type:'ADD_NODE',node:{id:'person',kind:'actor',shape:'avatar',label,position:{x:40,y:30},size:{width:88,height:88}}}]});
  for(const shape of ['avatar','badge','map','actor'] as const)for(const align of ['left','center','right'] as const){
    const n:DiagramNode={...doc.nodes[0]!,shape,style:{align}},before=JSON.stringify(n),title=nodeTitleLayout(n),rect=nodeVisualRect(n);
    assert.equal(title.lines.length,2);assert.ok(title.lines[1]!.endsWith('…'));assert.ok(title.box.width<=240);
    assert.ok(title.box.x>=rect.x&&title.box.x+title.box.width<=rect.x+rect.width);
    assert.ok(title.box.y+title.box.height<=rect.y+rect.height+1);
    assert.equal(n.label,label);assert.equal(JSON.stringify(n),before);
  }
});
