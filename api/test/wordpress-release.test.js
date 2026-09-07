import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { registerWordPressReleaseRoutes } from '../src/wordpress-release-routes.js';

test('public release serves only the manifest and existing valid version archives', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aaa-release-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'wordpress-update-manifest.json'),JSON.stringify({version:'0.2.1'}));
  fs.writeFileSync(path.join(dir,'aaastreamer-connector-0.2.1.zip'),'test-archive');
  const app=express();registerWordPressReleaseRoutes(app,dir);
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
  const manifest=await fetch(base+'/api/wordpress/releases/aaastreamer-connector');
  assert.equal((await manifest.json()).version,'0.2.1');
  const archive=await fetch(base+'/api/wordpress/downloads/aaastreamer-connector-0.2.1.zip');
  assert.equal(await archive.text(),'test-archive');
  for(const version of ['0.2.2','latest','abc','..%2Fsecret']) {
    assert.equal((await fetch(base+`/api/wordpress/downloads/aaastreamer-connector-${version}.zip`)).status,404);
  }
});
