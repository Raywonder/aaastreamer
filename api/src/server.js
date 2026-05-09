import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const port = Number(process.env.AAASTREAMER_PORT || 8095);
const dataDir = path.resolve(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'streams.json');
const publicUrl = (process.env.AAASTREAMER_PUBLIC_URL || '').replace(/\/+$/, '');
const requireSecret = process.env.AAASTREAMER_REQUIRE_SECRET === 'true';
const sharedSecret = process.env.VOICELINK_SHARED_SECRET || '';
const allowRestream = process.env.ALLOW_RESTREAM !== 'false';

function ensureDataStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(
      dataFile,
      JSON.stringify({ streams: [], events: [] }, null, 2)
    );
  }
}

function readStore() {
  ensureDataStore();
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeStore(store) {
  ensureDataStore();
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function appendEvent(type, payload) {
  const store = readStore();
  store.events.push({
    id: `evt_${Date.now()}`,
    type,
    payload,
    createdAt: new Date().toISOString()
  });
  writeStore(store);
}

function normalizedPayload(req) {
  return {
    ...req.query,
    ...(req.body || {})
  };
}

function hasValidSecret(req) {
  if (!requireSecret) {
    return true;
  }
  if (!sharedSecret || sharedSecret === 'replace-me') {
    return false;
  }
  const provided =
    req.get('x-voicelink-secret') ||
    req.query.secret ||
    req.body?.secret ||
    '';
  return provided === sharedSecret;
}

function denyUnauthorized(req, res) {
  appendEvent('unauthorized', {
    path: req.path,
    app: req.body?.app || req.query.app || null,
    name: req.body?.name || req.query.name || null,
    at: new Date().toISOString()
  });
  res.status(403).json({ success: false, allowed: false, error: 'Forbidden' });
}

function streamIdentifier(payload) {
  return String(
    payload.streamId ||
    payload.name ||
    payload.streamKey ||
    `stream_${Date.now()}`
  );
}

function hlsUrlFor(streamId) {
  if (!publicUrl) {
    return null;
  }
  return `${publicUrl}/hls/${encodeURIComponent(streamId)}.m3u8`;
}

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    service: 'aaastreamer-api',
    publicUrl: publicUrl || null,
    restreamEnabled: allowRestream,
    voicelinkApiUrl: process.env.VOICELINK_API_URL || null
  });
});

app.get('/api/streams', (_req, res) => {
  const store = readStore();
  res.json({ success: true, streams: store.streams });
});

app.get('/api/streams/:streamId', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId);
  if (!stream) {
    res.status(404).json({ success: false, error: 'Stream not found' });
    return;
  }
  res.json({ success: true, stream });
});

app.post('/api/voicelink/validate_user', (req, res) => {
  if (!hasValidSecret(req)) {
    denyUnauthorized(req, res);
    return;
  }
  const payload = normalizedPayload(req);
  appendEvent('validate_user', payload);
  res.json({
    success: true,
    allowed: true,
    provider: 'aaastreamer',
    roomId: payload.roomId || null,
    streamKey: payload.streamKey || null
  });
});

app.post('/api/voicelink/on_publish', (req, res) => {
  if (!hasValidSecret(req)) {
    denyUnauthorized(req, res);
    return;
  }
  const payload = normalizedPayload(req);
  const store = readStore();
  const streamId = streamIdentifier(payload);
  const nextStream = {
    id: streamId,
    roomId: payload.roomId || null,
    title: payload.title || payload.name || 'Live Stream',
    status: 'live',
    source: payload.source || 'voicelink',
    ingestApp: payload.app || process.env.RTMP_APP_NAME || 'live',
    hlsUrl: hlsUrlFor(streamId),
    updatedAt: new Date().toISOString()
  };
  const index = store.streams.findIndex((item) => item.id === streamId);
  if (index >= 0) {
    store.streams[index] = { ...store.streams[index], ...nextStream };
  } else {
    store.streams.push(nextStream);
  }
  store.events.push({
    id: `evt_${Date.now()}`,
    type: 'publish',
    payload,
    createdAt: new Date().toISOString()
  });
  writeStore(store);
  res.json({ success: true, stream: nextStream });
});

app.post('/api/voicelink/on_done', (req, res) => {
  if (!hasValidSecret(req)) {
    denyUnauthorized(req, res);
    return;
  }
  const payload = normalizedPayload(req);
  const store = readStore();
  const streamId = String(payload.streamId || payload.name || payload.streamKey || '');
  const index = store.streams.findIndex((item) => item.id === streamId);
  if (index >= 0) {
    store.streams[index] = {
      ...store.streams[index],
      status: 'ended',
      updatedAt: new Date().toISOString()
    };
  }
  store.events.push({
    id: `evt_${Date.now()}`,
    type: 'done',
    payload,
    createdAt: new Date().toISOString()
  });
  writeStore(store);
  res.json({ success: true, streamId });
});

app.post('/api/streams/:streamId/restream/start', (req, res) => {
  if (!allowRestream) {
    res.status(403).json({ success: false, error: 'Restreaming is disabled' });
    return;
  }
  appendEvent('restream_start', {
    streamId: req.params.streamId,
    ...req.body
  });
  res.json({ success: true, streamId: req.params.streamId, state: 'starting' });
});

app.post('/api/streams/:streamId/restream/stop', (req, res) => {
  if (!allowRestream) {
    res.status(403).json({ success: false, error: 'Restreaming is disabled' });
    return;
  }
  appendEvent('restream_stop', {
    streamId: req.params.streamId,
    ...req.body
  });
  res.json({ success: true, streamId: req.params.streamId, state: 'stopping' });
});

app.listen(port, () => {
  ensureDataStore();
  console.log(`AAAStreamer API listening on ${port}`);
});
