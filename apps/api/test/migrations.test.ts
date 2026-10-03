import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrationChecksum} from '../src/repositories/postgres.js';

test('a migration has the same checksum with Windows or Unix line endings, and any real edit changes it',()=>{
  const sql=readFileSync('apps/api/migrations/003_telemetry.sql','utf8').replace(/\r\n/g,'\n');
  assert.equal(migrationChecksum(sql.replace(/\n/g,'\r\n')),migrationChecksum(sql));
  assert.notEqual(migrationChecksum(sql+'-- cambio\n'),migrationChecksum(sql));
});
