import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyBatch,openDocument,validateDocument,emptyDocument,routeAll,findOverlaps,tidyBatch,fitSize,anchorAt,nodeRect,overlaps,contains,SCHEMA_VERSION,type ActionInput,type DiagramDocument} from '../src/index.js';

const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const architecture=():DiagramDocument=>validateDocument(read('../../../examples/architecture.diagramia.json'));
let counter=0;
const run=(d:DiagramDocument,...actions:ActionInput[])=>applyBatch(d,{id:'t3-'+(++counter),baseRevision:d.revision,actions});
const node=(id:string,label=id,extra:object={})=>({id,kind:'service' as const,label,position:{x:0,y:0},size:{width:120,height:60},...extra});
const edge=(from:string,to:string,extra:object={})=>({id:`${from}-${to}`,from,to,...extra});
const blocking=(d:DiagramDocument)=>findOverlaps(d).filter(i=>!['edge-through-node','label-overlap'].includes(i.type));

test('documents saved with schema 1.2.0 migrate and keep their look: no shape, style or anchors are invented',()=>{
  for(const name of ['architecture','checkout-success','checkout-failure']){
    const old=read(`./fixtures/v1.2.0/${name}.diagramia.json`),{document,migratedFrom}=openDocument(old);
    assert.equal(migratedFrom,'1.2.0');assert.equal(document.schemaVersion,SCHEMA_VERSION);
    assert.ok(document.nodes.every(n=>n.shape===null&&Object.keys(n.style).length===0&&n.details===''));
    assert.ok(document.edges.every(e=>e.fromAnchor===null&&e.toAnchor===null&&e.endArrow==='arrow'&&e.startArrow==='none'&&e.line==='orthogonal'));
    assert.deepEqual(document.nodes.map(n=>[n.id,n.position,n.size]),old.nodes.map((n:{id:string;position:object;size:object})=>[n.id,n.position,n.size]));
  }
});
test('a model that piles a whole diagram on one spot gets a complete layout with nothing overlapping',()=>{
  // Así llega un diagrama típico de una IA: todo en (0,0), tamaños chicos, textos largos y zonas sin medidas reales.
  const actions:ActionInput[]=[
    {type:'CREATE_ZONE',zone:{id:'front',label:'Frontend',bounds:{x:0,y:0,width:100,height:100}}},
    {type:'CREATE_ZONE',zone:{id:'back',label:'Backend',bounds:{x:0,y:0,width:100,height:100}}},
    {type:'ADD_NODE',node:node('user','Usuario final del sistema',{kind:'actor'})},
    {type:'ADD_NODE',node:node('web','Aplicación web de administración',{zoneId:'front'})},
    {type:'ADD_NODE',node:node('auth','¿Credenciales válidas?',{kind:'decision',zoneId:'back'})},
    {type:'ADD_NODE',node:node('api','API de autenticación y sesiones',{zoneId:'back'})},
    {type:'ADD_NODE',node:node('db','Base de usuarios',{kind:'database',zoneId:'back'})},
    {type:'ADD_NODE',node:node('mail','Servicio de correo',{kind:'external'})},
    ...[['user','web'],['web','api'],['api','auth'],['auth','db'],['api','mail'],['auth','web']].map(([from,to])=>({type:'ADD_EDGE' as const,edge:edge(from,to,{label:'paso '+from})}))
  ];
  const empty=emptyDocument('login','Login');
  assert.throws(()=>applyBatch(empty,{id:'raw',baseRevision:0,actions}),/debe caber/,'sin ordenar, el lote ni siquiera es válido');
  const {batch,issues}=tidyBatch(empty,{id:'ai-1',baseRevision:0,actions}),result=applyBatch(empty,batch);
  assert.deepEqual(blocking(result),[]);assert.deepEqual(issues.filter(i=>i.type==='edge-through-node'),[]);
  const rects=result.nodes.map(nodeRect);
  assert.ok(rects.every((r,i)=>rects.every((o,j)=>i===j||!overlaps(r,o))));
  const [front,back]=result.zones.map(z=>z.bounds);assert.ok(!overlaps(front,back));
  assert.ok(result.nodes.every(n=>{const need=fitSize(n);return n.size.width>=need.width&&n.size.height>=need.height;}),'cada texto entra en su nodo');
  assert.deepEqual(batch.actions.slice(0,actions.length).map(a=>a.type),actions.map(a=>a.type),'las acciones originales se conservan');
  assert.deepEqual(tidyBatch(empty,{id:'ai-1',baseRevision:0,actions}).batch,batch,'el resultado es determinista');
});
test('tidying a full batch rejects extra corrections instead of silently dropping actions',()=>{
  const empty=emptyDocument('large','Lote grande');
  const actions:ActionInput[]=[
    ...Array.from({length:199},(_,i)=>({type:'UPDATE_DOCUMENT' as const,changes:{title:`Título ${i}`}})),
    {type:'ADD_NODE',node:node('long','Un nodo cuyo título necesita un tamaño mayor que el declarado')}
  ];
  assert.throws(()=>tidyBatch(empty,{id:'full',baseRevision:0,actions}),/máximo por lote es 200/);
  assert.equal(empty.revision,0);
  assert.equal(empty.nodes.length,0);
});
test('an incremental change is nudged to free space without moving anything that was already there',()=>{
  const base=architecture(),before=new Map(base.nodes.map(n=>[n.id,n.position]));
  // Un nodo exactamente encima de la API y otro encima del usuario, fuera de zona.
  const {batch,notes}=tidyBatch(base,{id:'ai-2',baseRevision:0,actions:[
    {type:'ADD_NODE',node:node('redis','Redis',{position:{x:540,y:220},zoneId:'backend',kind:'cache'})},
    {type:'ADD_NODE',node:node('cdn','CDN',{position:{x:60,y:230},kind:'external'})},
    {type:'ADD_EDGE',edge:edge('api','redis')}
  ]}),result=applyBatch(base,batch);
  assert.deepEqual(blocking(result),[]);assert.deepEqual(notes,[]);
  for(const [id,position] of before)assert.deepEqual(result.nodes.find(n=>n.id===id)!.position,position,id+' no se movió');
  assert.equal(result.nodes.find(n=>n.id==='redis')!.zoneId,'backend');
  assert.ok(contains(result.zones[0].bounds,nodeRect(result.nodes.find(n=>n.id==='redis')!)));
});
test('a full zone grows instead of letting a new node overlap, and a relabel enlarges the node',()=>{
  let d=run(emptyDocument('z','Zona'),{type:'CREATE_ZONE',zone:{id:'box',label:'Caja',bounds:{x:0,y:0,width:220,height:150}}},{type:'ADD_NODE',node:node('a','A',{position:{x:32,y:56},size:{width:150,height:70},zoneId:'box'})});
  const grown=tidyBatch(d,{id:'g',baseRevision:d.revision,actions:[{type:'ADD_NODE',node:node('b','B',{position:{x:32,y:56},size:{width:150,height:70},zoneId:'box'})}]});
  d=applyBatch(d,grown.batch);
  assert.deepEqual(blocking(d),[]);assert.ok(d.zones[0].bounds.height>150);assert.match(grown.notes[0],/agrandó la zona/);
  const renamed=tidyBatch(d,{id:'r',baseRevision:d.revision,actions:[{type:'UPDATE_NODE',id:'a',changes:{label:'Servicio de facturación electrónica'}}]});
  const a=applyBatch(d,renamed.batch).nodes.find(n=>n.id==='a')!;
  assert.ok(a.size.width>150);assert.deepEqual(blocking(applyBatch(d,renamed.batch)),[]);
});
test('ARRANGE_DOCUMENT untangles an existing diagram: zones keep their members and stay apart',()=>{
  const messy=run(architecture(),{type:'CREATE_ZONE',zone:{id:'edge',label:'Borde',bounds:{x:0,y:600,width:420,height:200}}},{type:'ADD_NODE',node:node('cdn','CDN',{position:{x:40,y:660},zoneId:'edge'})},{type:'ADD_EDGE',edge:edge('cdn','frontend')},{type:'UPDATE_NODE',id:'user',changes:{position:{x:280,y:230}}});
  assert.ok(blocking(messy).length>0);
  const tidy=run(messy,{type:'ARRANGE_DOCUMENT'});
  assert.deepEqual(blocking(tidy),[]);
  assert.deepEqual(tidy.nodes.map(n=>[n.id,n.zoneId]),messy.nodes.map(n=>[n.id,n.zoneId]));
  assert.deepEqual(run(messy,{type:'ARRANGE_DOCUMENT'}).nodes.map(n=>n.position),tidy.nodes.map(n=>n.position));
});
test('edges that share a side leave from different points, and labels avoid nodes',()=>{
  const d=run(emptyDocument('fan','Fan'),{type:'ADD_NODE',node:node('hub','Hub',{position:{x:0,y:200},size:{width:140,height:120}})},
    ...['a','b','c'].flatMap((id,i)=>[{type:'ADD_NODE' as const,node:node(id,id.toUpperCase(),{position:{x:400,y:i*200}})},{type:'ADD_EDGE' as const,edge:edge('hub',id,{label:'evento '+id})}]));
  const routes=routeAll(d),starts=['a','b','c'].map(id=>routes.get('hub-'+id)!.points[0]);
  assert.deepEqual(starts.map(p=>p.x),[140,140,140]);assert.deepEqual(starts.map(p=>p.y),[230,260,290],'repartidas a lo largo del lado, en el orden de sus destinos');
  assert.deepEqual(findOverlaps(d).filter(i=>i.type==='label-overlap'||i.type==='edge-through-node'),[]);
  const labels=[...routes.values()].map(r=>r.label!);assert.equal(new Set(labels.map(p=>`${p.x},${p.y}`)).size,3);
});
test('arranging a graph reserves enough space for long connection labels',()=>{
  const crowded=run(emptyDocument('labels','Etiquetas'),
    {type:'ADD_NODE',node:node('user','Usuario',{kind:'actor'})},
    {type:'ADD_NODE',node:node('frontend','Frontend')},
    {type:'ADD_NODE',node:node('api','API')},
    {type:'ADD_NODE',node:node('db','Base de usuarios',{kind:'database',size:{width:180,height:80}})},
    {type:'ADD_EDGE',edge:edge('user','frontend',{label:'envía las credenciales'})},
    {type:'ADD_EDGE',edge:edge('frontend','api',{label:'solicita autenticación'})},
    {type:'ADD_EDGE',edge:edge('api','db',{label:'consulta los usuarios'})});
  const arranged=run(crowded,{type:'ARRANGE_DOCUMENT'});
  assert.deepEqual(findOverlaps(arranged),[]);
});
test('an edge can attach anywhere on a node border, use straight or curved lines, and custom arrowheads',()=>{
  const d=run(emptyDocument('anchors','Anclas'),{type:'ADD_NODE',node:node('a','A',{position:{x:0,y:0},size:{width:200,height:100}})},{type:'ADD_NODE',node:node('b','B',{position:{x:400,y:300},size:{width:200,height:100}})},
    {type:'ADD_EDGE',edge:edge('a','b',{fromAnchor:{x:.25,y:1},toAnchor:{x:0,y:.8},startArrow:'diamond',endArrow:'triangle'})},
    {type:'ADD_EDGE',edge:{id:'line',from:'a',to:'b',line:'straight'}},{type:'ADD_EDGE',edge:{id:'curve',from:'a',to:'b',line:'curved',style:{stroke:'#245cf6',dash:'dotted'}}});
  const routes=routeAll(d),anchored=routes.get('a-b')!.points;
  assert.deepEqual(anchored[0],{x:50,y:100});assert.deepEqual(anchored.at(-1),{x:400,y:380});
  assert.equal(routes.get('line')!.points.length,2);assert.ok(routes.get('curve')!.points.length>10);
  assert.deepEqual(anchorAt({x:0,y:0,width:200,height:100},{x:190,y:30}),{x:1,y:.3});
  assert.throws(()=>run(d,{type:'UPDATE_EDGE',id:'curve',changes:{style:{stroke:'red; background:url(x)'}}}));
  const moved=run(d,{type:'UPDATE_EDGE',id:'a-b',changes:{toAnchor:null,line:'straight'}}).edges[0];
  assert.equal(moved.toAnchor,null);assert.deepEqual(moved.fromAnchor,{x:.25,y:1});assert.equal(moved.startArrow,'diamond');
});

test('arranging a plan puts side zones next to the steps they point to, and curves go around nodes',()=>{
  // Como un viaje armado por la IA: un itinerario de diez días y zonas que se conectan con días sueltos.
  const zone=(id:string,x:number)=>({type:'CREATE_ZONE' as const,zone:{id,label:id,bounds:{x,y:0,width:900,height:900}}});
  const at=(z:string,i:number,x:number)=>({position:{x:x+20,y:60+i*100},zoneId:z,size:{width:180,height:70}});
  const days=Array.from({length:10},(_,i)=>`d${i+1}`);
  const actions:ActionInput[]=[zone('plan',0),zone('stay',1000),zone('night',2000),zone('food',3000),
    ...days.map((id,i)=>({type:'ADD_NODE' as const,node:node(id,'Día '+(i+1),at('plan',i%8,(i>>3)*200))})),
    ...days.slice(1).map((id,i)=>({type:'ADD_EDGE' as const,edge:edge(days[i],id)})),
    ...['car','hotel'].map((id,i)=>({type:'ADD_NODE' as const,node:node(id,id,at('stay',i,1000))})),
    ...['casino','bar','show'].map((id,i)=>({type:'ADD_NODE' as const,node:node(id,id,at('night',i,2000))})),
    ...['ice','fish'].map((id,i)=>({type:'ADD_NODE' as const,node:node(id,id,at('food',i,3000))}))];
  for(const [from,to] of [['car','d1'],['hotel','d10'],['casino','d5'],['bar','d8'],['show','d7'],['ice','d4'],['fish','d6']])actions.push({type:'ADD_EDGE',edge:edge(from,to,{line:'curved'})});
  const arranged=run(emptyDocument('plan','Plan'),...actions,{type:'ARRANGE_DOCUMENT'});
  assert.deepEqual(findOverlaps(arranged),[]);
  assert.deepEqual(run(emptyDocument('plan','Plan'),...actions,{type:'ARRANGE_DOCUMENT'}).nodes.map(n=>n.position),arranged.nodes.map(n=>n.position));
});
test('a placement inside a full zone grows the zone instead of failing',()=>{
  const base=architecture();
  let d=base;
  for(const id of ['q1','q2','q3','q4']){
    const {batch}=tidyBatch(d,{id:'fill-'+id,baseRevision:d.revision,actions:[{type:'ADD_NODE',node:node(id,'Cola '+id,{kind:'queue'}),placement:{inside:'backend',below:'api',gap:40}}]});
    d=applyBatch(d,batch);
  }
  assert.deepEqual(blocking(d),[]);
  assert.ok(d.nodes.filter(n=>n.id.startsWith('q')).every(n=>n.zoneId==='backend'));
  assert.throws(()=>tidyBatch(base,{id:'amb',baseRevision:0,actions:[{type:'ADD_NODE',node:node('x'),placement:{insideLabel:'No existe'}}]}),/No existe una zona/);
});

test('arranging reserves visible titles below small shapes and preserves IDs and original labels',()=>{
  const actions:ActionInput[]=[{type:'CREATE_ZONE',zone:{id:'people',label:'Equipo',bounds:{x:0,y:0,width:100,height:100}}},
    ...['a','b','c','map'].map((id,i)=>({type:'ADD_NODE' as const,node:node(id,'Una persona con nombre bastante largo '+i,{kind:'note',shape:i===3?'map':'avatar',zoneId:'people'})})),
    {type:'ADD_EDGE',edge:edge('a','b',{label:'Se encarga de invitar a las familias del barrio y confirmar asistencia'})}];
  const base=emptyDocument('visible','Personas'),{batch}=tidyBatch(base,{id:'visible',baseRevision:0,actions}),after=applyBatch(base,batch);
  assert.deepEqual(blocking(after),[]);
  assert.deepEqual(after.nodes.map(n=>n.id),['a','b','c','map']);
  assert.ok(after.nodes.every(n=>n.label.startsWith('Una persona con nombre')));
  assert.deepEqual(tidyBatch(base,{id:'visible',baseRevision:0,actions}).batch,batch);
  const original=structuredClone(after),again=run(after,{type:'ARRANGE_DOCUMENT'});
  assert.deepEqual(again.nodes.map(n=>[n.id,n.label,n.size]),original.nodes.map(n=>[n.id,n.label,n.size]));
});

test('multiline text and a font change get enough height without losing content or moving unrelated pieces',()=>{
  const base=run(emptyDocument('text','Notas'),{type:'ADD_NODE',node:node('note','Primera línea\nSegunda línea\nTercera línea',{kind:'text',shape:'text',position:{x:0,y:0},size:{width:160,height:50}})},
    {type:'ADD_NODE',node:node('other','Otra pieza',{position:{x:1000,y:1000}})});
  const {batch}=tidyBatch(base,{id:'font',baseRevision:base.revision,actions:[{type:'UPDATE_NODE',id:'note',changes:{style:{fontSize:24}}}]}),after=applyBatch(base,batch);
  const note=after.nodes.find(n=>n.id==='note')!;
  assert.ok(note.size.height>=3*24);assert.equal(note.label,base.nodes[0].label);assert.deepEqual(after.nodes[1],base.nodes[1]);
  assert.deepEqual(blocking(after),[]);
});

test('routing distinguishes diagonals near a node, corner touches and real crossings',async()=>{
  const {segmentHitsRect}=await import('../src/index.js');
  const box={x:40,y:70,width:20,height:20};
  assert.equal(segmentHitsRect({x:0,y:0},{x:100,y:100},box),false,'la caja de una diagonal puede solaparse sin atravesar el nodo');
  assert.equal(segmentHitsRect({x:0,y:40},{x:100,y:140},box),true);
  assert.equal(segmentHitsRect({x:0,y:70},{x:100,y:70},box),false,'tocar el borde no atraviesa el interior');
  assert.equal(segmentHitsRect({x:50,y:0},{x:50,y:100},box),true);
});
