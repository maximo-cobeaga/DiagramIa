import test from 'node:test';
import assert from 'node:assert/strict';
import {inferMode,resolveAutoMode} from '../src/intent.js';

test('the mode is inferred from how people actually ask, with or without accents',()=>{
  const cases:[string,ReturnType<typeof inferMode>][]=[
    ['Explicá qué hace este sistema','explain'],
    ['¿qué hace este sistema?','explain'],
    ['explicame como funciona el login','explain'],
    ['¿Para qué sirve la caché?','explain'],
    ['Explicame por qué agregaste Redis','explain'],
    ['Revisá la arquitectura y señalá riesgos','review'],
    ['¿Qué problemas ves en este diagrama?','review'],
    ['Documentá este diagrama en Markdown','document'],
    ['Creá un diagrama de inicio de sesión con usuario, frontend, API y base de datos','create'],
    ['Armame un flujo de compras','create'],
    ['Agregá Redis como caché dentro de Backend, debajo de la API','edit'],
    ['Conectá la API con la base','edit'],
    ['Cambiá el color del frontend a verde','edit'],
    ['Reorganizá el diagrama para que se lea de izquierda a derecha','transform'],
    ['Animá el recorrido de una compra','animate'],
    ['Revisá y agregá una réplica a la base','edit']
  ];
  for(const [prompt,mode] of cases)assert.equal(inferMode(prompt,false),mode,prompt);
});

test('requests written in English reach the same modes as their Spanish equivalents',()=>{
  const cases:[string,ReturnType<typeof inferMode>][]=[
    ['Explain what this diagram does','explain'],
    ['What does this system do?','explain'],
    ['Why did you add Redis','explain'],
    ['What risks do you see in this diagram?','review'],
    ['Review the architecture and point out bottlenecks','review'],
    ['Write the documentation in Markdown','document'],
    ['Create a login diagram with user, frontend, API and database','create'],
    ['Draw a flowchart for a purchase','create'],
    ['Add Redis as a cache inside Backend, below the API','edit'],
    ['Connect the API to the database','edit'],
    ['Change the frontend color to green','edit'],
    ['Rearrange the diagram so it reads left to right','transform'],
    ['Animate the walkthrough of a purchase','animate'],
    ['Review and add a replica to the database','edit']
  ];
  for(const [prompt,mode] of cases)assert.equal(inferMode(prompt,false),mode,prompt);
  assert.equal(inferMode('Add a user and an API',true),'create');
});

test('an empty canvas turns change requests into a new diagram, but a plain question is still answered',()=>{
  assert.equal(inferMode('Agregá un usuario y una API',true),'create');
  assert.equal(inferMode('login con google',true),'create');
  assert.equal(inferMode('¿Qué es un diagrama de secuencia?',true),'explain');
  assert.equal(inferMode('hola',false),'edit','sin señales, edita y el modelo puede pedir una aclaración');
});

test('only mode "auto" is rewritten; explicit modes and malformed bodies pass through untouched',()=>{
  assert.deepEqual(resolveAutoMode({mode:'auto',prompt:'Explicá esto',document:{nodes:[{id:'a'}]}}),{mode:'explain',prompt:'Explicá esto',document:{nodes:[{id:'a'}]}});
  assert.equal((resolveAutoMode({mode:'auto',prompt:'Agregá una API',document:{nodes:[]}}) as {mode:string}).mode,'create');
  const explicit={mode:'review',prompt:'Explicá esto'};
  assert.equal(resolveAutoMode(explicit),explicit);
  assert.equal(resolveAutoMode(null),null);
  assert.equal((resolveAutoMode({mode:'auto'}) as {mode:string}).mode,'edit');
});
