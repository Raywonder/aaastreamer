import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJsonAtomic } from '../src/atomic-store.js';

test('atomic store keeps last good data when serialization fails and leaves no temporary files', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aaa-store-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'store.json');
  writeJsonAtomic(file,{users:['existing']});
  const circular={};circular.self=circular;
  assert.throws(()=>writeJsonAtomic(file,circular));
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),{users:['existing']});
  writeJsonAtomic(file,{users:['existing','restored']});
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),{users:['existing','restored']});
  assert.deepEqual(fs.readdirSync(dir),['store.json']);
  if(process.platform!=='win32')assert.equal(fs.statSync(file).mode & 0o777,0o600);
});
