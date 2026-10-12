import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES,parsePreferences} from '../src/store/preferences.js';

test('preferencias locales corruptas o de otra versión no impiden abrir el editor',()=>{
  for(const raw of [null,'{','null','false','"dark"'])assert.deepEqual(parsePreferences(raw),DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"snap":"false","showGrid":null,"paletteLayout":"invalid","reduceMotion":1}'),DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"snap":false,"showGrid":false,"paletteLayout":"grid","reduceMotion":true,"document":{"nodes":[]}}'),{snap:false,showGrid:false,paletteLayout:'grid',reduceMotion:true});
});
