import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recognizeHandwriting,type HandwritingPlatform} from '../src/canvas/handwriting.js';

test('sin API local no se inventa una letra y no se llama un proveedor',async()=>{
  assert.deepEqual(await recognizeHandwriting([[{x:0,y:0},{x:10,y:10}]],{}),{status:'unavailable',text:''});
});
test('el adapter pasa trazos en español, recibe la predicción del dispositivo y libera recursos',async()=>{
  let strokes=0,points=0,cleared=false,finished=false;
  const platform:HandwritingPlatform={HandwritingStroke:class{addPoint(){points++;}},createHandwritingRecognizer:async options=>{assert.deepEqual(options.languages,['es']);return {startDrawing:()=>({addStroke:()=>{strokes++;},getPrediction:async()=>[{text:' a '}],clear:()=>{cleared=true;}}),finish:()=>{finished=true;}};}};
  assert.deepEqual(await recognizeHandwriting([[{x:0,y:0},{x:10,y:10}],[{x:20,y:0},{x:20,y:10}]],platform),{status:'recognized',text:'a'});
  assert.equal(strokes,2);assert.equal(points,4);assert.ok(cleared&&finished);
});
test('un dispositivo que rechaza español o no responde devuelve un fallo recuperable',async()=>{
  class Stroke{addPoint(){}}
  assert.equal((await recognizeHandwriting([],{HandwritingStroke:Stroke,createHandwritingRecognizer:async()=>{throw new Error('unsupported');}})).status,'failed');
  assert.equal((await recognizeHandwriting([],{HandwritingStroke:Stroke,createHandwritingRecognizer:()=>new Promise(()=>{})},10)).status,'failed');
});
