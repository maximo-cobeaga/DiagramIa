import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBatch,captureSelection,cloneSelectionActions,emptyDocument,getContext,groupMembers,openDocument,rootGroupId,selectionMoveActions,selectionMovePreview,type ActionInput,type DiagramDocument} from '../src/index.js';

let sequence=0;
const run=(doc:DiagramDocument,...actions:ActionInput[])=>applyBatch(doc,{id:'selection-'+sequence++,baseRevision:doc.revision,actions});
const node=(id:string,x:number,y:number)=>({id,kind:'text' as const,label:id,position:{x,y},size:{width:80,height:40}});
const piece=()=>run(emptyDocument('piece','Pieza'),{type:'ADD_NODE',node:node('title',20,20)},{type:'ADD_NODE',node:node('box',140,20)},{type:'ADD_DRAWING',drawing:{id:'ink',kind:'freehand',points:[{x:10,y:80},{x:180,y:90}],style:{stroke:'#ffffff'}}},{type:'ADD_EDGE',edge:{id:'link',from:'title',to:'box',points:[{x:60,y:60},{x:180,y:60}]}},{type:'CREATE_GROUP',group:{id:'mixed'},nodeIds:['title','box'],drawingIds:['ink']});

test('migrar 1.7 mantiene IDs, revisión, rutas y grupos; los trazos antiguos quedan libres',()=>{
  const original=piece(),legacy={...original,schemaVersion:'1.7.0',drawings:original.drawings.map(({groupId:_group,...d})=>d)};
  const before=structuredClone(legacy),opened=openDocument(legacy);
  assert.equal(opened.migratedFrom,'1.7.0');assert.equal(opened.document.revision,original.revision);
  assert.deepEqual(opened.document.nodes,original.nodes);assert.deepEqual(opened.document.edges,original.edges);
  assert.equal(opened.document.drawings[0].id,'ink');assert.equal(opened.document.drawings[0].groupId,null);
  assert.deepEqual(legacy,before);
});

test('grupos mixtos anidan, validan referencias y sobreviven hasta perder su último dibujo',()=>{
  const original=piece(),nested=run(original,{type:'CREATE_GROUP',group:{id:'outer'},drawingIds:['ink']});
  assert.equal(rootGroupId(nested,'ink'),'outer');assert.deepEqual(new Set(groupMembers(nested,'outer')),new Set(['title','box','ink']));
  const context=getContext(nested,['outer'],{scope:'selection'});assert.equal(context.drawings[0].id,'ink');
  const snapshot=structuredClone(nested);
  assert.throws(()=>run(nested,{type:'UPDATE_DRAWING',id:'ink',changes:{groupId:'missing'}}));assert.deepEqual(nested,snapshot);
  const onlyInk=run(nested,{type:'DELETE_NODE',id:'title'},{type:'DELETE_NODE',id:'box'});assert.equal(onlyInk.groups.length,2);
  assert.equal(run(onlyInk,{type:'DELETE_DRAWING',id:'ink'}).groups.length,0);
  const released=run(nested,{type:'DELETE_GROUP',id:'outer'},{type:'DELETE_GROUP',id:'mixed'});assert.equal(released.drawings[0].groupId,null);
});

test('mover pieza mixta conserva distancias, estilo y ruta manual; preview no cambia revisión',()=>{
  const original=piece(),ids=groupMembers(original,'mixed'),preview=selectionMovePreview(original,ids,24,32),moved=run(original,...selectionMoveActions(original,ids,24,32));
  assert.equal(preview.revision,original.revision);assert.deepEqual(preview.nodes,moved.nodes);assert.deepEqual(preview.drawings,moved.drawings);assert.deepEqual(preview.edges,moved.edges);
  assert.equal(moved.drawings[0].points[0].x-original.drawings[0].points[0].x,24);
  assert.equal(moved.nodes[0].position.y-original.nodes[0].position.y,32);assert.equal(moved.drawings[0].style.stroke,'#ffffff');
  assert.equal(moved.edges[0].points![0].x-original.edges[0].points![0].x,24);assert.equal(original.drawings[0].points[0].x,10);
});

test('copiar entre documentos conserva dibujos, jerarquía y referencias internas con nuevos IDs',()=>{
  const original=run(piece(),{type:'CREATE_GROUP',group:{id:'outer'},nodeIds:['title']}),clip=captureSelection(original,groupMembers(original,'outer'))!;
  let seq=0;const target=emptyDocument('target','Destino'),cloned=cloneSelectionActions(target,clip,24,prefix=>prefix+'-clone-'+seq++),pasted=run(target,...cloned.actions);
  assert.equal(pasted.nodes.length,2);assert.equal(pasted.drawings.length,1);assert.equal(pasted.groups.length,2);
  assert.equal(groupMembers(pasted,rootGroupId(pasted,pasted.drawings[0].id)!).length,3);
  assert.ok(pasted.edges.every(e=>pasted.nodes.some(n=>n.id===e.from)&&pasted.nodes.some(n=>n.id===e.to)));
  assert.deepEqual(pasted.edges[0].points,original.edges[0].points!.map(p=>({x:p.x+24,y:p.y+24})));
  assert.ok(cloned.ids.every(id=>!groupMembers(original,'outer').includes(id)));assert.equal(pasted.drawings[0].points[0].x,34);
  const onlyInk=captureSelection(original,['ink'])!,inkCopy=run(target,...cloneSelectionActions(target,onlyInk,0,prefix=>prefix+'-single').actions);
  assert.equal(inkCopy.groups.length,0);assert.equal(inkCopy.drawings[0].groupId,null);
});

test('mover zona y sus miembros seleccionados no duplica desplazamientos',()=>{
  const doc=run(emptyDocument('zone','Zona'),{type:'CREATE_ZONE',zone:{id:'z',label:'Zona',bounds:{x:0,y:0,width:300,height:200}}},{type:'ADD_NODE',node:{...node('n',20,20),zoneId:'z'}});
  const moved=run(doc,...selectionMoveActions(doc,['z','n'],40,50));assert.deepEqual(moved.nodes[0].position,{x:60,y:70});assert.equal(moved.nodes[0].zoneId,'z');
  const copy=run(emptyDocument('other','Otro'),...cloneSelectionActions(emptyDocument('other','Otro'),captureSelection(doc,['z'])!,24,p=>p+'-copy').actions);
  assert.equal(copy.nodes[0].zoneId,'zone-copy');assert.equal(copy.nodes[0].position.x,44);
});

test('copiar una imagen lleva su asset y reutiliza sólo contenido idéntico, también tras cortar',()=>{
  const asset={id:'photo',label:'Imagen',mediaType:'image/svg+xml' as const,width:8,height:8,data:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>').toString('base64')};
  const source=run(emptyDocument('image','Imagen'),{type:'ADD_ASSET',asset},{type:'ADD_NODE',node:{...node('img',20,20),kind:'image',assetId:'photo'}}),clip=captureSelection(source,['img'])!;
  const target=emptyDocument('destination','Destino'),copy=run(target,...cloneSelectionActions(target,clip,24,p=>p+'-fresh').actions);
  assert.equal(copy.assets.length,1);assert.equal(copy.nodes[0].assetId,copy.assets[0].id);assert.equal(copy.assets[0].data,asset.data);
  const same=run(source,...cloneSelectionActions(source,clip,24,p=>p+'-same').actions);assert.equal(same.assets.length,1);
  const cut=run(source,{type:'DELETE_NODE',id:'img'});assert.equal(cut.assets.length,0);
  const pasted=run(cut,...cloneSelectionActions(cut,clip,24,p=>p+'-pasted').actions);assert.equal(pasted.nodes[0].assetId,'asset-pasted');
});
