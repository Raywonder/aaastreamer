import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('function watchUrlFor('), source.indexOf('function isLive('));
test('existing listening token remains canonical without exposing it in stream serialization', () => {
  const ctx = vm.createContext({ publicUrl: 'https://example.test', id: () => { throw Error('must not rotate'); }, nowIso: () => 'now' });
  vm.runInContext(section, ctx);
  const stream = { id: 'stream', slug: 'station' };
  const store = { shareLinks: [{ streamId: 'stream', purpose: 'stream', token: 'test-listening-token' }] };
  ctx.ensureShareLink(store, stream, 'owner');
  assert.equal(ctx.watchUrlFor(stream), 'https://example.test/go/test-listening-token');
  assert.equal(store.shareLinks.length, 1);
  assert.equal(JSON.stringify(stream), '{"id":"stream","slug":"station"}');
});
test('legacy stream links remain compatible until a share link exists', () => {
  const ctx = vm.createContext({ publicUrl: 'https://example.test' });
  vm.runInContext(section, ctx);
  assert.equal(ctx.watchUrlFor({ slug: 'station' }), 'https://example.test/s/station');
  assert.equal(ctx.tokenUrlFor('test/value'), 'https://example.test/go/test%2Fvalue');
});
