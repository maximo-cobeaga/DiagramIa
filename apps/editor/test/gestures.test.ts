import test from 'node:test';
import assert from 'node:assert/strict';
import {beginPinch,pinchCamera} from '../src/canvas/gestures';

test('two fingers pan and zoom around the original document anchor without accumulating drift',()=>{
  const camera={x:100,y:50,zoom:1},origin={x:20,y:40},gesture=beginPinch({x:120,y:140},{x:220,y:140},camera,origin);
  const next=pinchCamera(gesture,{x:110,y:180},{x:310,y:180},origin,z=>Math.min(3,Math.max(.12,z)));
  assert.equal(next.zoom,2);
  assert.equal(next.x+(210-origin.x)/next.zoom,gesture.anchor.x);
  assert.equal(next.y+(180-origin.y)/next.zoom,gesture.anchor.y);
  assert.deepEqual(pinchCamera(gesture,{x:120,y:140},{x:220,y:140},origin,z=>z),camera);
  const clamped=pinchCamera(gesture,{x:50,y:200},{x:1000,y:200},origin,z=>Math.min(3,z));
  assert.equal(clamped.zoom,3);assert.equal(clamped.x+(525-origin.x)/3,gesture.anchor.x);
  assert.deepEqual(camera,{x:100,y:50,zoom:1});
});
