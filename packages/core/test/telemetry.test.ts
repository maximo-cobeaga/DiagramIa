import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_EVENTS_PER_BATCH,ServerEventSchema,TelemetryBatchSchema,campaignFrom,changeCounts,describeAgent,errorLocation,referrerHostOf} from '../src/index.js';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={app:'editor',appVersion:'0.1.0',utmSource:'reddit',utmMedium:'social',utmCampaign:'launch-1',referrerHost:'www.reddit.com',landingPath:'/',
  device:'desktop',browser:'chrome',os:'windows',language:'es-AR',viewport:{width:1440,height:900}};
const batch=(events:unknown[])=>({v:1,anonymousId:uuid(1),sessionId:uuid(2),context,events});
const event=(name:string,props:object,n=10)=>({id:uuid(n),name,at:'2026-10-02T12:00:00.000Z',props});

test('a telemetry batch accepts the documented events and nothing that could carry user content',()=>{
  const ok=TelemetryBatchSchema.parse(batch([event('board_opened',{returning:false,fromLanding:true},10),event('node_created',{count:3,source:'ai'},11),event('export',{format:'png2'},12),
    event('ai_feedback',{requestId:'req-1',rating:'down',reason:'bad_layout'},13),event('js_error',{kind:'error',name:'TypeError',where:'assets/index-abc.js:1:2345'},14)]));
  assert.equal(ok.events.length,5);
  const rejects=(events:unknown[],why:string)=>assert.throws(()=>TelemetryBatchSchema.parse(batch(events)),undefined,why);
  rejects([event('node_created',{count:1,source:'user',label:'Mi base de clientes'})],'props extra (texto de un label)');
  rejects([event('js_error',{kind:'error',name:'TypeError',where:'Cannot read properties of undefined (reading x)'})],'un mensaje de error no es una ubicación');
  rejects([event('template_used',{template:'Plantilla con espacios y texto libre'})],'las plantillas son slugs');
  rejects([event('prompt_sent',{text:'hola'})],'evento desconocido');
  rejects([event('export',{format:'exe'})],'formato fuera del enum');
  rejects(Array.from({length:MAX_EVENTS_PER_BATCH+1},(_,i)=>event('undo',{},100+i)),'lote demasiado grande');
  assert.throws(()=>TelemetryBatchSchema.parse({...batch([event('undo',{})]),context:{...context,landingPath:'/?email=ana@example.com'}}),undefined,'el path de entrada no lleva query');
  assert.throws(()=>TelemetryBatchSchema.parse({...batch([event('undo',{})]),context:{...context,referrerHost:'https://example.com/private/path'}}),undefined,'del referrer sólo el host');
});
test('server events are closed too: an AI request is measured by numbers and codes, never by its prompt',()=>{
  const props={requestId:'req-1',mode:'create',provider:'openai',model:'gpt-6-luna',outcome:'proposal',errorCode:null,inputTokens:1000,cachedInputTokens:800,outputTokens:300,costUsd:0.00018,latencyMs:4200,calls:1,repairs:0,replayed:false};
  assert.equal(ServerEventSchema.parse({name:'ai_request',props}).name,'ai_request');
  assert.throws(()=>ServerEventSchema.parse({name:'ai_request',props:{...props,prompt:'Diagrama de login'}}));
  assert.throws(()=>ServerEventSchema.parse({name:'ai_request',props:{...props,errorCode:'El modelo dijo algo'}}));
});
test('change counts summarize a batch per editor event instead of one event per element',()=>{
  assert.deepEqual(changeCounts([{type:'ADD_NODE'},{type:'ADD_NODE'},{type:'ADD_EDGE'},{type:'MOVE_NODES',ids:['a','b','c']} as {type:string},{type:'UPDATE_DOCUMENT'},{type:'ARRANGE_DOCUMENT'}]),
    {node_created:2,edge_created:1,node_moved:3,layout_applied:1});
  assert.deepEqual(changeCounts([{type:'UPDATE_NODE',changes:{position:{x:1,y:2}}},{type:'UPDATE_NODE',changes:{size:{width:9,height:9},position:{x:0,y:0}}},{type:'UPDATE_NODE',changes:{label:'x'}}] as {type:string}[]),
    {node_moved:1,node_resized:1,node_edited:1},'mover con el teclado es mover, no editar');
  assert.deepEqual(changeCounts([]),{});
});
test('visit context keeps hosts, slugs and coarse device data only',()=>{
  assert.deepEqual(campaignFrom('?utm_source=Reddit Ads&utm_medium=social&utm_campaign=<script>&x=1'),{utmSource:'Reddit-Ads',utmMedium:'social',utmCampaign:'script'});
  assert.deepEqual(campaignFrom(''),{utmSource:null,utmMedium:null,utmCampaign:null});
  assert.equal(referrerHostOf('https://www.reddit.com/r/webdev/comments/abc?user=ana','app.diagramia.test'),'www.reddit.com');
  assert.equal(referrerHostOf('https://app.diagramia.test/otra','app.diagramia.test'),null);
  assert.equal(referrerHostOf('','app.diagramia.test'),null);
  assert.deepEqual(describeAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',1440,false),{device:'desktop',browser:'edge',os:'windows'});
  assert.deepEqual(describeAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1',390,true),{device:'mobile',browser:'safari',os:'ios'});
  assert.deepEqual(describeAgent('Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',1200,true),{device:'tablet',browser:'chrome',os:'android'});
  assert.equal(errorLocation('https://app.diagramia.test/assets/index-a1b2.js?v=3',1,2345),'assets/index-a1b2.js:1:2345');
  assert.equal(errorLocation(undefined),null);
});
test('behaviour and monetization events carry enums and counts only',()=>{
  const ok=TelemetryBatchSchema.parse(batch([
    event('tool_selected',{tool:'freehand'},20),event('panel_toggled',{panel:'timeline',open:true},21),event('welcome_choice',{choice:'examples'},22),
    event('animation_created',{origin:'zones',steps:6},23),event('animation_played',{steps:6,scenario:false},24),event('animation_finished',{steps:6},25),
    event('ai_question_answered',{mode:'create',via:'other'},26),event('landing_scroll_depth',{percent:75},27),event('landing_section_viewed',{section:'precios'},28),
    event('landing_cta_clicked',{placement:'pricing_pro'},29),event('upgrade_prompt_shown',{placement:'header',offer:true},30),
    event('offer_viewed',{kind:'welcome',percent:40},31),event('checkout_started',{source:'offer',offer:true},32),event('checkout_failed',{status:503},33),
    event('limit_reached',{kind:'credits_monthly'},34),
    event('session_summary',{activeSeconds:420,changes:57,aiRequests:3,nodes:21,edges:19,animations:1,usedAi:true,usedAnimation:true},35)]));
  assert.equal(ok.events.length,16);
  const rejects=(events:unknown[],why:string)=>assert.throws(()=>TelemetryBatchSchema.parse(batch(events)),undefined,why);
  rejects([event('ai_question_answered',{mode:'create',via:'option',answer:'Playa'})],'la respuesta elegida es contenido y no se mide');
  rejects([event('landing_section_viewed',{section:'#secreta'})],'sólo secciones conocidas');
  rejects([event('landing_scroll_depth',{percent:33})],'sólo cuartos');
  rejects([event('tool_selected',{tool:'cohete'})],'sólo herramientas del editor');
  rejects([event('session_summary',{activeSeconds:1,changes:0,aiRequests:0,nodes:0,edges:0,animations:0,usedAi:false,usedAnimation:false,title:'Mi diagrama'})],'sin título');
});
