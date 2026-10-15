import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHAT_LIMITS,parseChats,trimChats,upsertChat,type SavedChat} from '../src/assistant/chatHistory.js';

const chat=(n:number,turns=1,reply='Respuesta'):SavedChat=>({id:'chat-'+n,tabId:'tab-'+n,docTitle:'Diagrama '+n,title:'Pedido '+n,updatedAt:n,turns:Array.from({length:turns},(_,i)=>({id:`t-${n}-${i}`,prompt:'Pedido '+i,reply}))});

test('un historial ilegible o con otra forma no impide abrir el chat',()=>{
  for(const raw of [null,'{','null','"texto"','{"id":"x"}','[null,3,"a",{"id":"sin-turnos","turns":[]},{"turns":[{"id":"t","prompt":"p"}]}]'])assert.deepEqual(parseChats(raw),[]);
});

test('del historial sólo vuelve texto corto: ni el documento, ni el lote, ni campos desconocidos',()=>{
  const stored=JSON.stringify([{id:'chat-1',tabId:'tab-1',docTitle:'Ventas',title:'',updatedAt:10,document:{nodes:[{id:'secreto'}]},
    turns:[{id:'t-1',prompt:'p'.repeat(5000),reply:'r'.repeat(9000),mode:'create',outcome:'applied',body:'{"document":{}}',result:{batch:{actions:[1]}}},{id:'',prompt:'sin id'},{id:'t-3',prompt:'Falló',reply:'Sin créditos',failed:true}]}]);
  const [restored]=parseChats(stored);
  assert.deepEqual(Object.keys(restored!).sort(),['docTitle','id','tabId','title','turns','updatedAt']);
  assert.equal(restored!.turns.length,2,'un turno sin identificador se descarta');
  assert.deepEqual(Object.keys(restored!.turns[0]!).sort(),['id','mode','outcome','prompt','reply']);
  assert.equal(restored!.turns[0]!.prompt.length,CHAT_LIMITS.prompt);assert.equal(restored!.turns[0]!.reply.length,CHAT_LIMITS.reply);
  assert.equal(restored!.title,'p'.repeat(120),'sin título se usa el primer pedido');
  assert.deepEqual(restored!.turns[1],{id:'t-3',prompt:'Falló',reply:'Sin créditos',failed:true});
  assert.ok(!JSON.stringify(restored).includes('secreto')&&!JSON.stringify(restored).includes('actions'));
});

test('el historial tiene topes de conversaciones, de turnos y de tamaño, y conserva lo más reciente',()=>{
  const many=trimChats(Array.from({length:30},(_,i)=>chat(i)));
  assert.equal(many.length,CHAT_LIMITS.chats);assert.equal(many[0]!.id,'chat-29');assert.equal(many.at(-1)!.id,'chat-10');
  const long=trimChats([chat(1,60)])[0]!;
  assert.equal(long.turns.length,CHAT_LIMITS.turns);assert.equal(long.turns.at(-1)!.id,'t-1-59','se conservan los últimos turnos');
  const heavy=trimChats(Array.from({length:20},(_,i)=>chat(i,40,'r'.repeat(CHAT_LIMITS.reply))));
  assert.ok(JSON.stringify(heavy).length<=CHAT_LIMITS.bytes,'el total queda bajo el tope');assert.ok(heavy.length<20&&heavy[0]!.id==='chat-19','se descartan las más viejas');
  assert.equal(trimChats([chat(1,40,'r'.repeat(400_000))]).length,1,'la conversación en curso nunca se descarta por tamaño');
});

test('guardar una conversación la reemplaza por su identificador y la deja primera',()=>{
  const saved=upsertChat([chat(1),chat(2)],{...chat(1,3),updatedAt:99});
  assert.deepEqual(saved.map(item=>[item.id,item.turns.length]),[['chat-1',3],['chat-2',1]]);
});
