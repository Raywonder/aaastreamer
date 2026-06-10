import crypto from 'crypto';
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
        registrationsEnabled: process.env.AAASTREAMER_REGISTRATION_ENABLED === 'true'
      }
    }, null, 2));
  }
  bootstrapAdmin();
}

function readStore() {
  ensureDataStore();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
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
  return store.streams.find((stream) => stream.streamKey === key || stream.id === key || stream.slug === key);
}

function hlsUrlFor(streamId) {
  const local = `/hls/${encodeURIComponent(streamId)}.m3u8`;
  if (!hlsBaseUrl) return local;
  return `${hlsBaseUrl}${local}`;
}

function rtmpUrlFor(streamKey) {
  return `rtmp://${rtmpHost}:1935/${rtmpAppName}`;
}

function ensureStreamForUser(store, user, body = {}) {
  const existing = store.streams.find((stream) => stream.ownerId === user.id);
  if (existing) return existing;
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
    createdAt,
    updatedAt: createdAt
  };
  store.streams.push(stream);
  user.streamKey = stream.streamKey;
  return stream;
}

function page(title, body, user = null) {
  const nav = user
    ? `<a href="/dashboard">Dashboard</a><a href="/admin">Admin</a><form method="post" action="/logout"><button type="submit">Log out</button></form>`
    : `<a href="/login">Log in</a>`;
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
button,.button{display:inline-block;margin:.35rem .35rem .35rem 0;padding:.65rem .85rem;background:#2c75c9;color:white;border:0;border-radius:4px;text-decoration:none;cursor:pointer}
button.secondary,.button.secondary{background:#3d4651} button.danger{background:#b84242}
table{width:100%;border-collapse:collapse;margin-top:.75rem} th,td{border-bottom:1px solid #303944;text-align:left;padding:.6rem;vertical-align:top}
video{width:100%;max-height:65vh;background:black}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.muted{color:#b8c1ca}.status-live{color:#7dff9b}.status-offline,.status-ended{color:#ffbd7d}
.comments{max-height:22rem;overflow:auto;border:1px solid #303944;padding:.75rem;background:#0c0f12}.comment{border-bottom:1px solid #28303a;padding:.45rem 0}
</style>
</head>
<body><header><strong>AAAStreamer</strong><nav>${nav}<a href="/">Visitor page</a></nav></header><main>${body}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
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
  const body = `<h1>${escapeHtml(stream.title)}</h1>
<p>Status: <strong class="status-${escapeHtml(stream.status)}">${escapeHtml(stream.status)}</strong></p>
<video controls playsinline src="${escapeHtml(stream.hlsUrl || hlsUrlFor(stream.streamKey))}"></video>
<section><h2>About this stream</h2><p>${escapeHtml(stream.description || 'No description yet.')}</p></section>
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
  const body = `<h1>User panel</h1>
<section><h2>Your OBS settings</h2><p>Server URL:</p><input readonly value="${escapeHtml(rtmpUrlFor(stream.streamKey))}"><p>Stream key:</p><input readonly value="${escapeHtml(stream.streamKey)}"><p>Watch page:</p><input readonly value="${escapeHtml((publicUrl || '') + '/s/' + stream.slug)}"></section>
<section><h2>Stream details</h2><form method="post" action="/dashboard/stream"><label>Title<input name="title" value="${escapeHtml(stream.title)}"></label><label>Description<textarea name="description" rows="4">${escapeHtml(stream.description || '')}</textarea></label><label>Visibility<select name="visibility"><option ${stream.visibility === 'public' ? 'selected' : ''}>public</option><option ${stream.visibility === 'unlisted' ? 'selected' : ''}>unlisted</option></select></label><label><input type="checkbox" name="allowComments" value="true" ${stream.allowComments ? 'checked' : ''}> Allow visitor comments</label><button type="submit">Save stream details</button></form></section>`;
  res.send(page('Dashboard', body, user));
});

app.post('/dashboard/stream', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user, req.body);
  stream.title = req.body.title || stream.title;
  stream.slug = slugify(stream.title);
  stream.description = req.body.description || '';
  stream.visibility = req.body.visibility === 'unlisted' ? 'unlisted' : 'public';
  stream.allowComments = req.body.allowComments === 'true';
  stream.updatedAt = nowIso();
  writeStore(store);
  res.redirect('/dashboard');
});

app.get('/admin', (req, res) => {
  const user = currentUser(req);
  if (!user || user.role !== 'admin') {
    res.redirect('/login');
    return;
  }
  const store = readStore();
  const body = `<h1>Admin panel</h1>
<div class="grid"><section><h2>Streams</h2><table><tr><th>Title</th><th>Status</th><th>Owner</th><th>Actions</th></tr>${store.streams.map((stream) => `<tr><td>${escapeHtml(stream.title)}</td><td>${escapeHtml(stream.status)}</td><td>${escapeHtml(store.users.find((item) => item.id === stream.ownerId)?.username || '')}</td><td><a href="/s/${escapeHtml(stream.slug)}">View</a></td></tr>`).join('')}</table></section>
<section><h2>Create user</h2><form method="post" action="/admin/users"><label>Username<input name="username" required></label><label>Display name<input name="displayName"></label><label>Password<input name="password" type="password" required></label><label>Role<select name="role"><option>user</option><option>admin</option></select></label><button type="submit">Create user</button></form></section></div>
<section><h2>Users</h2><table><tr><th>Username</th><th>Role</th><th>Active</th><th>Stream key</th></tr>${store.users.map((item) => `<tr><td>${escapeHtml(item.username)}</td><td>${escapeHtml(item.role)}</td><td>${item.active ? 'yes' : 'no'}</td><td><code>${escapeHtml(item.streamKey || '')}</code></td></tr>`).join('')}</table></section>
<section><h2>Recent events</h2><table><tr><th>Time</th><th>Type</th><th>Payload</th></tr>${store.events.slice(-50).reverse().map((event) => `<tr><td>${escapeHtml(event.createdAt)}</td><td>${escapeHtml(event.type)}</td><td><code>${escapeHtml(JSON.stringify(event.payload))}</code></td></tr>`).join('')}</table></section>`;
  res.send(page('Admin', body, user));
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
  res.redirect('/admin');
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
  stream.hlsUrl = hlsUrlFor(stream.streamKey);
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
    stream.status = 'ended';
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
