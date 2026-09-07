import crypto from 'crypto';

const providers = new Set(['wordpress', 'mastodon']);

export function canonicalIssuer(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || ''}`;
  } catch {
    return '';
  }
}

export function normalizeLinkedIdentity(identity = {}) {
  const provider = providers.has(identity.provider) ? identity.provider : '';
  const issuer = canonicalIssuer(identity.issuer);
  const subject = String(identity.subject || '').trim().slice(0, 240);
  if (!provider || !issuer || !subject) return null;
  const deterministicId = `eid_${crypto.createHash('sha256').update(`${provider}\n${issuer}\n${subject}`).digest('hex').slice(0, 20)}`;
  return {
    id: String(identity.id || deterministicId).slice(0, 80),
    provider,
    issuer,
    subject,
    username: String(identity.username || '').trim().slice(0, 120),
    email: String(identity.email || '').trim().slice(0, 180),
    displayName: String(identity.displayName || '').trim().slice(0, 180),
    linkedAt: identity.linkedAt || '',
    lastLoginAt: identity.lastLoginAt || ''
  };
}

export function identityKey(identity) {
  const normalized = normalizeLinkedIdentity(identity);
  return normalized ? `${normalized.provider}\n${normalized.issuer}\n${normalized.subject}` : '';
}

export function normalizeExternalAuthState(state = {}) {
  const provider = providers.has(state.provider) ? state.provider : '';
  const issuer = canonicalIssuer(state.issuer);
  if (!provider || !issuer || !state.state || !state.expiresAt) return null;
  return {
    state: String(state.state).slice(0, 160),
    provider,
    issuer,
    intent: ['link', 'publisher'].includes(state.intent) ? state.intent : 'login',
    linkUserId: String(state.linkUserId || '').slice(0, 80),
    codeVerifier: String(state.codeVerifier || '').slice(0, 160),
    createdAt: state.createdAt || '',
    expiresAt: state.expiresAt,
    usedAt: state.usedAt || ''
  };
}

export function randomUrlToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(String(verifier)).digest('base64url');
}

export function signWordPressAssertion(payload, secret) {
  if (!secret) throw new Error('A connector secret is required.');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyWordPressAssertion(assertion, secret, expected = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
  const [body, signature, extra] = String(assertion || '').split('.');
  if (!body || !signature || extra || !secret) throw new Error('The WordPress assertion is invalid.');
  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest();
  let receivedSignature;
  try { receivedSignature = Buffer.from(signature, 'base64url'); } catch { throw new Error('The WordPress assertion is invalid.'); }
  if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new Error('The WordPress assertion signature was not accepted.');
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw new Error('The WordPress assertion payload is invalid.'); }
  const issuer = canonicalIssuer(payload.iss);
  const audience = canonicalIssuer(payload.aud);
  if (!issuer || issuer !== canonicalIssuer(expected.issuer)) throw new Error('The WordPress issuer was not accepted.');
  if (!audience || audience !== canonicalIssuer(expected.audience)) throw new Error('The WordPress audience was not accepted.');
  if (!payload.sub || String(payload.state || '') !== String(expected.state || '')) throw new Error('The WordPress login request did not match.');
  if (!Number.isFinite(Number(payload.iat)) || !Number.isFinite(Number(payload.exp)) || Number(payload.iat) > nowSeconds + 60 || Number(payload.exp) < nowSeconds || Number(payload.exp) - Number(payload.iat) > 300) {
    throw new Error('The WordPress assertion has expired or has an invalid lifetime.');
  }
  return { ...payload, iss: issuer, aud: audience, sub: String(payload.sub) };
}

export function externalAuthCallbackUrl(baseUrl, provider) {
  const base = canonicalIssuer(baseUrl);
  if (!base || !providers.has(provider)) return '';
  return `${base}/auth/${provider}/callback`;
}
