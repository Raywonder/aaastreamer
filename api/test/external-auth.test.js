import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalIssuer, identityKey, pkceChallenge, signWordPressAssertion, verifyWordPressAssertion } from '../src/external-auth.js';

test('canonicalIssuer accepts exact HTTPS sites and rejects insecure or credentialed URLs', () => {
  assert.equal(canonicalIssuer('https://Example.com/'), 'https://example.com');
  assert.equal(canonicalIssuer('http://example.com'), '');
  assert.equal(canonicalIssuer('https://name:secret@example.com'), '');
});

test('linked identity keys are provider, issuer, and subject scoped', () => {
  assert.equal(identityKey({ provider: 'mastodon', issuer: 'https://social.example/', subject: '42' }), 'mastodon\nhttps://social.example\n42');
});

test('PKCE challenge uses SHA-256 base64url', () => {
  assert.equal(pkceChallenge('test-verifier'), 'JBbiqONGWPaAmwXk_8bT6UnlPfrn65D32eZlJS-zGG0');
});

test('WordPress assertions require signature, exact issuer, audience, state, and short lifetime', () => {
  const payload = { iss: 'https://site.example/', aud: 'https://aaa.example/', sub: '7', state: 'request-1', iat: 1000, exp: 1290 };
  const assertion = signWordPressAssertion(payload, 'connector-secret');
  const verified = verifyWordPressAssertion(assertion, 'connector-secret', { issuer: 'https://site.example', audience: 'https://aaa.example', state: 'request-1' }, 1100);
  assert.equal(verified.sub, '7');
  assert.throws(() => verifyWordPressAssertion(assertion, 'wrong-secret', { issuer: payload.iss, audience: payload.aud, state: payload.state }, 1100));
  assert.throws(() => verifyWordPressAssertion(assertion, 'connector-secret', { issuer: payload.iss, audience: payload.aud, state: 'other' }, 1100));
  assert.throws(() => verifyWordPressAssertion(assertion, 'connector-secret', { issuer: payload.iss, audience: payload.aud, state: payload.state }, 1400));
});
