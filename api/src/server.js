import crypto from 'crypto';
import childProcess from 'child_process';
import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

const port = Number(process.env.AAASTREAMER_PORT || 8095);
const dataDir = path.resolve(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'aaastreamer.json');
const hlsPath = process.env.HLS_PATH || '/tmp/hls';
const publicUrl = (process.env.AAASTREAMER_PUBLIC_URL || '').replace(/\/+$/, '');
const hlsBaseUrl = (process.env.AAASTREAMER_HLS_BASE_URL || publicUrl || '').replace(/\/+$/, '');
const rtmpHost = process.env.AAASTREAMER_RTMP_HOST || 'localhost';
const rtmpAppName = process.env.RTMP_APP_NAME || 'live';
const requireSecret = process.env.AAASTREAMER_REQUIRE_SECRET === 'true';
const sharedSecret = process.env.VOICELINK_SHARED_SECRET || '';
const allowRestream = process.env.ALLOW_RESTREAM !== 'false';
const allowAdHocStreams = process.env.AAASTREAMER_ALLOW_AD_HOC_STREAMS === 'true';
const sessionCookieName = 'aaastreamer_session';
const sseClients = new Set();
const appVersion = process.env.AAASTREAMER_VERSION || '0.1.1';
const updateManifestUrl = process.env.AAASTREAMER_UPDATE_MANIFEST_URL || 'https://raw.githubusercontent.com/Raywonder/aaastreamer/main/api/package.json';
const audioBitrates = ['96k', '128k', '160k', '192k', '256k', '320k'];
const platformPresets = [
  { id: 'youtube', name: 'YouTube Live', url: 'https://www.youtube.com/live_dashboard', ingest: 'rtmp://a.rtmp.youtube.com/live2' },
  { id: 'twitch', name: 'Twitch', url: 'https://dashboard.twitch.tv/u/stream-manager', ingest: 'rtmp://live.twitch.tv/app' },
  { id: 'facebook', name: 'Facebook Live', url: 'https://www.facebook.com/live/producer', ingest: 'rtmps://live-api-s.facebook.com:443/rtmp' },
  { id: 'linkedin', name: 'LinkedIn Live', url: 'https://www.linkedin.com/video/golive/now/', ingest: 'rtmp://1-rtmp-live.linkedin.com/live' },
  { id: 'kick', name: 'Kick', url: 'https://kick.com/dashboard/stream', ingest: 'rtmps://fa-live.stream.kick.com/app' },
  { id: 'restream', name: 'Restream.io', url: 'https://app.restream.io/channel', ingest: 'rtmp://live.restream.io/live' },
  { id: 'custom', name: 'Custom RTMP or RTMPS', url: '', ingest: '' }
];

app.use('/hls', express.static(hlsPath, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
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

function ensureDataStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({
      users: [],
      streams: [],
      comments: [],
      events: [],
      sessions: [],
      settings: {
        siteName: process.env.AAASTREAMER_SITE_NAME || 'AAAStreamer',
        visitorCommentsEnabled: true,
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

function defaultEncoderSettings() {
  return {
    videoBitrate: '4500k',
    audioBitrate: '160k',
    audioChannels: 'stereo',
    sampleRate: '48000',
    keyframeIntervalSeconds: 2
  };
}

function normalizeStore(store) {
  store.users ||= [];
  store.streams ||= [];
  store.comments ||= [];
  store.events ||= [];
  store.sessions ||= [];
  store.settings ||= {};
  store.settings.siteName ||= process.env.AAASTREAMER_SITE_NAME || 'AAAStreamer';
  store.settings.visitorCommentsEnabled ??= true;
  store.settings.registrationsEnabled ??= process.env.AAASTREAMER_REGISTRATION_ENABLED === 'true';
  store.settings.registrationDefaultRole ||= 'user';
  store.settings.encoderDefaults = { ...defaultEncoderSettings(), ...(store.settings.encoderDefaults || {}) };
  store.settings.updateManifestUrl ||= updateManifestUrl;
  store.settings.maintenanceMode ||= { enabled: false, message: '' };
  for (const stream of store.streams) normalizeStream(stream);
  return store;
}

function normalizeStream(stream) {
  stream.encoderKeys ||= [];
  stream.destinations ||= [];
  stream.links ||= [];
  stream.backgroundImage ||= '';
  stream.encoderSettings = { ...defaultEncoderSettings(), ...(stream.encoderSettings || {}) };
  stream.activeEncoders ||= {};
  return stream;
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

function watchUrlFor(stream) {
  return `${publicUrl || ''}/s/${stream.slug}`;
}

function ensureStreamForUser(store, user, body = {}) {
  const existing = store.streams.find((stream) => stream.ownerId === user.id);
  if (existing) return normalizeStream(existing);
  const createdAt = nowIso();
  const title = body.title || `${user.displayName || user.username}'s Stream`;
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
    encoderSettings: defaultEncoderSettings(),
    encoderKeys: [],
    destinations: [],
    links: [],
    backgroundImage: '',
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
.field-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem;align-items:end;margin:.75rem 0}.field-row label{margin:0}.inline-form{display:inline}.notice{margin:.75rem 0;color:#d7ecff}.link-list{padding-left:1.25rem}.public-hero{background-size:cover;background-position:center;border-radius:6px;padding:1rem;border:1px solid #303944}
</style>
</head>
<body><header><strong>AAAStreamer</strong><nav>${nav}<a href="/">Visitor page</a></nav></header><main>${body}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function parseLinks(raw) {
  return String(raw || '').split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const [label, ...urlParts] = trimmed.includes('|') ? trimmed.split('|') : ['', trimmed];
    const url = urlParts.join('|').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    return { id: id('lnk'), label: (label || url).trim().slice(0, 80), url: url.slice(0, 500) };
  }).filter(Boolean).slice(0, 12);
}

function linksText(links) {
  return (links || []).map((link) => `${link.label || link.url}|${link.url}`).join('\n');
}

function renderLinks(links) {
  if (!links?.length) return '<p class="muted">No links have been added yet.</p>';
  return `<ul class="link-list">${links.map((link) => `<li><a href="${escapeHtml(link.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(link.label || link.url)}</a></li>`).join('')}</ul>`;
}

function adminTabs(active) {
  const tabs = [
    ['streams', 'Streams'],
    ['accounts', 'Accounts'],
    ['signups', 'Signups'],
    ['encoders', 'Encoder settings'],
    ['updater', 'Updater']
  ];
  return `<nav class="tabs" aria-label="Admin sections">${tabs.map(([idValue, label]) => `<a href="/admin/${idValue}" ${active === idValue ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function embedCodeFor(stream) {
  const src = `${publicUrl || ''}/embed/${stream.slug}`;
  return `<iframe title="${escapeHtml(stream.title)}" src="${escapeHtml(src)}" width="800" height="450" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
}

function getGitRevision() {
  try {
    return childProcess.execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: path.resolve(process.cwd(), '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    service: 'aaastreamer',
    publicUrl: publicUrl || null,
    hlsBaseUrl: hlsBaseUrl || null,
    rtmpUrl: `rtmp://${rtmpHost}:1935/${rtmpAppName}`,
  restreamEnabled: allowRestream,
    adHocStreamsEnabled: allowAdHocStreams,
    voicelinkApiUrl: process.env.VOICELINK_API_URL || null
  });
});

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.use((req, res, next) => {
  const store = readStore();
  const maintenance = store.settings.maintenanceMode || {};
  const allowedPrefixes = ['/login', '/logout', '/admin', '/events', '/healthz', '/api/admin/update'];
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
  const streams = store.streams.filter((stream) => stream.visibility === 'public');
  const body = `<h1>${escapeHtml(store.settings.siteName)}</h1>
<p class="muted">Live streams and upcoming channels.</p>
<div class="grid">${streams.map((stream) => `<section><h2>${escapeHtml(stream.title)}</h2><p>Status: <strong class="status-${escapeHtml(stream.status)}">${escapeHtml(stream.status)}</strong></p><p>${escapeHtml(stream.description || '')}</p><a class="button" href="/s/${escapeHtml(stream.slug)}">Watch stream</a></section>`).join('') || '<section>No public streams yet.</section>'}</div>`;
  res.send(page(store.settings.siteName, body, currentUser(req)));
});

app.get('/s/:slug', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.slug === req.params.slug || item.id === req.params.slug);
  if (!stream) {
    res.status(404).send(page('Stream not found', '<h1>Stream not found</h1>', currentUser(req)));
    return;
  }
  const comments = store.comments.filter((comment) => comment.streamId === stream.id).slice(-100);
  const heroStyle = stream.backgroundImage ? ` style="background-image:linear-gradient(rgba(16,19,22,.78),rgba(16,19,22,.78)),url('${escapeHtml(stream.backgroundImage)}')"` : '';
  const body = `<div class="public-hero"${heroStyle}><h1>${escapeHtml(stream.title)}</h1>
<p>Status: <strong class="status-${escapeHtml(stream.status)}">${escapeHtml(stream.status)}</strong></p>
<video controls playsinline src="${escapeHtml(stream.hlsUrl || hlsUrlFor(stream.streamKey))}"></video></div>
<section><h2>About this stream</h2><p>${escapeHtml(stream.description || 'No description yet.')}</p><h3>Links</h3>${renderLinks(stream.links)}</section>
<section><h2>Live comments</h2><div id="comments" class="comments">${comments.map(renderComment).join('')}</div>
${stream.allowComments ? `<form id="commentForm"><label>Name<input name="authorName" required></label><label>Comment<textarea name="message" required rows="3"></textarea></label><button type="submit">Post comment</button></form>` : '<p>Comments are disabled for this stream.</p>'}</section>
<script>
const streamId=${JSON.stringify(stream.id)};
const comments=document.getElementById('comments');
const events=new EventSource('/events');
events.onmessage=(event)=>{try{const msg=JSON.parse(event.data); if(msg.type==='comment' && msg.payload.streamId===streamId){comments.insertAdjacentHTML('beforeend', msg.payload.html); comments.scrollTop=comments.scrollHeight;}}catch{}};
const form=document.getElementById('commentForm');
if(form){form.addEventListener('submit', async (e)=>{e.preventDefault(); const data=Object.fromEntries(new FormData(form)); const res=await fetch('/api/streams/'+streamId+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(res.ok) form.reset();});}
</script>`;
  res.send(page(stream.title, body, currentUser(req)));
});

app.get('/embed/:slug', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.slug === req.params.slug || item.id === req.params.slug);
  if (!stream) {
    res.status(404).send('Stream not found');
    return;
  }
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(stream.title)}</title><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;background:#000}</style></head><body><video controls playsinline autoplay src="${escapeHtml(stream.hlsUrl || hlsUrlFor(stream.streamKey))}"></video></body></html>`);
});

function renderComment(comment) {
  return `<div class="comment"><strong>${escapeHtml(comment.authorName)}</strong> <span class="muted">${escapeHtml(comment.createdAt)}</span><p>${escapeHtml(comment.message)}</p></div>`;
}

app.get('/login', (req, res) => {
  if (currentUser(req)) {
    res.redirect('/dashboard');
    return;
  }
  res.send(page('Log in', `<h1>Log in</h1><form method="post" action="/login"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Log in</button></form>`, null));
});

app.get('/signup', (req, res) => {
  const store = readStore();
  if (!store.settings.registrationsEnabled) {
    res.status(404).send(page('Signups closed', '<h1>Signups closed</h1><p>New account signups are not enabled on this server.</p>', currentUser(req)));
    return;
  }
  res.send(page('Sign up', `<h1>Create your AAAStreamer account</h1><form method="post" action="/signup"><label>Username<input name="username" autocomplete="username" required></label><label>Display name<input name="displayName"></label><label>Password<input name="password" type="password" autocomplete="new-password" required minlength="8"></label><button type="submit">Create account</button></form>`, null));
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
    role: store.settings.registrationDefaultRole === 'admin' ? 'admin' : 'user',
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
  res.redirect('/dashboard');
});

app.post('/login', (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.username.toLowerCase() === String(req.body.username || '').toLowerCase() && item.active);
  if (!user || !verifyPassword(req.body.password || '', user.passwordHash)) {
    res.status(403).send(page('Login failed', '<h1>Login failed</h1><p>Username or password was not accepted.</p><a class="button" href="/login">Try again</a>', null));
    return;
  }
  const token = id('sess');
  store.sessions.push({ token, userId: user.id, createdAt: nowIso(), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString() });
  writeStore(store);
  res.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
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
  writeStore(store);
  const serverUrl = rtmpUrlFor(stream.streamKey);
  const watchUrl = watchUrlFor(stream);
  const hlsUrl = stream.hlsUrl || hlsUrlFor(stream.streamKey);
  const embedCode = embedCodeFor(stream);
  const encoders = [
    { id: 'primary', name: 'Primary encoder', key: stream.streamKey, audioBitrate: stream.encoderSettings.audioBitrate, active: true },
    ...stream.encoderKeys
  ];
  const encoderRows = encoders.map((encoder) => `<tr><td>${escapeHtml(encoder.name)}</td><td><code>${escapeHtml(encoder.key)}</code></td><td>${escapeHtml(encoder.audioBitrate || stream.encoderSettings.audioBitrate)}</td><td>${encoder.active === false ? 'disabled' : 'enabled'}</td><td><input readonly value="${escapeHtml(hlsUrlFor(encoder.key))}"></td></tr>`).join('');
  const destinationRows = (stream.destinations || []).map((destination) => `<tr><td>${escapeHtml(destination.name)}</td><td>${escapeHtml(destination.platform)}</td><td>${destination.enabled ? 'enabled' : 'disabled'}</td><td><code>${escapeHtml(destination.rtmpUrl)}</code></td><td><form method="post" action="/dashboard/destinations/${escapeHtml(destination.id)}/delete"><button type="submit" class="danger">Remove</button></form></td></tr>`).join('');
  const presetOptions = platformPresets.map((preset) => `<option value="${escapeHtml(preset.id)}" data-ingest="${escapeHtml(preset.ingest)}">${escapeHtml(preset.name)}</option>`).join('');
  const body = `<h1>User panel</h1>
<section><h2>User streaming details</h2>
<p class="muted">Use these connection details in OBS, Ecamm Live, Audio Hijack, Streamlabs, vMix, Larix Broadcaster, or any app that can publish RTMP. The server URL stays the same; the stream key identifies your account or encoder.</p>
<div class="field-row"><label>Server URL<input id="rtmpUrl" readonly value="${escapeHtml(serverUrl)}"></label><button type="button" data-copy-target="rtmpUrl">Copy URL</button></div>
<div class="field-row"><label>Stream key<input id="streamKey" readonly value="${escapeHtml(stream.streamKey)}"></label><button type="button" data-copy-target="streamKey">Copy key</button></div>
<div class="field-row"><label>Watch page<input id="watchUrl" readonly value="${escapeHtml(watchUrl)}"></label><button type="button" data-copy-target="watchUrl">Copy watch link</button></div>
<div class="field-row"><label>HLS playback URL<input id="hlsUrl" readonly value="${escapeHtml(hlsUrl)}"></label><button type="button" data-copy-target="hlsUrl">Copy HLS link</button></div>
<div class="field-row"><label>Web embed code<input id="embedCode" readonly value="${escapeHtml(embedCode)}"></label><button type="button" data-copy-target="embedCode">Copy embed code</button></div>
<p><button type="button" id="shareStream">Share stream link</button></p>
<p id="copyStatus" class="notice" role="status" aria-live="polite"></p>
<form class="inline-form" method="post" action="/dashboard/stream/key"><input type="hidden" name="action" value="regenerate"><button type="submit">Regenerate stream key</button></form>
<form class="inline-form" method="post" action="/dashboard/stream/key"><input type="hidden" name="action" value="revoke"><button type="submit" class="danger">Revoke current stream key</button></form>
<p class="muted">Changing the key immediately prevents future publishes with the old key. Update OBS or any other streaming app after regenerating or revoking a key.</p>
</section>
<section><h2>Encoder keys</h2><p class="muted">Add separate keys when you want more than one encoder configured, such as OBS on Windows plus Ecamm on Mac. Audio presets are stereo and can be set from 96k through 320k.</p>
<table><tr><th>Name</th><th>Key</th><th>Audio bitrate</th><th>Status</th><th>HLS output</th></tr>${encoderRows}</table>
<form method="post" action="/dashboard/encoders"><label>Encoder name<input name="name" placeholder="OBS Windows, Ecamm Mac, Audio Hijack"></label><label>Audio bitrate<select name="audioBitrate">${audioBitrates.map((rate) => `<option ${rate === stream.encoderSettings.audioBitrate ? 'selected' : ''}>${rate}</option>`).join('')}</select></label><button type="submit">Add encoder key</button></form></section>
<section><h2>Destinations</h2><p class="muted">Add external destinations so the stream details are kept with the account. OBS and Ecamm can stream directly to these platforms, and AAAStreamer keeps the connection data organized for later API fan-out.</p>
<table><tr><th>Name</th><th>Platform</th><th>Status</th><th>RTMP URL</th><th>Action</th></tr>${destinationRows || '<tr><td colspan="5">No destinations configured yet.</td></tr>'}</table>
<form method="post" action="/dashboard/destinations"><label>Platform<select id="platformPreset" name="platform">${presetOptions}</select></label><label>Name<input name="name" placeholder="Main YouTube channel"></label><label>RTMP or RTMPS URL<input id="destinationRtmpUrl" name="rtmpUrl"></label><label>Stream key<input name="streamKey"></label><label><input type="checkbox" name="enabled" value="true" checked> Enable destination</label><button type="submit">Add destination</button></form>
<p class="muted">Popular destination dashboards: ${platformPresets.filter((preset) => preset.url).map((preset) => `<a href="${escapeHtml(preset.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(preset.name)}</a>`).join(', ')}.</p></section>
<section><h2>Stream profile</h2><form method="post" action="/dashboard/stream"><label>Title<input name="title" value="${escapeHtml(stream.title)}"></label><label>Description<textarea name="description" rows="4">${escapeHtml(stream.description || '')}</textarea></label><label>Links, one per line. Use Label|https://example.com<textarea name="links" rows="4">${escapeHtml(linksText(stream.links))}</textarea></label><label>Optional photo background<input id="backgroundUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><input type="hidden" id="backgroundImageData" name="backgroundImageData"><label><input type="checkbox" name="removeBackground" value="true"> Remove current background</label><label>Visibility<select name="visibility"><option ${stream.visibility === 'public' ? 'selected' : ''}>public</option><option ${stream.visibility === 'unlisted' ? 'selected' : ''}>unlisted</option></select></label><label><input type="checkbox" name="allowComments" value="true" ${stream.allowComments ? 'checked' : ''}> Allow visitor comments</label><button type="submit">Save stream profile</button></form></section>
<script>
const copyStatus=document.getElementById('copyStatus');
function setCopyStatus(message){copyStatus.textContent=message;}
async function copyText(value,label){
  if(navigator.clipboard && window.isSecureContext){await navigator.clipboard.writeText(value);}
  else{const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-9999px';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}
  setCopyStatus(label+' copied.');
}
document.querySelectorAll('[data-copy-target]').forEach((button)=>button.addEventListener('click',async()=>{const field=document.getElementById(button.dataset.copyTarget);try{await copyText(field.value,button.textContent.replace(/^Copy /,''));}catch{setCopyStatus('Copy failed. Select the field and copy it manually.');}}));
document.getElementById('shareStream').addEventListener('click',async()=>{const url=document.getElementById('watchUrl').value;const title=${JSON.stringify(stream.title)};try{if(navigator.share){await navigator.share({title,url});setCopyStatus('Share sheet opened.');}else{await copyText(url,'Stream link');}}catch(error){if(error && error.name==='AbortError')return;try{await copyText(url,'Stream link');}catch{setCopyStatus('Sharing failed. Select the watch page field and copy it manually.');}}});
const platformPreset=document.getElementById('platformPreset');
const destinationRtmpUrl=document.getElementById('destinationRtmpUrl');
if(platformPreset){platformPreset.addEventListener('change',()=>{const option=platformPreset.selectedOptions[0];if(option && !destinationRtmpUrl.value){destinationRtmpUrl.value=option.dataset.ingest||'';}});platformPreset.dispatchEvent(new Event('change'));}
const backgroundUpload=document.getElementById('backgroundUpload');
const backgroundImageData=document.getElementById('backgroundImageData');
if(backgroundUpload){backgroundUpload.addEventListener('change',()=>{const file=backgroundUpload.files&&backgroundUpload.files[0];if(!file)return;if(file.size>700000){setCopyStatus('Background image is too large. Use an image under 700 KB.');backgroundUpload.value='';return;}const reader=new FileReader();reader.onload=()=>{backgroundImageData.value=String(reader.result||'');setCopyStatus('Background image ready to save.');};reader.readAsDataURL(file);});}
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
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
});

app.post('/dashboard/destinations', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const preset = platformPresets.find((item) => item.id === req.body.platform) || platformPresets.at(-1);
  const rtmpUrl = String(req.body.rtmpUrl || preset.ingest || '').trim();
  if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
    res.status(400).send(page('Destination not saved', '<h1>Destination not saved</h1><p>Use an RTMP or RTMPS destination URL.</p><a class="button" href="/dashboard">Back to dashboard</a>', req.user));
    return;
  }
  stream.destinations.push({
    id: id('dst'),
    platform: preset.name,
    name: String(req.body.name || preset.name).trim().slice(0, 100) || preset.name,
    rtmpUrl,
    streamKey: String(req.body.streamKey || '').trim(),
    enabled: req.body.enabled === 'true',
    createdAt: nowIso()
  });
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'destination_added', payload: { streamId: stream.id, platform: preset.name }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
});

app.post('/dashboard/stream/key', requireUser, (req, res) => {
  const action = String(req.body.action || '').toLowerCase();
  if (!['regenerate', 'revoke'].includes(action)) {
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
    type: action === 'revoke' ? 'stream_key_revoked' : 'stream_key_regenerated',
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
  const body = `<h1>Admin panel</h1>${adminTabs('accounts')}
<section><h2>Create user</h2><form method="post" action="/admin/users"><label>Username<input name="username" required></label><label>Display name<input name="displayName"></label><label>Password<input name="password" type="password" required></label><label>Role<select name="role"><option>user</option><option>admin</option></select></label><button type="submit">Create user</button></form></section>
<section><h2>Users</h2><table><tr><th>Username</th><th>Display name</th><th>Role</th><th>Active</th><th>Primary stream key</th></tr>${store.users.map((item) => `<tr><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.displayName || '')}</td><td>${escapeHtml(item.role)}</td><td>${item.active ? 'yes' : 'no'}</td><td><code>${escapeHtml(item.streamKey || '')}</code></td></tr>`).join('')}</table></section>`;
  res.send(page('Admin accounts', body, req.user));
});

app.get('/admin/signups', requireAdmin, (req, res) => {
  const store = readStore();
  const body = `<h1>Admin panel</h1>${adminTabs('signups')}
<section><h2>Signup settings</h2><form method="post" action="/admin/signups"><label><input type="checkbox" name="registrationsEnabled" value="true" ${store.settings.registrationsEnabled ? 'checked' : ''}> Enable user signups</label><label>New account role<select name="registrationDefaultRole"><option value="user" ${store.settings.registrationDefaultRole !== 'admin' ? 'selected' : ''}>user</option><option value="admin" ${store.settings.registrationDefaultRole === 'admin' ? 'selected' : ''}>admin</option></select></label><button type="submit">Save signup settings</button></form></section>
<section><h2>Signup page</h2><p>When enabled, new users can create an account at <a href="/signup">/signup</a>. Each new account receives a stream page, primary stream key, and dashboard access.</p></section>`;
  res.send(page('Admin signups', body, req.user));
});

app.post('/admin/signups', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.registrationsEnabled = req.body.registrationsEnabled === 'true';
  store.settings.registrationDefaultRole = req.body.registrationDefaultRole === 'admin' ? 'admin' : 'user';
  store.events.push({ id: id('evt'), type: 'signup_settings_updated', payload: { enabled: store.settings.registrationsEnabled, defaultRole: store.settings.registrationDefaultRole }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/signups');
});

app.get('/admin/encoders', requireAdmin, (req, res) => {
  const store = readStore();
  const settings = store.settings.encoderDefaults;
  const body = `<h1>Admin panel</h1>${adminTabs('encoders')}
<section><h2>Default encoder settings</h2><form method="post" action="/admin/encoders"><label>Video bitrate<input name="videoBitrate" value="${escapeHtml(settings.videoBitrate)}"></label><label>Audio bitrate<select name="audioBitrate">${audioBitrates.map((rate) => `<option ${rate === settings.audioBitrate ? 'selected' : ''}>${rate}</option>`).join('')}</select></label><label>Audio channels<select name="audioChannels"><option value="stereo" selected>stereo</option></select></label><label>Sample rate<select name="sampleRate"><option ${settings.sampleRate === '44100' ? 'selected' : ''}>44100</option><option ${settings.sampleRate !== '44100' ? 'selected' : ''}>48000</option></select></label><label>Keyframe interval seconds<input name="keyframeIntervalSeconds" type="number" min="1" max="10" value="${escapeHtml(settings.keyframeIntervalSeconds)}"></label><button type="submit">Save encoder defaults</button></form></section>
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
    keyframeIntervalSeconds: Math.max(1, Math.min(10, Number(req.body.keyframeIntervalSeconds || 2)))
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
    role: req.body.role === 'admin' ? 'admin' : 'user',
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
  const script = path.resolve(process.cwd(), '..', 'scripts', 'update-aaastreamer.sh');
  if (!fs.existsSync(script)) {
    res.status(500).send(page('Updater unavailable', '<h1>Updater unavailable</h1><p>The update script is missing from this install.</p><a class="button" href="/admin/updater">Back to updater</a>', req.user));
    return;
  }
  const store = readStore();
  store.settings.maintenanceMode = { enabled: true, message: 'AAAStreamer is installing an update. Please reconnect shortly.' };
  store.events.push({ id: id('evt'), type: 'update_install_requested', payload: { requestedBy: req.user.username }, createdAt: nowIso() });
  writeStore(store);
  const child = childProcess.spawn('bash', [script], {
    cwd: path.resolve(process.cwd(), '..'),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      AAASTREAMER_STORE: dataFile,
      AAASTREAMER_ROOT: path.resolve(process.cwd(), '..'),
      AAASTREAMER_PM2_NAME: process.env.AAASTREAMER_PM2_NAME || 'aaastreamer-api'
    }
  });
  child.unref();
  res.send(page('Update started', '<h1>Update started</h1><p>Maintenance mode is enabled while the update installs. This page can be refreshed in a minute.</p><a class="button" href="/admin/updater">Back to updater</a>', req.user));
});

app.get('/api/me', (req, res) => {
  res.json({ success: true, user: safeUser(currentUser(req)) });
});

app.get('/api/streams', (_req, res) => {
  const store = readStore();
  res.json({ success: true, streams: store.streams });
});

app.get('/api/streams/:streamId', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!stream) {
    res.status(404).json({ success: false, error: 'Stream not found' });
    return;
  }
  res.json({ success: true, stream });
});

app.post('/api/streams/:streamId/comments', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!stream || !stream.allowComments) {
    res.status(403).json({ success: false, error: 'Comments are disabled' });
    return;
  }
  const message = String(req.body.message || '').trim().slice(0, 1000);
  const authorName = String(req.body.authorName || 'Visitor').trim().slice(0, 80);
  if (!message) {
    res.status(400).json({ success: false, error: 'Comment is required' });
    return;
  }
  const comment = { id: id('cmt'), streamId: stream.id, authorName, message, status: 'visible', createdAt: nowIso() };
  store.comments.push(comment);
  store.comments = store.comments.slice(-5000);
  writeStore(store);
  broadcast({ type: 'comment', payload: { ...comment, html: renderComment(comment) } });
  res.json({ success: true, comment });
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
  console.log(`AAAStreamer listening on ${port}`);
});
