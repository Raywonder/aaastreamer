import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

test('repeated normalization does not append wildcard defaults or override configured access', () => {
  const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function normalizeMediaSettings('), source.indexOf('function normalizeStreamSource('));
  const context = vm.createContext({path, slugify:s=>s.replace(/\W+/g,'-'),
    defaultMediaSettings:()=>({uploadFolder:'/uploads', folders:[{id:'pattern',path:'/accounts/*/media',visibleToUsers:true}]}),
    expandMediaFolderPath:p=>p.includes('*')?['/accounts/a/media','/accounts/b/media']:[p]});
  vm.runInContext(fn,context);
  let settings={folders:[{id:'existing-a',path:'/accounts/a/media',visibleToUsers:false,enabled:false}]};
  for(let i=0;i<100;i++)settings=context.normalizeMediaSettings(settings);
  assert.equal(settings.folders.length,3);
  assert.equal(settings.folders.find(f=>f.id==='existing-a').enabled,false);
  assert.equal(settings.folders.find(f=>f.id==='existing-a').visibleToUsers,false);
  assert.equal(settings.folders.filter(f=>f.path==='/accounts/b/media').length,1);
});
