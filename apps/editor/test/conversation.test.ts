import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conversationWindow} from '../src/assistant/conversation.js';

test('respuestas breves conservan el pedido original después de varias preguntas sin exceder el contexto',()=>{
  const turns=Array.from({length:6},(_,i)=>({id:'turn-'+i,prompt:i?'respuesta '+i:'Organizá mi viaje',status:'done',result:{kind:'clarification'}}));
  assert.deepEqual(conversationWindow(turns,'turn-0').map(t=>t.id),['turn-0','turn-4','turn-5']);
  assert.deepEqual(conversationWindow(turns,'turn-0',1).map(t=>t.id),['turn-0']);
  assert.deepEqual(conversationWindow(turns).map(t=>t.id),['turn-3','turn-4','turn-5']);
});

test('cancelar una pregunta evita reintroducirla y un error o pedido pendiente no cuenta como respuesta',()=>{
  const turns=[{id:'old',prompt:'Pedido cancelado',status:'done',result:{},outcome:'cancelled'},
    {id:'new',prompt:'Nueva idea',status:'done',result:{}},{id:'error',prompt:'Falló',status:'error',result:undefined},{id:'pending',prompt:'Pensando',status:'sending',result:undefined}];
  assert.deepEqual(conversationWindow(turns,'old').map(t=>t.id),['new']);
});
