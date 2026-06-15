import crypto from 'crypto';
import childProcess from 'child_process';
import dns from 'dns';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';

const app = express();
app.set('trust proxy', true);
const uploadLimit = process.env.AAASTREAMER_UPLOAD_LIMIT || '75mb';
app.use(express.json({
  limit: uploadLimit,
  verify(req, _res, buf) {
    if (req.originalUrl === '/api/payments/stripe/webhook') {
      req.rawBody = Buffer.from(buf);
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: uploadLimit }));
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    res.status(400).json({ ok: false, error: 'Invalid request body.' });
    return;
  }
  next(err);
});

const port = Number(process.env.AAASTREAMER_PORT || 8095);
const maxUploadBytes = Number(process.env.AAASTREAMER_MAX_UPLOAD_BYTES || 75 * 1024 * 1024);
const maxBulkUploads = Math.max(1, Math.min(25, Number(process.env.AAASTREAMER_MAX_BULK_UPLOADS || 12) || 12));
const repoRoot = fs.existsSync(path.resolve(process.cwd(), 'api/src/server.js')) ? process.cwd() : path.resolve(process.cwd(), '..');
const dataDir = path.resolve(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'aaastreamer.json');
const hlsPath = process.env.HLS_PATH || '/tmp/hls';
const publicUrl = (process.env.AAASTREAMER_PUBLIC_URL || '').replace(/\/+$/, '');
const hlsBaseUrl = (process.env.AAASTREAMER_HLS_BASE_URL || publicUrl || '').replace(/\/+$/, '');
const rtmpHost = process.env.AAASTREAMER_RTMP_HOST || 'localhost';
const rtmpAppName = process.env.RTMP_APP_NAME || 'live';
const requireSecret = process.env.AAASTREAMER_REQUIRE_SECRET === 'true';
const sharedSecret = process.env.VOICELINK_SHARED_SECRET || '';
const whmcsApiIdentifier = process.env.AAASTREAMER_WHMCS_API_IDENTIFIER || '';
const whmcsApiSecret = process.env.AAASTREAMER_WHMCS_API_SECRET || '';
const whmcsApiAccessKey = process.env.AAASTREAMER_WHMCS_API_ACCESS_KEY || '';
const stripeSecretKey = process.env.AAASTREAMER_STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.AAASTREAMER_STRIPE_WEBHOOK_SECRET || '';
const dnsApiToken = process.env.AAASTREAMER_DNS_API_TOKEN || '';
const mastodonAccessToken = process.env.AAASTREAMER_MASTODON_ACCESS_TOKEN || '';
const allowRestream = process.env.ALLOW_RESTREAM !== 'false';
const allowAdHocStreams = process.env.AAASTREAMER_ALLOW_AD_HOC_STREAMS === 'true';
const sessionCookieName = 'aaastreamer_session';
const sseClients = new Set();
const appVersion = process.env.AAASTREAMER_VERSION || '0.1.3';
const updateManifestUrl = process.env.AAASTREAMER_UPDATE_MANIFEST_URL || 'https://raw.githubusercontent.com/Raywonder/aaastreamer/main/api/package.json';
const audioBitrates = ['96k', '128k', '160k', '192k', '256k', '320k'];
const sourceProcesses = new Map();
const mediaExtensions = new Map([
  ['.aac', 'audio'], ['.aif', 'audio'], ['.aiff', 'audio'], ['.alac', 'audio'], ['.flac', 'audio'],
  ['.m4a', 'audio'], ['.mp3', 'audio'], ['.ogg', 'audio'], ['.opus', 'audio'], ['.wav', 'audio'],
  ['.m4v', 'video'], ['.mkv', 'video'], ['.mov', 'video'], ['.mp4', 'video'], ['.webm', 'video']
]);
const platformPresets = [
  { id: 'youtube', name: 'YouTube Live', url: 'https://www.youtube.com/live_dashboard', connectUrl: 'https://studio.youtube.com/channel/UC/livestreaming', ingest: 'rtmp://a.rtmp.youtube.com/live2', services: ['YouTube channel live stream', 'Scheduled YouTube event'] },
  { id: 'twitch', name: 'Twitch', url: 'https://dashboard.twitch.tv/u/stream-manager', connectUrl: 'https://dashboard.twitch.tv/u/stream-manager', ingest: 'rtmp://live.twitch.tv/app', services: ['Twitch channel stream'] },
  { id: 'facebook', name: 'Facebook Live', url: 'https://www.facebook.com/live/producer', connectUrl: 'https://www.facebook.com/live/producer', ingest: 'rtmps://live-api-s.facebook.com:443/rtmp', services: ['Facebook profile', 'Facebook page', 'Facebook group'] },
  { id: 'linkedin', name: 'LinkedIn Live', url: 'https://www.linkedin.com/video/golive/now/', connectUrl: 'https://www.linkedin.com/video/golive/now/', ingest: 'rtmp://1-rtmp-live.linkedin.com/live', services: ['LinkedIn profile', 'LinkedIn page', 'LinkedIn event'] },
  { id: 'kick', name: 'Kick', url: 'https://kick.com/dashboard/stream', connectUrl: 'https://kick.com/dashboard/stream', ingest: 'rtmps://fa-live.stream.kick.com/app', services: ['Kick channel stream'] },
  { id: 'restream', name: 'Restream.io', url: 'https://app.restream.io/channel', connectUrl: 'https://app.restream.io/channel', ingest: 'rtmp://live.restream.io/live', services: ['YouTube', 'Twitch', 'Facebook', 'LinkedIn', 'X', 'Kick', 'Custom RTMP destinations through Restream'] },
  { id: 'rumble', name: 'Rumble Live', url: 'https://rumble.com/account/livestreaming', connectUrl: 'https://rumble.com/account/livestreaming', ingest: '', services: ['Rumble channel stream'] },
  { id: 'x', name: 'X Live', url: 'https://studio.x.com/', connectUrl: 'https://studio.x.com/', ingest: '', services: ['X live broadcast'] },
  { id: 'custom', name: 'Manual RTMP or RTMPS', url: '', connectUrl: '', ingest: '', services: ['Any destination that gives you an RTMP or RTMPS server URL and stream key'] }
];
const sourcePresets = [
  {
    id: 'rtmpEncoder',
    name: 'Live encoder, RTMP',
    mediaType: 'video',
    label: 'OBS, Ecamm, Streamlabs, vMix, Larix, or another RTMP encoder'
  },
  {
    id: 'audioRelay',
    name: 'Audio stream URL',
    mediaType: 'audio',
    label: 'Remote audio stream or radio relay',
    placeholder: 'https://example.com/live.mp3'
  },
  {
    id: 'videoRelay',
    name: 'Video stream or file URL',
    mediaType: 'video',
    label: 'Remote video stream or hosted video file',
    placeholder: 'https://example.com/live-or-video.mp4'
  },
  {
    id: 'hlsRelay',
    name: 'HLS playlist URL',
    mediaType: 'video',
    label: 'Remote HLS playlist',
    placeholder: 'https://example.com/live/index.m3u8'
  },
  {
    id: 'serverMedia',
    name: 'Server media library',
    mediaType: 'video',
    label: 'Use approved media already on this server'
  },
  {
    id: 'upload',
    name: 'Upload audio or video',
    mediaType: 'video',
    label: 'Upload a local file and use it as the selected source'
  },
  {
    id: 'customRtmp',
    name: 'Custom RTMP source',
    mediaType: 'video',
    label: 'Manual RTMP-capable software setup'
  }
];

app.use('/hls', express.static(hlsPath, {
  setHeaders(res, filePath) {
    const ext = path.extname(filePath || '').toLowerCase();
    if (ext === '.m3u8') {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } else if (ext === '.ts') {
      res.setHeader('Content-Type', 'video/MP2T');
      res.setHeader('Cache-Control', 'public, max-age=30');
    } else if (ext === '.m4s' || ext === '.mp4') {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'public, max-age=30');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Accept, Content-Type');
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

function nowIso() {
  return new Date().toISOString();
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `stream-${Date.now()}`;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}

function createLoginSession(store, user, res) {
  const token = id('sess');
  store.sessions.push({ token, userId: user.id, createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString() });
  writeStore(store);
  res.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
}

function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totpCode(secret, step = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

function verifyTotp(secret, provided) {
  const code = String(provided || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code) || !secret) return false;
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((offset) => crypto.timingSafeEqual(Buffer.from(totpCode(secret, step + offset)), Buffer.from(code)));
}

function passkeyContext(req) {
  const host = String(req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
  const rpID = host.replace(/:\d+$/, '');
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return { rpID, origin: `${proto}://${host}` };
}

function configuredAuthDomains(store, req) {
  const current = passkeyContext(req).rpID;
  const dns = store.settings?.dns || {};
  return Array.from(new Set([
    current,
    ...String(dns.authDomains || '')
      .split(/\r?\n|,|;/)
      .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, ''))
      .filter(Boolean)
  ]));
}

function configuredOrigins(store, req) {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return configuredAuthDomains(store, req).map((domain) => `${proto}://${domain}`);
}

function passkeyCredentialForVerify(passkey) {
  return {
    id: passkey.id,
    publicKey: Buffer.from(passkey.publicKey, 'base64url'),
    counter: Number(passkey.counter || 0),
    transports: passkey.transports || []
  };
}

function ensureDataStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({
      users: [],
      streams: [],
      comments: [],
      events: [],
      payments: [],
      sessions: [],
      scheduledShows: [],
      settings: {
        siteName: process.env.AAASTREAMER_SITE_NAME || 'AAAStreamer',
        platformBranding: defaultPlatformBranding(),
        paymentIntegration: defaultPaymentIntegrationSettings(),
        license: defaultLicenseSettings(),
        dns: defaultDnsSettings(),
        social: defaultSocialSettings(),
        visitorCommentsEnabled: true,
        messaging: defaultMessagingSettings(),
        commentAccessRules: [],
        supportDefaults: defaultSupportSettings(),
        registrationsEnabled: process.env.AAASTREAMER_REGISTRATION_ENABLED === 'true',
        registrationDefaultRole: 'user',
        encoderDefaults: defaultEncoderSettings(),
        updateManifestUrl,
        maintenanceMode: { enabled: false, message: '' }
      }
    }, null, 2));
  }
  bootstrapAdmin();
}

function readStore() {
  ensureDataStore();
  return normalizeStore(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
}

function writeStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function normalizeMessagingSettings(settings = {}) {
  const defaults = defaultMessagingSettings();
  return {
    ...defaults,
    ...settings,
    visitorMessagesEnabled: settings.visitorMessagesEnabled !== false,
    loggedInUserMessagesEnabled: settings.loggedInUserMessagesEnabled !== false,
    reactionsEnabled: settings.reactionsEnabled !== false,
    requireNameForGuests: settings.requireNameForGuests !== false,
    maxMessageLength: clampNumber(settings.maxMessageLength, 100, 5000, defaults.maxMessageLength),
    requireGuestReview: settings.requireGuestReview === true,
    autoHideBlockedWords: settings.autoHideBlockedWords !== false,
    blockedWords: String(settings.blockedWords || '').trim().slice(0, 5000),
    retentionHours: clampNumber(settings.retentionHours, 0, 24 * 365, defaults.retentionHours),
    maxStoredMessages: clampNumber(settings.maxStoredMessages, 100, 50000, defaults.maxStoredMessages)
  };
}

function normalizeCommentAccessRule(rule = {}) {
  const targetType = ['user', 'ipv4', 'ipv6', 'ip', 'host', 'dns'].includes(rule.targetType) ? rule.targetType : '';
  const action = ['allow', 'review', 'hide', 'block'].includes(rule.action) ? rule.action : '';
  const targetValue = String(rule.targetValue || '').trim().toLowerCase().slice(0, 255);
  if (!targetType || !action || !targetValue) return null;
  return {
    id: String(rule.id || id('car')).slice(0, 80),
    targetType,
    targetValue,
    action,
    notes: String(rule.notes || '').trim().slice(0, 500),
    createdAt: rule.createdAt || nowIso()
  };
}

function normalizeIpAddress(value = '') {
  const raw = String(value || '').split(',')[0].trim().replace(/^::ffff:/i, '');
  return raw.replace(/^\[|\]$/g, '');
}

function requestClientIp(req) {
  return normalizeIpAddress(req.ip || req.get('x-forwarded-for') || req.socket?.remoteAddress || '');
}

function ipVersion(ip) {
  if (!ip) return '';
  return ip.includes(':') ? 'ipv6' : 'ipv4';
}

function requestHostName(req) {
  return String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').slice(0, 255);
}

async function reverseDnsHost(ip) {
  if (!ip) return '';
  try {
    const names = await Promise.race([
      dns.promises.reverse(ip),
      new Promise((resolve) => setTimeout(() => resolve([]), 500))
    ]);
    return String((Array.isArray(names) && names[0]) || '').toLowerCase().slice(0, 255);
  } catch {
    return '';
  }
}

function valueMatchesRule(value, targetValue) {
  const normalizedValue = String(value || '').toLowerCase();
  const normalizedTarget = String(targetValue || '').toLowerCase();
  if (!normalizedValue || !normalizedTarget) return false;
  if (normalizedTarget.includes('*')) {
    const pattern = normalizedTarget.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${pattern}$`, 'i').test(normalizedValue);
  }
  return normalizedValue === normalizedTarget || normalizedValue.endsWith(`.${normalizedTarget}`);
}

function commentIdentityForRules(commentIdentity, user) {
  return {
    user: user?.username || user?.displayName || commentIdentity.authorName || '',
    ip: commentIdentity.ipAddress || '',
    ipv4: commentIdentity.ipVersion === 'ipv4' ? commentIdentity.ipAddress : '',
    ipv6: commentIdentity.ipVersion === 'ipv6' ? commentIdentity.ipAddress : '',
    host: commentIdentity.requestHost || '',
    dns: commentIdentity.reverseDnsHost || ''
  };
}

function evaluateCommentAccessRules(store, commentIdentity, user) {
  const values = commentIdentityForRules(commentIdentity, user);
  for (const rule of store.settings.commentAccessRules || []) {
    const target = values[rule.targetType] || '';
    if (valueMatchesRule(target, rule.targetValue)) return rule;
  }
  return null;
}

function pruneComments(store) {
  const messaging = normalizeMessagingSettings(store.settings?.messaging || {});
  const cutoff = messaging.retentionHours > 0 ? Date.now() - messaging.retentionHours * 60 * 60 * 1000 : 0;
  store.comments = (store.comments || []).filter((comment) => {
    if (!cutoff) return true;
    const created = Date.parse(comment.createdAt || '');
    return !Number.isFinite(created) || created >= cutoff;
  }).slice(-messaging.maxStoredMessages);
}

function blockedWordList(settings) {
  return String(settings.blockedWords || '')
    .split(/[\r\n,]+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 200);
}

function messageHitsBlockedWord(message, settings) {
  const haystack = String(message || '').toLowerCase();
  return blockedWordList(settings).find((word) => haystack.includes(word)) || '';
}

function defaultEncoderSettings() {
  return {
    videoBitrate: '4500k',
    audioBitrate: '160k',
    audioChannels: 'stereo',
    sampleRate: '48000',
    keyframeIntervalSeconds: 2,
    latencyMode: 'balanced',
    targetLatencySeconds: 6,
    playerBufferSeconds: 10,
    hlsSegmentDurationMs: 2000,
    hlsPartDurationMs: 200,
    hlsSegmentCount: 12
  };
}

function defaultPlatformBranding() {
  const platformName = process.env.AAASTREAMER_SITE_NAME || 'AAAStreamer';
  return {
    platformName,
    subheading: 'Accessible live streaming for creators, communities, and events.',
    slogan: '',
    tagline: '',
    description: 'Watch live streams, join the conversation, and support creators from one accessible streaming page.'
  };
}

function defaultMessagingSettings() {
  return {
    visitorMessagesEnabled: true,
    loggedInUserMessagesEnabled: true,
    reactionsEnabled: true,
    requireNameForGuests: true,
    maxMessageLength: 1000,
    requireGuestReview: false,
    autoHideBlockedWords: true,
    blockedWords: '',
    retentionHours: 168,
    maxStoredMessages: 5000
  };
}

function defaultPaymentIntegrationSettings() {
  return {
    currency: 'usd',
    whmcsEnabled: Boolean(whmcsApiIdentifier && whmcsApiSecret),
    whmcsUrl: process.env.AAASTREAMER_WHMCS_URL || 'https://devine-creations.com',
    whmcsDefaultClientId: process.env.AAASTREAMER_WHMCS_DEFAULT_CLIENT_ID || '',
    whmcsPaymentMethod: process.env.AAASTREAMER_WHMCS_PAYMENT_METHOD || '',
    stripeEnabled: Boolean(stripeSecretKey),
    defaultAmountCents: 500,
    minimumAmountCents: 100,
    platformStatement: 'A 15% platform support share helps cover hosting, storage, domains, bandwidth, and support.'
  };
}

function defaultLicenseSettings() {
  return {
    licensingEnabled: process.env.AAASTREAMER_LICENSE_ENABLED !== 'false',
    licenseServerUrl: process.env.AAASTREAMER_LICENSE_SERVER_URL || 'https://devine-creations.com',
    whmcsProductId: process.env.AAASTREAMER_WHMCS_PRODUCT_ID || '',
    licenseKey: process.env.AAASTREAMER_LICENSE_KEY || '',
    installId: process.env.AAASTREAMER_INSTALL_ID || '',
    installDomain: process.env.AAASTREAMER_INSTALL_DOMAIN || '',
    edition: process.env.AAASTREAMER_EDITION || 'self-hosted',
    validationStatus: 'unknown',
    lastValidationAt: '',
    nextValidationAt: '',
    graceEndsAt: '',
    clientLinked: process.env.AAASTREAMER_CLIENT_LINKED === 'true',
    lockClientLinkedSettings: process.env.AAASTREAMER_LOCK_CLIENT_LINKED_SETTINGS === 'true',
    reissueLimits: { monthly: 2, quarterly: 4, yearly: 8 },
    reissues: []
  };
}

function defaultDnsSettings() {
  return {
    provider: process.env.AAASTREAMER_DNS_PROVIDER || '',
    zoneId: process.env.AAASTREAMER_DNS_ZONE_ID || '',
    defaultTarget: process.env.AAASTREAMER_DNS_DEFAULT_TARGET || '',
    defaultNameservers: process.env.AAASTREAMER_DNS_DEFAULT_NAMESERVERS || '',
    authDomains: process.env.AAASTREAMER_AUTH_DOMAINS || '',
    lastActionAt: '',
    lastActionStatus: 'not configured',
    lastActionMessage: ''
  };
}

function licenseReissueCounts(license = {}) {
  const now = Date.now();
  const reissues = Array.isArray(license.reissues) ? license.reissues : [];
  const since = {
    monthly: now - 31 * 24 * 60 * 60 * 1000,
    quarterly: now - 93 * 24 * 60 * 60 * 1000,
    yearly: now - 366 * 24 * 60 * 60 * 1000
  };
  return Object.fromEntries(Object.entries(since).map(([key, cutoff]) => [key, reissues.filter((item) => Date.parse(item.createdAt || '') >= cutoff).length]));
}

function canReissueLicense(license = {}) {
  const limits = { monthly: 2, quarterly: 4, yearly: 8, ...(license.reissueLimits || {}) };
  const counts = licenseReissueCounts(license);
  return Object.keys(limits).every((key) => counts[key] < Number(limits[key] || 0));
}

function defaultSocialSettings() {
  return {
    mastodonEnabled: Boolean(mastodonAccessToken),
    mastodonInstanceUrl: process.env.AAASTREAMER_MASTODON_INSTANCE_URL || 'https://md.tappedin.fm',
    mastodonAccountLabel: process.env.AAASTREAMER_MASTODON_ACCOUNT_LABEL || 'TappedIn',
    defaultShareText: 'Watch this stream on AAAStreamer.'
  };
}

async function createDnsRecord(settings, { name, type, content, proxied = false }) {
  if (settings.provider !== 'cloudflare') throw new Error('DNS provider is not configured for Cloudflare.');
  if (!settings.zoneId || !dnsApiToken) throw new Error('Cloudflare zone ID and API token are required.');
  const recordType = ['A', 'AAAA', 'CNAME'].includes(String(type || '').toUpperCase()) ? String(type).toUpperCase() : 'CNAME';
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(settings.zoneId)}/dns_records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${dnsApiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: recordType,
      name: String(name || '').trim(),
      content: String(content || '').trim(),
      proxied: Boolean(proxied)
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.map((error) => error.message).join('; ') || `Cloudflare DNS request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload.result;
}

async function postMastodonStatus(settings, status) {
  if (!settings.mastodonEnabled || !mastodonAccessToken) throw new Error('Mastodon sharing is not configured.');
  const base = String(settings.mastodonInstanceUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new Error('Mastodon instance URL is invalid.');
  const response = await fetch(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mastodonAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status, visibility: 'public' })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Mastodon returned HTTP ${response.status}.`);
  }
  return payload;
}

function defaultStreamMediaBehavior() {
  return {
    autoEnableUploads: true,
    autoQueueUploads: true,
    autoRefreshMedia: true,
    uploadEnableDelaySeconds: 0,
    playbackMode: 'loop',
    continuousPlayback: true,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    crossfadeSeconds: 0
  };
}

function normalizeStreamMediaBehavior(settings = {}) {
  const defaults = defaultStreamMediaBehavior();
  const playbackMode = ['loop', 'sequential', 'random', 'disabled'].includes(settings.playbackMode)
    ? settings.playbackMode
    : defaults.playbackMode;
  return {
    ...defaults,
    ...settings,
    playbackMode,
    autoEnableUploads: settings.autoEnableUploads !== false,
    autoQueueUploads: settings.autoQueueUploads !== false,
    autoRefreshMedia: settings.autoRefreshMedia !== false,
    uploadEnableDelaySeconds: clampNumber(settings.uploadEnableDelaySeconds, 0, 86400, 0),
    continuousPlayback: settings.continuousPlayback !== false,
    fadeInSeconds: clampNumber(settings.fadeInSeconds, 0, 30, 0),
    fadeOutSeconds: clampNumber(settings.fadeOutSeconds, 0, 30, 0),
    crossfadeSeconds: clampNumber(settings.crossfadeSeconds, 0, 30, 0)
  };
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return user;
  user.whmcsClientId = String(user.whmcsClientId || '').replace(/[^0-9]/g, '').slice(0, 20);
  user.whmcsPortalEmail = String(user.whmcsPortalEmail || '').trim().slice(0, 180);
  user.recoveryEmail = String(user.recoveryEmail || user.whmcsPortalEmail || '').trim().slice(0, 180);
  user.recoveryHint = String(user.recoveryHint || '').trim().slice(0, 240);
  user.recoveryEnabled = user.recoveryEnabled === true;
  user.notificationEmail = String(user.notificationEmail || user.recoveryEmail || user.whmcsPortalEmail || '').trim().slice(0, 180);
  user.notificationEmailReminder = {
    enabled: user.notificationEmailReminder?.enabled !== false,
    everyLogins: clampNumber(user.notificationEmailReminder?.everyLogins, 1, 30, 3),
    everyDays: clampNumber(user.notificationEmailReminder?.everyDays, 1, 180, 14),
    loginCount: clampNumber(user.notificationEmailReminder?.loginCount, 0, 1000000, 0),
    lastShownAt: user.notificationEmailReminder?.lastShownAt || ''
  };
  user.confirmationPreferences = {
    enabled: user.confirmationPreferences?.enabled !== false,
    countdownSeconds: clampNumber(user.confirmationPreferences?.countdownSeconds, 0, 30, 5),
    confirmAdding: user.confirmationPreferences?.confirmAdding !== false,
    confirmRemoving: user.confirmationPreferences?.confirmRemoving !== false,
    confirmGoingLive: user.confirmationPreferences?.confirmGoingLive !== false,
    confirmDisabling: user.confirmationPreferences?.confirmDisabling !== false
  };
  user.totpEnabled = user.totpEnabled === true;
  user.passkeys = Array.isArray(user.passkeys) ? user.passkeys : [];
  return user;
}

function userById(store, userId) {
  return store.users.find((user) => user.id === userId) || null;
}

function userByLogin(store, login) {
  const value = String(login || '').trim().toLowerCase();
  if (!value) return null;
  return store.users.find((user) =>
    user.username.toLowerCase() === value ||
    String(user.recoveryEmail || '').toLowerCase() === value ||
    String(user.whmcsPortalEmail || '').toLowerCase() === value
  ) || null;
}

function recoveryCodeMatches(user, code) {
  return Boolean(user?.recoveryEnabled && user?.recoveryCodeHash && verifyPassword(code || '', user.recoveryCodeHash));
}

function defaultScheduledShow() {
  return {
    title: '',
    description: '',
    streamId: '',
    ownerId: '',
    mode: 'live',
    sourceId: '',
    accessLevel: 'public',
    priceCents: 0,
    currency: 'usd',
    status: 'scheduled',
    enabled: true,
    startedByScheduler: false
  };
}

function normalizeScheduledShow(show) {
  if (!show || typeof show !== 'object') return null;
  const defaults = defaultScheduledShow();
  const mode = ['live', 'media'].includes(show.mode) ? show.mode : defaults.mode;
  const accessLevel = ['public', 'members', 'paid'].includes(show.accessLevel) ? show.accessLevel : defaults.accessLevel;
  const status = ['scheduled', 'live', 'ended', 'cancelled'].includes(show.status) ? show.status : defaults.status;
  return {
    ...defaults,
    ...show,
    id: show.id || id('sch'),
    title: String(show.title || 'Scheduled show').trim().slice(0, 160) || 'Scheduled show',
    description: String(show.description || '').trim().slice(0, 1500),
    mode,
    accessLevel,
    priceCents: clampNumber(show.priceCents, 0, 10000000, 0),
    currency: String(show.currency || 'usd').trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 3) || 'usd',
    status,
    enabled: show.enabled !== false,
    createdAt: show.createdAt || nowIso(),
    updatedAt: show.updatedAt || show.createdAt || nowIso()
  };
}

const accountRoles = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'creator', label: 'Creator' },
  { value: 'broadcaster', label: 'Broadcaster' },
  { value: 'producer', label: 'Producer' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'manager', label: 'Manager' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'user', label: 'Standard user' },
  { value: 'admin', label: 'Administrator' }
];

function normalizeRole(value, fallback = 'user') {
  return accountRoles.some((role) => role.value === value) ? value : fallback;
}

function roleOptions(selected, includeAdmin = false) {
  return accountRoles
    .filter((role) => includeAdmin || role.value !== 'admin')
    .map((role) => `<option value="${escapeHtml(role.value)}" ${role.value === selected ? 'selected' : ''}>${escapeHtml(role.label)}</option>`)
    .join('');
}

function defaultSupportSettings() {
  return {
    enabled: false,
    showOnWatchPage: false,
    placement: 'after',
    title: 'Support this stream',
    description: '',
    embedHtml: '',
    platformShareEnabled: true,
    platformSharePercent: 15,
    platformPaymentTitle: 'Support AAAStreamer hosting',
    platformPaymentDescription: 'A 15% platform support share helps cover hosting, storage, domains, bandwidth, and support.',
    platformPaymentEmbedHtml: '',
    paypalUrl: '',
    stripeUrl: '',
    cashAppUrl: '',
    applePayUrl: '',
    stripeConnectAccountId: '',
    whmcsClientId: '',
    paymentNotes: ''
  };
}

function defaultExtraContentSettings() {
  return {
    enabled: false,
    showOnWatchPage: false,
    title: 'Additional content',
    description: '',
    embedHtml: ''
  };
}

function defaultMediaSettings() {
  const envFolders = String(process.env.AAASTREAMER_MEDIA_FOLDERS || '')
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
  const folderSpecs = envFolders.length ? envFolders : [
    'Audio described content|/mnt/backup/home/dom/media/AudioDescribedContent|enabled|visible|audio|video',
    'Audio described movies|/mnt/backup/home/dom/media/AudioDescribedContent/Movies|enabled|visible|audio|video',
    'Audio described TV|/mnt/backup/home/dom/media/AudioDescribedContent/TV|enabled|visible|audio|video',
    'Audio described misc|/mnt/backup/home/dom/media/AudioDescribedContent/Misc|enabled|visible|audio|video',
    'Dom podcasts|/mnt/backup/home/dom/media/podcasts|enabled|visible|audio|no-video',
    'Hosted account media|/mnt/backup/home/*/media|enabled|hidden|audio|video',
    'Backup media|/mnt/backup/media|enabled|visible|audio|video',
    'Audio description|/mnt/backup/audio-description|enabled|visible|audio|video',
    'Music|/mnt/backup/music|enabled|visible|audio|video',
    'Mounted media|/mnt/*/media|enabled|visible|audio|video',
    'Mounted audio description|/mnt/*/audio-description|enabled|visible|audio|video',
    'Mounted music|/mnt/*/music|enabled|visible|audio|video',
    'Website audio uploads|/home/dom/*html/uploads/website*/Audio|enabled|visible|audio|no-video',
    'Website gallery videos|/home/dom/*html/uploads/website*/galleries|enabled|visible|no-audio|video',
    'Devine Creations website audio|/home/devinecr/devinecreations.net/uploads/website_specific/audio|enabled|visible|audio|no-video',
    'Devine Creations galleries|/home/devinecr/devinecreations.net/uploads/galleries|enabled|visible|no-audio|video',
    'VoiceLink uploaded media|/home/devinecr/apps/voicelink-local/data/media|enabled|visible|audio|video',
    'Thrive Messenger videos|/home/devinecr/apps/ThriveMessenger/assets/videos|enabled|visible|no-audio|video',
    'Backup root|/mnt/backup|enabled|hidden|audio|video'
  ];
  const folders = folderSpecs.map((spec, index) => {
    const parts = String(spec).split('|').map((item) => item.trim());
    const hasRichSpec = parts.length > 1;
    const label = hasRichSpec ? parts[0] : path.basename(spec) || spec;
    const folderPath = hasRichSpec ? parts[1] : spec;
    return {
      id: slugify(`${index + 1}-${folderPath}`),
      label,
      path: folderPath,
      enabled: parts[2] !== 'disabled',
      visibleToUsers: hasRichSpec ? parts[3] !== 'hidden' : index < 3,
      allowAudio: parts[4] !== 'no-audio',
      allowVideo: parts[5] !== 'no-video'
    };
  }).filter((folder) => folder.path);
  return {
    enabled: true,
    maxScanDepth: 4,
    uploadFolder: process.env.AAASTREAMER_UPLOAD_FOLDER || path.join(dataDir, 'uploads'),
    uploadsVisibleToUsers: true,
    folders,
    urlRelayEnabled: true,
    allowUsersToSelectServerMedia: true,
    allowUsersToAddRelayUrls: true
  };
}

function normalizeStore(store) {
  store.users ||= [];
  store.streams ||= [];
  store.comments ||= [];
  store.events ||= [];
  store.payments ||= [];
  store.sessions ||= [];
  store.pendingLogins ||= [];
  store.passkeyChallenges ||= [];
  store.scheduledShows ||= [];
  store.shareLinks ||= [];
  store.settings ||= {};
  store.settings.siteName ||= process.env.AAASTREAMER_SITE_NAME || 'AAAStreamer';
  if (!store.settings.platformBranding) {
    store.settings.platformBranding = { ...defaultPlatformBranding(), platformName: store.settings.siteName };
  } else {
    store.settings.platformBranding = { ...defaultPlatformBranding(), ...store.settings.platformBranding };
  }
  store.settings.paymentIntegration = { ...defaultPaymentIntegrationSettings(), ...(store.settings.paymentIntegration || {}) };
  store.settings.license = { ...defaultLicenseSettings(), ...(store.settings.license || {}) };
  store.settings.license.reissueLimits = { ...defaultLicenseSettings().reissueLimits, ...(store.settings.license.reissueLimits || {}) };
  store.settings.license.reissues = Array.isArray(store.settings.license.reissues) ? store.settings.license.reissues : [];
  store.settings.dns = { ...defaultDnsSettings(), ...(store.settings.dns || {}) };
  store.settings.social = { ...defaultSocialSettings(), ...(store.settings.social || {}) };
  store.settings.siteName = store.settings.platformBranding.platformName || store.settings.siteName;
  store.settings.visitorCommentsEnabled ??= true;
  store.settings.messaging = normalizeMessagingSettings(store.settings.messaging || {});
  store.settings.commentAccessRules = Array.isArray(store.settings.commentAccessRules)
    ? store.settings.commentAccessRules.map(normalizeCommentAccessRule).filter(Boolean).slice(-500)
    : [];
  store.settings.supportDefaults = { ...defaultSupportSettings(), ...(store.settings.supportDefaults || {}) };
  store.settings.mediaLibrary = normalizeMediaSettings(store.settings.mediaLibrary);
  store.settings.registrationsEnabled ??= process.env.AAASTREAMER_REGISTRATION_ENABLED === 'true';
  store.settings.registrationDefaultRole = normalizeRole(store.settings.registrationDefaultRole || 'user');
  store.settings.encoderDefaults = { ...defaultEncoderSettings(), ...(store.settings.encoderDefaults || {}) };
  store.settings.updateManifestUrl ||= updateManifestUrl;
  store.settings.maintenanceMode ||= { enabled: false, message: '' };
  store.users = (store.users || []).map(normalizeUser).filter(Boolean);
  store.scheduledShows = (store.scheduledShows || []).map(normalizeScheduledShow).filter(Boolean);
  store.shareLinks = (store.shareLinks || []).filter((link) => link?.token && link?.streamId);
  const now = Date.now();
  store.pendingLogins = (store.pendingLogins || []).filter((item) => item?.token && Date.parse(item.expiresAt || '') > now);
  store.passkeyChallenges = (store.passkeyChallenges || []).filter((item) => item?.challenge && Date.parse(item.expiresAt || '') > now);
  for (const stream of store.streams) normalizeStream(stream);
  pruneComments(store);
  return store;
}

function normalizeStream(stream) {
  stream.encoderKeys ||= [];
  stream.destinations ||= [];
  stream.links ||= [];
  stream.backgroundImage ||= '';
  stream.encoderSettings = { ...defaultEncoderSettings(), ...(stream.encoderSettings || {}) };
  stream.latencySettings = { ...defaultLatencySettings(), ...(stream.latencySettings || {}) };
  stream.support = { ...defaultSupportSettings(), ...(stream.support || {}) };
  stream.extraContent = { ...defaultExtraContentSettings(), ...(stream.extraContent || {}) };
  stream.mediaBehavior = normalizeStreamMediaBehavior(stream.mediaBehavior);
  stream.onDemand = {
    enabled: false,
    showWhenOffline: false,
    title: '',
    ...(stream.onDemand || {})
  };
  stream.sourceMode ||= 'rtmp';
  stream.currentSource = normalizeStreamSource(stream.currentSource);
  stream.relaySources = (stream.relaySources || []).map(normalizeStreamSource).filter(Boolean);
  stream.sourceQueue = (stream.sourceQueue || []).map(normalizeStreamSource).filter(Boolean);
  stream.activeEncoders ||= {};
  return stream;
}

function normalizeMediaSettings(settings = {}) {
  const defaults = defaultMediaSettings();
  const configuredFolders = Array.isArray(settings.folders) && settings.folders.length ? settings.folders : [];
  const configuredKeys = new Set(configuredFolders.map((folder) => String(folder.path || '').trim()).filter(Boolean));
  const defaultFoldersToAdd = defaults.folders.filter((folder) => !configuredKeys.has(folder.path));
  const folders = configuredFolders.length ? [...configuredFolders, ...defaultFoldersToAdd] : defaults.folders;
  const uploadFolder = String(settings.uploadFolder || defaults.uploadFolder).trim();
  const normalizedFolders = folders.flatMap((folder, index) => {
    const expandedPaths = expandMediaFolderPath(String(folder.path || '').trim());
    return expandedPaths.map((folderPath, expandedIndex) => ({
      id: slugify(folder.id && expandedPaths.length === 1 ? folder.id : `${index + 1}-${expandedIndex + 1}-${folderPath}`),
      label: String(folder.label && expandedPaths.length === 1 ? folder.label : path.basename(folderPath || '') || `Media folder ${index + 1}`).trim().slice(0, 120),
      path: folderPath,
      enabled: folder.enabled !== false,
      visibleToUsers: folder.visibleToUsers !== false,
      allowAudio: folder.allowAudio !== false,
      allowVideo: folder.allowVideo !== false
    }));
  }).filter((folder) => folder.path);
  if (uploadFolder && !normalizedFolders.some((folder) => path.resolve(folder.path) === path.resolve(uploadFolder))) {
    normalizedFolders.unshift({
      id: 'uploads',
      label: 'Uploaded media',
      path: uploadFolder,
      enabled: true,
      visibleToUsers: settings.uploadsVisibleToUsers !== false,
      allowAudio: true,
      allowVideo: true
    });
  }
  return {
    ...defaults,
    ...settings,
    uploadFolder,
    uploadsVisibleToUsers: settings.uploadsVisibleToUsers !== false,
    folders: normalizedFolders
  };
}

function normalizeStreamSource(source) {
  if (!source || typeof source !== 'object') return null;
  const type = ['localMedia', 'urlRelay'].includes(source.type) ? source.type : null;
  if (!type) return null;
  return {
    id: source.id || id('src'),
    type,
    label: String(source.label || source.title || source.url || source.relativePath || 'Media source').trim().slice(0, 160),
    mediaType: ['audio', 'video'].includes(source.mediaType) ? source.mediaType : 'video',
    folderId: source.folderId || '',
    relativePath: source.relativePath || '',
    url: source.url || '',
    enabled: source.enabled !== false,
    enableAt: source.enableAt || '',
    autoEnabled: source.autoEnabled === true,
    createdAt: source.createdAt || nowIso()
  };
}

function expandMediaFolderPath(pattern) {
  if (!pattern) return [];
  if (!pattern.includes('*')) return [pattern];
  const parts = path.resolve(pattern).split(path.sep);
  const roots = [parts[0] || path.sep];
  const matches = parts.slice(1).reduce((current, part) => {
    const next = [];
    const regex = part.includes('*')
      ? new RegExp(`^${part.split('*').map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
      : null;
    for (const base of current) {
      let entries = [];
      try {
        entries = fs.readdirSync(base, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (regex && !regex.test(entry.name)) continue;
        if (!regex && entry.name !== part) continue;
        const candidate = path.join(base, entry.name);
        try {
          if (entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(candidate).isDirectory())) {
            next.push(candidate);
          }
        } catch {
          continue;
        }
      }
    }
    return next;
  }, roots);
  return matches.filter((item) => {
    try {
      return fs.statSync(item).isDirectory();
    } catch {
      return false;
    }
  }).slice(0, 80);
}

function defaultLatencySettings() {
  return {
    mode: 'low',
    targetLatencySeconds: 6,
    playerBufferSeconds: 10,
    reconnectBufferSeconds: 10
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function bootstrapAdmin() {
  const adminUser = process.env.AAASTREAMER_ADMIN_USER;
  const adminPassword = process.env.AAASTREAMER_ADMIN_PASSWORD;
  if (!adminUser || !adminPassword) return;

  const store = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (store.users.some((user) => user.role === 'admin')) return;
  const createdAt = nowIso();
  store.users.push({
    id: id('usr'),
    username: adminUser,
    displayName: adminUser,
    role: 'admin',
    passwordHash: hashPassword(adminPassword),
    streamKey: id('sk'),
    active: true,
    createdAt,
    updatedAt: createdAt
  });
  store.events.push({ id: id('evt'), type: 'admin_bootstrap', payload: { username: adminUser }, createdAt });
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function appendEvent(type, payload) {
  const store = readStore();
  store.events.push({ id: id('evt'), type, payload, createdAt: nowIso() });
  store.events = store.events.slice(-1000);
  writeStore(store);
  broadcast({ type, payload });
}

function broadcast(message) {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

function parseCookies(req) {
  const raw = req.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map((part) => {
    const [name, ...rest] = part.trim().split('=');
    return [name, decodeURIComponent(rest.join('=') || '')];
  }).filter(([name]) => name));
}

function currentUser(req) {
  const token = parseCookies(req)[sessionCookieName];
  if (!token) return null;
  const store = readStore();
  const session = store.sessions.find((item) => item.token === token && new Date(item.expiresAt) > new Date());
  if (!session) return null;
  return store.users.find((user) => user.id === session.userId && user.active) || null;
}

function notificationEmailReminder(user) {
  if (!user || user.notificationEmail || user.notificationEmailReminder?.enabled === false) return '';
  const reminder = user.notificationEmailReminder || {};
  const loginDue = Number(reminder.loginCount || 0) > 0 && Number(reminder.loginCount || 0) % Number(reminder.everyLogins || 3) === 0;
  const last = Date.parse(reminder.lastShownAt || '');
  const dayDue = !Number.isFinite(last) || Date.now() - last > Number(reminder.everyDays || 14) * 24 * 60 * 60 * 1000;
  if (!loginDue && !dayDue) return '';
  return `<section class="notice" role="status"><h2>Notification email reminder</h2><p>Add a notification email so AAAStreamer can contact you about account recovery, scheduled shows, stream events, and payment or moderation notices.</p><p><a class="button" href="/dashboard?tab=account">Set notification email</a></p></section>`;
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Login required' });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  req.user = user;
  next();
}

function requireModeratorOrAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || !['admin', 'moderator'].includes(user.role)) {
    res.status(403).json({ success: false, error: 'Moderator access required' });
    return;
  }
  req.user = user;
  next();
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function normalizedPayload(req) {
  return { ...req.query, ...(req.body || {}) };
}

function hasValidSecret(req) {
  if (!requireSecret) return true;
  if (!sharedSecret || sharedSecret === 'replace-me') return false;
  const provided = req.get('x-voicelink-secret') || req.query.secret || req.body?.secret || '';
  return provided === sharedSecret;
}

function denyUnauthorized(req, res) {
  appendEvent('unauthorized', {
    path: req.path,
    app: req.body?.app || req.query.app || null,
    name: req.body?.name || req.query.name || null
  });
  res.status(403).json({ success: false, allowed: false, error: 'Forbidden' });
}

function streamIdentifier(payload) {
  return String(payload.streamId || payload.name || payload.streamKey || `stream_${Date.now()}`);
}

function streamByKey(store, key) {
  return store.streams.find((stream) => (
    stream.streamKey === key ||
    stream.id === key ||
    stream.slug === key ||
    stream.encoderKeys?.some((encoder) => encoder.key === key && encoder.active !== false)
  ));
}

function encoderForKey(stream, key) {
  if (!stream) return null;
  if (stream.streamKey === key) {
    return {
      id: 'primary',
      name: 'Primary encoder',
      key: stream.streamKey,
      audioBitrate: stream.encoderSettings?.audioBitrate || defaultEncoderSettings().audioBitrate,
      active: true
    };
  }
  return stream.encoderKeys?.find((encoder) => encoder.key === key && encoder.active !== false) || null;
}

function hlsUrlFor(streamId) {
  const local = `/hls/live/${encodeURIComponent(streamId)}/index.m3u8`;
  if (!hlsBaseUrl) return local;
  return `${hlsBaseUrl}${local}`;
}

function rtmpUrlFor(streamKey) {
  return `rtmp://${rtmpHost}:1935/${rtmpAppName}`;
}

function rtmpPublishUrlFor(streamKey) {
  return `${rtmpUrlFor(streamKey)}/${encodeURIComponent(streamKey)}`;
}

function watchUrlFor(stream) {
  return `${publicUrl || ''}/s/${stream.slug}`;
}

function tokenUrlFor(token) {
  return `${publicUrl || ''}/go/${encodeURIComponent(token)}`;
}

function ensureShareLink(store, stream, createdBy = '') {
  store.shareLinks ||= [];
  let link = store.shareLinks.find((item) => item.streamId === stream.id && item.purpose === 'stream');
  if (!link) {
    link = {
      id: id('shr'),
      token: id('go'),
      streamId: stream.id,
      purpose: 'stream',
      createdBy,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.shareLinks.push(link);
  }
  return link;
}

function isLive(stream) {
  return stream?.status === 'live' && Object.values(stream.activeEncoders || {}).some((encoder) => encoder.status === 'live');
}

function streamSources(stream) {
  return [
    stream?.currentSource,
    ...(stream?.sourceQueue || []),
    ...(stream?.relaySources || [])
  ].filter(Boolean);
}

function firstPlayableSource(stream, store) {
  return streamSources(stream).find((source) => playableSourceUrl(source, store)) || null;
}

function streamHasOnDemand(stream, store) {
  if (!stream?.onDemand?.enabled && !stream?.onDemand?.showWhenOffline) return false;
  return Boolean(firstPlayableSource(stream, store));
}

function shouldRunContinuousOnDemandRelay(stream, store) {
  if (!streamHasOnDemand(stream, store)) return false;
  const behavior = normalizeStreamMediaBehavior(stream.mediaBehavior);
  return behavior.continuousPlayback !== false && behavior.playbackMode !== 'disabled';
}

function streamIsPubliclyListable(stream, store) {
  return stream.visibility === 'public' && (isLive(stream) || streamHasOnDemand(stream, store));
}

function streamPlaybackUrl(stream, store) {
  if (isLive(stream)) return stream.hlsUrl || hlsUrlFor(stream.activeEncoderKey || stream.streamKey);
  if (shouldRunContinuousOnDemandRelay(stream, store)) {
    return hlsUrlFor(stream.streamKey);
  }
  if (streamHasOnDemand(stream, store)) return playableSourceUrl(firstPlayableSource(stream, store), store);
  return '';
}

function publicStreamSummary(stream, store, includePrivate = false) {
  const playbackUrl = streamPlaybackUrl(stream, store);
  const continuousOnDemandRelay = shouldRunContinuousOnDemandRelay(stream, store);
  const safe = {
    id: stream.id,
    ownerId: stream.ownerId,
    title: stream.title,
    slug: stream.slug,
    description: stream.description,
    status: stream.status,
    visibility: stream.visibility,
    allowComments: stream.allowComments,
    sourceMode: stream.sourceMode,
    onDemand: stream.onDemand,
    hasLivePlayback: isLive(stream),
    hasOnDemandPlayback: streamHasOnDemand(stream, store),
    continuousOnDemandRelay,
    relayRunning: sourceProcesses.has(stream.id),
    watchUrl: watchUrlFor(stream),
    playbackUrl: playbackUrl || null,
    hlsUrl: isLive(stream) || continuousOnDemandRelay ? (stream.hlsUrl || hlsUrlFor(stream.activeEncoderKey || stream.streamKey)) : null,
    updatedAt: stream.updatedAt,
    createdAt: stream.createdAt
  };
  if (includePrivate) {
    safe.streamKey = stream.streamKey;
    safe.rtmpUrl = stream.rtmpUrl;
    safe.encoderKeys = stream.encoderKeys;
    safe.destinations = stream.destinations;
    safe.currentSource = stream.currentSource;
    safe.relaySources = stream.relaySources;
    safe.sourceQueue = stream.sourceQueue;
  }
  safe.sourceQueueCount = stream.sourceQueue?.length || 0;
  return safe;
}

function mediaTypeFor(filePath) {
  return mediaExtensions.get(path.extname(filePath).toLowerCase()) || null;
}

function ffprobePath() {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

function probeMediaFile(filePath) {
  try {
    const output = childProcess.execFileSync(ffprobePath(), [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_chapters',
      filePath
    ], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
    const parsed = JSON.parse(output);
    const tags = parsed.format?.tags || {};
    return {
      title: tags.title || tags.TITLE || path.basename(filePath).replace(/\.[^.]+$/, ''),
      artist: tags.artist || tags.ARTIST || tags.album_artist || '',
      album: tags.album || tags.ALBUM || '',
      durationSeconds: Number(parsed.format?.duration || 0) || 0,
      chapters: (parsed.chapters || []).slice(0, 40).map((chapter, index) => ({
        index,
        title: chapter.tags?.title || chapter.tags?.TITLE || `Chapter ${index + 1}`,
        startSeconds: Number(chapter.start_time || 0) || 0,
        endSeconds: Number(chapter.end_time || 0) || 0
      }))
    };
  } catch {
    return null;
  }
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function resolveMediaFolder(store, folderId) {
  const settings = store.settings.mediaLibrary || defaultMediaSettings();
  return settings.folders.find((folder) => folder.id === folderId && folder.enabled);
}

function safeMediaPath(folder, relativePath) {
  if (!folder || !relativePath) return null;
  const root = path.resolve(folder.path);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

function localMediaUrlFor(source) {
  if (!source?.folderId || !source?.relativePath) return '';
  return `/media/${encodeURIComponent(source.folderId)}/${source.relativePath.split(/[\\/]+/).map(encodeURIComponent).join('/')}`;
}

function playableSourceUrl(source, store) {
  if (!source?.enabled) return '';
  if (source.enableAt && new Date(source.enableAt).getTime() > Date.now()) return '';
  if (source.type === 'urlRelay') return /^https?:\/\//i.test(source.url) ? source.url : '';
  if (source.type === 'localMedia') {
    const settings = store.settings.mediaLibrary || defaultMediaSettings();
    if (!settings.enabled) return '';
    const folder = resolveMediaFolder(store, source.folderId);
    const target = safeMediaPath(folder, source.relativePath);
    if (!target || !fs.existsSync(target) || !mediaTypeFor(target)) return '';
    return localMediaUrlFor(source);
  }
  return '';
}

function mediaCatalog(store, user = null) {
  const settings = store.settings.mediaLibrary || defaultMediaSettings();
  if (!settings.enabled) return [];
  const isAdmin = user?.role === 'admin';
  const maxDepth = clampNumber(settings.maxScanDepth, 1, 8, 4);
  return settings.folders
    .filter((folder) => folder.enabled && (isAdmin || (settings.allowUsersToSelectServerMedia && folder.visibleToUsers)))
    .map((folder) => ({
      ...folder,
      path: isAdmin ? folder.path : undefined,
      files: scanMediaFolder(folder, maxDepth)
    }));
}

function canServeMediaFile(store, folderId, relativePath, user = null) {
  if (user?.role === 'admin') return true;
  return store.streams.some((stream) => {
    if (!streamIsPubliclyListable(stream, store)) return false;
    return streamSources(stream).some((source) => (
      source.enabled
      && source.type === 'localMedia'
      && source.folderId === folderId
      && source.relativePath === relativePath
      && playableSourceUrl(source, store)
    ));
  });
}

function scanMediaFolder(folder, maxDepth) {
  const root = path.resolve(folder.path);
  if (!fs.existsSync(root)) return [];
  const files = [];
  const walk = (dir, depth) => {
    if (files.length >= 500 || depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      let isFile = entry.isFile();
      if (!isFile && entry.isSymbolicLink()) {
        try {
          isFile = fs.statSync(fullPath).isFile();
        } catch {
          isFile = false;
        }
      }
      if (!isFile) continue;
      const mediaType = mediaTypeFor(fullPath);
      if (!mediaType) continue;
      if (mediaType === 'audio' && !folder.allowAudio) continue;
      if (mediaType === 'video' && !folder.allowVideo) continue;
      const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
      const stat = fs.statSync(fullPath);
      const metadata = probeMediaFile(fullPath);
      files.push({
        folderId: folder.id,
        relativePath,
        label: metadata?.title || relativePath.replace(/\.[^.]+$/, '').replace(/[\\/_.-]+/g, ' '),
        fileName: path.basename(relativePath),
        metadata: metadata || null,
        durationSeconds: metadata?.durationSeconds || 0,
        chapters: metadata?.chapters || [],
        mediaType,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
  };
  walk(root, 0);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function ensureStreamForUser(store, user, body = {}) {
  const existing = store.streams.find((stream) => stream.ownerId === user.id);
  if (existing) return normalizeStream(existing);
  const createdAt = nowIso();
  const title = body.title || `${user.displayName || user.username}'s Stream`;
  const encoderDefaults = store.settings?.encoderDefaults || defaultEncoderSettings();
  const stream = {
    id: id('str'),
    ownerId: user.id,
    title,
    slug: slugify(title),
    description: body.description || '',
    streamKey: user.streamKey || id('sk'),
    status: 'offline',
    visibility: 'public',
    allowComments: true,
    hlsUrl: null,
    rtmpUrl: rtmpUrlFor(user.streamKey),
    encoderSettings: { ...defaultEncoderSettings(), ...encoderDefaults },
    encoderKeys: [],
    destinations: [],
    links: [],
    backgroundImage: '',
    support: { ...store.settings?.supportDefaults },
    extraContent: defaultExtraContentSettings(),
    mediaBehavior: defaultStreamMediaBehavior(),
    onDemand: { enabled: false, showWhenOffline: false, title: '' },
    sourceMode: 'rtmp',
    currentSource: null,
    relaySources: [],
    latencySettings: {
      ...defaultLatencySettings(),
      mode: encoderDefaults.latencyMode || 'low',
      targetLatencySeconds: encoderDefaults.targetLatencySeconds || 6,
      playerBufferSeconds: encoderDefaults.playerBufferSeconds || 10,
      reconnectBufferSeconds: encoderDefaults.reconnectBufferSeconds || 10
    },
    activeEncoders: {},
    createdAt,
    updatedAt: createdAt
  };
  store.streams.push(stream);
  user.streamKey = stream.streamKey;
  return stream;
}

function page(title, body, user = null) {
  const settings = readStore().settings;
  const branding = settings.platformBranding || defaultPlatformBranding();
  const nav = user
    ? `<a href="/dashboard">Dashboard</a><a href="/admin">Admin</a><form method="post" action="/logout"><button type="submit">Log out</button></form>`
    : `<a href="/login">Log in</a>${settings.registrationsEnabled ? '<a href="/signup">Sign up</a>' : ''}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#101316;color:#f3f6f8}
a{color:#9bd3ff} header{display:flex;gap:1rem;align-items:center;justify-content:space-between;padding:1rem 1.25rem;background:#171c22;border-bottom:1px solid #303944}
nav{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap} main{max-width:1100px;margin:0 auto;padding:1.25rem}
section,.panel{border:1px solid #303944;background:#171c22;padding:1rem;margin:1rem 0;border-radius:6px}
label{display:block;margin:.75rem 0 .25rem} input,textarea,select{width:100%;box-sizing:border-box;padding:.65rem;background:#0c0f12;color:#f3f6f8;border:1px solid #4b5968;border-radius:4px}
input[type="checkbox"]{width:auto;margin-right:.45rem}.tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}.tabs a{padding:.55rem .75rem;border:1px solid #4b5968;border-radius:4px;text-decoration:none}.tabs a[aria-current="page"]{background:#2c75c9;color:white}
button,.button{display:inline-block;margin:.35rem .35rem .35rem 0;padding:.65rem .85rem;background:#2c75c9;color:white;border:0;border-radius:4px;text-decoration:none;cursor:pointer}
button.secondary,.button.secondary{background:#3d4651} button.danger{background:#b84242}
table{width:100%;border-collapse:collapse;margin-top:.75rem} th,td{border-bottom:1px solid #303944;text-align:left;padding:.6rem;vertical-align:top}
video{width:100%;max-height:65vh;background:black}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.muted{color:#b8c1ca}.status-live{color:#7dff9b}.status-offline,.status-ended{color:#ffbd7d}
.comments{max-height:22rem;overflow:auto;border:1px solid #303944;padding:.75rem;background:#0c0f12}.comment{border-bottom:1px solid #28303a;padding:.45rem 0}
.reaction-list{display:flex;gap:.4rem;flex-wrap:wrap;margin:.35rem 0}.reaction-list button{padding:.3rem .45rem;background:#26313d}.message-meta{font-size:.92rem;color:#b8c1ca}.support-box iframe,.extra-content-box iframe,.embed-content iframe{max-width:100%;border:0}.support-box form{margin:.5rem 0}.extra-content-box summary{cursor:pointer;font-weight:bold}
.field-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem;align-items:end;margin:.75rem 0}.field-row label{margin:0}.inline-form{display:inline}.notice{margin:.75rem 0;color:#d7ecff}.link-list{padding-left:1.25rem}.public-hero{background-size:cover;background-position:center;border-radius:6px;padding:1rem;border:1px solid #303944}
.subsection{background:#121820}.preset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.75rem}.preset-card{border:1px solid #3a4654;border-radius:6px;padding:.85rem;background:#0c0f12}.preset-card h3{margin-top:0}
</style>
</head>
<body><header><div><strong>${escapeHtml(branding.platformName || settings.siteName || 'AAAStreamer')}</strong>${branding.tagline ? `<div class="muted">${escapeHtml(branding.tagline)}</div>` : ''}</div><nav>${nav}<a href="/">Visitor page</a></nav></header><main>${body}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function isSafeUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function safeUrl(value) {
  const url = String(value || '').trim().slice(0, 800);
  return isSafeUrl(url) ? url : '';
}

function centsFromAmount(value, fallback = 500) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(50, Math.round(numeric * 100));
}

function formatMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'usd').toUpperCase() }).format(Number(cents || 0) / 100);
}

function paymentIntegrationReady(settings) {
  return {
    stripe: Boolean(settings?.stripeEnabled && stripeSecretKey),
    stripeWebhook: Boolean(stripeWebhookSecret),
    whmcs: Boolean(settings?.whmcsEnabled && settings?.whmcsUrl && whmcsApiIdentifier && whmcsApiSecret)
  };
}

async function postForm(url, data, headers = {}) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') body.append(key, String(value));
  });
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return json || { raw: text };
}

async function callWhmcsApi(settings, action, params = {}) {
  const base = String(settings.whmcsUrl || '').replace(/\/+$/, '');
  if (!base || !whmcsApiIdentifier || !whmcsApiSecret) {
    throw new Error('WHMCS API is not configured.');
  }
  const payload = {
    action,
    identifier: whmcsApiIdentifier,
    secret: whmcsApiSecret,
    responsetype: 'json',
    ...params
  };
  if (whmcsApiAccessKey) payload.accesskey = whmcsApiAccessKey;
  const result = await postForm(`${base}/includes/api.php`, payload);
  if (String(result.result || '').toLowerCase() !== 'success') {
    throw new Error(result.message || `WHMCS ${action} failed.`);
  }
  return result;
}

async function lookupWhmcsClient(settings, { clientId = '', email = '' } = {}) {
  if (!settings?.whmcsEnabled || !settings?.whmcsUrl || !whmcsApiIdentifier || !whmcsApiSecret) return null;
  const cleanedId = String(clientId || '').replace(/[^0-9]/g, '').slice(0, 20);
  const cleanedEmail = String(email || '').trim().slice(0, 180);
  try {
    if (cleanedId) {
      const result = await callWhmcsApi(settings, 'GetClientsDetails', { clientid: cleanedId, stats: false });
      return { clientId: String(result.userid || result.client_id || cleanedId), email: String(result.email || cleanedEmail || '') };
    }
    if (cleanedEmail) {
      const result = await callWhmcsApi(settings, 'GetClients', { search: cleanedEmail });
      const clients = result?.clients?.client || [];
      const client = clients.find((item) => String(item.email || '').toLowerCase() === cleanedEmail.toLowerCase()) || clients[0];
      if (client) return { clientId: String(client.id || client.userid || ''), email: String(client.email || cleanedEmail) };
    }
  } catch {
    return null;
  }
  return null;
}

async function detectUrlTitle(url) {
  if (!isSafeUrl(url)) return '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) return '';
    const text = (await response.text()).slice(0, 120000);
    return (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  } catch {
    return '';
  }
}

async function createStripeCheckoutSession({ stream, support, settings, amountCents, description, successUrl, cancelUrl }) {
  if (!stripeSecretKey) throw new Error('Stripe secret key is not configured.');
  const platformSharePercent = clampNumber(support.platformSharePercent, 0, 100, 15);
  const applicationFeeAmount = support.platformShareEnabled && support.stripeConnectAccountId
    ? Math.round(amountCents * platformSharePercent / 100)
    : 0;
  const data = {
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': settings.currency || 'usd',
    'line_items[0][price_data][unit_amount]': amountCents,
    'line_items[0][price_data][product_data][name]': support.title || `Support ${stream.title}`,
    'line_items[0][price_data][product_data][description]': description,
    'metadata[aaastreamer_stream_id]': stream.id,
    'metadata[aaastreamer_stream_slug]': stream.slug,
    'metadata[aaastreamer_platform_share_percent]': support.platformShareEnabled ? platformSharePercent : 0
  };
  if (support.stripeConnectAccountId) {
    data['payment_intent_data[transfer_data][destination]'] = support.stripeConnectAccountId;
    if (applicationFeeAmount > 0) {
      data['payment_intent_data[application_fee_amount]'] = applicationFeeAmount;
    }
  }
  const result = await postForm('https://api.stripe.com/v1/checkout/sessions', data, {
    Authorization: `Bearer ${stripeSecretKey}`,
    'Stripe-Version': '2026-02-25.clover'
  });
  if (!result.url || !result.id) throw new Error('Stripe did not return a checkout URL.');
  return { session: result, platformFeeCents: applicationFeeAmount };
}

function verifyStripeSignature(req) {
  if (!stripeWebhookSecret) return false;
  const header = req.get('stripe-signature') || '';
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.split('=');
    return [key, value];
  }));
  if (!parts.t || !parts.v1 || !req.rawBody) return false;
  const signedPayload = `${parts.t}.${req.rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', stripeWebhookSecret).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

function parseLinks(raw) {
  return String(raw || '').split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const [label, ...urlParts] = trimmed.includes('|') ? trimmed.split('|') : ['', trimmed];
    const url = urlParts.join('|').trim();
    if (!isSafeUrl(url)) return null;
    return { id: id('lnk'), label: (label || url).trim().slice(0, 80), url: url.slice(0, 500) };
  }).filter(Boolean).slice(0, 12);
}

function normalizeLinkEntry(link) {
  if (!link || !isSafeUrl(link.url)) return null;
  return {
    label: String(link.label || link.url).trim().slice(0, 120) || link.url,
    url: String(link.url).trim()
  };
}

function linksText(links) {
  return (links || []).map((link) => `${link.label || link.url}|${link.url}`).join('\n');
}

function renderLinks(links) {
  if (!links?.length) return '<p class="muted">No links have been added yet.</p>';
  return `<ul class="link-list">${links.map((link) => `<li><a href="${escapeHtml(link.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(link.label || link.url)}</a></li>`).join('')}</ul>`;
}

function editableLinks(stream, canEdit = false) {
  if (!stream.links?.length && !canEdit) return '<p class="muted">No links have been added yet.</p>';
  const rows = (stream.links || []).map((link, index) => `<li><a href="${escapeHtml(link.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(link.label || link.url)}</a>${canEdit ? ` <button type="button" data-link-action="up" data-link-index="${index}">Move up</button><button type="button" data-link-action="down" data-link-index="${index}">Move down</button><button type="button" data-link-action="remove" data-link-index="${index}" class="danger">Remove</button>` : ''}</li>`).join('');
  const list = rows ? `<ul class="link-list" id="streamLinksList">${rows}</ul>` : '<p class="muted" id="streamLinksList">No links have been added yet.</p>';
  if (!canEdit) return list;
  return `${list}<form id="quickLinkForm"><label>Link title<input name="label" placeholder="Leave blank to detect the site title"></label><label>URL<input name="url" type="url" required placeholder="https://example.com"></label><label>Place link<select name="placement"><option value="bottom">At bottom</option><option value="top">At top</option></select></label><button type="submit">Add link</button></form><p id="linkActionStatus" class="notice" role="status" aria-live="polite"></p>`;
}

function adminTabs(active) {
  const tabs = [
    ['streams', 'Streams'],
    ['accounts', 'Accounts'],
    ['signups', 'Signups'],
    ['branding', 'Branding'],
    ['messaging', 'Messaging'],
    ['share-links', 'Share links'],
    ['payments', 'Payments'],
    ['install', 'Install and licensing'],
    ['media', 'Media sources'],
    ['encoders', 'Encoder settings'],
    ['updater', 'Updater']
  ];
  return `<nav class="tabs" role="tablist" aria-label="Admin sections">${tabs.map(([idValue, label]) => `<a role="tab" class="tab-button" href="/admin/${idValue}" ${active === idValue ? 'aria-selected="true" aria-current="page"' : 'aria-selected="false"'}>${escapeHtml(label)}</a>`).join('')}</nav>`;
}

function sanitizeSupportEmbed(raw) {
  return String(raw || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .slice(0, 12000);
}

function renderSupportBox(stream, context = 'watch') {
  const support = { ...defaultSupportSettings(), ...(stream.support || {}) };
  if (!support.enabled) return '';
  if (context === 'watch' && !support.showOnWatchPage) return '';
  const store = readStore();
  const paymentSettings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
  const readiness = paymentIntegrationReady(paymentSettings);
  const embed = sanitizeSupportEmbed(support.embedHtml);
  const paymentLinks = [
    ['PayPal', support.paypalUrl],
    ['Stripe', support.stripeUrl],
    ['Cash App', support.cashAppUrl],
    ['Apple Pay', support.applePayUrl]
  ].filter(([, url]) => isSafeUrl(url));
  const paymentLinksHtml = paymentLinks.length
    ? `<ul class="link-list">${paymentLinks.map(([label, url]) => `<li><a href="${escapeHtml(url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a></li>`).join('')}</ul>`
    : '';
  const paymentNotes = support.paymentNotes ? `<p>${escapeHtml(support.paymentNotes)}</p>` : '';
  const platformEmbed = sanitizeSupportEmbed(support.platformPaymentEmbedHtml);
  const platformSharePercent = clampNumber(support.platformSharePercent, 0, 100, 15);
  const creatorPayment = embed || paymentLinksHtml || paymentNotes
    ? `<section class="subsection"><h3>Creator payment method</h3>${paymentNotes}${paymentLinksHtml}${embed ? `<div>${embed}</div>` : ''}</section>`
    : '<p class="muted">Creator payment details are not configured yet.</p>';
  const platformPayment = support.platformShareEnabled
    ? `<section class="subsection"><h3>${escapeHtml(support.platformPaymentTitle || 'Platform support')}</h3><p>${escapeHtml(support.platformPaymentDescription || `A ${platformSharePercent}% platform support share helps cover hosting and service costs.`)}</p><p class="muted">Platform share: ${escapeHtml(platformSharePercent)}%.</p>${platformEmbed ? `<div>${platformEmbed}</div>` : '<p class="muted">Platform payment details are not configured yet.</p>'}</section>`
    : '';
  const integratedPayment = context === 'watch' && (readiness.stripe || readiness.whmcs)
    ? `<form class="integrated-payment" data-support-payment="${escapeHtml(stream.id)}"><h3>Send support payment</h3><label>Amount, ${escapeHtml(String(paymentSettings.currency || 'usd').toUpperCase())}<input name="amount" inputmode="decimal" value="${escapeHtml((Number(paymentSettings.defaultAmountCents || 500) / 100).toFixed(2))}"></label><label>Payment method<select name="provider">${readiness.stripe ? '<option value="stripe">Card, wallet, or Stripe Checkout</option>' : ''}${readiness.whmcs ? '<option value="whmcs">WHMCS invoice or client payment</option>' : ''}</select></label><button type="submit">Continue to payment</button><p class="muted" data-payment-status></p></form>`
    : '';
  return `<section class="support-box"><h2>${escapeHtml(support.title || 'Support this stream')}</h2>${support.description ? `<p>${escapeHtml(support.description)}</p>` : ''}${integratedPayment}${creatorPayment}${platformPayment}</section>`;
}

function renderExtraContentBox(stream, context = 'watch') {
  const extra = { ...defaultExtraContentSettings(), ...(stream.extraContent || {}) };
  if (!extra.enabled) return '';
  if (context === 'watch' && !extra.showOnWatchPage) return '';
  const embed = sanitizeSupportEmbed(extra.embedHtml);
  const title = escapeHtml(extra.title || 'Additional content');
  const description = extra.description ? `<p>${escapeHtml(extra.description)}</p>` : '';
  const content = embed ? `<div class="embed-content">${embed}</div>` : '<p class="muted">No additional embedded content is configured yet.</p>';
  return `<details class="extra-content-box"><summary>${title}</summary>${description}${content}</details>`;
}

function embedCodeFor(stream) {
  const src = `${publicUrl || ''}/embed/${stream.slug}`;
  return `<iframe title="${escapeHtml(stream.title)}" src="${escapeHtml(src)}" width="800" height="450" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
}

function isHlsUrl(url) {
  return /\.m3u8(?:$|[?#])/i.test(String(url || ''));
}

function renderPlaybackPlayer(playbackUrl, stream, options = {}) {
  if (!playbackUrl) {
    return '<section><h2>Stream offline</h2><p>This creator is not live, and no on-demand content is available for this stream right now.</p></section>';
  }
  const autoplay = options.autoplay ? ' autoplay' : '';
  const playerId = options.playerId || 'streamPlayer';
  const statusId = `${playerId}Status`;
  const targetLatency = Number(stream.latencySettings?.targetLatencySeconds || 6);
  const playerBuffer = Number(stream.latencySettings?.playerBufferSeconds || 10);
  const reconnectBuffer = Number(stream.latencySettings?.reconnectBufferSeconds || 10);
  const volumeKey = `aaastreamer:volume:${stream?.id || stream?.streamKey || playerId}`;
  const commonAttrs = `id="${escapeHtml(playerId)}" controls playsinline${autoplay} preload="auto" data-volume-key="${escapeHtml(volumeKey)}" data-target-latency="${escapeHtml(targetLatency)}" data-player-buffer="${escapeHtml(playerBuffer)}" data-reconnect-buffer="${escapeHtml(reconnectBuffer)}"`;
  const volumeScript = `<script>
(() => {
  const player = document.getElementById(${JSON.stringify(playerId)});
  if (!player) return;
  const key = player.dataset.volumeKey;
  try {
    const saved = key ? localStorage.getItem(key) : null;
    if (saved !== null) {
      const value = Number(saved);
      if (Number.isFinite(value) && value >= 0 && value <= 1) player.volume = value;
    }
  } catch {}
  player.addEventListener('volumechange', () => {
    try {
      if (key) localStorage.setItem(key, String(player.volume));
    } catch {}
  });
})();
</script>`;
  if (!isHlsUrl(playbackUrl)) {
    return `<video ${commonAttrs} src="${escapeHtml(playbackUrl)}"></video>${volumeScript}`;
  }
  return `<video ${commonAttrs} data-hls-src="${escapeHtml(playbackUrl)}"></video><p id="${escapeHtml(statusId)}" class="muted" role="status">Loading live stream.</p>${volumeScript}<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script><script>
(() => {
  const player = document.getElementById(${JSON.stringify(playerId)});
  const status = document.getElementById(${JSON.stringify(statusId)});
  const setStatus = (text) => { if (status) status.textContent = text; };
  if (!player) return;
  const source = player.dataset.hlsSrc;
  const targetLatency = Math.max(2, Number(player.dataset.targetLatency || 6) || 6);
  const playerBuffer = Math.max(targetLatency, Number(player.dataset.playerBuffer || 10) || 10);
  const reconnectDelay = Math.max(2000, (Number(player.dataset.reconnectBuffer || 10) || 10) * 1000);
  let retryTimer = null;
  let nativeRetryCount = 0;
  const refreshSource = () => source + (source.includes('?') ? '&' : '?') + 'refresh=' + Date.now();
  const retryNative = () => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      nativeRetryCount += 1;
      setStatus('Refreshing the live stream buffer.');
      player.src = refreshSource();
      player.load();
      player.play().catch(() => {});
    }, Math.min(reconnectDelay, 5000));
  };
  if (player.canPlayType('application/vnd.apple.mpegurl')) {
    player.src = source;
    player.addEventListener('waiting', () => setStatus('Loading more live audio and video.'));
    player.addEventListener('playing', () => { nativeRetryCount = 0; setStatus(''); });
    player.addEventListener('pause', () => clearTimeout(retryTimer));
    player.addEventListener('stalled', retryNative);
    player.addEventListener('error', retryNative);
    player.addEventListener('emptied', () => { if (nativeRetryCount < 5) retryNative(); });
    setStatus('');
  } else if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      liveSyncDuration: targetLatency,
      liveMaxLatencyDuration: Math.max(targetLatency + playerBuffer, targetLatency * 2),
      maxLiveSyncPlaybackRate: 1.05,
      maxBufferLength: playerBuffer,
      maxMaxBufferLength: Math.max(playerBuffer * 2, 30),
      backBufferLength: Math.max(playerBuffer, 30),
      maxBufferHole: 1.5,
      nudgeOffset: 0.2,
      nudgeMaxRetry: 5,
      fragLoadingMaxRetry: 8,
      fragLoadingRetryDelay: 1000,
      fragLoadingMaxRetryTimeout: reconnectDelay,
      manifestLoadingMaxRetry: 8,
      manifestLoadingRetryDelay: 1000,
      levelLoadingMaxRetry: 8,
      levelLoadingRetryDelay: 1000
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data?.fatal) return;
      setStatus('Refreshing the live stream buffer.');
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    });
    player.addEventListener('stalled', () => hls.startLoad());
    hls.loadSource(source);
    hls.attachMedia(player);
    player.addEventListener('waiting', () => setStatus('Loading more live audio and video.'));
    player.addEventListener('playing', () => setStatus(''));
    setStatus('');
  } else {
    setStatus('This browser cannot play HLS directly. Try Safari, VLC, or a current Chrome, Edge, or Firefox build with JavaScript enabled.');
  }
})();
</script>`;
}

function mediaSourceOptions(store, user, selectedSource = null) {
  const catalog = mediaCatalog(store, user);
  const selectedKey = selectedSource?.type === 'localMedia' ? `${selectedSource.folderId}|${selectedSource.relativePath}` : '';
  const options = ['<option value="">No server media selected</option>'];
  for (const folder of catalog) {
    for (const file of folder.files) {
      const value = `${file.folderId}|${file.relativePath}`;
      const label = `${folder.label}: ${file.label} (${file.mediaType})`;
      options.push(`<option value="${escapeHtml(value)}" ${value === selectedKey ? 'selected' : ''}>${escapeHtml(label)}</option>`);
    }
  }
  return options.join('');
}

function sourceSummary(source) {
  if (!source) return 'No source selected';
  if (source.type === 'localMedia') return `${source.label} from server media`;
  if (source.type === 'urlRelay') return `${source.label} from URL relay`;
  return source.label || 'Media source';
}

function sourceQueueKey(source) {
  if (!source) return '';
  if (source.type === 'localMedia') return `localMedia|${source.folderId}|${source.relativePath}`;
  if (source.type === 'urlRelay') return `urlRelay|${source.url}`;
  return source.id || '';
}

function addSourcesToQueue(stream, sources) {
  stream.sourceQueue = (stream.sourceQueue || []).map(normalizeStreamSource).filter(Boolean);
  const existingKeys = new Set(stream.sourceQueue.map(sourceQueueKey));
  const currentKey = sourceQueueKey(stream.currentSource);
  for (const source of sources.map(normalizeStreamSource).filter(Boolean)) {
    const key = sourceQueueKey(source);
    if (!key || key === currentKey || existingKeys.has(key)) continue;
    stream.sourceQueue.push(source);
    existingKeys.add(key);
  }
  return stream.sourceQueue;
}

function removeQueuedSource(stream, sourceId) {
  const before = stream.sourceQueue?.length || 0;
  stream.sourceQueue = (stream.sourceQueue || []).filter((source) => source.id !== sourceId);
  return before !== stream.sourceQueue.length;
}

function queuedSourceRows(stream, store) {
  return (stream.sourceQueue || []).map((source, index) => {
    const sourceUrl = playableSourceUrl(source, store);
    const label = `${index + 1}. ${sourceSummary(source)}`;
    const urlCell = sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source</a>`
      : '<span class="muted">Unavailable</span>';
    return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(source.mediaType)}</td><td>${urlCell}</td><td><form method="post" action="/dashboard/sources/queue/${escapeHtml(source.id)}/select" class="inline-form" data-confirm-kind="live" data-confirm-message="Start playing ${escapeHtml(sourceSummary(source))} now?"><button type="submit">Start playing this queued item</button></form><p class="muted">Starts this item immediately and makes it the current source.</p><form method="post" action="/dashboard/sources/queue/${escapeHtml(source.id)}/remove" class="inline-form" data-confirm-kind="remove" data-confirm-message="Remove ${escapeHtml(sourceSummary(source))} from the queue?"><button type="submit" class="danger">Remove from queue</button></form><p class="muted">Removes this item from the queue without deleting the media file.</p></td></tr>`;
  }).join('');
}

function bodyValues(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function sourcePresetCards(stream, serverUrl) {
  const publishUrl = rtmpPublishUrlFor(stream.streamKey);
  return sourcePresets.map((preset) => {
    if (preset.id === 'rtmpEncoder' || preset.id === 'customRtmp') {
      const fieldId = `${preset.id}PublishUrl`;
      return `<article class="preset-card"><h3>${escapeHtml(preset.name)}</h3><p>${escapeHtml(preset.label)}</p><div class="field-row"><label>Direct publish URL<input id="${escapeHtml(fieldId)}" readonly value="${escapeHtml(publishUrl)}"></label><button type="button" data-copy-target="${escapeHtml(fieldId)}">Copy direct URL</button></div><p class="muted">For OBS-style setup, use server <code>${escapeHtml(serverUrl)}</code> and stream key <code>${escapeHtml(stream.streamKey)}</code>.</p></article>`;
    }
    if (preset.id === 'serverMedia') {
      return `<article class="preset-card"><h3>${escapeHtml(preset.name)}</h3><p>${escapeHtml(preset.label)}</p><p><a class="button" href="#serverMediaSource">Choose server media</a></p></article>`;
    }
    if (preset.id === 'upload') {
      return `<article class="preset-card"><h3>${escapeHtml(preset.name)}</h3><p>${escapeHtml(preset.label)}</p><p><a class="button" href="#mediaUpload">Choose upload file</a></p></article>`;
    }
    return `<article class="preset-card"><h3>${escapeHtml(preset.name)}</h3><p>${escapeHtml(preset.label)}</p><button type="button" data-source-preset="${escapeHtml(preset.id)}" data-source-label="${escapeHtml(preset.label)}" data-source-media-type="${escapeHtml(preset.mediaType)}" data-source-placeholder="${escapeHtml(preset.placeholder || '')}">Use this source type</button></article>`;
  }).join('');
}

function dashboardTabs(active) {
  const tabs = [
    ['overview', 'Overview'],
    ['media', 'Media management'],
    ['encoders', 'Encoders'],
    ['destinations', 'Destinations'],
    ['schedule', 'Calendar'],
    ['profile', 'Stream profile'],
    ['support', 'Support and payments'],
    ['account', 'Account'],
    ['advanced', 'Advanced']
  ];
  return `<nav class="tabs" role="tablist" aria-label="Dashboard sections">${tabs.map(([idValue, label]) => `<a role="tab" class="tab-button" href="/dashboard?tab=${escapeHtml(idValue)}" ${active === idValue ? 'aria-selected="true" aria-current="page"' : 'aria-selected="false"'}>${escapeHtml(label)}</a>`).join('')}</nav>`;
}

function effectiveSupportSettings(stream, user, settings = {}) {
  const support = { ...defaultSupportSettings(), ...(stream.support || {}) };
  const paymentSettings = settings.paymentIntegration || settings || defaultPaymentIntegrationSettings();
  if (!support.whmcsClientId) {
    support.whmcsClientId = user?.whmcsClientId || (user?.role === 'admin' ? paymentSettings.whmcsDefaultClientId : '') || '';
  }
  return support;
}

function mediaCatalogCheckboxes(store, user, stream) {
  const queuedKeys = new Set((stream?.sourceQueue || []).map(sourceQueueKey));
  const currentKey = sourceQueueKey(stream?.currentSource);
  const relayRunning = stream?.id ? sourceProcesses.has(stream.id) : false;
  const rows = [];
  for (const folder of mediaCatalog(store, user)) {
    for (const file of folder.files) {
      const source = normalizeStreamSource({
        type: 'localMedia',
        folderId: file.folderId,
        relativePath: file.relativePath,
        label: file.label,
        mediaType: file.mediaType
      });
      const key = sourceQueueKey(source);
      const previewUrl = `/dashboard/media/preview/${encodeURIComponent(file.folderId)}/${file.relativePath.split(/[\\/]+/).map(encodeURIComponent).join('/')}`;
      const chapterText = file.chapters?.length ? `${file.chapters.length} chapters` : 'No chapters detected';
      const usage = key === currentKey
        ? (relayRunning ? 'Currently playing' : 'Selected current source')
        : queuedKeys.has(key)
          ? 'Queued'
          : 'Not used';
      rows.push(`<tr><td><input type="checkbox" name="localMedia" value="${escapeHtml(`${file.folderId}|${file.relativePath}`)}" ${queuedKeys.has(key) || key === currentKey ? 'checked' : ''} aria-label="Select ${escapeHtml(file.label)} for the playback queue"></td><td>${escapeHtml(file.label)}</td><td>${escapeHtml(file.fileName || path.basename(file.relativePath))}</td><td>${escapeHtml(folder.label)}</td><td>${escapeHtml(file.mediaType)}</td><td>${escapeHtml(formatDuration(file.durationSeconds))}</td><td>${escapeHtml(formatBytes(file.size))}</td><td>${escapeHtml(chapterText)}</td><td>${escapeHtml(usage)}</td><td><form method="get" action="${escapeHtml(previewUrl)}" target="_blank"><button type="submit">Play one-minute preview</button></form></td></tr>`);
    }
  }
  return rows.join('') || '<tr><td colspan="10">No media files are available from enabled folders.</td></tr>';
}

function mediaLibraryFolderRows(store, user) {
  const catalog = mediaCatalog(store, user);
  return catalog.map((folder) => {
    const typeText = [
      folder.allowAudio ? 'audio' : '',
      folder.allowVideo ? 'video' : ''
    ].filter(Boolean).join(' and ') || 'none';
    const accessText = folder.visibleToUsers ? 'visible' : 'admin only';
    const pathText = folder.path ? `<br><code>${escapeHtml(folder.path)}</code>` : '';
    return `<tr><td>${escapeHtml(folder.label)}${pathText}</td><td>${escapeHtml(typeText)}</td><td>${escapeHtml(accessText)}</td><td>${escapeHtml(String(folder.files.length))}</td></tr>`;
  }).join('') || '<tr><td colspan="4">No media library folders are enabled for this account.</td></tr>';
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function sourceByIdOrKey(stream, store, sourceId) {
  const target = String(sourceId || '');
  if (!target) return null;
  return streamSources(stream).find((source) => source.id === target || sourceQueueKey(source) === target) || null;
}

function scheduledShowsForStream(store, stream) {
  return (store.scheduledShows || [])
    .filter((show) => show.streamId === stream.id)
    .sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
}

function datetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoFromDatetimeLocal(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function sourceFromRequest(req, store, user) {
  const type = String(req.body.sourceType || '').trim();
  if (type === 'localMedia') {
    const [folderId, ...parts] = String(req.body.localMedia || '').split('|');
    const relativePath = parts.join('|');
    const folder = resolveMediaFolder(store, folderId);
    const settings = store.settings.mediaLibrary || defaultMediaSettings();
    if (!settings.enabled) return null;
    if (!folder || (!settings.allowUsersToSelectServerMedia && user?.role !== 'admin')) return null;
    if (user?.role !== 'admin' && !folder.visibleToUsers) return null;
    const target = safeMediaPath(folder, relativePath);
    const mediaType = target ? mediaTypeFor(target) : null;
    if (!target || !fs.existsSync(target) || !mediaType) return null;
    return normalizeStreamSource({
      type: 'localMedia',
      folderId,
      relativePath,
      label: path.basename(relativePath),
      mediaType,
      enabled: true
    });
  }
  if (type === 'urlRelay') {
    const settings = store.settings.mediaLibrary || defaultMediaSettings();
    if (!settings.urlRelayEnabled || (!settings.allowUsersToAddRelayUrls && user?.role !== 'admin')) return null;
    const url = String(req.body.relayUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    return normalizeStreamSource({
      type: 'urlRelay',
      url: url.slice(0, 1200),
      label: String(req.body.relayLabel || url).trim().slice(0, 160),
      mediaType: req.body.relayMediaType === 'audio' ? 'audio' : 'video',
      enabled: true
    });
  }
  return null;
}

function parseUploadItems(body) {
  const raw = String(body.uploadData || '').trim();
  if (!raw) return [];
  if (raw.startsWith('[') || raw.startsWith('{')) {
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [parsed]).slice(0, maxBulkUploads);
  }
  return [{
    data: raw,
    name: body.uploadName || body.uploadLabel || 'uploaded-media',
    label: body.uploadLabel || body.uploadName || 'Uploaded media'
  }];
}

function saveUploadedMediaItem(store, user, body, item, index) {
  const media = store.settings.mediaLibrary || defaultMediaSettings();
  if (!media.enabled) throw new Error('The media library is disabled.');
  const raw = String(item?.data || item?.uploadData || '');
  const match = raw.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error('Upload data was not received.');
  const mime = match[1].toLowerCase();
  const extensionByMime = new Map([
    ['audio/aac', '.aac'], ['audio/flac', '.flac'], ['audio/mpeg', '.mp3'], ['audio/mp3', '.mp3'],
    ['audio/ogg', '.ogg'], ['audio/opus', '.opus'], ['audio/wav', '.wav'], ['audio/x-wav', '.wav'],
    ['video/mp4', '.mp4'], ['video/quicktime', '.mov'], ['video/webm', '.webm'], ['video/x-matroska', '.mkv']
  ]);
  const uploadName = String(item?.name || body.uploadName || body.uploadLabel || 'uploaded-media');
  const ext = extensionByMime.get(mime) || path.extname(uploadName).toLowerCase();
  if (!mediaExtensions.has(ext)) throw new Error('Upload must be a supported audio or video file.');
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > maxUploadBytes) throw new Error(`Each upload must be smaller than ${Math.round(maxUploadBytes / 1024 / 1024)} MB.`);
  const uploadRoot = path.resolve(media.uploadFolder || path.join(dataDir, 'uploads'));
  const userFolder = path.join(uploadRoot, slugify(user.username || user.id));
  fs.mkdirSync(userFolder, { recursive: true });
  const baseName = slugify(path.basename(uploadName, ext)) || `uploaded-media-${index + 1}`;
  const fileName = `${Date.now()}-${index + 1}-${baseName}${ext}`;
  const target = path.join(userFolder, fileName);
  fs.writeFileSync(target, buffer, { flag: 'wx' });
  const relativePath = path.relative(uploadRoot, target).split(path.sep).join('/');
  const label = String(item?.label || (index === 0 ? body.uploadLabel : '') || uploadName || baseName).trim().slice(0, 160);
  return normalizeStreamSource({
    type: 'localMedia',
    folderId: 'uploads',
    relativePath,
    label,
    mediaType: mediaTypeFor(target),
    enabled: true
  });
}

function saveUploadedMediaBatch(store, user, stream, body) {
  const items = parseUploadItems(body);
  if (!items.length) throw new Error('Upload data was not received.');
  if (items.length > maxBulkUploads) throw new Error(`Upload no more than ${maxBulkUploads} files at once.`);
  return items.map((item, index) => saveUploadedMediaItem(store, user, body, item, index));
}

function saveUploadedMedia(store, user, stream, body) {
  return saveUploadedMediaBatch(store, user, stream, body)[0];
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function stopSourceProcess(streamId) {
  const child = sourceProcesses.get(streamId);
  if (!child) return false;
  child.aaastreamerStopping = true;
  sourceProcesses.delete(streamId);
  child.kill('SIGTERM');
  return true;
}

function advanceStreamSourceQueue(streamId) {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === streamId);
  if (!stream) return false;
  normalizeStream(stream);
  const nextIndex = stream.sourceQueue.findIndex((source) => playableSourceUrl(source, store));
  if (nextIndex < 0) {
    appendEvent('source_relay_queue_empty', { streamId });
    return false;
  }
  const [nextSource] = stream.sourceQueue.splice(nextIndex, 1);
  const previousSource = stream.currentSource;
  stream.currentSource = nextSource;
  addSourcesToQueue(stream, [previousSource]);
  stream.updatedAt = nowIso();
  store.events.push({
    id: id('evt'),
    type: 'source_relay_queue_advanced',
    payload: { streamId: stream.id, sourceId: nextSource.id, label: nextSource.label },
    createdAt: nowIso()
  });
  writeStore(store);
  try {
    startSourceProcess(stream, nextSource, store);
    return true;
  } catch (error) {
    appendEvent('source_relay_queue_error', { streamId, message: error.message });
    return false;
  }
}

function startSourceProcess(stream, source, store) {
  const input = source?.type === 'localMedia'
    ? safeMediaPath(resolveMediaFolder(store, source.folderId), source.relativePath)
    : source?.url;
  if (!input) throw new Error('No source input selected');
  const behavior = normalizeStreamMediaBehavior(stream.mediaBehavior);
  const mediaInfo = source?.type === 'localMedia' ? probeMediaFile(input) : null;
  const duration = Number(mediaInfo?.durationSeconds || 0);
  const audioFilters = [];
  const videoFilters = [];
  if (behavior.fadeInSeconds > 0) {
    audioFilters.push(`afade=t=in:st=0:d=${behavior.fadeInSeconds}`);
    videoFilters.push(`fade=t=in:st=0:d=${Math.min(behavior.fadeInSeconds, 10)}`);
  }
  if (behavior.fadeOutSeconds > 0 && duration > behavior.fadeOutSeconds + 1) {
    const fadeStart = Math.max(0, duration - behavior.fadeOutSeconds);
    audioFilters.push(`afade=t=out:st=${fadeStart}:d=${behavior.fadeOutSeconds}`);
    videoFilters.push(`fade=t=out:st=${fadeStart}:d=${Math.min(behavior.fadeOutSeconds, 10)}`);
  }
  const outputKey = stream.streamKey;
  const output = `rtmp://127.0.0.1:1935/${rtmpAppName}/${outputKey}`;
  const sampleRate = String(stream.encoderSettings?.sampleRate || '48000');
  const keyframeSeconds = clampNumber(stream.encoderSettings?.keyframeIntervalSeconds, 1, 10, 2);
  const keyframeFrames = Math.max(24, Math.round(keyframeSeconds * 30));
  stopSourceProcess(stream.id);
  const hasQueue = behavior.playbackMode !== 'loop' && (stream.sourceQueue || []).some((queuedSource) => playableSourceUrl(queuedSource, store));
  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-fflags', '+genpts',
    '-re'
  ];
  if (!hasQueue) {
    args.push('-stream_loop', '-1');
  }
  args.push(
    '-i', input,
    '-map', '0:v?',
    '-map', '0:a?',
    ...(videoFilters.length ? ['-vf', videoFilters.join(',')] : []),
    ...(audioFilters.length ? ['-af', audioFilters.join(',')] : []),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-g', String(keyframeFrames),
    '-keyint_min', String(keyframeFrames),
    '-sc_threshold', '0',
    '-force_key_frames', `expr:gte(t,n_forced*${keyframeSeconds})`,
    '-c:a', 'aac',
    '-aac_coder', 'twoloop',
    '-b:a', stream.encoderSettings?.audioBitrate || '160k',
    '-ar', sampleRate,
    '-ac', '2',
    '-max_muxing_queue_size', '1024',
    '-flvflags', 'no_duration_filesize',
    '-f', 'flv',
    output
  );
  const child = childProcess.spawn(ffmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  sourceProcesses.set(stream.id, child);
  child.stderr.on('data', (data) => {
    appendEvent('source_relay_log', { streamId: stream.id, message: String(data).slice(0, 500) });
  });
  child.on('exit', (code, signal) => {
    if (sourceProcesses.get(stream.id) === child) {
      sourceProcesses.delete(stream.id);
    }
    appendEvent('source_relay_exit', { streamId: stream.id, code, signal });
    if (!child.aaastreamerStopping && hasQueue) {
      setTimeout(() => advanceStreamSourceQueue(stream.id), 1000);
    }
  });
  return child;
}

function runSchedulerTick() {
  let store;
  try {
    store = readStore();
  } catch (error) {
    appendEvent('scheduler_tick_failed', { message: error.message });
    return;
  }
  const now = Date.now();
  let changed = false;
  for (const show of store.scheduledShows || []) {
    if (!show.enabled || show.status === 'cancelled') continue;
    const stream = store.streams.find((item) => item.id === show.streamId);
    if (!stream) continue;
    normalizeStream(stream);
    const startsAt = new Date(show.startAt || '').getTime();
    const endsAt = new Date(show.endAt || '').getTime();
    if (show.status === 'scheduled' && Number.isFinite(startsAt) && startsAt <= now) {
      show.status = 'live';
      show.updatedAt = nowIso();
      if (show.mode === 'media') {
        const source = sourceByIdOrKey(stream, store, show.sourceId);
        if (source && playableSourceUrl(source, store)) {
          stream.currentSource = source;
          stream.sourceMode = source.type === 'urlRelay' ? 'url' : 'media';
          stream.status = 'live';
          stream.hlsUrl = hlsUrlFor(stream.streamKey);
          try {
            startSourceProcess(stream, source, store);
            show.startedByScheduler = true;
            store.events.push({ id: id('evt'), type: 'scheduled_media_started', payload: { showId: show.id, streamId: stream.id, sourceId: source.id }, createdAt: nowIso() });
          } catch (error) {
            show.status = 'scheduled';
            store.events.push({ id: id('evt'), type: 'scheduled_media_start_failed', payload: { showId: show.id, streamId: stream.id, message: error.message }, createdAt: nowIso() });
          }
        } else {
          store.events.push({ id: id('evt'), type: 'scheduled_media_unavailable', payload: { showId: show.id, streamId: stream.id }, createdAt: nowIso() });
        }
      } else {
        store.events.push({ id: id('evt'), type: 'scheduled_live_window_started', payload: { showId: show.id, streamId: stream.id }, createdAt: nowIso() });
      }
      broadcast({ type: 'scheduled_show_started', payload: { showId: show.id, streamId: stream.id, title: show.title, mode: show.mode } });
      changed = true;
    }
    if (show.status === 'live' && Number.isFinite(endsAt) && endsAt <= now) {
      show.status = 'ended';
      show.enabled = false;
      show.updatedAt = nowIso();
      if (show.startedByScheduler) {
        stopSourceProcess(stream.id);
        stream.status = 'ended';
        stream.updatedAt = nowIso();
      }
      store.events.push({ id: id('evt'), type: 'scheduled_show_ended', payload: { showId: show.id, streamId: stream.id }, createdAt: nowIso() });
      broadcast({ type: 'scheduled_show_ended', payload: { showId: show.id, streamId: stream.id, title: show.title } });
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

function ensureContinuousOnDemandRelays() {
  let store;
  try {
    store = readStore();
  } catch (error) {
    appendEvent('ondemand_relay_check_failed', { message: error.message });
    return;
  }
  let changed = false;
  for (const stream of store.streams || []) {
    normalizeStream(stream);
    if (!shouldRunContinuousOnDemandRelay(stream, store)) continue;
    if (sourceProcesses.has(stream.id)) continue;
    const source = firstPlayableSource(stream, store);
    if (!source) continue;
    if (stream.currentSource?.id !== source.id) {
      const previousSource = stream.currentSource;
      removeQueuedSource(stream, source.id);
      stream.currentSource = source;
      addSourcesToQueue(stream, [previousSource]);
      stream.sourceMode = source.type === 'urlRelay' ? 'url' : 'media';
      changed = true;
    }
    try {
      startSourceProcess(stream, source, store);
      stream.hlsUrl = hlsUrlFor(stream.streamKey);
      stream.updatedAt = nowIso();
      store.events.push({ id: id('evt'), type: 'ondemand_relay_warmed', payload: { streamId: stream.id, sourceId: source.id, label: source.label }, createdAt: nowIso() });
      changed = true;
    } catch (error) {
      store.events.push({ id: id('evt'), type: 'ondemand_relay_warm_failed', payload: { streamId: stream.id, message: error.message }, createdAt: nowIso() });
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

function ensureContinuousOnDemandRelayForStream(store, stream, reason = 'playback_request') {
  normalizeStream(stream);
  if (!shouldRunContinuousOnDemandRelay(stream, store)) return false;
  if (sourceProcesses.has(stream.id)) return true;
  const source = firstPlayableSource(stream, store);
  if (!source) return false;
  if (stream.currentSource?.id !== source.id) {
    const previousSource = stream.currentSource;
    removeQueuedSource(stream, source.id);
    stream.currentSource = source;
    addSourcesToQueue(stream, [previousSource]);
    stream.sourceMode = source.type === 'urlRelay' ? 'url' : 'media';
  }
  try {
    startSourceProcess(stream, source, store);
    stream.hlsUrl = hlsUrlFor(stream.streamKey);
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'ondemand_relay_ensured', payload: { streamId: stream.id, sourceId: source.id, label: source.label, reason }, createdAt: nowIso() });
    writeStore(store);
    return true;
  } catch (error) {
    store.events.push({ id: id('evt'), type: 'ondemand_relay_ensure_failed', payload: { streamId: stream.id, message: error.message, reason }, createdAt: nowIso() });
    writeStore(store);
    return false;
  }
}

function getGitRevision() {
  try {
    return childProcess.execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function healthPayload() {
  return {
    ok: true,
    service: 'aaastreamer',
    version: appVersion,
    gitRevision: getGitRevision(),
    publicUrl: publicUrl || null,
    hlsBaseUrl: hlsBaseUrl || null,
    rtmpUrl: `rtmp://${rtmpHost}:1935/${rtmpAppName}`,
    restreamEnabled: allowRestream,
    adHocStreamsEnabled: allowAdHocStreams,
    voicelinkApiUrl: process.env.VOICELINK_API_URL || null
  };
}

app.get('/healthz', (_req, res) => {
  res.json(healthPayload());
});

app.get('/health', (_req, res) => {
  res.json(healthPayload());
});

app.get('/api/health', (_req, res) => {
  res.json(healthPayload());
});

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/media/catalog', requireUser, (req, res) => {
  const store = readStore();
  res.json({ success: true, folders: mediaCatalog(store, req.user) });
});

function canEditStream(user, stream) {
  return Boolean(user && stream && (user.role === 'admin' || stream.ownerId === user.id));
}

app.get('/api/streams/:streamId/links', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  const user = currentUser(req);
  if (!stream || (!streamIsPubliclyListable(stream, store) && !canEditStream(user, stream))) {
    res.status(404).json({ success: false, error: 'Stream not found' });
    return;
  }
  res.json({ success: true, links: stream.links || [], html: editableLinks(stream, canEditStream(user, stream)) });
});

app.post('/api/streams/:streamId/links', requireUser, async (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!canEditStream(req.user, stream)) {
    res.status(403).json({ success: false, error: 'You cannot edit links for this stream.' });
    return;
  }
  const url = safeUrl(req.body.url);
  if (!url) {
    res.status(400).json({ success: false, error: 'Use a valid HTTP or HTTPS link.' });
    return;
  }
  const detectedTitle = String(req.body.label || '').trim() ? '' : await detectUrlTitle(url);
  const link = normalizeLinkEntry({ label: req.body.label || detectedTitle || url, url });
  if (!link) {
    res.status(400).json({ success: false, error: 'Link could not be saved.' });
    return;
  }
  stream.links ||= [];
  if (req.body.placement === 'top') stream.links.unshift(link);
  else stream.links.push(link);
  stream.links = stream.links.slice(0, 12);
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_link_added', payload: { streamId: stream.id, label: link.label }, createdAt: nowIso() });
  writeStore(store);
  broadcast({ type: 'stream_links_updated', payload: { streamId: stream.id } });
  res.json({ success: true, links: stream.links, html: editableLinks(stream, true) });
});

app.post('/api/streams/:streamId/links/:index', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!canEditStream(req.user, stream)) {
    res.status(403).json({ success: false, error: 'You cannot edit links for this stream.' });
    return;
  }
  const index = Number(req.params.index);
  const action = String(req.body.action || '').toLowerCase();
  if (!Number.isInteger(index) || index < 0 || index >= (stream.links || []).length) {
    res.status(400).json({ success: false, error: 'Link was not found.' });
    return;
  }
  if (action === 'remove') {
    stream.links.splice(index, 1);
  } else if (action === 'up' && index > 0) {
    [stream.links[index - 1], stream.links[index]] = [stream.links[index], stream.links[index - 1]];
  } else if (action === 'down' && index < stream.links.length - 1) {
    [stream.links[index + 1], stream.links[index]] = [stream.links[index], stream.links[index + 1]];
  }
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_link_changed', payload: { streamId: stream.id, action, index }, createdAt: nowIso() });
  writeStore(store);
  broadcast({ type: 'stream_links_updated', payload: { streamId: stream.id } });
  res.json({ success: true, links: stream.links, html: editableLinks(stream, true) });
});

app.get('/dashboard/media/preview/:folderId/*', requireUser, (req, res) => {
  const store = readStore();
  const folder = resolveMediaFolder(store, req.params.folderId);
  const relativePath = req.params[0] || '';
  if (!folder || (req.user.role !== 'admin' && !folder.visibleToUsers)) {
    res.status(404).send(page('Preview not found', '<h1>Preview not found</h1><p>This media item is not available to your account.</p>', req.user));
    return;
  }
  const target = safeMediaPath(folder, relativePath);
  const mediaType = target ? mediaTypeFor(target) : null;
  if (!target || !fs.existsSync(target) || !mediaType) {
    res.status(404).send(page('Preview not found', '<h1>Preview not found</h1><p>This media item could not be found.</p>', req.user));
    return;
  }
  const info = probeMediaFile(target) || {};
  const duration = Number(info.durationSeconds || 0);
  const latestStart = Math.max(60, duration - 300);
  const earliestStart = Math.min(60, latestStart);
  const startAt = duration > 180 ? Math.floor(earliestStart + Math.random() * Math.max(1, latestStart - earliestStart)) : 0;
  const title = info.title || path.basename(relativePath);
  const previewUrl = `/dashboard/media/preview-stream/${encodeURIComponent(req.params.folderId)}/${relativePath.split(/[\\/]+/).map(encodeURIComponent).join('/')}?start=${encodeURIComponent(startAt)}`;
  const chapters = info.chapters?.length
    ? `<ul>${info.chapters.slice(0, 12).map((chapter) => `<li>${escapeHtml(chapter.title)}: ${escapeHtml(formatDuration(chapter.startSeconds))} to ${escapeHtml(formatDuration(chapter.endSeconds))}</li>`).join('')}</ul>`
    : '<p class="muted">No chapters were detected in this file.</p>';
  const player = mediaType === 'audio'
    ? `<audio controls autoplay src="${escapeHtml(previewUrl)}"></audio>`
    : `<video controls autoplay src="${escapeHtml(previewUrl)}"></video>`;
  res.send(page('Media preview', `<h1>Media preview</h1><section><h2>${escapeHtml(title)}</h2><p>Preview starts around ${escapeHtml(formatDuration(startAt))} and plays for one minute with a fade in and fade out.</p>${player}<h3>Detected metadata</h3><ul><li>File: ${escapeHtml(path.basename(relativePath))}</li><li>Duration: ${escapeHtml(formatDuration(duration))}</li><li>Artist: ${escapeHtml(info.artist || 'None')}</li><li>Album: ${escapeHtml(info.album || 'None')}</li></ul><h3>Detected chapters</h3>${chapters}</section>`, req.user));
});

app.get('/dashboard/media/preview-stream/:folderId/*', requireUser, (req, res) => {
  const store = readStore();
  const folder = resolveMediaFolder(store, req.params.folderId);
  const relativePath = req.params[0] || '';
  if (!folder || (req.user.role !== 'admin' && !folder.visibleToUsers)) {
    res.status(404).send('Preview not found');
    return;
  }
  const target = safeMediaPath(folder, relativePath);
  const mediaType = target ? mediaTypeFor(target) : null;
  if (!target || !fs.existsSync(target) || !mediaType) {
    res.status(404).send('Preview not found');
    return;
  }
  const startAt = clampNumber(req.query.start, 0, 86400, 0);
  const args = ['-hide_banner', '-loglevel', 'error', '-ss', String(startAt), '-t', '60', '-i', target];
  if (mediaType === 'audio') {
    args.push('-vn', '-af', 'afade=t=in:st=0:d=10,afade=t=out:st=50:d=10', '-c:a', 'libmp3lame', '-b:a', '160k', '-f', 'mp3', 'pipe:1');
    res.setHeader('Content-Type', 'audio/mpeg');
  } else {
    args.push('-vf', 'fade=t=in:st=0:d=2,fade=t=out:st=58:d=2', '-af', 'afade=t=in:st=0:d=10,afade=t=out:st=50:d=10', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1');
    res.setHeader('Content-Type', 'video/mp4');
  }
  const child = childProcess.spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(res);
  child.stderr.on('data', (data) => appendEvent('media_preview_log', { message: String(data).slice(0, 500), folderId: req.params.folderId }));
  req.on('close', () => {
    if (!child.killed) child.kill('SIGTERM');
  });
});

app.get('/media/:folderId/*', (req, res) => {
  const store = readStore();
  const relativePath = req.params[0] || '';
  const user = currentUser(req);
  if (!canServeMediaFile(store, req.params.folderId, relativePath, user)) {
    res.status(404).send('Media not found');
    return;
  }
  const folder = resolveMediaFolder(store, req.params.folderId);
  const target = safeMediaPath(folder, relativePath);
  if (!target || !fs.existsSync(target) || !mediaTypeFor(target)) {
    res.status(404).send('Media not found');
    return;
  }
  res.sendFile(target);
});

app.get('/go/:token', (req, res) => {
  const store = readStore();
  const link = (store.shareLinks || []).find((item) => item.token === req.params.token);
  const stream = link ? store.streams.find((item) => item.id === link.streamId) : null;
  if (!stream) {
    res.status(404).send(page('Link not found', '<h1>Link not found</h1><p>This share link is no longer available.</p>', currentUser(req)));
    return;
  }
  link.lastUsedAt = nowIso();
  link.useCount = Number(link.useCount || 0) + 1;
  writeStore(store);
  res.redirect(`/s/${encodeURIComponent(stream.slug)}`);
});

app.use((req, res, next) => {
  const store = readStore();
  const maintenance = store.settings.maintenanceMode || {};
  const allowedPrefixes = ['/login', '/logout', '/admin', '/events', '/healthz', '/api/admin/update', '/api/payments'];
  if (!maintenance.enabled || allowedPrefixes.some((prefix) => req.path.startsWith(prefix))) {
    next();
    return;
  }
  const user = currentUser(req);
  if (user?.role === 'admin') {
    next();
    return;
  }
  res.status(503).send(page('Maintenance in progress', `<h1>Maintenance in progress</h1><p>${escapeHtml(maintenance.message || 'AAAStreamer is installing an update. Streams and logins will resume automatically when maintenance is complete.')}</p>`, user));
});

app.get('/', (req, res) => {
  const store = readStore();
  const branding = store.settings.platformBranding || defaultPlatformBranding();
  const streams = store.streams.filter((stream) => streamIsPubliclyListable(stream, store));
  const body = `<h1>${escapeHtml(branding.platformName || store.settings.siteName)}</h1>
${branding.subheading ? `<p class="muted">${escapeHtml(branding.subheading)}</p>` : ''}
${branding.slogan ? `<p><strong>${escapeHtml(branding.slogan)}</strong></p>` : ''}
${branding.description ? `<section><p>${escapeHtml(branding.description)}</p></section>` : ''}
<div class="grid">${streams.map((stream) => `<section><h2>${escapeHtml(stream.title)}</h2><p>Status: <strong class="status-${escapeHtml(isLive(stream) ? 'live' : 'on demand')}">${escapeHtml(isLive(stream) ? 'live' : 'on demand')}</strong></p><p>${escapeHtml(stream.description || '')}</p><a class="button" href="/s/${escapeHtml(stream.slug)}">${isLive(stream) ? 'Watch live stream' : 'Play on-demand content'}</a></section>`).join('') || '<section>No streams are live and no on-demand streams are available right now.</section>'}</div>`;
  res.send(page(store.settings.siteName, body, currentUser(req)));
});

app.get('/s/:slug', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.slug === req.params.slug || item.id === req.params.slug);
  if (!stream) {
    res.status(404).send(page('Stream not found', '<h1>Stream not found</h1>', currentUser(req)));
    return;
  }
  ensureContinuousOnDemandRelayForStream(store, stream, 'watch_page');
  const playbackUrl = streamPlaybackUrl(stream, store);
  const playableStatus = isLive(stream) ? 'live' : (streamHasOnDemand(stream, store) ? 'on demand' : 'offline');
  const comments = store.comments.filter((comment) => comment.streamId === stream.id && comment.status !== 'hidden' && comment.status !== 'pending').slice(-100);
  const messaging = normalizeMessagingSettings(store.settings.messaging || {});
  const user = currentUser(req);
  const canEditLinks = canEditStream(user, stream);
  const canComment = stream.allowComments && (
    user ? messaging.loggedInUserMessagesEnabled : messaging.visitorMessagesEnabled
  );
  const heroStyle = stream.backgroundImage ? ` style="background-image:linear-gradient(rgba(16,19,22,.78),rgba(16,19,22,.78)),url('${escapeHtml(stream.backgroundImage)}')"` : '';
  const supportBefore = stream.support?.placement === 'before' ? renderSupportBox(stream, 'watch') : '';
  const supportDuring = stream.support?.placement === 'during' ? renderSupportBox(stream, 'watch') : '';
  const supportAfter = !['before', 'during'].includes(stream.support?.placement) ? renderSupportBox(stream, 'watch') : '';
  const body = `<div class="public-hero"${heroStyle}><h1>${escapeHtml(stream.title)}</h1>
<p>Status: <strong class="status-${escapeHtml(stream.status)}">${escapeHtml(playableStatus)}</strong></p>
${supportBefore}
${renderPlaybackPlayer(playbackUrl, stream)}${supportDuring}</div>
<section><h2>About this stream</h2><p>${escapeHtml(stream.description || 'No description yet.')}</p>${renderExtraContentBox(stream, 'watch')}<h3>Links</h3><div id="streamLinksPanel">${editableLinks(stream, canEditLinks)}</div></section>
<section><h2>Live comments</h2><div id="comments" class="comments">${comments.map((comment) => renderComment(comment, messaging.reactionsEnabled)).join('')}</div>
${canComment ? `<form id="commentForm"><label>Name<input name="authorName" ${user ? `value="${escapeHtml(user.displayName || user.username)}" readonly` : 'required'}></label><label>Message type<select name="messageType"><option value="comment">Comment</option><option value="question">Question</option><option value="support">Support message</option></select></label><label>Comment<textarea name="message" required rows="3" maxlength="${escapeHtml(messaging.maxMessageLength || 1000)}"></textarea></label><button type="submit">Post comment</button></form>` : '<p>Comments are disabled for this stream or account type.</p>'}</section>
${supportAfter}
<script>
const streamId=${JSON.stringify(stream.id)};
const comments=document.getElementById('comments');
const linksPanel=document.getElementById('streamLinksPanel');
async function refreshLinks(){if(!linksPanel)return;try{const response=await fetch('/api/streams/'+encodeURIComponent(streamId)+'/links');const payload=await response.json();if(payload.success)linksPanel.innerHTML=payload.html;}catch{}}
if(linksPanel){linksPanel.addEventListener('click',async(event)=>{const button=event.target.closest('button[data-link-action]');if(!button)return;const action=button.dataset.linkAction;const index=button.dataset.linkIndex;if(action==='remove'&&!confirm('Remove this link from the stream page?'))return;await fetch('/api/streams/'+encodeURIComponent(streamId)+'/links/'+encodeURIComponent(index),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});await refreshLinks();});linksPanel.addEventListener('submit',async(event)=>{if(event.target.id!=='quickLinkForm')return;event.preventDefault();const form=new FormData(event.target);await fetch('/api/streams/'+encodeURIComponent(streamId)+'/links',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:form.get('label'),url:form.get('url'),placement:form.get('placement')})});event.target.reset();await refreshLinks();});}
const events=new EventSource('/events');
events.onmessage=(event)=>{try{const msg=JSON.parse(event.data); if(msg.type==='comment' && msg.payload.streamId===streamId){comments.insertAdjacentHTML('beforeend', msg.payload.html); comments.scrollTop=comments.scrollHeight;} if(msg.type==='reaction' && msg.payload.streamId===streamId){const target=document.getElementById('reactions-'+msg.payload.commentId); if(target) target.innerHTML=msg.payload.html;} if(msg.type==='stream_links_updated' && msg.payload.streamId===streamId){refreshLinks();} if(['stream_latency_updated','stream_source_selected','source_queue_selected','source_relay_started','source_relay_stopped','ondemand_settings_updated','stream_support_updated','stream_extra_content_updated'].includes(msg.type) && msg.payload.streamId===streamId){setTimeout(()=>window.location.reload(),500);}}catch{}};
const form=document.getElementById('commentForm');
if(form){form.addEventListener('submit', async (e)=>{e.preventDefault(); const data=Object.fromEntries(new FormData(form)); const res=await fetch('/api/streams/'+streamId+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(res.ok) form.reset();});}
document.addEventListener('click', async (event)=>{const button=event.target.closest('[data-reaction]'); if(!button)return; const commentId=button.dataset.commentId; const reaction=button.dataset.reaction; const res=await fetch('/api/comments/'+commentId+'/reactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({streamId,reaction})}); if(res.ok){const data=await res.json(); const target=document.getElementById('reactions-'+commentId); if(target) target.innerHTML=data.html;}});
document.querySelectorAll('[data-support-payment]').forEach((paymentForm)=>paymentForm.addEventListener('submit',async(event)=>{event.preventDefault(); const status=paymentForm.querySelector('[data-payment-status]'); if(status) status.textContent='Creating payment link.'; const data=Object.fromEntries(new FormData(paymentForm)); try{const res=await fetch('/api/streams/'+paymentForm.dataset.supportPayment+'/support-payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); const payload=await res.json(); if(!res.ok||!payload.success) throw new Error(payload.error||'Payment could not be started.'); if(status) status.textContent='Opening payment page.'; window.location.href=payload.url;}catch(error){if(status) status.textContent=error.message||'Payment could not be started.';}}));
</script>`;
  res.send(page(stream.title, body, user));
});

app.get('/embed/:slug', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.slug === req.params.slug || item.id === req.params.slug);
  if (!stream) {
    res.status(404).send('Stream not found');
    return;
  }
  ensureContinuousOnDemandRelayForStream(store, stream, 'embed_player');
  const playbackUrl = streamPlaybackUrl(stream, store);
  if (!playbackUrl) {
    res.status(404).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(stream.title)}</title><style>html,body{margin:0;height:100%;background:#000;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;text-align:center}</style></head><body><p>This stream is offline.</p></body></html>`);
    return;
  }
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(stream.title)}</title><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;background:#000}.muted{color:#fff;font-family:Arial,sans-serif;padding:1rem}</style></head><body>${renderPlaybackPlayer(playbackUrl, stream, { autoplay: true, playerId: 'embedPlayer' })}</body></html>`);
});

function renderComment(comment, reactionsEnabled = true) {
  const reactions = comment.reactions || {};
  const reactionButtons = ['like', 'love', 'applause', 'thanks'].map((reaction) => {
    const count = Number(reactions[reaction] || 0);
    return `<button type="button" data-comment-id="${escapeHtml(comment.id)}" data-reaction="${reaction}">${escapeHtml(reaction)}${count ? ` ${count}` : ''}</button>`;
  }).join('');
  return `<div class="comment" id="comment-${escapeHtml(comment.id)}"><strong>${escapeHtml(comment.authorName)}</strong> <span class="message-meta">${escapeHtml(comment.authorType || 'guest')} ${escapeHtml(comment.messageType || 'comment')} ${escapeHtml(comment.createdAt)}</span><p>${escapeHtml(comment.message)}</p>${reactionsEnabled ? `<div id="reactions-${escapeHtml(comment.id)}" class="reaction-list">${reactionButtons}</div>` : ''}</div>`;
}

app.get('/login', (req, res) => {
  if (currentUser(req)) {
    res.redirect('/dashboard');
    return;
  }
  res.send(page('Log in', `<h1>Log in</h1><form method="post" action="/login"><label>Username<input id="loginUsername" name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Log in</button></form><p><button type="button" id="passkeyLogin">Log in with passkey</button></p><p id="passkeyLoginStatus" class="notice" role="status" aria-live="polite"></p><p><a href="/forgot-password">Forgot your login details?</a></p><script>
function b64uToBuffer(value){const b64=String(value).replace(/-/g,'+').replace(/_/g,'/');const bin=atob(b64.padEnd(Math.ceil(b64.length/4)*4,'='));return Uint8Array.from(bin,c=>c.charCodeAt(0)).buffer;}
function bufferToB64u(buffer){const bytes=new Uint8Array(buffer);let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');}
function publicKeyRequestFromJSON(options){options.challenge=b64uToBuffer(options.challenge);if(options.allowCredentials){options.allowCredentials=options.allowCredentials.map(c=>({...c,id:b64uToBuffer(c.id)}));}return options;}
function credentialToJSON(credential){return {id:credential.id,rawId:bufferToB64u(credential.rawId),type:credential.type,response:{authenticatorData:bufferToB64u(credential.response.authenticatorData),clientDataJSON:bufferToB64u(credential.response.clientDataJSON),signature:bufferToB64u(credential.response.signature),userHandle:credential.response.userHandle?bufferToB64u(credential.response.userHandle):null}};}
const passkeyLogin=document.getElementById('passkeyLogin');const passkeyLoginStatus=document.getElementById('passkeyLoginStatus');
if(passkeyLogin){passkeyLogin.addEventListener('click',async()=>{try{if(!window.PublicKeyCredential)throw new Error('This browser does not support passkeys.');const username=document.getElementById('loginUsername').value;if(!username){passkeyLoginStatus.textContent='Enter your username or recovery email first.';return;}const optionsResponse=await fetch('/api/passkeys/authenticate/options',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})});const options=await optionsResponse.json();if(!optionsResponse.ok)throw new Error(options.error||'Passkey login is not available for this account.');const credential=await navigator.credentials.get({publicKey:publicKeyRequestFromJSON(options)});const verifyResponse=await fetch('/api/passkeys/authenticate/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentialToJSON(credential))});const result=await verifyResponse.json();if(!verifyResponse.ok||!result.success)throw new Error(result.error||'Passkey login failed.');location.href=result.redirect||'/dashboard';}catch(error){passkeyLoginStatus.textContent=error.message||'Passkey login failed.';}});}
</script>`, null));
});

app.get('/forgot-password', (req, res) => {
  res.send(page('Reset login details', `<h1>Reset login details</h1><p>Enter your username or recovery email, your private recovery code, and a new password.</p><form method="post" action="/forgot-password"><label>Username or recovery email<input name="login" autocomplete="username" required></label><label>Recovery code<input name="recoveryCode" type="password" autocomplete="one-time-code" required></label><label>New password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label><button type="submit">Reset password</button></form>`, null));
});

app.post('/forgot-password', (req, res) => {
  const store = readStore();
  const user = userByLogin(store, req.body.login);
  const password = String(req.body.password || '');
  if (!user || !user.active || password.length < 8 || !recoveryCodeMatches(user, req.body.recoveryCode)) {
    res.status(403).send(page('Reset not accepted', '<h1>Reset not accepted</h1><p>The account, recovery code, or new password was not accepted.</p><a class="button" href="/forgot-password">Try again</a>', null));
    return;
  }
  user.passwordHash = hashPassword(password);
  user.updatedAt = nowIso();
  store.sessions = (store.sessions || []).filter((session) => session.userId !== user.id);
  store.events.push({ id: id('evt'), type: 'password_reset_self_service', payload: { username: user.username }, createdAt: nowIso() });
  writeStore(store);
  res.send(page('Password reset', '<h1>Password reset</h1><p>Your password has been updated. You can now log in with the new password.</p><p><a class="button" href="/login">Log in</a></p>', null));
});

app.get('/signup', (req, res) => {
  const store = readStore();
  if (!store.settings.registrationsEnabled) {
    res.status(404).send(page('Signups closed', '<h1>Signups closed</h1><p>New account signups are not enabled on this server.</p>', currentUser(req)));
    return;
  }
  res.send(page('Sign up', `<h1>Create your AAAStreamer account</h1><form method="post" action="/signup"><label>Username<input name="username" autocomplete="username" required></label><label>Display name<input name="displayName"></label><label>Account type<select name="role">${roleOptions(store.settings.registrationDefaultRole || 'user', false)}</select></label><label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label><button type="submit">Create account</button></form>`, null));
});

app.post('/signup', (req, res) => {
  const store = readStore();
  if (!store.settings.registrationsEnabled) {
    res.status(403).send(page('Signups closed', '<h1>Signups closed</h1><p>New account signups are not enabled on this server.</p>', null));
    return;
  }
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^[a-z0-9_.-]{3,40}$/i.test(username) || password.length < 8) {
    res.status(400).send(page('Signup failed', '<h1>Signup failed</h1><p>Use a 3-40 character username and a password with at least 8 characters.</p><a class="button" href="/signup">Try again</a>', null));
    return;
  }
  if (store.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
    res.status(409).send(page('Signup failed', '<h1>Signup failed</h1><p>That username is already in use.</p><a class="button" href="/signup">Try again</a>', null));
    return;
  }
  const createdAt = nowIso();
  const user = {
    id: id('usr'),
    username,
    displayName: String(req.body.displayName || username).trim().slice(0, 80) || username,
    role: normalizeRole(req.body.role || store.settings.registrationDefaultRole, 'user') === 'admin' ? 'user' : normalizeRole(req.body.role || store.settings.registrationDefaultRole, 'user'),
    passwordHash: hashPassword(password),
    streamKey: id('sk'),
    active: true,
    createdAt,
    updatedAt: createdAt
  };
  store.users.push(user);
  ensureStreamForUser(store, user);
  store.events.push({ id: id('evt'), type: 'user_signup', payload: { username, role: user.role }, createdAt });
  writeStore(store);
  const token = id('sess');
  const loggedIn = readStore();
  loggedIn.sessions.push({ token, userId: user.id, createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString() });
  writeStore(loggedIn);
  res.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
  res.redirect('/dashboard?tab=profile');
});

app.post('/login', (req, res) => {
  const store = readStore();
  const user = userByLogin(store, req.body.username);
  if (!user || !verifyPassword(req.body.password || '', user.passwordHash)) {
    res.status(403).send(page('Login failed', '<h1>Login failed</h1><p>Username or password was not accepted.</p><a class="button" href="/login">Try again</a>', null));
    return;
  }
  user.notificationEmailReminder ||= { enabled: true, everyLogins: 3, everyDays: 14, loginCount: 0, lastShownAt: '' };
  user.notificationEmailReminder.loginCount = Number(user.notificationEmailReminder.loginCount || 0) + 1;
  user.updatedAt = nowIso();
  if (user.totpEnabled) {
    const token = id('login');
    store.pendingLogins.push({ token, userId: user.id, createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString() });
    writeStore(store);
    res.redirect(`/login/2fa?token=${encodeURIComponent(token)}`);
    return;
  }
  createLoginSession(store, user, res);
  res.redirect('/dashboard');
});

app.get('/login/2fa', (req, res) => {
  const token = String(req.query.token || '');
  const store = readStore();
  const pending = store.pendingLogins.find((item) => item.token === token && Date.parse(item.expiresAt || '') > Date.now());
  if (!pending) {
    res.status(403).send(page('Two-factor login expired', '<h1>Two-factor login expired</h1><p>Start login again.</p><p><a class="button" href="/login">Back to login</a></p>', null));
    return;
  }
  res.send(page('Two-factor verification', `<h1>Two-factor verification</h1><form method="post" action="/login/2fa"><input type="hidden" name="token" value="${escapeHtml(token)}"><label>Authentication code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button type="submit">Continue</button></form>`, null));
});

app.post('/login/2fa', (req, res) => {
  const store = readStore();
  const token = String(req.body.token || '');
  const pending = store.pendingLogins.find((item) => item.token === token && Date.parse(item.expiresAt || '') > Date.now());
  const user = pending ? userById(store, pending.userId) : null;
  if (!user || !verifyTotp(user.totpSecret, req.body.code)) {
    res.status(403).send(page('Two-factor verification failed', '<h1>Two-factor verification failed</h1><p>The code was not accepted.</p><p><a class="button" href="/login">Back to login</a></p>', null));
    return;
  }
  store.pendingLogins = store.pendingLogins.filter((item) => item.token !== token);
  user.updatedAt = nowIso();
  createLoginSession(store, user, res);
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  const token = parseCookies(req)[sessionCookieName];
  const store = readStore();
  store.sessions = store.sessions.filter((session) => session.token !== token);
  writeStore(store);
  res.setHeader('Set-Cookie', `${sessionCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  res.redirect('/');
});

app.get('/dashboard', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.redirect('/login');
    return;
  }
  const store = readStore();
  const stream = ensureStreamForUser(store, user);
  const paymentSettings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
  stream.support = effectiveSupportSettings(stream, user, store.settings);
  const shareLink = ensureShareLink(store, stream, user.id);
  const reminderHtml = notificationEmailReminder(user);
  if (reminderHtml) {
    user.notificationEmailReminder.lastShownAt = nowIso();
  }
  writeStore(store);
  const activeTab = ['overview', 'media', 'encoders', 'destinations', 'schedule', 'profile', 'support', 'account', 'advanced'].includes(req.query.tab) ? req.query.tab : 'overview';
  const serverUrl = rtmpUrlFor(stream.streamKey);
  const watchUrl = watchUrlFor(stream);
  const shareUrl = tokenUrlFor(shareLink.token);
  const hlsUrl = stream.hlsUrl || hlsUrlFor(stream.streamKey);
  const embedCode = embedCodeFor(stream);
  const encoders = [
    { id: 'primary', name: 'Primary encoder', key: stream.streamKey, audioBitrate: stream.encoderSettings.audioBitrate, active: true },
    ...stream.encoderKeys
  ];
  const encoderRows = encoders.map((encoder) => `<tr><td>${escapeHtml(encoder.name)}</td><td><code>${escapeHtml(encoder.key)}</code></td><td>${escapeHtml(encoder.audioBitrate || stream.encoderSettings.audioBitrate)}</td><td>${escapeHtml(encoder.sampleRate || stream.encoderSettings.sampleRate || '48000')}</td><td>${encoder.active === false ? 'disabled' : 'enabled'}</td><td><input readonly value="${escapeHtml(hlsUrlFor(encoder.key))}"></td></tr>`).join('');
  const destinationRows = (stream.destinations || []).map((destination) => `<tr><td><input type="checkbox" form="destinationStateForm" name="destinationIds" value="${escapeHtml(destination.id)}" aria-label="Select ${escapeHtml(destination.name)} for a bulk action"></td><td>${destination.enabled ? 'Live enabled' : 'Disabled'}</td><td>${escapeHtml(destination.name)}</td><td>${escapeHtml(destination.platform)}</td><td>${destination.connected ? 'connected' : 'manual setup'}</td><td><details><summary>Show manual RTMP</summary><code>${escapeHtml(destination.rtmpUrl)}</code></details></td><td><form method="post" action="/dashboard/destinations/${escapeHtml(destination.id)}/delete" data-confirm-kind="remove" data-confirm-message="Remove ${escapeHtml(destination.name)} from your destinations?"><button type="submit" class="danger">Remove destination</button></form><p class="muted">Removes this destination from your saved streaming targets.</p></td></tr>`).join('');
  const presetOptions = platformPresets.map((preset) => `<option value="${escapeHtml(preset.id)}" data-ingest="${escapeHtml(preset.ingest)}" data-connect="${escapeHtml(preset.connectUrl || preset.url || '')}" data-services="${escapeHtml((preset.services || []).join(', '))}">${escapeHtml(preset.name)}</option>`).join('');
  const selectedSource = stream.currentSource || null;
  const relayRows = (stream.relaySources || []).map((source) => `<tr><td>${escapeHtml(source.label)}</td><td>${escapeHtml(source.mediaType)}</td><td><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Open source URL</a></td><td><form method="post" action="/dashboard/sources/${escapeHtml(source.id)}/select" class="inline-form" data-confirm-kind="live" data-confirm-message="Start streaming ${escapeHtml(source.label)} now?"><button type="submit">Start streaming this source</button></form><p class="muted">Starts this URL relay immediately as the current stream source.</p><form method="post" action="/dashboard/sources/${escapeHtml(source.id)}/delete" class="inline-form" data-confirm-kind="remove" data-confirm-message="Remove ${escapeHtml(source.label)} from your media sources?"><button type="submit" class="danger">Remove relay source</button></form><p class="muted">Removes this saved URL relay source.</p></td></tr>`).join('');
  const queueRows = queuedSourceRows(stream, store);
  const activeSourceRunning = sourceProcesses.has(stream.id);
  const quickSourceCards = sourcePresetCards(stream, serverUrl);
  const mediaFolderRows = mediaLibraryFolderRows(store, user);
  const behavior = normalizeStreamMediaBehavior(stream.mediaBehavior);
  const scheduleRows = scheduledShowsForStream(store, stream).map((show) => `<tr><td>${escapeHtml(show.title)}</td><td>${escapeHtml(show.startAt || '')}</td><td>${escapeHtml(show.mode)}</td><td>${escapeHtml(show.status)}</td><td><form method="post" action="/dashboard/schedule/${escapeHtml(show.id)}/toggle" class="inline-form"><button type="submit">${show.enabled ? 'Disable' : 'Enable'}</button></form><form method="post" action="/dashboard/schedule/${escapeHtml(show.id)}/cancel" class="inline-form"><button type="submit" class="danger">Cancel</button></form></td></tr>`).join('');
  const authDomains = configuredAuthDomains(store, req).join(', ');
  const passkeyRows = (user.passkeys || []).map((passkey) => `<tr><td>${escapeHtml(passkey.name || 'Passkey')}</td><td>${escapeHtml(passkey.rpID || '')}</td><td>${escapeHtml(passkey.createdAt || '')}</td><td>${escapeHtml(passkey.lastUsedAt || 'Never')}</td></tr>`).join('');
  const totpUri = user.totpPendingSecret ? `otpauth://totp/${encodeURIComponent(store.settings.siteName || 'AAAStreamer')}:${encodeURIComponent(user.username)}?secret=${encodeURIComponent(user.totpPendingSecret)}&issuer=${encodeURIComponent(store.settings.siteName || 'AAAStreamer')}` : '';
  const tabs = dashboardTabs(activeTab);
  const streamEvents = (store.events || []).filter((event) => event.payload?.streamId === stream.id).slice(-25);
  const visibleComments = (store.comments || []).filter((comment) => comment.streamId === stream.id && comment.status !== 'hidden').length;
  const pendingComments = (store.comments || []).filter((comment) => comment.streamId === stream.id && comment.status === 'pending').length;
  const enabledDestinations = (stream.destinations || []).filter((destination) => destination.enabled).length;
  const liveEncoderCount = Object.values(stream.activeEncoders || {}).filter((encoder) => encoder.status === 'live').length;
  const lastEvent = streamEvents.at(-1);
  const analyticsRows = [
    ['Stream status', stream.status || 'offline'],
    ['Relay process', activeSourceRunning ? 'running' : 'stopped'],
    ['Current source', sourceSummary(selectedSource)],
    ['Queue items', String((stream.sourceQueue || []).length)],
    ['Enabled destinations', `${enabledDestinations} of ${(stream.destinations || []).length}`],
    ['Live encoders', String(liveEncoderCount)],
    ['Visible messages', String(visibleComments)],
    ['Pending messages', String(pendingComments)],
    ['Latest stream event', lastEvent ? `${lastEvent.type} at ${lastEvent.createdAt}` : 'No stream events yet']
  ].map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
  const recentEventRows = streamEvents.slice(-8).reverse().map((event) => `<tr><td>${escapeHtml(event.createdAt || '')}</td><td>${escapeHtml(event.type || '')}</td></tr>`).join('');
  const overviewTab = `<section><h2>Links</h2>
<div class="field-row"><label>Share link<input id="watchUrl" readonly value="${escapeHtml(shareUrl)}"></label><button type="button" data-copy-target="watchUrl">Copy share link</button></div>
<div class="field-row"><label>Direct watch page<input id="directWatchUrl" readonly value="${escapeHtml(watchUrl)}"></label><button type="button" data-copy-target="directWatchUrl">Copy direct watch link</button></div>
<div class="field-row"><label>HLS playback URL<input id="hlsUrl" readonly value="${escapeHtml(hlsUrl)}"></label><button type="button" data-copy-target="hlsUrl">Copy HLS link</button></div>
<div class="field-row"><label>Web embed code<input id="embedCode" readonly value="${escapeHtml(embedCode)}"></label><button type="button" data-copy-target="embedCode">Copy embed code</button></div>
<p><button type="button" id="shareStream">Share stream link</button></p><p id="copyStatus" class="notice" role="status" aria-live="polite"></p>
<form method="post" action="/dashboard/share/mastodon"><label>Optional Mastodon share text<textarea name="status" rows="3">${escapeHtml(`${stream.title}\n${shareUrl}`)}</textarea></label><button type="submit">Share on Mastodon</button></form></section>
<section><h2>Stats and analytics</h2><table>${analyticsRows}</table></section>
<section><h2>Recent stream activity</h2><table><tr><th>Time</th><th>Event</th></tr>${recentEventRows || '<tr><td colspan="2">No stream activity yet.</td></tr>'}</table></section>`;
  const encodersTab = `<section><h2>Encoder connection details</h2>
<p class="muted">Use these connection details in OBS, Ecamm Live, Audio Hijack, Streamlabs, vMix, Larix Broadcaster, or any app that can publish RTMP.</p>
<div class="field-row"><label>Server URL<input id="rtmpUrl" readonly value="${escapeHtml(serverUrl)}"></label><button type="button" data-copy-target="rtmpUrl">Copy URL</button></div>
<div class="field-row"><label>Primary stream key<input id="streamKey" readonly value="${escapeHtml(stream.streamKey)}"></label><button type="button" data-copy-target="streamKey">Copy key</button></div>
<form class="inline-form" method="post" action="/dashboard/stream/key"><input type="hidden" name="action" value="revoke"><button type="submit" class="danger" onclick="return confirm('This will revoke the current stream key and generate a new one. Existing encoder settings using the old key will stop working until you update them. Continue?')">Revoke and generate new key</button></form></section>
<section><h2>Encoder keys</h2><p class="muted">Each row shows a key that an encoder app can use, plus the audio settings, status, and HLS output for that encoder.</p><table><tr><th>Name</th><th>Key</th><th>Audio bitrate</th><th>Sample rate</th><th>Status</th><th>HLS output</th></tr>${encoderRows}</table>
<form method="post" action="/dashboard/encoders"><label>Encoder name<input name="name" placeholder="OBS Windows, Ecamm Mac, Audio Hijack"></label><label>Audio bitrate<select name="audioBitrate">${audioBitrates.map((rate) => `<option ${rate === stream.encoderSettings.audioBitrate ? 'selected' : ''}>${rate}</option>`).join('')}</select></label><button type="submit">Add encoder key for another app</button></form></section>
<section><h2>Encoder audio and video defaults</h2><form method="post" action="/dashboard/encoder-settings"><label>Video bitrate<input name="videoBitrate" value="${escapeHtml(stream.encoderSettings.videoBitrate || '4500k')}"></label><label>Audio bitrate<select name="audioBitrate">${audioBitrates.map((rate) => `<option ${rate === stream.encoderSettings.audioBitrate ? 'selected' : ''}>${rate}</option>`).join('')}</select></label><label>Audio channels<select name="audioChannels"><option value="stereo" selected>stereo</option></select></label><label>Sample rate<select name="sampleRate"><option value="44100" ${stream.encoderSettings.sampleRate === '44100' ? 'selected' : ''}>44100</option><option value="48000" ${stream.encoderSettings.sampleRate !== '44100' ? 'selected' : ''}>48000</option></select></label><label>Keyframe interval seconds<input name="keyframeIntervalSeconds" type="number" min="1" max="10" step="1" value="${escapeHtml(stream.encoderSettings.keyframeIntervalSeconds || 2)}"></label><label>HLS segment duration, ms<input name="hlsSegmentDurationMs" type="number" min="1000" max="6000" step="100" value="${escapeHtml(stream.encoderSettings.hlsSegmentDurationMs || 2000)}"></label><label>HLS segment count<input name="hlsSegmentCount" type="number" min="8" max="24" step="1" value="${escapeHtml(Math.max(12, Number(stream.encoderSettings.hlsSegmentCount || 12)))}"></label><button type="submit">Save encoder defaults</button></form></section>
<section><h2>Encoder latency and buffer</h2><form method="post" action="/dashboard/latency"><label>Stream latency mode<select name="mode"><option value="low" ${stream.latencySettings.mode === 'low' ? 'selected' : ''}>Low latency</option><option value="balanced" ${stream.latencySettings.mode === 'balanced' ? 'selected' : ''}>Balanced</option><option value="stable" ${stream.latencySettings.mode === 'stable' ? 'selected' : ''}>Most stable for Safari and mobile browsers</option></select></label><label>Target live latency, seconds<input name="targetLatencySeconds" type="number" min="2" max="30" step="0.5" value="${escapeHtml(stream.latencySettings.targetLatencySeconds)}"></label><label>Player buffer, seconds<input name="playerBufferSeconds" type="number" min="4" max="60" step="0.5" value="${escapeHtml(stream.latencySettings.playerBufferSeconds)}"></label><label>Reconnect buffer, seconds<input name="reconnectBufferSeconds" type="number" min="4" max="120" step="1" value="${escapeHtml(stream.latencySettings.reconnectBufferSeconds)}"></label><button type="submit">Save encoder latency and buffer</button></form></section>`;
  const destinationsTab = `<section><h2>Destinations</h2><p class="muted">Destinations are external services or subchannels that may receive your stream, such as YouTube, Restream, Twitch, or a custom RTMP target. Select rows, then choose whether to enable or disable them. Manual RTMP details stay hidden unless you open them.</p><form id="destinationStateForm" method="post" action="/dashboard/destinations/enabled"><table><tr><th>Select for bulk action</th><th>Live status</th><th>Name or subchannel</th><th>Platform</th><th>Connection</th><th>Manual RTMP</th><th>Action</th></tr>${destinationRows || '<tr><td colspan="7">No destinations configured yet.</td></tr>'}</table><label>Destination action<select name="bulkAction"><option value="enable-selected">Enable selected destinations</option><option value="disable-selected">Disable selected destinations</option><option value="enable-all">Enable all destinations</option><option value="disable-all">Disable all destinations</option></select></label><p class="muted">Enable means the destination is allowed to receive stream output. Disable leaves the destination saved but prevents it from going live.</p><button type="submit">Apply destination action</button></form>
<form method="post" action="/dashboard/destinations" data-confirm-kind="add" data-confirm-message="Add this destination or subchannel to your stream settings?"><label>Platform<select id="platformPreset" name="platform">${presetOptions}</select></label><p id="destinationServices" class="muted"></p><p><a id="destinationConnectLink" class="button" href="#" target="_blank" rel="noopener noreferrer">Open service setup</a></p><label>Name<input name="name" placeholder="Main YouTube channel"></label><label>RTMP or RTMPS URL, manual destinations only<input id="destinationRtmpUrl" name="rtmpUrl"></label><label>Stream key, manual destinations only<input name="streamKey"></label><label><input type="checkbox" name="enabled" value="true" checked> Enable this destination after saving</label><button type="submit">Add destination or subchannel</button></form></section>`;
  const accountTab = `<section><h2>Account details</h2><form method="post" action="/dashboard/account"><label>Display name<input name="displayName" value="${escapeHtml(user.displayName || '')}"></label><label>Client ID or client email<input name="whmcsLookup" value="${escapeHtml(user.whmcsClientId || user.whmcsPortalEmail || '')}" placeholder="Client ID or email address"></label><p class="muted">When the client portal is configured, AAAStreamer looks up the matching client ID and client email automatically.</p><button type="submit">Save account details</button></form><p>Client ID: <strong>${escapeHtml(user.whmcsClientId || 'None')}</strong>. Client email: <strong>${escapeHtml(user.whmcsPortalEmail || 'None')}</strong>.</p></section>
<section><h2>Notification email</h2><p class="muted">This email is used for account recovery reminders, stream notices, payment notices, and browser notification enrollment. Browser notifications follow the current domain in your browser.</p><form method="post" action="/dashboard/notification-settings"><label>Notification email<input name="notificationEmail" type="email" value="${escapeHtml(user.notificationEmail || '')}"></label><label><input type="checkbox" name="reminderEnabled" value="true" ${user.notificationEmailReminder?.enabled !== false ? 'checked' : ''}> Remind me if no notification email is configured</label><label>Reminder every number of logins<input name="everyLogins" type="number" min="1" max="30" value="${escapeHtml(user.notificationEmailReminder?.everyLogins || 3)}"></label><label>Reminder every number of days<input name="everyDays" type="number" min="1" max="180" value="${escapeHtml(user.notificationEmailReminder?.everyDays || 14)}"></label><button type="submit">Save notification settings</button></form></section>
<section><h2>Action confirmations</h2><p class="muted">Confirmations help prevent accidental stream changes. The countdown appears before go-live actions so you can cancel before enabled destinations begin receiving a stream.</p><form method="post" action="/dashboard/confirmation-settings"><label><input type="checkbox" name="enabled" value="true" ${user.confirmationPreferences?.enabled !== false ? 'checked' : ''}> Show confirmations before stream actions</label><label><input type="checkbox" name="confirmGoingLive" value="true" ${user.confirmationPreferences?.confirmGoingLive !== false ? 'checked' : ''}> Confirm go-live or enable actions</label><label><input type="checkbox" name="confirmDisabling" value="true" ${user.confirmationPreferences?.confirmDisabling !== false ? 'checked' : ''}> Confirm disable actions</label><label><input type="checkbox" name="confirmAdding" value="true" ${user.confirmationPreferences?.confirmAdding !== false ? 'checked' : ''}> Confirm adding destinations or media sources</label><label><input type="checkbox" name="confirmRemoving" value="true" ${user.confirmationPreferences?.confirmRemoving !== false ? 'checked' : ''}> Confirm removing destinations or media sources</label><label>Go-live countdown seconds<input name="countdownSeconds" type="number" min="0" max="30" value="${escapeHtml(user.confirmationPreferences?.countdownSeconds ?? 5)}"></label><button type="submit">Save confirmation settings</button></form></section>
<section><h2>Login recovery</h2><p class="muted">Use a recovery email and a private recovery code so you can reset your password if you forget your login details. Keep the recovery code somewhere only you can access.</p><form method="post" action="/dashboard/recovery-settings"><label><input type="checkbox" name="recoveryEnabled" value="true" ${user.recoveryEnabled ? 'checked' : ''}> Enable self-service password reset</label><label>Recovery email<input name="recoveryEmail" type="email" value="${escapeHtml(user.recoveryEmail || '')}"></label><label>Recovery hint, optional<input name="recoveryHint" value="${escapeHtml(user.recoveryHint || '')}" maxlength="240"></label><label>New recovery code<input name="recoveryCode" type="password" autocomplete="new-password" minlength="8" placeholder="${user.recoveryCodeHash ? 'Leave blank to keep existing code' : 'Set a private code, at least 8 characters'}"></label><button type="submit">Save recovery settings</button></form></section>
<section><h2>Two-factor authentication</h2><p>Status: <strong>${user.totpEnabled ? 'enabled' : 'not enabled'}</strong>.</p>${user.totpPendingSecret ? `<p>Add this setup key to your authenticator app, then enter the current 6 digit code. Setup URI: <code>${escapeHtml(totpUri)}</code></p><form method="post" action="/dashboard/security/totp/confirm"><label>Authentication code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button type="submit">Enable two-factor authentication</button></form>` : user.totpEnabled ? `<form method="post" action="/dashboard/security/totp/disable"><label>Current password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit" class="danger">Disable two-factor authentication</button></form>` : `<form method="post" action="/dashboard/security/totp/setup"><button type="submit">Set up two-factor authentication</button></form>`}</section>
<section><h2>Passkeys</h2><p class="muted">Passkeys can sign in to this account on approved domains for this install: ${escapeHtml(authDomains)}. If an admin adds or changes domains, register a passkey from the new domain as well so your device syncs it under that site.</p><p><button type="button" id="registerPasskey">Add passkey</button></p><p id="passkeyStatus" class="notice" role="status" aria-live="polite"></p><table><tr><th>Name</th><th>Domain</th><th>Created</th><th>Last used</th></tr>${passkeyRows || '<tr><td colspan="4">No passkeys registered yet.</td></tr>'}</table></section>`;
  const mediaTab = `<section><h2>Media management</h2><p>Current source: <strong>${escapeHtml(sourceSummary(selectedSource))}</strong>. Relay process: <strong>${activeSourceRunning ? 'running' : 'stopped'}</strong>.</p>
<form method="post" action="/dashboard/media-settings"><div class="grid"><label><input type="checkbox" name="autoEnableUploads" value="true" ${behavior.autoEnableUploads ? 'checked' : ''}> Auto-enable new uploads</label><label><input type="checkbox" name="autoQueueUploads" value="true" ${behavior.autoQueueUploads ? 'checked' : ''}> Auto-add uploads to queue</label><label><input type="checkbox" name="autoRefreshMedia" value="true" ${behavior.autoRefreshMedia ? 'checked' : ''}> Auto-refresh media list</label><label>Enable delay after upload, seconds<input type="number" min="0" max="86400" name="uploadEnableDelaySeconds" value="${escapeHtml(behavior.uploadEnableDelaySeconds)}"></label><label>Playback action<select name="playbackMode"><option value="loop" ${behavior.playbackMode === 'loop' ? 'selected' : ''}>Auto loop continuously</option><option value="sequential" ${behavior.playbackMode === 'sequential' ? 'selected' : ''}>Play queue in order</option><option value="random" ${behavior.playbackMode === 'random' ? 'selected' : ''}>Random queue playback</option><option value="disabled" ${behavior.playbackMode === 'disabled' ? 'selected' : ''}>Stop or disable source relay</option></select></label><label>Fade in seconds<input type="range" min="0" max="30" step="1" name="fadeInSeconds" value="${escapeHtml(behavior.fadeInSeconds)}"></label><label>Fade out seconds<input type="range" min="0" max="30" step="1" name="fadeOutSeconds" value="${escapeHtml(behavior.fadeOutSeconds)}"></label><label>Crossfade target seconds<input type="range" min="0" max="30" step="1" name="crossfadeSeconds" value="${escapeHtml(behavior.crossfadeSeconds)}"></label></div><button type="submit">Save media settings</button></form>
<section class="subsection"><h3>Quick source setup</h3><div class="preset-grid">${quickSourceCards}</div></section>
<section class="subsection"><h3>Library folders</h3><p class="muted">These are the server folders currently available to this account for live or on-demand playback. The file count only includes supported audio and video formats that AAAStreamer can read.</p><table><tr><th>Library</th><th>Types</th><th>Access</th><th>Usable files</th></tr>${mediaFolderRows}</table></section>
<form method="post" action="/dashboard/sources/select" data-confirm-kind="live" data-confirm-message="Start playing or queue the selected media for this stream?"><input type="hidden" name="sourceType" value="localMedia"><p><button type="button" id="checkAllMedia">Check all media</button><button type="button" id="uncheckAllMedia" class="secondary">Uncheck all media</button></p><table id="mediaCatalog"><tr><th>Select</th><th>Title</th><th>File name</th><th>Folder</th><th>Type</th><th>Duration</th><th>Size</th><th>Chapters</th><th>Use status</th><th>Preview</th></tr>${mediaCatalogCheckboxes(store, user, stream)}</table><p class="muted">Selected media becomes the current source or is added to the playback queue, depending on your media playback settings.</p><button type="submit">Start playing or queue selected media</button></form>
<form method="post" action="/dashboard/sources/upload" data-confirm-kind="add" data-confirm-message="Upload and add the selected media files?"><label>Upload audio or video files<input id="mediaUpload" type="file" accept="audio/*,video/*" multiple></label><input type="hidden" id="mediaUploadData" name="uploadData"><label>Upload title<input name="uploadLabel" placeholder="Intro music, event replay, audio described movie"></label><button type="submit">Upload media</button></form>
<form method="post" action="/dashboard/sources/url" data-confirm-kind="add" data-confirm-message="Add this URL relay source?"><input type="hidden" name="sourceType" value="urlRelay"><label>Relay label<input id="relayLabel" name="relayLabel" placeholder="Radio relay, remote event, training video"></label><label>Media type<select id="relayMediaType" name="relayMediaType"><option value="video">video</option><option value="audio">audio</option></select></label><label>HTTP or HTTPS media URL<input id="relayUrl" name="relayUrl" placeholder="https://example.com/stream.mp3"></label><button type="submit">Add URL relay source</button></form>
<section class="subsection"><h3>Source queue</h3><table><tr><th>Name</th><th>Type</th><th>Source</th><th>Actions</th></tr>${queueRows || '<tr><td colspan="4">No queued sources. Upload or check media to build a playlist.</td></tr>'}</table><form method="post" action="/dashboard/sources/queue/clear" class="inline-form" data-confirm-kind="remove" data-confirm-message="Clear all queued media?"><button type="submit" class="danger">Clear playback queue</button></form><p class="muted">Clears the queued list without deleting uploaded or server media.</p><form method="post" action="/dashboard/sources/action" class="inline-form"><label>Playback action<select name="sourceAction"><option value="start">Start playing selected or queued media now</option><option value="loop">Loop the current source continuously</option><option value="random">Play queued media in random order</option><option value="stop">Stop playback and disable source relay</option></select></label><button type="submit">Apply playback action</button></form><p class="muted">This changes what the stream plays now; media files stay in your library.</p></section>
<table><tr><th>Name</th><th>Type</th><th>URL</th><th>Actions</th></tr>${relayRows || '<tr><td colspan="4">No URL relay sources configured.</td></tr>'}</table></section>`;
  const scheduleTab = `<section><h2>Calendar and scheduled shows</h2><p class="muted">Schedule a live encoder session or pre-created uploaded media. The internal scheduler checks active entries and starts media playback when the show is due.</p><form method="post" action="/dashboard/schedule"><label>Show title<input name="title" required></label><label>Start time<input type="datetime-local" name="startAt" required></label><label>End time<input type="datetime-local" name="endAt"></label><label>Show type<select name="mode"><option value="live">Live stream from encoder</option><option value="media">Pre-created uploaded or server media</option></select></label><label>Media source for pre-created show<select name="sourceId"><option value="">No media source</option>${streamSources(stream).map((source) => `<option value="${escapeHtml(source.id)}">${escapeHtml(sourceSummary(source))}</option>`).join('')}</select></label><label>Description<textarea name="description" rows="4"></textarea></label><button type="submit">Add scheduled show</button></form><table><tr><th>Show</th><th>Start</th><th>Type</th><th>Status</th><th>Actions</th></tr>${scheduleRows || '<tr><td colspan="5">No shows are scheduled yet.</td></tr>'}</table></section>`;
  const profileTab = `<section><h2>Stream profile</h2><form method="post" action="/dashboard/stream"><label>Title<input name="title" value="${escapeHtml(stream.title)}"></label><label>Description<textarea name="description" rows="4">${escapeHtml(stream.description || '')}</textarea></label><label>Links, one per line. Use Label|https://example.com<textarea name="links" rows="4">${escapeHtml(linksText(stream.links))}</textarea></label><label>Optional photo background<input id="backgroundUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><input type="hidden" id="backgroundImageData" name="backgroundImageData"><label><input type="checkbox" name="removeBackground" value="true"> Remove current background</label><label>Visibility<select name="visibility"><option ${stream.visibility === 'public' ? 'selected' : ''}>public</option><option ${stream.visibility === 'unlisted' ? 'selected' : ''}>unlisted</option></select></label><label><input type="checkbox" name="allowComments" value="true" ${stream.allowComments ? 'checked' : ''}> Allow visitor comments</label><button type="submit">Save stream profile</button></form></section>
<section><h2>Extra embedded content</h2><form method="post" action="/dashboard/extra-content"><label><input type="checkbox" name="enabled" value="true" ${stream.extraContent?.enabled ? 'checked' : ''}> Enable extra embedded content</label><label><input type="checkbox" name="showOnWatchPage" value="true" ${stream.extraContent?.showOnWatchPage ? 'checked' : ''}> Show on visitor stream page</label><label>Heading<input name="title" value="${escapeHtml(stream.extraContent?.title || 'Additional content')}"></label><label>Description<textarea name="description" rows="3">${escapeHtml(stream.extraContent?.description || '')}</textarea></label><label>Embed HTML<textarea name="embedHtml" rows="8">${escapeHtml(stream.extraContent?.embedHtml || '')}</textarea></label><button type="submit">Save extra content</button></form>${renderExtraContentBox(stream, 'dashboard')}</section>`;
  const support = effectiveSupportSettings(stream, user, store.settings);
  const supportTab = `<section><h2>Support and payment box</h2><p class="muted">Admin streams use the configured default client when the stream field is blank. Linked user accounts use their stored client ID.</p><form method="post" action="/dashboard/support"><label><input type="checkbox" name="enabled" value="true" ${support.enabled ? 'checked' : ''}> Enable support box for this stream</label><label><input type="checkbox" name="showOnWatchPage" value="true" ${support.showOnWatchPage ? 'checked' : ''}> Show support box on the visitor watch page</label><label>Placement<select name="placement"><option value="before" ${support.placement === 'before' ? 'selected' : ''}>Before stream player</option><option value="during" ${support.placement === 'during' ? 'selected' : ''}>Beside stream player area</option><option value="after" ${!['before', 'during'].includes(support.placement) ? 'selected' : ''}>After comments and stream details</option></select></label><label>Heading<input name="title" value="${escapeHtml(support.title || 'Support this stream')}"></label><label>Description<textarea name="description" rows="3">${escapeHtml(support.description || '')}</textarea></label><label>PayPal URL<input name="paypalUrl" value="${escapeHtml(support.paypalUrl || '')}" placeholder="https://paypal.me/example"></label><label>Stripe payment link<input name="stripeUrl" value="${escapeHtml(support.stripeUrl || '')}" placeholder="https://buy.stripe.com/..."></label><label>Stripe Connect account ID<input name="stripeConnectAccountId" value="${escapeHtml(support.stripeConnectAccountId || '')}" placeholder="acct_..."></label><label>Client ID or client email for invoice payments<input name="whmcsLookup" value="${escapeHtml(support.whmcsClientId || user.whmcsClientId || user.whmcsPortalEmail || '')}" placeholder="${escapeHtml(user.role === 'admin' ? paymentSettings.whmcsDefaultClientId || 'Admin default not set' : user.whmcsClientId || 'Linked client ID or email')}"></label><label>Cash App URL<input name="cashAppUrl" value="${escapeHtml(support.cashAppUrl || '')}" placeholder="https://cash.app/$name"></label><label>Apple Pay or payment URL<input name="applePayUrl" value="${escapeHtml(support.applePayUrl || '')}" placeholder="https://example.com/apple-pay"></label><label>Payment notes<textarea name="paymentNotes" rows="3">${escapeHtml(support.paymentNotes || '')}</textarea></label><label>Payment or donation embed HTML<textarea name="embedHtml" rows="6">${escapeHtml(support.embedHtml || '')}</textarea></label><button type="submit">Save support settings</button></form>${renderSupportBox({ ...stream, support }, 'dashboard')}</section>`;
  const advancedTab = `<section><h2>On-demand display</h2><form method="post" action="/dashboard/sources/ondemand"><label><input type="checkbox" name="enabled" value="true" ${stream.onDemand?.enabled ? 'checked' : ''}> Enable on-demand playback</label><label><input type="checkbox" name="showWhenOffline" value="true" ${stream.onDemand?.showWhenOffline ? 'checked' : ''}> Show to visitors when offline and selected media is available</label><label>On-demand title<input name="title" value="${escapeHtml(stream.onDemand?.title || '')}"></label><button type="submit">Save on-demand settings</button></form></section>`;
  const selectedBody = { overview: overviewTab, media: mediaTab, encoders: encodersTab, destinations: destinationsTab, schedule: scheduleTab, profile: profileTab, support: supportTab, account: accountTab, advanced: advancedTab }[activeTab];
  const body = `<h1>User panel</h1>${reminderHtml}${tabs}${selectedBody}<script>
const copyStatus=document.getElementById('copyStatus');
const confirmationPreferences=${JSON.stringify(user.confirmationPreferences || {})};
function b64uToBuffer(value){const b64=String(value).replace(/-/g,'+').replace(/_/g,'/');const bin=atob(b64.padEnd(Math.ceil(b64.length/4)*4,'='));return Uint8Array.from(bin,c=>c.charCodeAt(0)).buffer;}
function bufferToB64u(buffer){const bytes=new Uint8Array(buffer);let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');}
function publicKeyCreateFromJSON(options){options.challenge=b64uToBuffer(options.challenge);options.user.id=b64uToBuffer(options.user.id);if(options.excludeCredentials){options.excludeCredentials=options.excludeCredentials.map(c=>({...c,id:b64uToBuffer(c.id)}));}return options;}
function attestationToJSON(credential){return {id:credential.id,rawId:bufferToB64u(credential.rawId),type:credential.type,response:{attestationObject:bufferToB64u(credential.response.attestationObject),clientDataJSON:bufferToB64u(credential.response.clientDataJSON),transports:credential.response.getTransports?credential.response.getTransports():[]},clientExtensionResults:credential.getClientExtensionResults?credential.getClientExtensionResults():{}};}
function setCopyStatus(message){if(copyStatus) copyStatus.textContent=message;}
function shouldConfirm(kind){if(confirmationPreferences.enabled===false)return false;if(kind==='add')return confirmationPreferences.confirmAdding!==false;if(kind==='remove')return confirmationPreferences.confirmRemoving!==false;if(kind==='live')return confirmationPreferences.confirmGoingLive!==false;if(kind==='disable')return confirmationPreferences.confirmDisabling!==false;return true;}
function actionKindForForm(form){const explicit=form.dataset.confirmKind;if(explicit)return explicit;const bulk=form.querySelector('[name="bulkAction"]')?.value||'';if(bulk.includes('enable'))return 'live';if(bulk.includes('disable'))return 'disable';const sourceAction=form.querySelector('[name="sourceAction"]')?.value||'';if(['start','loop','random'].includes(sourceAction))return 'live';if(sourceAction==='stop')return 'disable';return '';}
function actionMessageForForm(form,kind){return form.dataset.confirmMessage|| (kind==='live'?'Enable selected destinations or go live with the current choices?':kind==='disable'?'Disable selected destinations or streaming choices?':kind==='remove'?'Remove this item?':'Apply this stream change?');}
async function confirmAction(form){const kind=actionKindForForm(form);if(!kind||!shouldConfirm(kind))return true;const message=actionMessageForForm(form,kind);if(!confirm(message))return false;const seconds=Math.max(0,Number(confirmationPreferences.countdownSeconds||0));if(kind==='live'&&seconds>0){let cancelled=false;const cancel=(event)=>{if(event.key==='Escape')cancelled=true;};document.addEventListener('keydown',cancel);for(let remaining=seconds;remaining>0;remaining--){if(cancelled){document.removeEventListener('keydown',cancel);setCopyStatus('Go-live action cancelled.');return false;}setCopyStatus('Going live in '+remaining+' seconds. Press Escape to cancel.');await new Promise(resolve=>setTimeout(resolve,1000));}document.removeEventListener('keydown',cancel);setCopyStatus('Starting live action now.');}return true;}
document.addEventListener('submit',async(event)=>{const form=event.target.closest('form');if(!form||form.dataset.confirmBound==='done')return;const kind=actionKindForForm(form);if(!kind)return;event.preventDefault();const ok=await confirmAction(form);if(ok){form.dataset.confirmBound='done';form.submit();}});
async function copyText(value,label){
  if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(value);}
  else{const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-9999px';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
  setCopyStatus(label+' copied.');
}
document.querySelectorAll('[data-copy-target]').forEach((button)=>button.addEventListener('click',async()=>{const field=document.getElementById(button.dataset.copyTarget);try{await copyText(field.value,button.textContent.replace(/^Copy /,''));}catch{setCopyStatus('Copy failed. Select the field and copy it manually.');}}));
const shareStream=document.getElementById('shareStream');
if(shareStream){shareStream.addEventListener('click',async()=>{const url=document.getElementById('watchUrl').value;const title=${JSON.stringify(stream.title)};try{if(navigator.share){await navigator.share({title,url});setCopyStatus('Share sheet opened.');}else{await copyText(url,'Stream link');}}catch(error){if(error && error.name==='AbortError')return;try{await copyText(url,'Stream link');}catch{setCopyStatus('Sharing failed. Select the watch page field and copy it manually.');}}});}
const passkeyStatus=document.getElementById('passkeyStatus');
const registerPasskey=document.getElementById('registerPasskey');
if(registerPasskey){registerPasskey.addEventListener('click',async()=>{try{if(!window.PublicKeyCredential)throw new Error('This browser does not support passkeys.');const optionsResponse=await fetch('/api/passkeys/register/options',{method:'POST'});const options=await optionsResponse.json();if(!optionsResponse.ok)throw new Error(options.error||'Could not start passkey registration.');const credential=await navigator.credentials.create({publicKey:publicKeyCreateFromJSON(options)});const verifyResponse=await fetch('/api/passkeys/register/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(attestationToJSON(credential))});const result=await verifyResponse.json();if(!verifyResponse.ok||!result.success)throw new Error(result.error||'Passkey registration failed.');passkeyStatus.textContent='Passkey added. Reloading account details.';setTimeout(()=>location.href='/dashboard?tab=account',700);}catch(error){passkeyStatus.textContent=error.message||'Passkey registration failed.';}});}
const platformPreset=document.getElementById('platformPreset');
const destinationRtmpUrl=document.getElementById('destinationRtmpUrl');
const destinationConnectLink=document.getElementById('destinationConnectLink');
const destinationServices=document.getElementById('destinationServices');
if(platformPreset){platformPreset.addEventListener('change',()=>{const option=platformPreset.selectedOptions[0];if(option && !destinationRtmpUrl.value){destinationRtmpUrl.value=option.dataset.ingest||'';} if(destinationConnectLink){const connect=option?.dataset.connect||'';destinationConnectLink.href=connect||'#';destinationConnectLink.style.display=connect?'inline-block':'none';destinationConnectLink.textContent=connect?'Open '+option.textContent+' setup':'Manual setup only';} if(destinationServices){destinationServices.textContent=option?.dataset.services?'Supported through this service: '+option.dataset.services:'Manual RTMP destination.';}});platformPreset.dispatchEvent(new Event('change'));}
const relayLabel=document.getElementById('relayLabel');
const relayMediaType=document.getElementById('relayMediaType');
const relayUrl=document.getElementById('relayUrl');
document.querySelectorAll('[data-source-preset]').forEach((button)=>button.addEventListener('click',()=>{
  if(relayLabel) relayLabel.value=button.dataset.sourceLabel||'Remote source';
  if(relayMediaType) relayMediaType.value=button.dataset.sourceMediaType||'video';
  if(relayUrl){
    relayUrl.placeholder=button.dataset.sourcePlaceholder||'https://example.com/stream';
    relayUrl.focus();
  }
  setCopyStatus((button.textContent||'Source preset')+' selected. Enter or paste the media URL, then choose Add URL relay source.');
}));
const backgroundUpload=document.getElementById('backgroundUpload');
const backgroundImageData=document.getElementById('backgroundImageData');
if(backgroundUpload){backgroundUpload.addEventListener('change',()=>{const file=backgroundUpload.files&&backgroundUpload.files[0];if(!file)return;if(file.size>700000){setCopyStatus('Background image is too large. Use an image under 700 KB.');backgroundUpload.value='';return;}const reader=new FileReader();reader.onload=()=>{backgroundImageData.value=String(reader.result||'');setCopyStatus('Background image ready to save.');};reader.readAsDataURL(file);});}
const checkAllMedia=document.getElementById('checkAllMedia');
const uncheckAllMedia=document.getElementById('uncheckAllMedia');
function setMediaChecks(checked){document.querySelectorAll('#mediaCatalog input[type="checkbox"]').forEach((box)=>{box.checked=checked;});}
if(checkAllMedia) checkAllMedia.addEventListener('click',()=>setMediaChecks(true));
if(uncheckAllMedia) uncheckAllMedia.addEventListener('click',()=>setMediaChecks(false));
const mediaUpload=document.getElementById('mediaUpload');
const mediaUploadData=document.getElementById('mediaUploadData');
if(mediaUpload){mediaUpload.addEventListener('change',async()=>{const files=Array.from(mediaUpload.files||[]);if(!files.length)return;if(files.length>${JSON.stringify(maxBulkUploads)}){setCopyStatus('Select no more than ${maxBulkUploads} files at once.');mediaUpload.value='';mediaUploadData.value='';return;}const tooLarge=files.find((file)=>file.size>${JSON.stringify(maxUploadBytes)});if(tooLarge){setCopyStatus(tooLarge.name+' is too large for this server upload limit.');mediaUpload.value='';mediaUploadData.value='';return;}const readFile=(file)=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,data:String(reader.result||'')});reader.onerror=()=>reject(reader.error||new Error('Read failed'));reader.readAsDataURL(file);});try{const uploads=await Promise.all(files.map(readFile));mediaUploadData.value=JSON.stringify(uploads);setCopyStatus(files.length===1?'Media upload ready to submit.':files.length+' media files ready to upload and queue.');}catch{setCopyStatus('Media file could not be read. Choose the file again.');mediaUpload.value='';mediaUploadData.value='';}});}
${behavior.autoRefreshMedia && activeTab === 'media' ? `let mediaCount=document.querySelectorAll('#mediaCatalog input[type="checkbox"]').length;setInterval(async()=>{try{const response=await fetch('/api/media/catalog');const payload=await response.json();const nextCount=(payload.folders||[]).reduce((total,folder)=>total+(folder.files||[]).length,0);if(nextCount!==mediaCount) location.reload();}catch{}},30000);` : ''}
</script>`;
  res.send(page('Dashboard', body, user));
});

app.post('/dashboard/stream', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user, req.body);
  stream.title = req.body.title || stream.title;
  stream.slug = slugify(stream.title);
  stream.description = req.body.description || '';
  stream.links = parseLinks(req.body.links);
  if (req.body.removeBackground === 'true') {
    stream.backgroundImage = '';
  } else if (String(req.body.backgroundImageData || '').startsWith('data:image/') && String(req.body.backgroundImageData).length < 950000) {
    stream.backgroundImage = String(req.body.backgroundImageData);
  }
  stream.visibility = req.body.visibility === 'unlisted' ? 'unlisted' : 'public';
  stream.allowComments = req.body.allowComments === 'true';
  stream.updatedAt = nowIso();
  writeStore(store);
  res.redirect('/dashboard?tab=profile');
});

app.post('/dashboard/encoders', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const encoder = {
    id: id('enc'),
    name: String(req.body.name || 'Additional encoder').trim().slice(0, 80) || 'Additional encoder',
    key: id('sk'),
    audioBitrate: audioBitrates.includes(req.body.audioBitrate) ? req.body.audioBitrate : stream.encoderSettings.audioBitrate,
    audioChannels: 'stereo',
    sampleRate: stream.encoderSettings.sampleRate,
    active: true,
    createdAt: nowIso()
  };
  stream.encoderKeys.push(encoder);
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'encoder_key_created', payload: { streamId: stream.id, encoderId: encoder.id, name: encoder.name }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=encoders');
});

app.post('/dashboard/destinations', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const preset = platformPresets.find((item) => item.id === req.body.platform) || platformPresets.at(-1);
  const rtmpUrl = String(req.body.rtmpUrl || preset.ingest || '').trim();
  if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
    res.status(400).send(page('Destination not saved', '<h1>Destination not saved</h1><p>Use an RTMP or RTMPS destination URL.</p><a class="button" href="/dashboard?tab=destinations">Back to destinations</a>', req.user));
    return;
  }
  stream.destinations.push({
    id: id('dst'),
    platform: preset.name,
    name: String(req.body.name || preset.name).trim().slice(0, 100) || preset.name,
    rtmpUrl,
    streamKey: String(req.body.streamKey || '').trim(),
    connectUrl: preset.connectUrl || preset.url || '',
    services: preset.services || [],
    connected: false,
    enabled: req.body.enabled === 'true',
    createdAt: nowIso()
  });
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'destination_added', payload: { streamId: stream.id, platform: preset.name }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=destinations');
});

app.post('/dashboard/destinations/enabled', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream) {
    const bulkAction = String(req.body.bulkAction || 'enable-selected');
    const selectedIds = new Set(bodyValues(req.body.destinationIds));
    for (const destination of stream.destinations || []) {
      if (bulkAction === 'enable-all') destination.enabled = true;
      else if (bulkAction === 'disable-all') destination.enabled = false;
      else if (bulkAction === 'enable-selected' && selectedIds.has(destination.id)) destination.enabled = true;
      else if (bulkAction === 'disable-selected' && selectedIds.has(destination.id)) destination.enabled = false;
    }
    stream.updatedAt = nowIso();
    const enabledCount = (stream.destinations || []).filter((destination) => destination.enabled).length;
    store.events.push({ id: id('evt'), type: 'destination_enabled_state_updated', payload: { streamId: stream.id, action: bulkAction, selectedCount: selectedIds.size, enabledCount }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=destinations');
});

app.post('/dashboard/destinations/:destinationId/delete', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream) {
    stream.destinations = (stream.destinations || []).filter((destination) => destination.id !== req.params.destinationId);
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'destination_removed', payload: { streamId: stream.id, destinationId: req.params.destinationId }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=destinations');
});

app.post('/dashboard/sources/select', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const sources = bodyValues(req.body.localMedia)
    .map((localMedia) => sourceFromRequest({ ...req, body: { ...req.body, localMedia, sourceType: 'localMedia' } }, store, req.user))
    .filter(Boolean);
  if (!sources.length) {
    res.status(400).send(page('Source not saved', '<h1>Source not saved</h1><p>Select a valid media file from an enabled folder.</p><a class="button" href="/dashboard?tab=media">Back to media management</a>', req.user));
    return;
  }
  stream.sourceMode = 'media';
  stream.currentSource = sources[0];
  addSourcesToQueue(stream, sources.slice(1));
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_source_selected', payload: { streamId: stream.id, sourceType: sources[0].type, label: sources[0].label, queued: Math.max(0, sources.length - 1) }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/url', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const source = sourceFromRequest({ ...req, body: { ...req.body, sourceType: 'urlRelay' } }, store, req.user);
  if (!source) {
    res.status(400).send(page('Relay source not saved', '<h1>Relay source not saved</h1><p>Use a valid HTTP or HTTPS media URL. URL relay must also be enabled by an admin.</p><a class="button" href="/dashboard?tab=media">Back to media management</a>', req.user));
    return;
  }
  stream.sourceMode = 'url';
  stream.currentSource = source;
  stream.relaySources = [source, ...(stream.relaySources || []).filter((item) => item.url !== source.url)].slice(0, 20);
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'url_relay_source_added', payload: { streamId: stream.id, label: source.label }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/upload', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  try {
    const sources = saveUploadedMediaBatch(store, user, stream, req.body);
    const behavior = normalizeStreamMediaBehavior(stream.mediaBehavior);
    const enableAt = behavior.uploadEnableDelaySeconds > 0
      ? new Date(Date.now() + behavior.uploadEnableDelaySeconds * 1000).toISOString()
      : '';
    for (const source of sources) {
      source.enabled = behavior.autoEnableUploads;
      source.enableAt = enableAt;
      source.autoEnabled = behavior.autoEnableUploads;
    }
    const source = sources[0];
    stream.sourceMode = 'media';
    if (!stream.currentSource || behavior.autoQueueUploads) {
      stream.currentSource ||= source;
      addSourcesToQueue(stream, stream.currentSource?.id === source.id ? sources.slice(1) : sources);
    }
    stream.onDemand = { ...stream.onDemand, enabled: true, showWhenOffline: true };
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'media_uploaded', payload: { streamId: stream.id, label: source.label, mediaType: source.mediaType, count: sources.length, queued: Math.max(0, sources.length - 1) }, createdAt: nowIso() });
    writeStore(store);
  } catch (error) {
    res.status(400).send(page('Media upload failed', `<h1>Media upload failed</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/dashboard?tab=media">Back to media management</a>`, req.user));
    return;
  }
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/queue/clear', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream) {
    stream.sourceQueue = [];
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'source_queue_cleared', payload: { streamId: stream.id }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/queue/:sourceId/select', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream) {
    const index = (stream.sourceQueue || []).findIndex((source) => source.id === req.params.sourceId);
    if (index >= 0) {
      const [source] = stream.sourceQueue.splice(index, 1);
      const previousSource = stream.currentSource;
      stream.currentSource = source;
      addSourcesToQueue(stream, [previousSource]);
      stream.sourceMode = source.type === 'urlRelay' ? 'url' : 'media';
      stream.updatedAt = nowIso();
      store.events.push({ id: id('evt'), type: 'source_queue_selected', payload: { streamId: stream.id, sourceId: source.id, label: source.label }, createdAt: nowIso() });
      writeStore(store);
      if (sourceProcesses.has(stream.id)) {
        try {
          startSourceProcess(stream, source, store);
        } catch (error) {
          appendEvent('source_relay_queue_error', { streamId: stream.id, message: error.message });
        }
      }
    }
  }
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/queue/:sourceId/remove', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream && removeQueuedSource(stream, req.params.sourceId)) {
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'source_queue_removed', payload: { streamId: stream.id, sourceId: req.params.sourceId }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/:sourceId/select', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  const source = stream?.relaySources?.find((item) => item.id === req.params.sourceId);
  if (stream && source) {
    const previousSource = stream.currentSource;
    stream.sourceMode = 'url';
    stream.currentSource = source;
    addSourcesToQueue(stream, [previousSource]);
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'url_relay_source_selected', payload: { streamId: stream.id, sourceId: source.id }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/:sourceId/delete', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream) {
    stream.relaySources = (stream.relaySources || []).filter((item) => item.id !== req.params.sourceId);
    stream.sourceQueue = (stream.sourceQueue || []).filter((item) => item.id !== req.params.sourceId);
    if (stream.currentSource?.id === req.params.sourceId) stream.currentSource = null;
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'url_relay_source_removed', payload: { streamId: stream.id, sourceId: req.params.sourceId }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/ondemand', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  stream.onDemand = {
    enabled: req.body.enabled === 'true',
    showWhenOffline: req.body.showWhenOffline === 'true',
    title: String(req.body.title || '').trim().slice(0, 160)
  };
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'ondemand_settings_updated', payload: { streamId: stream.id, onDemand: stream.onDemand }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/start', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const source = firstPlayableSource(stream, store);
  if (!source || !playableSourceUrl(source, store)) {
    res.status(400).send(page('Source relay not started', '<h1>Source relay not started</h1><p>Select a valid server media file or URL relay source first.</p><a class="button" href="/dashboard">Back to dashboard</a>', req.user));
    return;
  }
  if (stream.currentSource?.id !== source.id) {
    const previousSource = stream.currentSource;
    removeQueuedSource(stream, source.id);
    stream.currentSource = source;
    addSourcesToQueue(stream, [previousSource]);
    stream.sourceMode = source.type === 'urlRelay' ? 'url' : 'media';
  }
  try {
    startSourceProcess(stream, source, store);
  } catch (error) {
    res.status(500).send(page('Source relay not started', `<h1>Source relay not started</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/dashboard?tab=media">Back to media management</a>`, req.user));
    return;
  }
  store.events.push({ id: id('evt'), type: 'source_relay_started', payload: { streamId: stream.id, sourceType: source.type, label: source.label }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/stop', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream) {
    const stopped = stopSourceProcess(stream.id);
    store.events.push({ id: id('evt'), type: 'source_relay_stopped', payload: { streamId: stream.id, stopped }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/sources/action', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const sourceAction = String(req.body.sourceAction || '').trim();
  if (sourceAction === 'stop' || sourceAction === 'disable') {
    const stopped = stopSourceProcess(stream.id);
    stream.mediaBehavior = normalizeStreamMediaBehavior({ ...stream.mediaBehavior, playbackMode: 'disabled', continuousPlayback: false });
    store.events.push({ id: id('evt'), type: 'source_relay_stopped', payload: { streamId: stream.id, stopped, sourceAction }, createdAt: nowIso() });
    writeStore(store);
    res.redirect('/dashboard?tab=media');
    return;
  }
  if (sourceAction === 'random') {
    stream.sourceQueue = (stream.sourceQueue || []).sort(() => Math.random() - 0.5);
    stream.mediaBehavior = normalizeStreamMediaBehavior({ ...stream.mediaBehavior, playbackMode: 'random', continuousPlayback: true });
  } else if (sourceAction === 'loop') {
    stream.mediaBehavior = normalizeStreamMediaBehavior({ ...stream.mediaBehavior, playbackMode: 'loop', continuousPlayback: true });
  } else {
    stream.mediaBehavior = normalizeStreamMediaBehavior({ ...stream.mediaBehavior, playbackMode: 'sequential', continuousPlayback: true });
  }
  const source = firstPlayableSource(stream, store);
  if (!source || !playableSourceUrl(source, store)) {
    res.status(400).send(page('Source relay not started', '<h1>Source relay not started</h1><p>Select a valid server media file or URL relay source first.</p><a class="button" href="/dashboard?tab=media">Back to media management</a>', req.user));
    return;
  }
  if (stream.currentSource?.id !== source.id) {
    const previousSource = stream.currentSource;
    removeQueuedSource(stream, source.id);
    stream.currentSource = source;
    addSourcesToQueue(stream, [previousSource]);
    stream.sourceMode = source.type === 'urlRelay' ? 'url' : 'media';
  }
  try {
    startSourceProcess(stream, source, store);
  } catch (error) {
    res.status(500).send(page('Source relay not started', `<h1>Source relay not started</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/dashboard?tab=media">Back to media management</a>`, req.user));
    return;
  }
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'source_relay_action_started', payload: { streamId: stream.id, sourceAction, sourceType: source.type, label: source.label }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/latency', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const mode = ['low', 'balanced', 'stable'].includes(req.body.mode) ? req.body.mode : 'low';
  stream.latencySettings = {
    mode,
    targetLatencySeconds: clampNumber(req.body.targetLatencySeconds, 2, 30, mode === 'stable' ? 12 : mode === 'balanced' ? 6 : 4),
    playerBufferSeconds: clampNumber(req.body.playerBufferSeconds, 4, 60, mode === 'stable' ? 18 : mode === 'balanced' ? 10 : 8),
    reconnectBufferSeconds: clampNumber(req.body.reconnectBufferSeconds, 4, 120, 10)
  };
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_latency_updated', payload: { streamId: stream.id, latencySettings: stream.latencySettings }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=encoders');
});

app.post('/dashboard/encoder-settings', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  stream.encoderSettings = {
    ...defaultEncoderSettings(),
    ...(stream.encoderSettings || {}),
    videoBitrate: String(req.body.videoBitrate || stream.encoderSettings?.videoBitrate || '4500k').trim().slice(0, 20),
    audioBitrate: audioBitrates.includes(req.body.audioBitrate) ? req.body.audioBitrate : stream.encoderSettings?.audioBitrate || '160k',
    audioChannels: 'stereo',
    sampleRate: req.body.sampleRate === '44100' ? '44100' : '48000',
    keyframeIntervalSeconds: clampNumber(req.body.keyframeIntervalSeconds, 1, 10, 2),
    hlsSegmentDurationMs: clampNumber(req.body.hlsSegmentDurationMs, 1000, 6000, 2000),
    hlsPartDurationMs: clampNumber(req.body.hlsPartDurationMs, 100, 1000, 200),
    hlsSegmentCount: clampNumber(req.body.hlsSegmentCount, 8, 24, 12)
  };
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_encoder_settings_updated', payload: { streamId: stream.id, encoderSettings: stream.encoderSettings }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=encoders');
});

app.post('/dashboard/support', requireUser, async (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const existingSupport = { ...defaultSupportSettings(), ...(stream.support || {}) };
  const paymentSettings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
  const lookup = String(req.body.whmcsLookup || '').trim();
  const linkedWhmcs = await lookupWhmcsClient(paymentSettings, {
    clientId: /^\d+$/.test(lookup) ? lookup : '',
    email: lookup.includes('@') ? lookup : ''
  });
  stream.support = {
    enabled: req.body.enabled === 'true',
    showOnWatchPage: req.body.showOnWatchPage === 'true',
    placement: ['before', 'during', 'after'].includes(req.body.placement) ? req.body.placement : 'after',
    title: String(req.body.title || 'Support this stream').trim().slice(0, 120) || 'Support this stream',
    description: String(req.body.description || '').trim().slice(0, 1000),
    embedHtml: sanitizeSupportEmbed(req.body.embedHtml),
    platformShareEnabled: existingSupport.platformShareEnabled,
    platformSharePercent: existingSupport.platformSharePercent,
    platformPaymentTitle: existingSupport.platformPaymentTitle,
    platformPaymentDescription: existingSupport.platformPaymentDescription,
    platformPaymentEmbedHtml: existingSupport.platformPaymentEmbedHtml,
    paypalUrl: safeUrl(req.body.paypalUrl),
    stripeUrl: safeUrl(req.body.stripeUrl),
    cashAppUrl: safeUrl(req.body.cashAppUrl),
    applePayUrl: safeUrl(req.body.applePayUrl),
    stripeConnectAccountId: String(req.body.stripeConnectAccountId || '').trim().slice(0, 120),
    whmcsClientId: linkedWhmcs?.clientId || (/^\d+$/.test(lookup) ? lookup.replace(/[^0-9]/g, '').slice(0, 20) : existingSupport.whmcsClientId || ''),
    paymentNotes: String(req.body.paymentNotes || '').trim().slice(0, 1000)
  };
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_support_updated', payload: { streamId: stream.id, enabled: stream.support.enabled, showOnWatchPage: stream.support.showOnWatchPage }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=support');
});

app.post('/dashboard/account', requireUser, async (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  if (user) {
    const paymentSettings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
    const lookup = String(req.body.whmcsLookup || '').trim();
    const linkedWhmcs = await lookupWhmcsClient(paymentSettings, {
      clientId: /^\d+$/.test(lookup) ? lookup : '',
      email: lookup.includes('@') ? lookup : ''
    });
    user.displayName = String(req.body.displayName || user.username).trim().slice(0, 80) || user.username;
    user.whmcsPortalEmail = linkedWhmcs?.email || (lookup.includes('@') ? lookup.slice(0, 180) : user.whmcsPortalEmail || '');
    user.whmcsClientId = linkedWhmcs?.clientId || (/^\d+$/.test(lookup) ? lookup.replace(/[^0-9]/g, '').slice(0, 20) : user.whmcsClientId || '');
    user.whmcsLinkedAt = linkedWhmcs ? nowIso() : user.whmcsLinkedAt || '';
    user.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'account_details_updated', payload: { username: user.username, whmcsLinked: Boolean(linkedWhmcs) }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=account');
});

app.post('/dashboard/recovery-settings', requireUser, (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  if (user) {
    user.recoveryEnabled = req.body.recoveryEnabled === 'true';
    user.recoveryEmail = String(req.body.recoveryEmail || '').trim().slice(0, 180);
    user.notificationEmail = user.recoveryEmail || user.notificationEmail || '';
    user.recoveryHint = String(req.body.recoveryHint || '').trim().slice(0, 240);
    const recoveryCode = String(req.body.recoveryCode || '');
    if (recoveryCode) {
      if (recoveryCode.length < 8) {
        res.status(400).send(page('Recovery settings not saved', '<h1>Recovery settings not saved</h1><p>Recovery codes must be at least 8 characters.</p><p><a class="button" href="/dashboard?tab=account">Back to account</a></p>', req.user));
        return;
      }
      user.recoveryCodeHash = hashPassword(recoveryCode);
    }
    user.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'recovery_settings_updated', payload: { username: user.username, enabled: user.recoveryEnabled }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=account');
});

app.post('/dashboard/notification-settings', requireUser, (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  if (user) {
    user.notificationEmail = String(req.body.notificationEmail || '').trim().slice(0, 180);
    user.notificationEmailReminder = {
      enabled: req.body.reminderEnabled === 'true',
      everyLogins: clampNumber(req.body.everyLogins, 1, 30, 3),
      everyDays: clampNumber(req.body.everyDays, 1, 180, 14),
      loginCount: Number(user.notificationEmailReminder?.loginCount || 0),
      lastShownAt: nowIso()
    };
    user.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'notification_settings_updated', payload: { username: user.username, hasEmail: Boolean(user.notificationEmail) }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=account');
});

app.post('/dashboard/confirmation-settings', requireUser, (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  if (user) {
    user.confirmationPreferences = {
      enabled: req.body.enabled === 'true',
      countdownSeconds: clampNumber(req.body.countdownSeconds, 0, 30, 5),
      confirmAdding: req.body.confirmAdding === 'true',
      confirmRemoving: req.body.confirmRemoving === 'true',
      confirmGoingLive: req.body.confirmGoingLive === 'true',
      confirmDisabling: req.body.confirmDisabling === 'true'
    };
    user.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'confirmation_settings_updated', payload: { username: user.username, enabled: user.confirmationPreferences.enabled, countdownSeconds: user.confirmationPreferences.countdownSeconds }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=account');
});

app.post('/dashboard/security/totp/setup', requireUser, (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  if (!user) {
    res.redirect('/login');
    return;
  }
  user.totpPendingSecret = generateTotpSecret();
  user.updatedAt = nowIso();
  writeStore(store);
  res.redirect('/dashboard?tab=account');
});

app.post('/dashboard/security/totp/confirm', requireUser, (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  if (!user?.totpPendingSecret || !verifyTotp(user.totpPendingSecret, req.body.code)) {
    res.status(400).send(page('Two-factor setup failed', '<h1>Two-factor setup failed</h1><p>The code was not accepted.</p><p><a class="button" href="/dashboard?tab=account">Back to account</a></p>', req.user));
    return;
  }
  user.totpSecret = user.totpPendingSecret;
  user.totpPendingSecret = '';
  user.totpEnabled = true;
  user.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'totp_enabled', payload: { username: user.username }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=account');
});

app.post('/dashboard/security/totp/disable', requireUser, (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  if (user && verifyPassword(req.body.password || '', user.passwordHash)) {
    user.totpEnabled = false;
    user.totpSecret = '';
    user.totpPendingSecret = '';
    user.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'totp_disabled', payload: { username: user.username }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=account');
});

app.post('/api/passkeys/register/options', requireUser, async (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  const { rpID } = passkeyContext(req);
  const options = await generateRegistrationOptions({
    rpName: store.settings.platformBranding?.platformName || store.settings.siteName || 'AAAStreamer',
    rpID,
    userName: user.username,
    userID: Buffer.from(user.id),
    userDisplayName: user.displayName || user.username,
    attestationType: 'none',
    excludeCredentials: (user.passkeys || []).filter((item) => item.rpID === rpID).map((item) => ({ id: item.id, transports: item.transports || [] })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
  });
  store.passkeyChallenges.push({ id: id('pkc'), type: 'registration', userId: user.id, challenge: options.challenge, rpID, createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 5).toISOString() });
  writeStore(store);
  res.json(options);
});

app.post('/api/passkeys/register/verify', requireUser, async (req, res) => {
  const store = readStore();
  const user = userById(store, req.user.id);
  const { rpID } = passkeyContext(req);
  const challenge = [...(store.passkeyChallenges || [])].reverse().find((item) => item.type === 'registration' && item.userId === user.id && item.rpID === rpID);
  if (!challenge) {
    res.status(400).json({ success: false, error: 'Passkey registration expired. Try again.' });
    return;
  }
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: configuredOrigins(store, req),
      expectedRPID: configuredAuthDomains(store, req),
      requireUserVerification: false
    });
    if (!verification.verified) throw new Error('Passkey was not verified.');
    const credential = verification.registrationInfo.credential;
    user.passkeys = (user.passkeys || []).filter((item) => item.id !== credential.id);
    user.passkeys.push({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: req.body.response?.transports || [],
      credentialDeviceType: verification.registrationInfo.credentialDeviceType,
      credentialBackedUp: verification.registrationInfo.credentialBackedUp,
      rpID: verification.registrationInfo.rpID || rpID,
      name: `Passkey ${new Date().toLocaleDateString('en-US')}`,
      createdAt: nowIso(),
      lastUsedAt: ''
    });
    store.passkeyChallenges = (store.passkeyChallenges || []).filter((item) => item.id !== challenge.id);
    user.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'passkey_registered', payload: { username: user.username, rpID }, createdAt: nowIso() });
    writeStore(store);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Passkey registration failed.' });
  }
});

app.post('/api/passkeys/authenticate/options', async (req, res) => {
  const store = readStore();
  const user = userByLogin(store, req.body.username);
  if (!user || !user.active || !(user.passkeys || []).length) {
    res.status(404).json({ success: false, error: 'No passkeys are registered for that account.' });
    return;
  }
  const domains = configuredAuthDomains(store, req);
  const options = await generateAuthenticationOptions({
    rpID: passkeyContext(req).rpID,
    allowCredentials: (user.passkeys || []).filter((item) => domains.includes(item.rpID)).map((item) => ({ id: item.id, transports: item.transports || [] })),
    userVerification: 'preferred'
  });
  store.passkeyChallenges.push({ id: id('pkc'), type: 'authentication', userId: user.id, challenge: options.challenge, createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 5).toISOString() });
  writeStore(store);
  res.json(options);
});

app.post('/api/passkeys/authenticate/verify', async (req, res) => {
  const store = readStore();
  const credentialId = req.body?.id;
  const user = store.users.find((item) => (item.passkeys || []).some((passkey) => passkey.id === credentialId));
  const passkey = user?.passkeys?.find((item) => item.id === credentialId);
  const challenge = user ? [...(store.passkeyChallenges || [])].reverse().find((item) => item.type === 'authentication' && item.userId === user.id) : null;
  if (!user || !passkey || !challenge) {
    res.status(400).json({ success: false, error: 'Passkey login expired. Try again.' });
    return;
  }
  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challenge.challenge,
      expectedOrigin: configuredOrigins(store, req),
      expectedRPID: configuredAuthDomains(store, req),
      credential: passkeyCredentialForVerify(passkey),
      requireUserVerification: false
    });
    if (!verification.verified) throw new Error('Passkey was not verified.');
    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.lastUsedAt = nowIso();
    user.notificationEmailReminder ||= { enabled: true, everyLogins: 3, everyDays: 14, loginCount: 0, lastShownAt: '' };
    user.notificationEmailReminder.loginCount = Number(user.notificationEmailReminder.loginCount || 0) + 1;
    user.updatedAt = nowIso();
    store.passkeyChallenges = (store.passkeyChallenges || []).filter((item) => item.id !== challenge.id);
    store.events.push({ id: id('evt'), type: 'passkey_login', payload: { username: user.username }, createdAt: nowIso() });
    createLoginSession(store, user, res);
    res.json({ success: true, redirect: '/dashboard' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Passkey login failed.' });
  }
});

app.post('/dashboard/media-settings', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  stream.mediaBehavior = normalizeStreamMediaBehavior({
    autoEnableUploads: req.body.autoEnableUploads === 'true',
    autoQueueUploads: req.body.autoQueueUploads === 'true',
    autoRefreshMedia: req.body.autoRefreshMedia === 'true',
    uploadEnableDelaySeconds: req.body.uploadEnableDelaySeconds,
    playbackMode: req.body.playbackMode,
    continuousPlayback: req.body.playbackMode !== 'disabled',
    fadeInSeconds: req.body.fadeInSeconds,
    fadeOutSeconds: req.body.fadeOutSeconds,
    crossfadeSeconds: req.body.crossfadeSeconds
  });
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_media_settings_updated', payload: { streamId: stream.id, mediaBehavior: stream.mediaBehavior }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=media');
});

app.post('/dashboard/share/mastodon', requireUser, async (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const link = ensureShareLink(store, stream, user.id);
  const shareUrl = tokenUrlFor(link.token);
  const social = store.settings.social || defaultSocialSettings();
  const rawStatus = String(req.body.status || '').trim();
  const status = (rawStatus || `${stream.title}\n${shareUrl}`).includes(shareUrl)
    ? rawStatus || `${stream.title}\n${shareUrl}`
    : `${rawStatus}\n${shareUrl}`;
  try {
    const result = await postMastodonStatus(social, status.slice(0, 480));
    store.events.push({ id: id('evt'), type: 'mastodon_stream_shared', payload: { streamId: stream.id, statusUrl: result.url || null, instance: social.mastodonInstanceUrl }, createdAt: nowIso() });
    writeStore(store);
    res.redirect('/dashboard');
  } catch (error) {
    store.events.push({ id: id('evt'), type: 'mastodon_stream_share_failed', payload: { streamId: stream.id, message: error.message }, createdAt: nowIso() });
    writeStore(store);
    res.status(502).send(page('Mastodon share failed', `<h1>Mastodon share failed</h1><p>${escapeHtml(error.message)}</p><p><a class="button" href="/dashboard">Back to dashboard</a></p>`, req.user));
  }
});

app.post('/dashboard/schedule', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const startAt = isoFromDatetimeLocal(req.body.startAt);
  if (!startAt) {
    res.status(400).send(page('Schedule not saved', '<h1>Schedule not saved</h1><p>Choose a valid start time.</p><a class="button" href="/dashboard?tab=schedule">Back to calendar</a>', req.user));
    return;
  }
  const mode = req.body.mode === 'media' ? 'media' : 'live';
  const source = mode === 'media' ? sourceByIdOrKey(stream, store, req.body.sourceId) : null;
  if (mode === 'media' && !source) {
    res.status(400).send(page('Schedule not saved', '<h1>Schedule not saved</h1><p>Choose a media source for a pre-created show.</p><a class="button" href="/dashboard?tab=schedule">Back to calendar</a>', req.user));
    return;
  }
  const accessLevel = ['public', 'members'].includes(req.body.accessLevel) ? req.body.accessLevel : 'public';
  const show = normalizeScheduledShow({
    title: req.body.title,
    description: req.body.description,
    streamId: stream.id,
    ownerId: user.id,
    mode,
    sourceId: source?.id || '',
    accessLevel,
    priceCents: 0,
    currency: store.settings.paymentIntegration?.currency || 'usd',
    startAt,
    endAt: isoFromDatetimeLocal(req.body.endAt),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  store.scheduledShows.push(show);
  store.events.push({ id: id('evt'), type: 'scheduled_show_created', payload: { showId: show.id, streamId: stream.id, mode, accessLevel }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=schedule');
});

app.post('/dashboard/schedule/:showId/toggle', requireUser, (req, res) => {
  const store = readStore();
  const show = (store.scheduledShows || []).find((item) => item.id === req.params.showId && item.ownerId === req.user.id);
  if (show) {
    show.enabled = !show.enabled;
    show.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'scheduled_show_toggled', payload: { showId: show.id, enabled: show.enabled }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=schedule');
});

app.post('/dashboard/schedule/:showId/cancel', requireUser, (req, res) => {
  const store = readStore();
  const show = (store.scheduledShows || []).find((item) => item.id === req.params.showId && item.ownerId === req.user.id);
  if (show) {
    show.status = 'cancelled';
    show.enabled = false;
    show.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'scheduled_show_cancelled', payload: { showId: show.id }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard?tab=schedule');
});

app.post('/dashboard/extra-content', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  stream.extraContent = {
    enabled: req.body.enabled === 'true',
    showOnWatchPage: req.body.showOnWatchPage === 'true',
    title: String(req.body.title || 'Additional content').trim().slice(0, 120) || 'Additional content',
    description: String(req.body.description || '').trim().slice(0, 1000),
    embedHtml: sanitizeSupportEmbed(req.body.embedHtml)
  };
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_extra_content_updated', payload: { streamId: stream.id, enabled: stream.extraContent.enabled, showOnWatchPage: stream.extraContent.showOnWatchPage }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard?tab=profile');
});

app.post('/dashboard/stream/key', requireUser, (req, res) => {
  const action = String(req.body.action || '').toLowerCase();
  if (action !== 'revoke') {
    res.status(400).send(page('Invalid stream key action', '<h1>Invalid stream key action</h1><p>The requested key action is not supported.</p><a class="button" href="/dashboard">Back to dashboard</a>', req.user));
    return;
  }
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  if (!user) {
    res.status(404).send(page('User not found', '<h1>User not found</h1>', req.user));
    return;
  }
  const stream = ensureStreamForUser(store, user);
  const previousKey = stream.streamKey;
  const newKey = id('sk');
  user.streamKey = newKey;
  user.updatedAt = nowIso();
  stream.streamKey = newKey;
  stream.rtmpUrl = rtmpUrlFor(newKey);
  stream.hlsUrl = null;
  if (action === 'revoke') {
    stream.status = 'ended';
  }
  stream.updatedAt = nowIso();
  store.events.push({
    id: id('evt'),
    type: 'stream_key_revoked_and_regenerated',
    payload: {
      streamId: stream.id,
      username: user.username,
      previousKeySuffix: String(previousKey || '').slice(-6),
      newKeySuffix: newKey.slice(-6)
    },
    createdAt: nowIso()
  });
  writeStore(store);
  res.redirect('/dashboard');
});

app.get('/admin', (req, res) => {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') {
    res.redirect('/login');
    return;
  }
  res.redirect('/admin/streams');
});

app.get('/admin/streams', requireAdmin, (req, res) => {
  const store = readStore();
  const body = `<h1>Admin panel</h1>${adminTabs('streams')}
<section><h2>Streams</h2><table><tr><th>Title</th><th>Status</th><th>Owner</th><th>Encoders</th><th>Actions</th></tr>${store.streams.map((stream) => `<tr><td>${escapeHtml(stream.title)}</td><td>${escapeHtml(stream.status)}</td><td>${escapeHtml(store.users.find((item) => item.id === stream.ownerId)?.username || 'ad hoc')}</td><td>${1 + (stream.encoderKeys?.length || 0)}</td><td><a href="/s/${escapeHtml(stream.slug)}">View</a></td></tr>`).join('')}</table></section>
<section><h2>Recent events</h2><table><tr><th>Time</th><th>Type</th><th>Payload</th></tr>${store.events.slice(-75).reverse().map((event) => `<tr><td>${escapeHtml(event.createdAt)}</td><td>${escapeHtml(event.type)}</td><td><code>${escapeHtml(JSON.stringify(event.payload))}</code></td></tr>`).join('')}</table></section>`;
  res.send(page('Admin streams', body, req.user));
});

app.get('/admin/accounts', requireAdmin, (req, res) => {
  const store = readStore();
  const accountRows = store.users.map((item) => `<tr><td>${escapeHtml(item.username)}</td><td><form method="post" action="/admin/users/${escapeHtml(item.id)}"><label>Display name<input name="displayName" value="${escapeHtml(item.displayName || '')}"></label></td><td><label>Role<select name="role">${roleOptions(item.role, true)}</select></label></td><td><label><input type="checkbox" name="active" value="true" ${item.active ? 'checked' : ''}> Active</label></td><td><label>Notification email<input name="notificationEmail" type="email" value="${escapeHtml(item.notificationEmail || '')}"></label><label>Client ID or client email<input name="clientLookup" value="${escapeHtml(item.whmcsClientId || item.whmcsPortalEmail || '')}"></label><p class="muted">Current client ID: ${escapeHtml(item.whmcsClientId || 'None')}. Client email: ${escapeHtml(item.whmcsPortalEmail || 'None')}.</p></td><td><label>New password<input name="password" type="password" autocomplete="new-password" placeholder="Leave blank to keep current password"></label><button type="submit">Save account</button></form></td></tr>`).join('');
  const body = `<h1>Admin panel</h1>${adminTabs('accounts')}
<section><h2>Create user</h2><form method="post" action="/admin/users"><label>Username<input name="username" required></label><label>Display name<input name="displayName"></label><label>Password<input name="password" type="password" required></label><label>Role<select name="role">${roleOptions('user', true)}</select></label><button type="submit">Create user</button></form></section>
<section><h2>Edit accounts</h2><table><tr><th>Username</th><th>Display name</th><th>Role</th><th>Status</th><th>Linked details</th><th>Password and save</th></tr>${accountRows}</table></section>`;
  res.send(page('Admin accounts', body, req.user));
});

app.get('/admin/signups', requireAdmin, (req, res) => {
  const store = readStore();
  const body = `<h1>Admin panel</h1>${adminTabs('signups')}
<section><h2>Signup settings</h2><form method="post" action="/admin/signups"><label><input type="checkbox" name="registrationsEnabled" value="true" ${store.settings.registrationsEnabled ? 'checked' : ''}> Enable user signups</label><label>New account role<select name="registrationDefaultRole">${roleOptions(store.settings.registrationDefaultRole, false)}</select></label><p class="muted">Public signup cannot create administrator accounts. Administrators can assign admin access from the account tools.</p><button type="submit">Save signup settings</button></form></section>
<section><h2>Signup page</h2><p>When enabled, new users can create an account at <a href="/signup">/signup</a>. Each new account receives a stream page, primary stream key, and dashboard access.</p></section>`;
  res.send(page('Admin signups', body, req.user));
});

app.post('/admin/signups', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.registrationsEnabled = req.body.registrationsEnabled === 'true';
  store.settings.registrationDefaultRole = normalizeRole(req.body.registrationDefaultRole, 'user') === 'admin' ? 'user' : normalizeRole(req.body.registrationDefaultRole, 'user');
  store.events.push({ id: id('evt'), type: 'signup_settings_updated', payload: { enabled: store.settings.registrationsEnabled, defaultRole: store.settings.registrationDefaultRole }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/signups');
});

app.get('/admin/branding', requireAdmin, (req, res) => {
  const store = readStore();
  const branding = store.settings.platformBranding || defaultPlatformBranding();
  const body = `<h1>Admin panel</h1>${adminTabs('branding')}
<section><h2>Platform naming</h2><p class="muted">These fields control the default install name, front page heading, header name, sub-heading, slogan, tagline, and platform description. They can be changed at any time.</p><form method="post" action="/admin/branding"><label>Platform name<input name="platformName" value="${escapeHtml(branding.platformName)}" required></label><label>Sub-heading<input name="subheading" value="${escapeHtml(branding.subheading)}"></label><label>Slogan<input name="slogan" value="${escapeHtml(branding.slogan)}"></label><label>Tagline<input name="tagline" value="${escapeHtml(branding.tagline)}"></label><label>Description<textarea name="description" rows="5">${escapeHtml(branding.description)}</textarea></label><button type="submit">Save platform branding</button></form></section>`;
  res.send(page('Admin branding', body, req.user));
});

app.post('/admin/branding', requireAdmin, (req, res) => {
  const store = readStore();
  const platformName = String(req.body.platformName || 'AAAStreamer').trim().slice(0, 120) || 'AAAStreamer';
  store.settings.platformBranding = {
    platformName,
    subheading: String(req.body.subheading || '').trim().slice(0, 180),
    slogan: String(req.body.slogan || '').trim().slice(0, 180),
    tagline: String(req.body.tagline || '').trim().slice(0, 180),
    description: String(req.body.description || '').trim().slice(0, 1500)
  };
  store.settings.siteName = platformName;
  store.events.push({ id: id('evt'), type: 'platform_branding_updated', payload: { platformName }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/branding');
});

app.get('/admin/messaging', requireModeratorOrAdmin, (req, res) => {
  const store = readStore();
  const messaging = normalizeMessagingSettings(store.settings.messaging || {});
  const support = store.settings.supportDefaults || defaultSupportSettings();
  const isAdmin = req.user.role === 'admin';
  const ruleRows = (store.settings.commentAccessRules || []).map((rule) => `<tr><td>${escapeHtml(rule.targetType)}</td><td><code>${escapeHtml(rule.targetValue)}</code></td><td>${escapeHtml(rule.action)}</td><td>${escapeHtml(rule.notes || '')}</td><td><form class="inline-form" method="post" action="/admin/comment-rules/${escapeHtml(rule.id)}/delete"><button type="submit" class="danger">Remove rule</button></form></td></tr>`).join('');
  const messageRows = (store.comments || []).slice(-150).reverse().map((comment) => {
    const stream = store.streams.find((item) => item.id === comment.streamId);
    const status = comment.status || 'visible';
    const identity = [
      comment.ipVersion && comment.ipAddress ? `${comment.ipVersion}: ${comment.ipAddress}` : '',
      comment.requestHost ? `host: ${comment.requestHost}` : '',
      comment.reverseDnsHost ? `dns: ${comment.reverseDnsHost}` : ''
    ].filter(Boolean).join('<br>') || '<span class="muted">No network identity saved</span>';
    const quickValue = comment.authorName || comment.ipAddress || comment.requestHost || '';
    return `<tr><td>${escapeHtml(comment.createdAt || '')}</td><td>${escapeHtml(stream?.title || 'Unknown stream')}</td><td>${escapeHtml(comment.authorName || '')}<br><span class="muted">${escapeHtml(comment.authorType || '')}</span></td><td>${identity}</td><td>${escapeHtml(status)}</td><td>${escapeHtml(comment.message || '')}</td><td><form class="inline-form" method="post" action="/admin/comments/${escapeHtml(comment.id)}/moderate"><button name="action" value="approve" type="submit">Approve</button><button name="action" value="hide" type="submit">Hide</button><button name="action" value="delete" type="submit" class="danger">Delete</button></form><form class="inline-form" method="post" action="/admin/comment-rules"><input type="hidden" name="targetValue" value="${escapeHtml(quickValue)}"><label>Rule target<select name="targetType"><option value="user">User/name</option><option value="ip">IP address</option><option value="ipv4">IPv4 only</option><option value="ipv6">IPv6 only</option><option value="host">Host</option><option value="dns">Reverse DNS</option></select></label><label>Action<select name="action"><option value="review">Review first</option><option value="hide">Auto-hide</option><option value="block">Block</option><option value="allow">Allow</option></select></label><button type="submit">Add rule from this comment</button></form></td></tr>`;
  }).join('');
  const retentionOptions = [
    [0, 'Keep until manually cleared'],
    [6, '6 hours'],
    [12, '12 hours'],
    [24, '1 day'],
    [72, '3 days'],
    [168, '1 week'],
    [336, '2 weeks'],
    [720, '30 days']
  ].map(([value, label]) => `<option value="${value}" ${Number(messaging.retentionHours) === value ? 'selected' : ''}>${label}</option>`).join('');
  const messageSettingsSection = isAdmin
    ? `<section id="message-settings"><h2>Messaging features</h2><form method="post" action="/admin/messaging"><label><input type="checkbox" name="visitorMessagesEnabled" value="true" ${messaging.visitorMessagesEnabled ? 'checked' : ''}> Guests can post stream messages when comments are enabled on the stream</label><label><input type="checkbox" name="loggedInUserMessagesEnabled" value="true" ${messaging.loggedInUserMessagesEnabled ? 'checked' : ''}> Logged-in users can post stream messages</label><label><input type="checkbox" name="reactionsEnabled" value="true" ${messaging.reactionsEnabled ? 'checked' : ''}> Enable reactions on messages</label><label><input type="checkbox" name="requireNameForGuests" value="true" ${messaging.requireNameForGuests ? 'checked' : ''}> Require guests to enter a display name</label><label><input type="checkbox" name="requireGuestReview" value="true" ${messaging.requireGuestReview ? 'checked' : ''}> Hold guest messages for admin review</label><label><input type="checkbox" name="autoHideBlockedWords" value="true" ${messaging.autoHideBlockedWords ? 'checked' : ''}> Auto-hide messages containing blocked words</label><label>Maximum message length<input type="number" min="100" max="5000" step="50" name="maxMessageLength" value="${escapeHtml(messaging.maxMessageLength)}"></label><label>Auto-clear messages after<select name="retentionHours">${retentionOptions}</select></label><label>Maximum stored messages<input type="number" min="100" max="50000" step="100" name="maxStoredMessages" value="${escapeHtml(messaging.maxStoredMessages)}"></label><label>Blocked words or phrases, one per line<textarea name="blockedWords" rows="5">${escapeHtml(messaging.blockedWords || '')}</textarea></label><button type="submit">Save messaging settings</button></form></section>`
    : `<section id="message-settings"><h2>Messaging features</h2><p class="notice" role="status">Moderator access is active. You can moderate messages and manage comment access rules; global messaging settings stay with administrators.</p></section>`;
  const supportDefaultsSection = isAdmin
    ? `<section id="support-defaults"><h2>Default support and payment box</h2><p class="muted">These defaults are copied into new streams. Stream owners can link their own PayPal, Stripe, Cash App, Apple Pay, or payment embed. The platform payment area can hold WHMCS-linked payment methods for Devine Creations or AAAStreamer support.</p><form method="post" action="/admin/support-defaults"><label><input type="checkbox" name="enabled" value="true" ${support.enabled ? 'checked' : ''}> Enable support box by default for new streams</label><label><input type="checkbox" name="showOnWatchPage" value="true" ${support.showOnWatchPage ? 'checked' : ''}> Show support boxes to visitors by default</label><label>Default placement<select name="placement"><option value="before" ${support.placement === 'before' ? 'selected' : ''}>Before stream player</option><option value="during" ${support.placement === 'during' ? 'selected' : ''}>Beside stream player area</option><option value="after" ${!['before', 'during'].includes(support.placement) ? 'selected' : ''}>After comments and stream details</option></select></label><label>Heading<input name="title" value="${escapeHtml(support.title)}"></label><label>Description<textarea name="description" rows="3">${escapeHtml(support.description)}</textarea></label><label>Creator payment or donation embed HTML<textarea name="embedHtml" rows="6">${escapeHtml(support.embedHtml)}</textarea></label><label><input type="checkbox" name="platformShareEnabled" value="true" ${support.platformShareEnabled ? 'checked' : ''}> Enable platform support share notice</label><label>Platform share percent<input type="number" min="0" max="100" step="0.1" name="platformSharePercent" value="${escapeHtml(support.platformSharePercent ?? 15)}"></label><label>Platform payment heading<input name="platformPaymentTitle" value="${escapeHtml(support.platformPaymentTitle || 'Support AAAStreamer hosting')}"></label><label>Platform payment description<textarea name="platformPaymentDescription" rows="3">${escapeHtml(support.platformPaymentDescription || '')}</textarea></label><label>Platform or WHMCS payment embed HTML<textarea name="platformPaymentEmbedHtml" rows="6">${escapeHtml(support.platformPaymentEmbedHtml || '')}</textarea></label><button type="submit">Save support defaults</button></form></section>`
    : '';
  const body = `<h1>Admin panel</h1>${adminTabs('messaging')}<nav class="tabs" role="tablist" aria-label="Messaging subsections"><a class="tab-button" role="tab" href="#message-settings">Message settings</a><a class="tab-button" role="tab" href="#moderation">Moderation queue</a><a class="tab-button" role="tab" href="#comment-rules">Comment access rules</a>${isAdmin ? '<a class="tab-button" role="tab" href="#support-defaults">Support defaults</a>' : ''}</nav>
${messageSettingsSection}
<section id="moderation"><h2>Message moderation</h2><p class="muted">Approve pending messages, hide messages from stream pages, delete messages, or create access rules tied to users, IPv4, IPv6, host, or reverse DNS identity.</p><table><tr><th>Time</th><th>Stream</th><th>Author</th><th>Network identity</th><th>Status</th><th>Message</th><th>Actions</th></tr>${messageRows || '<tr><td colspan="7">No messages have been posted yet.</td></tr>'}</table><form method="post" action="/admin/comments/prune"><button type="submit">Run message cleanup now</button></form></section>
<section id="comment-rules"><h2>Comment access rules</h2><p class="muted">Rules are checked from top to bottom when a comment is posted. Targets support exact values or wildcard patterns such as <code>*.example.net</code>.</p><table><tr><th>Target type</th><th>Target value</th><th>Action</th><th>Notes</th><th>Remove</th></tr>${ruleRows || '<tr><td colspan="5">No comment access rules are configured yet.</td></tr>'}</table><form method="post" action="/admin/comment-rules"><label>Target type<select name="targetType"><option value="user">User/name</option><option value="ip">Any IP</option><option value="ipv4">IPv4 only</option><option value="ipv6">IPv6 only</option><option value="host">Host header</option><option value="dns">Reverse DNS hostname</option></select></label><label>Target value<input name="targetValue" placeholder="username, 203.0.113.10, 2001:db8::1, or *.example.net" required></label><label>Action<select name="action"><option value="review">Review first</option><option value="hide">Auto-hide</option><option value="block">Block posting</option><option value="allow">Allow</option></select></label><label>Notes<input name="notes" placeholder="Why this rule exists"></label><button type="submit">Add comment access rule</button></form></section>
${supportDefaultsSection}`;
  res.send(page('Admin messaging', body, req.user));
});

app.post('/admin/messaging', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.messaging = normalizeMessagingSettings({
    visitorMessagesEnabled: req.body.visitorMessagesEnabled === 'true',
    loggedInUserMessagesEnabled: req.body.loggedInUserMessagesEnabled === 'true',
    reactionsEnabled: req.body.reactionsEnabled === 'true',
    requireNameForGuests: req.body.requireNameForGuests === 'true',
    requireGuestReview: req.body.requireGuestReview === 'true',
    autoHideBlockedWords: req.body.autoHideBlockedWords === 'true',
    maxMessageLength: req.body.maxMessageLength,
    retentionHours: req.body.retentionHours,
    maxStoredMessages: req.body.maxStoredMessages,
    blockedWords: req.body.blockedWords
  });
  pruneComments(store);
  store.events.push({ id: id('evt'), type: 'messaging_settings_updated', payload: store.settings.messaging, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/messaging');
});

app.post('/admin/comments/prune', requireModeratorOrAdmin, (req, res) => {
  const store = readStore();
  const before = store.comments.length;
  pruneComments(store);
  store.events.push({ id: id('evt'), type: 'comments_pruned', payload: { before, after: store.comments.length }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/messaging');
});

app.post('/admin/comment-rules', requireModeratorOrAdmin, (req, res) => {
  const store = readStore();
  const rule = normalizeCommentAccessRule({
    targetType: req.body.targetType,
    targetValue: req.body.targetValue,
    action: req.body.action,
    notes: req.body.notes
  });
  if (rule) {
    store.settings.commentAccessRules ||= [];
    store.settings.commentAccessRules.push(rule);
    store.events.push({ id: id('evt'), type: 'comment_access_rule_added', payload: { targetType: rule.targetType, action: rule.action }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/admin/messaging#comment-rules');
});

app.post('/admin/comment-rules/:ruleId/delete', requireModeratorOrAdmin, (req, res) => {
  const store = readStore();
  const before = (store.settings.commentAccessRules || []).length;
  store.settings.commentAccessRules = (store.settings.commentAccessRules || []).filter((rule) => rule.id !== req.params.ruleId);
  store.events.push({ id: id('evt'), type: 'comment_access_rule_removed', payload: { before, after: store.settings.commentAccessRules.length }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/messaging#comment-rules');
});

app.post('/admin/comments/:commentId/moderate', requireModeratorOrAdmin, (req, res) => {
  const store = readStore();
  const commentIndex = store.comments.findIndex((comment) => comment.id === req.params.commentId);
  if (commentIndex >= 0) {
    const action = String(req.body.action || '').toLowerCase();
    const comment = store.comments[commentIndex];
    if (action === 'delete') {
      store.comments.splice(commentIndex, 1);
    } else if (action === 'hide') {
      comment.status = 'hidden';
      comment.moderatedAt = nowIso();
      comment.moderatedBy = req.user.id;
    } else if (action === 'approve') {
      comment.status = 'visible';
      comment.moderatedAt = nowIso();
      comment.moderatedBy = req.user.id;
    }
    store.events.push({ id: id('evt'), type: 'comment_moderated', payload: { commentId: req.params.commentId, action }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/admin/messaging');
});

app.get('/admin/share-links', requireAdmin, (req, res) => {
  const store = readStore();
  const rows = (store.shareLinks || []).slice().reverse().map((link) => {
    const stream = store.streams.find((item) => item.id === link.streamId);
    const owner = stream ? store.users.find((user) => user.id === stream.ownerId) : null;
    const tokenUrl = tokenUrlFor(link.token);
    const directUrl = stream ? watchUrlFor(stream) : '';
    return `<tr><td>${escapeHtml(stream?.title || 'Missing stream')}</td><td>${escapeHtml(owner?.username || 'unknown')}</td><td><input readonly value="${escapeHtml(tokenUrl)}"></td><td>${directUrl ? `<details><summary>Show direct URL</summary><input readonly value="${escapeHtml(directUrl)}"></details>` : 'None'}</td><td>${escapeHtml(link.useCount || 0)}</td><td>${escapeHtml(link.lastUsedAt || 'Never')}</td></tr>`;
  }).join('');
  const body = `<h1>Admin panel</h1>${adminTabs('share-links')}<section><h2>Tracked share links</h2><p class="muted">Token links are the default public sharing format. Direct stream URLs remain available for desktop clients, API calls, and advanced users, but are hidden by default in public-facing copy/share flows.</p><table><tr><th>Stream</th><th>Owner</th><th>Token URL</th><th>Direct URL</th><th>Uses</th><th>Last used</th></tr>${rows || '<tr><td colspan="6">No tracked share links have been generated yet.</td></tr>'}</table></section>`;
  res.send(page('Admin share links', body, req.user));
});

app.get('/admin/payments', requireAdmin, (req, res) => {
  const store = readStore();
  const settings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
  const ready = paymentIntegrationReady(settings);
  const recentPayments = (store.payments || []).slice(-50).reverse();
  const body = `<h1>Admin panel</h1>${adminTabs('payments')}
<section><h2>Payment integrations</h2><p class="muted">API secrets are loaded from the server environment only. This page stores non-secret routing settings, default amounts, and integration enablement.</p><form method="post" action="/admin/payments"><label><input type="checkbox" name="stripeEnabled" value="true" ${settings.stripeEnabled ? 'checked' : ''}> Enable Stripe Checkout</label><p>Stripe secret key configured: <strong>${stripeSecretKey ? 'yes' : 'no'}</strong>. Stripe webhook secret configured: <strong>${stripeWebhookSecret ? 'yes' : 'no'}</strong>.</p><label><input type="checkbox" name="whmcsEnabled" value="true" ${settings.whmcsEnabled ? 'checked' : ''}> Enable WHMCS invoice payments</label><p>WHMCS API identifier and secret configured: <strong>${whmcsApiIdentifier && whmcsApiSecret ? 'yes' : 'no'}</strong>.</p><label>WHMCS URL<input name="whmcsUrl" value="${escapeHtml(settings.whmcsUrl || '')}" placeholder="https://devine-creations.com"></label><label>Default WHMCS client ID<input name="whmcsDefaultClientId" value="${escapeHtml(settings.whmcsDefaultClientId || '')}" inputmode="numeric"></label><label>WHMCS payment method system name<input name="whmcsPaymentMethod" value="${escapeHtml(settings.whmcsPaymentMethod || '')}" placeholder="paypal, stripe, mailin, etc."></label><label>Currency<input name="currency" value="${escapeHtml(settings.currency || 'usd')}" maxlength="3"></label><label>Default amount<input name="defaultAmount" inputmode="decimal" value="${escapeHtml((Number(settings.defaultAmountCents || 500) / 100).toFixed(2))}"></label><label>Minimum amount<input name="minimumAmount" inputmode="decimal" value="${escapeHtml((Number(settings.minimumAmountCents || 100) / 100).toFixed(2))}"></label><label>Platform share statement<textarea name="platformStatement" rows="3">${escapeHtml(settings.platformStatement || '')}</textarea></label><button type="submit">Save payment integration settings</button></form></section>
<section><h2>Integration health</h2><p>Stripe checkout: <strong>${ready.stripe ? 'ready' : 'not ready'}</strong>.</p><p>Stripe webhook verification: <strong>${ready.stripeWebhook ? 'ready' : 'not ready'}</strong>.</p><p>WHMCS API: <strong>${ready.whmcs ? 'ready' : 'not ready'}</strong>.</p><form method="post" action="/admin/payments/test-whmcs"><button type="submit">Test WHMCS API connection</button></form></section>
<section><h2>Recent payment records</h2><table><tr><th>Time</th><th>Provider</th><th>Status</th><th>Stream</th><th>Amount</th><th>Platform share</th></tr>${recentPayments.map((payment) => `<tr><td>${escapeHtml(payment.createdAt || '')}</td><td>${escapeHtml(payment.provider || '')}</td><td>${escapeHtml(payment.status || '')}</td><td>${escapeHtml(payment.streamSlug || payment.streamId || '')}</td><td>${escapeHtml(formatMoney(payment.amountCents, payment.currency || settings.currency))}</td><td>${escapeHtml(formatMoney(payment.platformFeeCents || 0, payment.currency || settings.currency))}</td></tr>`).join('') || '<tr><td colspan="6">No payment records yet.</td></tr>'}</table></section>`;
  res.send(page('Admin payments', body, req.user));
});

app.get('/admin/install', requireAdmin, (req, res) => {
  const store = readStore();
  const license = store.settings.license || defaultLicenseSettings();
  const dns = store.settings.dns || defaultDnsSettings();
  const reissueCounts = licenseReissueCounts(license);
  const canEditLicense = !license.lockClientLinkedSettings || license.edition === 'enterprise' || license.edition === 'hosted';
  const licenseFieldsDisabled = canEditLicense ? '' : ' disabled';
  const body = `<h1>Admin panel</h1>${adminTabs('install')}
<section><h2>Server install and license</h2><p class="muted">Customer-owned installs use their own local payment links while license, product, invoice, and account continuity stay linked to the Devine Creations client portal. Client-linked installs can display license details without allowing protected settings to be changed locally.</p><form method="post" action="/admin/install/license"><label><input type="checkbox" name="licensingEnabled" value="true" ${license.licensingEnabled ? 'checked' : ''}${licenseFieldsDisabled}> Enable license validation for this install</label><label><input type="checkbox" name="clientLinked" value="true" ${license.clientLinked ? 'checked' : ''}${licenseFieldsDisabled}> Linked to a client account</label><label><input type="checkbox" name="lockClientLinkedSettings" value="true" ${license.lockClientLinkedSettings ? 'checked' : ''}> Lock client-linked license settings on this install</label><label>License server URL<input name="licenseServerUrl" value="${escapeHtml(license.licenseServerUrl || '')}"${licenseFieldsDisabled}></label><label>Product ID<input name="whmcsProductId" value="${escapeHtml(license.whmcsProductId || '')}"${licenseFieldsDisabled}></label><label>Generated license key<input readonly value="${escapeHtml(license.licenseKey || 'Not generated')}"></label><input type="hidden" name="licenseKey" value="${escapeHtml(license.licenseKey || '')}"><label>Install ID<input name="installId" value="${escapeHtml(license.installId || '')}"${licenseFieldsDisabled}></label><label>Install domain<input name="installDomain" value="${escapeHtml(license.installDomain || '')}"${licenseFieldsDisabled}></label><label>Edition<select name="edition"${licenseFieldsDisabled}><option value="hosted" ${license.edition === 'hosted' ? 'selected' : ''}>Hosted</option><option value="self-hosted" ${license.edition === 'self-hosted' ? 'selected' : ''}>Self-hosted licensed</option><option value="managed" ${license.edition === 'managed' ? 'selected' : ''}>Managed deployment</option><option value="enterprise" ${license.edition === 'enterprise' ? 'selected' : ''}>Enterprise or internal</option></select></label><button type="submit">Save license settings</button></form><form method="post" action="/admin/install/license/reissue"><button type="submit" ${canReissueLicense(license) ? '' : 'disabled'}>Reissue generated license key</button></form><p>Reissues used: ${escapeHtml(reissueCounts.monthly)}/${escapeHtml(license.reissueLimits?.monthly ?? 2)} this month, ${escapeHtml(reissueCounts.quarterly)}/${escapeHtml(license.reissueLimits?.quarterly ?? 4)} this quarter, ${escapeHtml(reissueCounts.yearly)}/${escapeHtml(license.reissueLimits?.yearly ?? 8)} this year.</p><p>Validation status: <strong>${escapeHtml(license.validationStatus || 'unknown')}</strong>. Last checked: ${escapeHtml(license.lastValidationAt || 'Never')}.</p></section>
<section><h2>DNS and domain automation</h2><p class="muted">DNS changes are only performed when a supported provider token is configured on the server. Cloudflare is supported in this build. Existing nameservers and domain ownership must already allow this install to manage records. Approved auth domains let passkeys and browser notifications follow additional domains for this install.</p><form method="post" action="/admin/install/dns-settings"><label>DNS provider<select name="provider"><option value="">Not configured</option><option value="cloudflare" ${dns.provider === 'cloudflare' ? 'selected' : ''}>Cloudflare</option></select></label><label>Zone ID<input name="zoneId" value="${escapeHtml(dns.zoneId || '')}"></label><label>Default DNS target<input name="defaultTarget" value="${escapeHtml(dns.defaultTarget || '')}" placeholder="live.tappedin.fm or server hostname"></label><label>Default nameservers<input name="defaultNameservers" value="${escapeHtml(dns.defaultNameservers || '')}"></label><label>Approved auth domains, one per line<textarea name="authDomains" rows="4" placeholder="live.tappedin.fm&#10;aaastreamer.devinecreations.net">${escapeHtml(dns.authDomains || '')}</textarea></label><button type="submit">Save DNS settings</button></form><form method="post" action="/admin/install/dns-record"><label>Record name<input name="name" placeholder="live"></label><label>Record type<select name="type"><option value="CNAME">CNAME</option><option value="A">A</option><option value="AAAA">AAAA</option></select></label><label>Record target<input name="content" value="${escapeHtml(dns.defaultTarget || '')}"></label><label><input type="checkbox" name="proxied" value="true"> Proxy through provider when supported</label><button type="submit">Create DNS record</button></form><p>Last DNS action: <strong>${escapeHtml(dns.lastActionStatus || 'not configured')}</strong> ${escapeHtml(dns.lastActionMessage || '')}</p></section>
<section><h2>Server installer</h2><p>Installer script path in this release: <code>scripts/install-aaastreamer-server.sh</code>.</p><p class="muted">The installer creates a service, env file, optional nginx vhost, and the licensing/DNS configuration hooks needed for production setup.</p></section>`;
  res.send(page('Admin install and licensing', body, req.user));
});

app.post('/admin/install/license', requireAdmin, (req, res) => {
  const store = readStore();
  const existing = store.settings.license || defaultLicenseSettings();
  const canEditLicense = !existing.lockClientLinkedSettings || existing.edition === 'enterprise' || existing.edition === 'hosted';
  if (!canEditLicense) {
    store.settings.license = {
      ...existing,
      lockClientLinkedSettings: req.body.lockClientLinkedSettings === 'true'
    };
    store.events.push({ id: id('evt'), type: 'license_settings_lock_updated', payload: { locked: store.settings.license.lockClientLinkedSettings }, createdAt: nowIso() });
    writeStore(store);
    res.redirect('/admin/install');
    return;
  }
  store.settings.license = {
    ...existing,
    licensingEnabled: req.body.licensingEnabled === 'true',
    clientLinked: req.body.clientLinked === 'true',
    lockClientLinkedSettings: req.body.lockClientLinkedSettings === 'true',
    licenseServerUrl: safeUrl(req.body.licenseServerUrl) || 'https://devine-creations.com',
    whmcsProductId: String(req.body.whmcsProductId || '').trim().replace(/[^0-9]/g, '').slice(0, 20),
    licenseKey: String(req.body.licenseKey || '').trim().slice(0, 160),
    installId: String(req.body.installId || '').trim().slice(0, 160),
    installDomain: String(req.body.installDomain || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 180),
    edition: ['hosted', 'self-hosted', 'managed', 'enterprise'].includes(req.body.edition) ? req.body.edition : 'self-hosted'
  };
  store.events.push({ id: id('evt'), type: 'license_settings_updated', payload: { edition: store.settings.license.edition, licensingEnabled: store.settings.license.licensingEnabled }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/install');
});

app.post('/admin/install/license/reissue', requireAdmin, (req, res) => {
  const store = readStore();
  const license = { ...defaultLicenseSettings(), ...(store.settings.license || {}) };
  license.reissueLimits = { ...defaultLicenseSettings().reissueLimits, ...(license.reissueLimits || {}) };
  license.reissues = Array.isArray(license.reissues) ? license.reissues : [];
  if (!canReissueLicense(license)) {
    res.status(429).send(page('License reissue limit reached', '<h1>License reissue limit reached</h1><p>This install has used its configured license reissues for the current period.</p><p><a class="button" href="/admin/install">Back to install settings</a></p>', req.user));
    return;
  }
  const previousSuffix = String(license.licenseKey || '').slice(-8);
  license.licenseKey = `aas_${crypto.randomBytes(24).toString('base64url')}`;
  license.reissues.push({ id: id('lic'), createdAt: nowIso(), requestedBy: req.user.username, installDomain: license.installDomain || '', previousSuffix, newSuffix: license.licenseKey.slice(-8) });
  license.validationStatus = 'reissued';
  license.lastValidationAt = nowIso();
  store.settings.license = license;
  store.events.push({ id: id('evt'), type: 'license_key_reissued', payload: { installDomain: license.installDomain || '', newSuffix: license.licenseKey.slice(-8) }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/install');
});

app.post('/admin/install/dns-settings', requireAdmin, (req, res) => {
  const store = readStore();
  const existing = store.settings.dns || defaultDnsSettings();
  store.settings.dns = {
    ...existing,
    provider: req.body.provider === 'cloudflare' ? 'cloudflare' : '',
    zoneId: String(req.body.zoneId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120),
    defaultTarget: String(req.body.defaultTarget || '').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 240),
    defaultNameservers: String(req.body.defaultNameservers || '').trim().slice(0, 500),
    authDomains: String(req.body.authDomains || '').split(/\r?\n|,|;/).map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')).filter(Boolean).join('\n').slice(0, 1000)
  };
  store.events.push({ id: id('evt'), type: 'dns_settings_updated', payload: { provider: store.settings.dns.provider, hasZoneId: Boolean(store.settings.dns.zoneId) }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/install');
});

app.post('/admin/install/dns-record', requireAdmin, async (req, res) => {
  const store = readStore();
  const dns = store.settings.dns || defaultDnsSettings();
  try {
    const result = await createDnsRecord(dns, {
      name: req.body.name,
      type: req.body.type,
      content: req.body.content || dns.defaultTarget,
      proxied: req.body.proxied === 'true'
    });
    dns.lastActionAt = nowIso();
    dns.lastActionStatus = 'success';
    dns.lastActionMessage = `Created ${result.type || req.body.type} record ${result.name || req.body.name}.`;
    store.settings.dns = dns;
    store.events.push({ id: id('evt'), type: 'dns_record_created', payload: { name: result.name || req.body.name, type: result.type || req.body.type }, createdAt: nowIso() });
    writeStore(store);
    res.redirect('/admin/install');
  } catch (error) {
    dns.lastActionAt = nowIso();
    dns.lastActionStatus = 'failed';
    dns.lastActionMessage = error.message;
    store.settings.dns = dns;
    store.events.push({ id: id('evt'), type: 'dns_record_create_failed', payload: { message: error.message }, createdAt: nowIso() });
    writeStore(store);
    res.status(502).send(page('DNS record not created', `<h1>DNS record not created</h1><p>${escapeHtml(error.message)}</p><p><a class="button" href="/admin/install">Back to install settings</a></p>`, req.user));
  }
});

app.post('/admin/payments', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.paymentIntegration = {
    ...defaultPaymentIntegrationSettings(),
    ...(store.settings.paymentIntegration || {}),
    stripeEnabled: req.body.stripeEnabled === 'true',
    whmcsEnabled: req.body.whmcsEnabled === 'true',
    whmcsUrl: safeUrl(req.body.whmcsUrl) || 'https://devine-creations.com',
    whmcsDefaultClientId: String(req.body.whmcsDefaultClientId || '').trim().replace(/[^0-9]/g, '').slice(0, 20),
    whmcsPaymentMethod: String(req.body.whmcsPaymentMethod || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60),
    currency: String(req.body.currency || 'usd').trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 3) || 'usd',
    defaultAmountCents: centsFromAmount(req.body.defaultAmount, 500),
    minimumAmountCents: centsFromAmount(req.body.minimumAmount, 100),
    platformStatement: String(req.body.platformStatement || '').trim().slice(0, 1000)
  };
  store.events.push({ id: id('evt'), type: 'payment_settings_updated', payload: { stripeEnabled: store.settings.paymentIntegration.stripeEnabled, whmcsEnabled: store.settings.paymentIntegration.whmcsEnabled }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/payments');
});

app.post('/admin/payments/test-whmcs', requireAdmin, async (req, res) => {
  const store = readStore();
  const settings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
  try {
    const result = await callWhmcsApi(settings, 'GetStats');
    store.events.push({ id: id('evt'), type: 'whmcs_api_test_success', payload: { status: result.result }, createdAt: nowIso() });
    writeStore(store);
    res.send(page('WHMCS API test', `<h1>WHMCS API test</h1><p>WHMCS API connection succeeded.</p><p><a class="button" href="/admin/payments">Back to payments</a></p>`, req.user));
  } catch (error) {
    store.events.push({ id: id('evt'), type: 'whmcs_api_test_failed', payload: { message: error.message }, createdAt: nowIso() });
    writeStore(store);
    res.status(502).send(page('WHMCS API test failed', `<h1>WHMCS API test failed</h1><p>${escapeHtml(error.message)}</p><p><a class="button" href="/admin/payments">Back to payments</a></p>`, req.user));
  }
});

app.post('/admin/support-defaults', requireAdmin, (req, res) => {
  const store = readStore();
  const existingSupport = { ...defaultSupportSettings(), ...(store.settings.supportDefaults || {}) };
  store.settings.supportDefaults = {
    enabled: req.body.enabled === 'true',
    showOnWatchPage: req.body.showOnWatchPage === 'true',
    placement: ['before', 'during', 'after'].includes(req.body.placement) ? req.body.placement : 'after',
    title: String(req.body.title || 'Support this stream').trim().slice(0, 120) || 'Support this stream',
    description: String(req.body.description || '').trim().slice(0, 1000),
    embedHtml: sanitizeSupportEmbed(req.body.embedHtml),
    platformShareEnabled: req.body.platformShareEnabled === 'true',
    platformSharePercent: clampNumber(req.body.platformSharePercent, 0, 100, 15),
    platformPaymentTitle: String(req.body.platformPaymentTitle || 'Support AAAStreamer hosting').trim().slice(0, 120) || 'Support AAAStreamer hosting',
    platformPaymentDescription: String(req.body.platformPaymentDescription || '').trim().slice(0, 1000),
    platformPaymentEmbedHtml: sanitizeSupportEmbed(req.body.platformPaymentEmbedHtml),
    paypalUrl: existingSupport.paypalUrl || '',
    stripeUrl: existingSupport.stripeUrl || '',
    cashAppUrl: existingSupport.cashAppUrl || '',
    applePayUrl: existingSupport.applePayUrl || '',
    paymentNotes: existingSupport.paymentNotes || ''
  };
  store.events.push({ id: id('evt'), type: 'support_defaults_updated', payload: { enabled: store.settings.supportDefaults.enabled, showOnWatchPage: store.settings.supportDefaults.showOnWatchPage }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/messaging');
});

function mediaFoldersText(settings) {
  return (settings.folders || []).map((folder) => [
    folder.label,
    folder.path,
    folder.enabled ? 'enabled' : 'disabled',
    folder.visibleToUsers ? 'visible' : 'hidden',
    folder.allowAudio ? 'audio' : 'no-audio',
    folder.allowVideo ? 'video' : 'no-video'
  ].join('|')).join('\n');
}

function parseMediaFoldersText(raw) {
  return String(raw || '').split(/\r?\n/).map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const [label, folderPath, enabled = 'enabled', visible = 'visible', audio = 'audio', video = 'video'] = trimmed.split('|').map((item) => item.trim());
    if (!folderPath) return null;
    return {
      id: slugify(`${index + 1}-${folderPath}`),
      label: (label || path.basename(folderPath) || `Media folder ${index + 1}`).slice(0, 120),
      path: folderPath,
      enabled: enabled !== 'disabled',
      visibleToUsers: visible !== 'hidden',
      allowAudio: audio !== 'no-audio',
      allowVideo: video !== 'no-video'
    };
  }).filter(Boolean);
}

app.get('/admin/media', requireAdmin, (req, res) => {
  const store = readStore();
  const media = store.settings.mediaLibrary || defaultMediaSettings();
  const catalog = mediaCatalog(store, req.user);
  const folderRows = catalog.map((folder) => `<tr><td>${escapeHtml(folder.label)}</td><td><code>${escapeHtml(folder.path || '')}</code></td><td>${folder.enabled ? 'enabled' : 'disabled'}</td><td>${folder.visibleToUsers ? 'visible to users' : 'admin only'}</td><td>${folder.files.length}</td></tr>`).join('');
  const fileRows = catalog.flatMap((folder) => folder.files.slice(0, 200).map((file) => `<tr><td>${escapeHtml(file.label)}</td><td>${escapeHtml(file.fileName || path.basename(file.relativePath))}</td><td>${escapeHtml(folder.label)}</td><td>${escapeHtml(file.mediaType)}</td><td>${escapeHtml(formatDuration(file.durationSeconds))}</td><td>${escapeHtml(file.chapters?.length ? `${file.chapters.length} chapters` : 'No chapters')}</td><td>${escapeHtml(formatBytes(file.size))}</td></tr>`)).join('');
  const body = `<h1>Admin panel</h1>${adminTabs('media')}
<section><h2>Media library folders</h2><p class="muted">Admins control which server folders are available for streamers. Hidden folders remain available to admins but are not shown to normal users. Use one folder per line in this format: label|path|enabled|visible|audio|video. Use disabled, hidden, no-audio, or no-video when needed.</p>
<form method="post" action="/admin/media"><label><input type="checkbox" name="enabled" value="true" ${media.enabled ? 'checked' : ''}> Enable server media library</label><label><input type="checkbox" name="allowUsersToSelectServerMedia" value="true" ${media.allowUsersToSelectServerMedia ? 'checked' : ''}> Users can select media from visible folders</label><label><input type="checkbox" name="uploadsVisibleToUsers" value="true" ${media.uploadsVisibleToUsers ? 'checked' : ''}> Uploaded media folder is visible to users</label><label><input type="checkbox" name="urlRelayEnabled" value="true" ${media.urlRelayEnabled ? 'checked' : ''}> Enable URL relay sources</label><label><input type="checkbox" name="allowUsersToAddRelayUrls" value="true" ${media.allowUsersToAddRelayUrls ? 'checked' : ''}> Users can add their own HTTP or HTTPS relay URLs</label><label>Upload folder<input name="uploadFolder" value="${escapeHtml(media.uploadFolder)}"></label><label>Maximum scan depth<input type="number" min="1" max="8" name="maxScanDepth" value="${escapeHtml(media.maxScanDepth)}"></label><label>Folders<textarea name="folders" rows="8">${escapeHtml(mediaFoldersText(media))}</textarea></label><button type="submit">Save media source settings</button></form></section>
<section><h2>Detected folders</h2><table><tr><th>Folder</th><th>Path</th><th>Status</th><th>User access</th><th>Detected files</th></tr>${folderRows || '<tr><td colspan="5">No enabled media folders are configured or reachable.</td></tr>'}</table></section>
<section><h2>Detected media files</h2><table><tr><th>Title</th><th>File name</th><th>Folder</th><th>Type</th><th>Duration</th><th>Chapters</th><th>Size</th></tr>${fileRows || '<tr><td colspan="7">No playable media files were detected in the enabled folders.</td></tr>'}</table></section>`;
  res.send(page('Admin media sources', body, req.user));
});

app.post('/admin/media', requireAdmin, (req, res) => {
  const store = readStore();
  const folders = parseMediaFoldersText(req.body.folders);
  store.settings.mediaLibrary = normalizeMediaSettings({
    enabled: req.body.enabled === 'true',
    allowUsersToSelectServerMedia: req.body.allowUsersToSelectServerMedia === 'true',
    uploadFolder: String(req.body.uploadFolder || '').trim(),
    uploadsVisibleToUsers: req.body.uploadsVisibleToUsers === 'true',
    urlRelayEnabled: req.body.urlRelayEnabled === 'true',
    allowUsersToAddRelayUrls: req.body.allowUsersToAddRelayUrls === 'true',
    maxScanDepth: clampNumber(req.body.maxScanDepth, 1, 8, 4),
    folders
  });
  store.events.push({ id: id('evt'), type: 'media_library_settings_updated', payload: { folderCount: store.settings.mediaLibrary.folders.length }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/media');
});

app.get('/admin/encoders', requireAdmin, (req, res) => {
  const store = readStore();
  const settings = store.settings.encoderDefaults;
  const body = `<h1>Admin panel</h1>${adminTabs('encoders')}
<section><h2>Default encoder settings</h2><form method="post" action="/admin/encoders"><label>Video bitrate<input name="videoBitrate" value="${escapeHtml(settings.videoBitrate)}"></label><label>Audio bitrate<select name="audioBitrate">${audioBitrates.map((rate) => `<option ${rate === settings.audioBitrate ? 'selected' : ''}>${rate}</option>`).join('')}</select></label><label>Audio channels<select name="audioChannels"><option value="stereo" selected>stereo</option></select></label><label>Sample rate<select name="sampleRate"><option ${settings.sampleRate === '44100' ? 'selected' : ''}>44100</option><option ${settings.sampleRate !== '44100' ? 'selected' : ''}>48000</option></select></label><label>Keyframe interval seconds<input name="keyframeIntervalSeconds" type="number" min="1" max="10" value="${escapeHtml(settings.keyframeIntervalSeconds)}"></label><label>Default latency mode<select name="latencyMode"><option value="low" ${settings.latencyMode === 'low' ? 'selected' : ''}>Low latency</option><option value="balanced" ${settings.latencyMode === 'balanced' ? 'selected' : ''}>Balanced</option><option value="stable" ${settings.latencyMode === 'stable' ? 'selected' : ''}>Most stable</option></select></label><label>Target live latency, seconds<input name="targetLatencySeconds" type="number" min="2" max="30" step="0.5" value="${escapeHtml(settings.targetLatencySeconds)}"></label><label>Player buffer, seconds<input name="playerBufferSeconds" type="number" min="4" max="60" step="0.5" value="${escapeHtml(settings.playerBufferSeconds)}"></label><label>HLS segment duration, ms<input name="hlsSegmentDurationMs" type="number" min="1000" max="6000" step="100" value="${escapeHtml(settings.hlsSegmentDurationMs)}"></label><label>HLS part duration, ms<input name="hlsPartDurationMs" type="number" min="100" max="1000" step="50" value="${escapeHtml(settings.hlsPartDurationMs)}"></label><label>HLS segment count<input name="hlsSegmentCount" type="number" min="8" max="24" step="1" value="${escapeHtml(Math.max(12, Number(settings.hlsSegmentCount || 12)))}"></label><button type="submit">Save encoder defaults</button></form></section>
<section><h2>Recommended software</h2><ul><li>OBS Studio: Custom streaming server, RTMP URL, stream key.</li><li>Ecamm Live: RTMP destination with the same server URL and stream key.</li><li>Audio Hijack: pair with a supported broadcaster or virtual camera/RTMP workflow for audio-only or mixed sessions.</li><li>Larix Broadcaster and Streamlabs: custom RTMP destination using the same details.</li></ul></section>`;
  res.send(page('Admin encoder settings', body, req.user));
});

app.post('/admin/encoders', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.encoderDefaults = {
    videoBitrate: String(req.body.videoBitrate || '4500k').trim().slice(0, 20),
    audioBitrate: audioBitrates.includes(req.body.audioBitrate) ? req.body.audioBitrate : '160k',
    audioChannels: 'stereo',
    sampleRate: req.body.sampleRate === '44100' ? '44100' : '48000',
    keyframeIntervalSeconds: clampNumber(req.body.keyframeIntervalSeconds, 1, 10, 2),
    latencyMode: ['low', 'balanced', 'stable'].includes(req.body.latencyMode) ? req.body.latencyMode : 'balanced',
    targetLatencySeconds: clampNumber(req.body.targetLatencySeconds, 2, 30, 6),
    playerBufferSeconds: clampNumber(req.body.playerBufferSeconds, 4, 60, 10),
    hlsSegmentDurationMs: clampNumber(req.body.hlsSegmentDurationMs, 1000, 6000, 2000),
    hlsPartDurationMs: clampNumber(req.body.hlsPartDurationMs, 100, 1000, 200),
    hlsSegmentCount: clampNumber(req.body.hlsSegmentCount, 8, 24, 12)
  };
  store.events.push({ id: id('evt'), type: 'encoder_defaults_updated', payload: store.settings.encoderDefaults, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/encoders');
});

app.get('/admin/updater', requireAdmin, (req, res) => {
  const store = readStore();
  const body = `<h1>Admin panel</h1>${adminTabs('updater')}
<section><h2>Update AAAStreamer</h2><p>Current version: <strong>${escapeHtml(appVersion)}</strong>${getGitRevision() ? `, git ${escapeHtml(getGitRevision())}` : ''}</p><form method="post" action="/admin/updater/settings"><label>Update manifest URL<input name="updateManifestUrl" value="${escapeHtml(store.settings.updateManifestUrl)}"></label><button type="submit">Save update source</button></form><form method="post" action="/admin/updater/install"><button type="submit">Install latest update</button></form><p class="muted">Installing an update briefly enables maintenance mode, pulls the configured release source, installs dependencies, restarts AAAStreamer, then disables maintenance mode so admin and user logins reopen.</p></section>
<section><h2>Maintenance mode</h2><p>Status: <strong>${store.settings.maintenanceMode?.enabled ? 'enabled' : 'disabled'}</strong></p><form method="post" action="/admin/updater/maintenance"><label><input type="checkbox" name="enabled" value="true" ${store.settings.maintenanceMode?.enabled ? 'checked' : ''}> Maintenance mode enabled</label><label>Message<input name="message" value="${escapeHtml(store.settings.maintenanceMode?.message || '')}"></label><button type="submit">Save maintenance mode</button></form></section>`;
  res.send(page('Admin updater', body, req.user));
});

app.post('/admin/users', requireAdmin, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || !password) {
    res.status(400).json({ success: false, error: 'Username and password required' });
    return;
  }
  const store = readStore();
  if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    res.status(409).json({ success: false, error: 'Username already exists' });
    return;
  }
  const createdAt = nowIso();
  const user = {
    id: id('usr'),
    username,
    displayName: req.body.displayName || username,
    role: normalizeRole(req.body.role, 'user'),
    passwordHash: hashPassword(password),
    streamKey: id('sk'),
    active: true,
    createdAt,
    updatedAt: createdAt
  };
  store.users.push(user);
  ensureStreamForUser(store, user);
  store.events.push({ id: id('evt'), type: 'user_created', payload: { username, role: user.role }, createdAt });
  writeStore(store);
  res.redirect('/admin/accounts');
});

app.post('/admin/users/:userId', requireAdmin, async (req, res) => {
  const store = readStore();
  const user = userById(store, req.params.userId);
  if (!user) {
    res.status(404).send(page('Account not found', '<h1>Account not found</h1><p>The selected account was not found.</p><p><a class="button" href="/admin/accounts">Back to accounts</a></p>', req.user));
    return;
  }
  user.displayName = String(req.body.displayName || user.username).trim().slice(0, 80) || user.username;
  user.role = normalizeRole(req.body.role, user.role);
  user.notificationEmail = String(req.body.notificationEmail || '').trim().slice(0, 180);
  const paymentSettings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
  const lookup = String(req.body.clientLookup || '').trim();
  const linkedWhmcs = await lookupWhmcsClient(paymentSettings, {
    clientId: /^\d+$/.test(lookup) ? lookup : '',
    email: lookup.includes('@') ? lookup : ''
  });
  user.whmcsPortalEmail = linkedWhmcs?.email || (lookup.includes('@') ? lookup.slice(0, 180) : user.whmcsPortalEmail || '');
  user.whmcsClientId = linkedWhmcs?.clientId || (/^\d+$/.test(lookup) ? lookup.replace(/[^0-9]/g, '').slice(0, 20) : user.whmcsClientId || '');
  user.active = user.id === req.user.id ? true : req.body.active === 'true';
  const password = String(req.body.password || '');
  if (password) {
    if (password.length < 8) {
      res.status(400).send(page('Password not changed', '<h1>Password not changed</h1><p>New passwords must be at least 8 characters.</p><p><a class="button" href="/admin/accounts">Back to accounts</a></p>', req.user));
      return;
    }
    user.passwordHash = hashPassword(password);
    store.sessions = (store.sessions || []).filter((session) => session.userId !== user.id || user.id === req.user.id);
  }
  user.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'admin_account_updated', payload: { username: user.username, role: user.role, active: user.active, clientLinked: Boolean(linkedWhmcs) }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/accounts');
});

app.post('/api/streams/:streamId/support-payments', async (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!stream) {
    res.status(404).json({ success: false, error: 'Stream not found.' });
    return;
  }
  const settings = store.settings.paymentIntegration || defaultPaymentIntegrationSettings();
  const owner = store.users.find((user) => user.id === stream.ownerId);
  const support = effectiveSupportSettings(stream, owner, store.settings);
  const minimum = Number(settings.minimumAmountCents || 100);
  const requestedCents = centsFromAmount(req.body.amount, Number(settings.defaultAmountCents || 500));
  const amountCents = Math.max(minimum, requestedCents);
  const provider = String(req.body.provider || '').toLowerCase();
  const currency = settings.currency || 'usd';
  const createdAt = nowIso();
  const payment = {
    id: id('pay'),
    streamId: stream.id,
    streamSlug: stream.slug,
    provider,
    status: 'created',
    amountCents,
    currency,
    platformSharePercent: support.platformShareEnabled ? clampNumber(support.platformSharePercent, 0, 100, 15) : 0,
    platformFeeCents: 0,
    createdAt,
    updatedAt: createdAt
  };
  try {
    if (provider === 'stripe') {
      if (!settings.stripeEnabled || !stripeSecretKey) throw new Error('Stripe Checkout is not configured.');
      const successUrl = `${publicUrl || `${req.protocol}://${req.get('host')}`}/s/${stream.slug}?payment=success`;
      const cancelUrl = `${publicUrl || `${req.protocol}://${req.get('host')}`}/s/${stream.slug}?payment=cancelled`;
      const checkout = await createStripeCheckoutSession({
        stream,
        support,
        settings,
        amountCents,
        description: support.description || `Support payment for ${stream.title}`,
        successUrl,
        cancelUrl
      });
      payment.providerSessionId = checkout.session.id;
      payment.url = checkout.session.url;
      payment.status = 'pending';
      payment.platformFeeCents = checkout.platformFeeCents;
      store.payments.push(payment);
      store.payments = store.payments.slice(-2000);
      store.events.push({ id: id('evt'), type: 'payment_created', payload: { paymentId: payment.id, provider, streamId: stream.id, amountCents, platformFeeCents: payment.platformFeeCents }, createdAt: nowIso() });
      writeStore(store);
      res.json({ success: true, provider, paymentId: payment.id, url: checkout.session.url });
      return;
    }
    if (provider === 'whmcs') {
      if (!settings.whmcsEnabled) throw new Error('WHMCS payments are not enabled.');
      const userId = support.whmcsClientId || settings.whmcsDefaultClientId;
      if (!userId) throw new Error('A client ID is required for invoice payments.');
      const invoice = await callWhmcsApi(settings, 'CreateInvoice', {
        userid: userId,
        status: 'Unpaid',
        sendinvoice: false,
        paymentmethod: settings.whmcsPaymentMethod,
        itemdescription1: `${support.title || 'AAAStreamer support'} - ${stream.title}`,
        itemamount1: (amountCents / 100).toFixed(2),
        itemtaxed1: false,
        notes: `AAAStreamer stream ${stream.slug}; platform share ${payment.platformSharePercent}%`
      });
      payment.providerInvoiceId = invoice.invoiceid || invoice.id;
      payment.url = `${String(settings.whmcsUrl || '').replace(/\/+$/, '')}/viewinvoice.php?id=${encodeURIComponent(payment.providerInvoiceId)}`;
      payment.status = 'invoice_created';
      payment.platformFeeCents = support.platformShareEnabled ? Math.round(amountCents * payment.platformSharePercent / 100) : 0;
      store.payments.push(payment);
      store.payments = store.payments.slice(-2000);
      store.events.push({ id: id('evt'), type: 'payment_invoice_created', payload: { paymentId: payment.id, provider, streamId: stream.id, invoiceId: payment.providerInvoiceId, amountCents, platformFeeCents: payment.platformFeeCents }, createdAt: nowIso() });
      writeStore(store);
      res.json({ success: true, provider, paymentId: payment.id, invoiceId: payment.providerInvoiceId, url: payment.url });
      return;
    }
    res.status(400).json({ success: false, error: 'Choose Stripe or WHMCS as the payment method.' });
  } catch (error) {
    store.events.push({ id: id('evt'), type: 'payment_create_failed', payload: { provider, streamId: stream.id, message: error.message }, createdAt: nowIso() });
    writeStore(store);
    res.status(502).json({ success: false, error: error.message });
  }
});

app.post('/api/payments/stripe/webhook', (req, res) => {
  if (!verifyStripeSignature(req)) {
    res.status(400).json({ success: false, error: 'Invalid Stripe signature.' });
    return;
  }
  const event = req.body;
  const session = event?.data?.object || {};
  const store = readStore();
  const payment = (store.payments || []).find((item) => item.provider === 'stripe' && item.providerSessionId === session.id);
  if (payment) {
    if (event.type === 'checkout.session.completed') payment.status = 'paid';
    if (event.type === 'checkout.session.expired') payment.status = 'expired';
    payment.updatedAt = nowIso();
    payment.stripePaymentIntent = session.payment_intent || payment.stripePaymentIntent;
    store.events.push({ id: id('evt'), type: 'stripe_webhook_payment_updated', payload: { paymentId: payment.id, status: payment.status, eventType: event.type }, createdAt: nowIso() });
    writeStore(store);
  } else {
    store.events.push({ id: id('evt'), type: 'stripe_webhook_unmatched', payload: { eventType: event?.type || 'unknown', sessionId: session?.id || null }, createdAt: nowIso() });
    writeStore(store);
  }
  res.json({ received: true });
});

app.post('/admin/updater/settings', requireAdmin, (req, res) => {
  const store = readStore();
  const url = String(req.body.updateManifestUrl || '').trim();
  if (/^https?:\/\//i.test(url)) {
    store.settings.updateManifestUrl = url;
    store.events.push({ id: id('evt'), type: 'update_source_changed', payload: { updateManifestUrl: url }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/admin/updater');
});

app.post('/admin/updater/maintenance', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.maintenanceMode = {
    enabled: req.body.enabled === 'true',
    message: String(req.body.message || '').trim().slice(0, 240)
  };
  store.events.push({ id: id('evt'), type: 'maintenance_mode_changed', payload: store.settings.maintenanceMode, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/updater');
});

app.post('/admin/updater/install', requireAdmin, (req, res) => {
  const script = path.resolve(repoRoot, 'scripts', 'update-aaastreamer.sh');
  if (!fs.existsSync(script)) {
    res.status(500).send(page('Updater unavailable', '<h1>Updater unavailable</h1><p>The update script is missing from this install.</p><a class="button" href="/admin/updater">Back to updater</a>', req.user));
    return;
  }
  const store = readStore();
  store.settings.maintenanceMode = { enabled: true, message: 'AAAStreamer is installing an update. Please reconnect shortly.' };
  store.events.push({ id: id('evt'), type: 'update_install_requested', payload: { requestedBy: req.user.username }, createdAt: nowIso() });
  writeStore(store);
  const child = childProcess.spawn('bash', [script], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      AAASTREAMER_STORE: dataFile,
      AAASTREAMER_ROOT: repoRoot,
      AAASTREAMER_PM2_NAME: process.env.AAASTREAMER_PM2_NAME || 'aaastreamer-api'
    }
  });
  child.unref();
  res.send(page('Update started', '<h1>Update started</h1><p>Maintenance mode is enabled while the update installs. This page can be refreshed in a minute.</p><a class="button" href="/admin/updater">Back to updater</a>', req.user));
});

app.get('/api/me', (req, res) => {
  res.json({ success: true, user: safeUser(currentUser(req)) });
});

app.get('/api/streams', (req, res) => {
  const store = readStore();
  const user = currentUser(req);
  const streams = store.streams
    .filter((stream) => user?.role === 'admin' || stream.ownerId === user?.id || streamIsPubliclyListable(stream, store))
    .map((stream) => {
      ensureContinuousOnDemandRelayForStream(store, stream, 'api_streams');
      return stream;
    })
    .map((stream) => publicStreamSummary(stream, store, user?.role === 'admin' || stream.ownerId === user?.id));
  res.json({ success: true, streams });
});

app.get('/api/streams/:streamId', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!stream) {
    res.status(404).json({ success: false, error: 'Stream not found' });
    return;
  }
  const user = currentUser(req);
  if (!streamIsPubliclyListable(stream, store) && user?.role !== 'admin' && stream.ownerId !== user?.id) {
    res.status(404).json({ success: false, error: 'Stream is offline' });
    return;
  }
  ensureContinuousOnDemandRelayForStream(store, stream, 'api_stream');
  res.json({ success: true, stream: publicStreamSummary(stream, store, user?.role === 'admin' || stream.ownerId === user?.id) });
});

app.post('/api/streams/:streamId/comments', async (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!stream || !stream.allowComments) {
    res.status(403).json({ success: false, error: 'Comments are disabled' });
    return;
  }
  const user = currentUser(req);
  const messaging = normalizeMessagingSettings(store.settings.messaging || {});
  if (user && !messaging.loggedInUserMessagesEnabled) {
    res.status(403).json({ success: false, error: 'Messages are disabled for logged-in users' });
    return;
  }
  if (!user && !messaging.visitorMessagesEnabled) {
    res.status(403).json({ success: false, error: 'Guest messages are disabled' });
    return;
  }
  const maxLength = clampNumber(messaging.maxMessageLength, 100, 5000, 1000);
  const message = String(req.body.message || '').trim().slice(0, maxLength);
  const authorName = user
    ? String(user.displayName || user.username).trim().slice(0, 80)
    : String(req.body.authorName || (messaging.requireNameForGuests ? '' : 'Visitor')).trim().slice(0, 80);
  const messageType = ['comment', 'question', 'support'].includes(req.body.messageType) ? req.body.messageType : 'comment';
  if (!user && messaging.requireNameForGuests && !authorName) {
    res.status(400).json({ success: false, error: 'Name is required' });
    return;
  }
  if (!message) {
    res.status(400).json({ success: false, error: 'Comment is required' });
    return;
  }
  const ipAddress = requestClientIp(req);
  const commentIdentity = {
    ipAddress,
    ipVersion: ipVersion(ipAddress),
    requestHost: requestHostName(req),
    reverseDnsHost: await reverseDnsHost(ipAddress),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
    authorName
  };
  const accessRule = evaluateCommentAccessRules(store, commentIdentity, user);
  if (accessRule?.action === 'block') {
    store.events.push({ id: id('evt'), type: 'comment_blocked_by_access_rule', payload: { streamId: stream.id, targetType: accessRule.targetType, ipVersion: commentIdentity.ipVersion }, createdAt: nowIso() });
    writeStore(store);
    res.status(403).json({ success: false, error: 'Comments are not available for this visitor.' });
    return;
  }
  const blockedWord = messaging.autoHideBlockedWords ? messageHitsBlockedWord(message, messaging) : '';
  const status = accessRule?.action === 'allow'
    ? (blockedWord ? 'hidden' : 'visible')
    : accessRule?.action === 'hide'
      ? 'hidden'
      : accessRule?.action === 'review'
        ? 'pending'
        : blockedWord ? 'hidden' : (!user && messaging.requireGuestReview ? 'pending' : 'visible');
  const comment = {
    id: id('cmt'),
    streamId: stream.id,
    authorName: authorName || 'Visitor',
    authorType: user ? 'logged-in user' : 'guest',
    authorUserId: user?.id || null,
    messageType,
    message,
    reactions: {},
    status,
    moderationReason: accessRule ? `Comment access rule: ${accessRule.targetType} ${accessRule.action}` : blockedWord ? `Blocked word or phrase: ${blockedWord}` : '',
    ipAddress: commentIdentity.ipAddress,
    ipVersion: commentIdentity.ipVersion,
    requestHost: commentIdentity.requestHost,
    reverseDnsHost: commentIdentity.reverseDnsHost,
    userAgent: commentIdentity.userAgent,
    createdAt: nowIso()
  };
  store.comments.push(comment);
  pruneComments(store);
  writeStore(store);
  if (comment.status === 'visible') {
    broadcast({ type: 'comment', payload: { ...comment, html: renderComment(comment, messaging.reactionsEnabled) } });
  }
  res.json({
    success: true,
    comment,
    moderationStatus: comment.status,
    message: comment.status === 'pending' ? 'Message received and waiting for moderation.' : comment.status === 'hidden' ? 'Message received but hidden by moderation settings.' : 'Message posted.'
  });
});

app.post('/api/comments/:commentId/reactions', (req, res) => {
  const store = readStore();
  const messaging = normalizeMessagingSettings(store.settings.messaging || {});
  if (!messaging.reactionsEnabled) {
    res.status(403).json({ success: false, error: 'Reactions are disabled' });
    return;
  }
  const streamId = String(req.body.streamId || '').trim();
  const reaction = String(req.body.reaction || '').trim().toLowerCase();
  if (!['like', 'love', 'applause', 'thanks'].includes(reaction)) {
    res.status(400).json({ success: false, error: 'Unsupported reaction' });
    return;
  }
  const comment = store.comments.find((item) => item.id === req.params.commentId && (!streamId || item.streamId === streamId) && item.status !== 'hidden' && item.status !== 'pending');
  if (!comment) {
    res.status(404).json({ success: false, error: 'Comment not found' });
    return;
  }
  comment.reactions ||= {};
  comment.reactions[reaction] = Number(comment.reactions[reaction] || 0) + 1;
  writeStore(store);
  const html = ['like', 'love', 'applause', 'thanks'].map((name) => {
    const count = Number(comment.reactions[name] || 0);
    return `<button type="button" data-comment-id="${escapeHtml(comment.id)}" data-reaction="${name}">${escapeHtml(name)}${count ? ` ${count}` : ''}</button>`;
  }).join('');
  broadcast({ type: 'reaction', payload: { streamId: comment.streamId, commentId: comment.id, html, reactions: comment.reactions } });
  res.json({ success: true, commentId: comment.id, reactions: comment.reactions, html });
});

app.post('/api/voicelink/validate_user', (req, res) => {
  if (!hasValidSecret(req)) {
    denyUnauthorized(req, res);
    return;
  }
  const payload = normalizedPayload(req);
  const store = readStore();
  const stream = streamByKey(store, payload.name || payload.streamKey || payload.streamId);
  const allowed = Boolean(stream);
  appendEvent('validate_user', { streamKey: payload.name || payload.streamKey || null, allowed });
  res.status(allowed ? 200 : 403).json({
    success: allowed,
    allowed,
    provider: 'aaastreamer',
    streamId: stream?.id || null,
    streamKey: payload.streamKey || payload.name || null
  });
});

app.post('/api/voicelink/on_publish', (req, res) => {
  if (!hasValidSecret(req)) {
    denyUnauthorized(req, res);
    return;
  }
  const payload = normalizedPayload(req);
  const store = readStore();
  const key = streamIdentifier(payload);
  let stream = streamByKey(store, key);
  if (!stream) {
    if (!allowAdHocStreams) {
      appendEvent('publish_rejected', { streamKey: key, reason: 'unknown_stream_key' });
      res.status(403).json({ success: false, allowed: false, error: 'Unknown stream key' });
      return;
    }
    const createdAt = nowIso();
    stream = {
      id: id('str'),
      ownerId: null,
      title: payload.title || payload.name || 'Live Stream',
      slug: slugify(payload.title || payload.name || key),
      description: '',
      streamKey: key,
      status: 'offline',
      visibility: 'public',
      allowComments: true,
      createdAt
    };
    store.streams.push(stream);
  }
  stream.status = 'live';
  stream.source = payload.source || 'rtmp';
  stream.ingestApp = payload.app || rtmpAppName;
  const encoder = encoderForKey(stream, key);
  stream.activeEncoderKey = key;
  stream.activeEncoders ||= {};
  stream.activeEncoders[key] = {
    encoderName: encoder?.name || 'Ad hoc encoder',
    hlsUrl: hlsUrlFor(key),
    latencySettings: stream.latencySettings,
    encoderSettings: {
      audioBitrate: encoder?.audioBitrate || stream.encoderSettings?.audioBitrate,
      audioChannels: encoder?.audioChannels || 'stereo',
      sampleRate: encoder?.sampleRate || stream.encoderSettings?.sampleRate
    },
    startedAt: nowIso(),
    status: 'live'
  };
  stream.hlsUrl = hlsUrlFor(key);
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'publish', payload, createdAt: nowIso() });
  writeStore(store);
  broadcast({ type: 'publish', payload: stream });
  res.json({ success: true, stream });
});

app.post('/api/voicelink/on_done', (req, res) => {
  if (!hasValidSecret(req)) {
    denyUnauthorized(req, res);
    return;
  }
  const payload = normalizedPayload(req);
  const store = readStore();
  const stream = streamByKey(store, payload.streamId || payload.name || payload.streamKey);
  if (stream) {
    const key = payload.name || payload.streamKey || stream.activeEncoderKey || stream.streamKey;
    if (stream.activeEncoders?.[key]) {
      stream.activeEncoders[key].status = 'ended';
      stream.activeEncoders[key].endedAt = nowIso();
    }
    const hasLiveEncoder = Object.values(stream.activeEncoders || {}).some((encoder) => encoder.status === 'live');
    stream.status = hasLiveEncoder ? 'live' : 'ended';
    stream.updatedAt = nowIso();
  }
  store.events.push({ id: id('evt'), type: 'done', payload, createdAt: nowIso() });
  writeStore(store);
  broadcast({ type: 'done', payload: stream || payload });
  res.json({ success: true, streamId: stream?.id || null });
});

app.post('/api/streams/:streamId/restream/start', requireUser, (req, res) => {
  if (!allowRestream) {
    res.status(403).json({ success: false, error: 'Restreaming is disabled' });
    return;
  }
  appendEvent('restream_start', { streamId: req.params.streamId, requestedBy: req.user.username, target: req.body.target || null });
  res.json({ success: true, streamId: req.params.streamId, state: 'starting' });
});

app.post('/api/streams/:streamId/restream/stop', requireUser, (req, res) => {
  if (!allowRestream) {
    res.status(403).json({ success: false, error: 'Restreaming is disabled' });
    return;
  }
  appendEvent('restream_stop', { streamId: req.params.streamId, requestedBy: req.user.username });
  res.json({ success: true, streamId: req.params.streamId, state: 'stopping' });
});

app.listen(port, () => {
  ensureDataStore();
  ensureContinuousOnDemandRelays();
  setInterval(() => {
    runSchedulerTick();
    ensureContinuousOnDemandRelays();
  }, 30000).unref();
  console.log(`AAAStreamer listening on ${port}`);
});
