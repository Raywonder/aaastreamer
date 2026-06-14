import crypto from 'crypto';
import childProcess from 'child_process';
import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const uploadLimit = process.env.AAASTREAMER_UPLOAD_LIMIT || '75mb';
app.use(express.json({ limit: uploadLimit }));
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
  { id: 'youtube', name: 'YouTube Live', url: 'https://www.youtube.com/live_dashboard', ingest: 'rtmp://a.rtmp.youtube.com/live2' },
  { id: 'twitch', name: 'Twitch', url: 'https://dashboard.twitch.tv/u/stream-manager', ingest: 'rtmp://live.twitch.tv/app' },
  { id: 'facebook', name: 'Facebook Live', url: 'https://www.facebook.com/live/producer', ingest: 'rtmps://live-api-s.facebook.com:443/rtmp' },
  { id: 'linkedin', name: 'LinkedIn Live', url: 'https://www.linkedin.com/video/golive/now/', ingest: 'rtmp://1-rtmp-live.linkedin.com/live' },
  { id: 'kick', name: 'Kick', url: 'https://kick.com/dashboard/stream', ingest: 'rtmps://fa-live.stream.kick.com/app' },
  { id: 'restream', name: 'Restream.io', url: 'https://app.restream.io/channel', ingest: 'rtmp://live.restream.io/live' },
  { id: 'custom', name: 'Custom RTMP or RTMPS', url: '', ingest: '' }
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
        platformBranding: defaultPlatformBranding(),
        visitorCommentsEnabled: true,
        messaging: defaultMessagingSettings(),
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
    hlsSegmentCount: 8
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
    maxMessageLength: 1000
  };
}

function defaultSupportSettings() {
  return {
    enabled: false,
    showOnWatchPage: false,
    placement: 'after',
    title: 'Support this stream',
    description: '',
    embedHtml: ''
  };
}

function defaultMediaSettings() {
  const envFolders = String(process.env.AAASTREAMER_MEDIA_FOLDERS || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  const folders = (envFolders.length ? envFolders : [
    '/mnt/backup/media',
    '/mnt/backup/audio-description',
    '/mnt/backup/music',
    '/mnt/backup'
  ]).map((folderPath, index) => ({
    id: slugify(`${index + 1}-${folderPath}`),
    label: path.basename(folderPath) || folderPath,
    path: folderPath,
    enabled: true,
    visibleToUsers: index < 3,
    allowAudio: true,
    allowVideo: true
  }));
  return {
    enabled: true,
    maxScanDepth: 4,
    uploadFolder: path.join(dataDir, 'uploads'),
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
  store.sessions ||= [];
  store.settings ||= {};
  store.settings.siteName ||= process.env.AAASTREAMER_SITE_NAME || 'AAAStreamer';
  if (!store.settings.platformBranding) {
    store.settings.platformBranding = { ...defaultPlatformBranding(), platformName: store.settings.siteName };
  } else {
    store.settings.platformBranding = { ...defaultPlatformBranding(), ...store.settings.platformBranding };
  }
  store.settings.siteName = store.settings.platformBranding.platformName || store.settings.siteName;
  store.settings.visitorCommentsEnabled ??= true;
  store.settings.messaging = { ...defaultMessagingSettings(), ...(store.settings.messaging || {}) };
  store.settings.supportDefaults = { ...defaultSupportSettings(), ...(store.settings.supportDefaults || {}) };
  store.settings.mediaLibrary = normalizeMediaSettings(store.settings.mediaLibrary);
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
  stream.latencySettings = { ...defaultLatencySettings(), ...(stream.latencySettings || {}) };
  stream.support = { ...defaultSupportSettings(), ...(stream.support || {}) };
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
  const folders = Array.isArray(settings.folders) && settings.folders.length ? settings.folders : defaults.folders;
  const uploadFolder = String(settings.uploadFolder || defaults.uploadFolder).trim();
  const normalizedFolders = folders.map((folder, index) => ({
    id: slugify(folder.id || `${index + 1}-${folder.path || folder.label || 'media'}`),
    label: String(folder.label || path.basename(folder.path || '') || `Media folder ${index + 1}`).trim().slice(0, 120),
    path: String(folder.path || '').trim(),
    enabled: folder.enabled !== false,
    visibleToUsers: folder.visibleToUsers !== false,
    allowAudio: folder.allowAudio !== false,
    allowVideo: folder.allowVideo !== false
  })).filter((folder) => folder.path);
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
    createdAt: source.createdAt || nowIso()
  };
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

function rtmpPublishUrlFor(streamKey) {
  return `${rtmpUrlFor(streamKey)}/${encodeURIComponent(streamKey)}`;
}

function watchUrlFor(stream) {
  return `${publicUrl || ''}/s/${stream.slug}`;
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

function streamIsPubliclyListable(stream, store) {
  return stream.visibility === 'public' && (isLive(stream) || streamHasOnDemand(stream, store));
}

function streamPlaybackUrl(stream, store) {
  if (isLive(stream)) return stream.hlsUrl || hlsUrlFor(stream.activeEncoderKey || stream.streamKey);
  if (streamHasOnDemand(stream, store)) return playableSourceUrl(firstPlayableSource(stream, store), store);
  return '';
}

function publicStreamSummary(stream, store, includePrivate = false) {
  const playbackUrl = streamPlaybackUrl(stream, store);
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
    watchUrl: watchUrlFor(stream),
    playbackUrl: playbackUrl || null,
    hlsUrl: isLive(stream) ? (stream.hlsUrl || hlsUrlFor(stream.activeEncoderKey || stream.streamKey)) : null,
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
      if (!entry.isFile()) continue;
      const mediaType = mediaTypeFor(fullPath);
      if (!mediaType) continue;
      if (mediaType === 'audio' && !folder.allowAudio) continue;
      if (mediaType === 'video' && !folder.allowVideo) continue;
      const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
      const stat = fs.statSync(fullPath);
      files.push({
        folderId: folder.id,
        relativePath,
        label: relativePath.replace(/\.[^.]+$/, '').replace(/[\\/_.-]+/g, ' '),
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
.reaction-list{display:flex;gap:.4rem;flex-wrap:wrap;margin:.35rem 0}.reaction-list button{padding:.3rem .45rem;background:#26313d}.message-meta{font-size:.92rem;color:#b8c1ca}.support-box iframe{max-width:100%;border:0}.support-box form{margin:.5rem 0}
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
    ['branding', 'Branding'],
    ['messaging', 'Messaging'],
    ['media', 'Media sources'],
    ['encoders', 'Encoder settings'],
    ['updater', 'Updater']
  ];
  return `<nav class="tabs" aria-label="Admin sections">${tabs.map(([idValue, label]) => `<a href="/admin/${idValue}" ${active === idValue ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
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
  const embed = sanitizeSupportEmbed(support.embedHtml);
  return `<section class="support-box"><h2>${escapeHtml(support.title || 'Support this stream')}</h2>${support.description ? `<p>${escapeHtml(support.description)}</p>` : ''}${embed ? `<div>${embed}</div>` : '<p class="muted">Support details are not configured yet.</p>'}</section>`;
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
  const commonAttrs = `id="${escapeHtml(playerId)}" controls playsinline${autoplay} preload="auto" data-target-latency="${escapeHtml(targetLatency)}" data-player-buffer="${escapeHtml(playerBuffer)}" data-reconnect-buffer="${escapeHtml(reconnectBuffer)}"`;
  if (!isHlsUrl(playbackUrl)) {
    return `<video ${commonAttrs} src="${escapeHtml(playbackUrl)}"></video>`;
  }
  return `<video ${commonAttrs} data-hls-src="${escapeHtml(playbackUrl)}"></video><p id="${escapeHtml(statusId)}" class="muted" role="status">Loading stream player.</p><script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script><script>
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
  const retryNative = () => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      const currentTime = player.currentTime || 0;
      player.src = source + (source.includes('?') ? '&' : '?') + 'refresh=' + Date.now();
      player.load();
      if (currentTime > 0) {
        player.currentTime = currentTime;
      }
      player.play().catch(() => {});
    }, reconnectDelay);
  };
  if (player.canPlayType('application/vnd.apple.mpegurl')) {
    player.src = source;
    player.addEventListener('waiting', () => setStatus('Buffering stream. Holding a little more audio for smooth playback.'));
    player.addEventListener('stalled', retryNative);
    player.addEventListener('error', retryNative);
    setStatus('Stream player ready.');
  } else if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({
      lowLatencyMode: false,
      liveSyncDuration: targetLatency,
      maxLiveSyncPlaybackRate: 1.05,
      maxBufferLength: playerBuffer,
      maxMaxBufferLength: Math.max(playerBuffer * 2, 30),
      backBufferLength: Math.max(playerBuffer, 30),
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
      setStatus('Playback lost. Trying to recover stream.');
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    });
    hls.loadSource(source);
    hls.attachMedia(player);
    player.addEventListener('waiting', () => setStatus('Buffering stream. Holding a little more audio for smooth playback.'));
    setStatus('Stream player ready.');
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
    return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(source.mediaType)}</td><td>${urlCell}</td><td><form method="post" action="/dashboard/sources/queue/${escapeHtml(source.id)}/select" class="inline-form"><button type="submit">Use now</button></form><form method="post" action="/dashboard/sources/queue/${escapeHtml(source.id)}/remove" class="inline-form"><button type="submit" class="danger">Remove</button></form></td></tr>`;
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
  const outputKey = stream.streamKey;
  const output = `rtmp://127.0.0.1:1935/${rtmpAppName}/${outputKey}`;
  stopSourceProcess(stream.id);
  const hasQueue = (stream.sourceQueue || []).some((queuedSource) => playableSourceUrl(queuedSource, store));
  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-re'
  ];
  if (!hasQueue) {
    args.push('-stream_loop', '-1');
  }
  args.push(
    '-i', input,
    '-map', '0:v?',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', stream.encoderSettings?.audioBitrate || '160k',
    '-ar', stream.encoderSettings?.sampleRate || '48000',
    '-ac', '2',
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

function getGitRevision() {
  try {
    return childProcess.execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

app.get('/healthz', (_req, res) => {
  res.json({
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
  const playbackUrl = streamPlaybackUrl(stream, store);
  const playableStatus = isLive(stream) ? 'live' : (streamHasOnDemand(stream, store) ? 'on demand' : 'offline');
  const comments = store.comments.filter((comment) => comment.streamId === stream.id).slice(-100);
  const messaging = store.settings.messaging || defaultMessagingSettings();
  const user = currentUser(req);
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
<section><h2>About this stream</h2><p>${escapeHtml(stream.description || 'No description yet.')}</p><h3>Links</h3>${renderLinks(stream.links)}</section>
<section><h2>Live comments</h2><div id="comments" class="comments">${comments.map((comment) => renderComment(comment, messaging.reactionsEnabled)).join('')}</div>
${canComment ? `<form id="commentForm"><label>Name<input name="authorName" ${user ? `value="${escapeHtml(user.displayName || user.username)}" readonly` : 'required'}></label><label>Message type<select name="messageType"><option value="comment">Comment</option><option value="question">Question</option><option value="support">Support message</option></select></label><label>Comment<textarea name="message" required rows="3" maxlength="${escapeHtml(messaging.maxMessageLength || 1000)}"></textarea></label><button type="submit">Post comment</button></form>` : '<p>Comments are disabled for this stream or account type.</p>'}</section>
${supportAfter}
<script>
const streamId=${JSON.stringify(stream.id)};
const comments=document.getElementById('comments');
const events=new EventSource('/events');
events.onmessage=(event)=>{try{const msg=JSON.parse(event.data); if(msg.type==='comment' && msg.payload.streamId===streamId){comments.insertAdjacentHTML('beforeend', msg.payload.html); comments.scrollTop=comments.scrollHeight;} if(msg.type==='reaction' && msg.payload.streamId===streamId){const target=document.getElementById('reactions-'+msg.payload.commentId); if(target) target.innerHTML=msg.payload.html;} if(['stream_latency_updated','stream_source_selected','source_queue_selected','source_relay_started','source_relay_stopped','ondemand_settings_updated'].includes(msg.type) && msg.payload.streamId===streamId){setTimeout(()=>window.location.reload(),500);}}catch{}};
const form=document.getElementById('commentForm');
if(form){form.addEventListener('submit', async (e)=>{e.preventDefault(); const data=Object.fromEntries(new FormData(form)); const res=await fetch('/api/streams/'+streamId+'/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); if(res.ok) form.reset();});}
document.addEventListener('click', async (event)=>{const button=event.target.closest('[data-reaction]'); if(!button)return; const commentId=button.dataset.commentId; const reaction=button.dataset.reaction; const res=await fetch('/api/comments/'+commentId+'/reactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({streamId,reaction})}); if(res.ok){const data=await res.json(); const target=document.getElementById('reactions-'+commentId); if(target) target.innerHTML=data.html;}});
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
  const selectedSource = stream.currentSource || null;
  const mediaOptions = mediaSourceOptions(store, user, selectedSource);
  const relayRows = (stream.relaySources || []).map((source) => `<tr><td>${escapeHtml(source.label)}</td><td>${escapeHtml(source.mediaType)}</td><td><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Open URL</a></td><td><form method="post" action="/dashboard/sources/${escapeHtml(source.id)}/select" class="inline-form"><button type="submit">Use</button></form><form method="post" action="/dashboard/sources/${escapeHtml(source.id)}/delete" class="inline-form"><button type="submit" class="danger">Remove</button></form></td></tr>`).join('');
  const queueRows = queuedSourceRows(stream, store);
  const activeSourceRunning = sourceProcesses.has(stream.id);
  const quickSourceCards = sourcePresetCards(stream, serverUrl);
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
<section><h2>Server media and URL relay</h2><p class="muted">Choose existing server media or a remote URL to use as on-demand content or as a looped broadcast source. Stream links stay hidden from visitors while you are offline unless on-demand playback is enabled and a valid source is selected.</p>
<p>Current source: <strong>${escapeHtml(sourceSummary(selectedSource))}</strong>. Relay process: <strong>${activeSourceRunning ? 'running' : 'stopped'}</strong>.</p>
<section class="subsection"><h3>Quick source setup</h3><p class="muted">Pick the source type first. Presets copy the correct connection URL or fill the relay fields so setup is not manual-only.</p><div class="preset-grid">${quickSourceCards}</div></section>
<form method="post" action="/dashboard/sources/select"><label>Server media<select id="serverMediaSource" name="localMedia" multiple size="8">${mediaOptions}</select></label><input type="hidden" name="sourceType" value="localMedia"><p class="muted">Select one item to use it now, or select several items to queue them in order. Hold Control or Shift while selecting multiple files.</p><button type="submit">Use or queue selected server media</button></form>
<form method="post" action="/dashboard/sources/upload"><label>Upload audio or video files<input id="mediaUpload" type="file" accept="audio/*,video/*" multiple></label><input type="hidden" id="mediaUploadData" name="uploadData"><label>Upload title<input name="uploadLabel" placeholder="Intro music, event replay, audio described movie"></label><button type="submit">Upload and queue media</button></form>
<form method="post" action="/dashboard/sources/url"><input type="hidden" name="sourceType" value="urlRelay"><label>Relay label<input id="relayLabel" name="relayLabel" placeholder="Radio relay, remote event, training video"></label><label>Media type<select id="relayMediaType" name="relayMediaType"><option value="video">video</option><option value="audio">audio</option></select></label><label>HTTP or HTTPS media URL<input id="relayUrl" name="relayUrl" placeholder="https://example.com/stream.mp3"></label><button type="submit">Add URL relay source</button></form>
<section class="subsection"><h3>Source queue</h3><p class="muted">Queued sources play after the current source when the source relay is running. A non-empty queue plays as a continuous playlist instead of stopping after one file.</p><table><tr><th>Name</th><th>Type</th><th>Source</th><th>Actions</th></tr>${queueRows || '<tr><td colspan="4">No queued sources. Upload or multi-select media to build a playlist.</td></tr>'}</table><form method="post" action="/dashboard/sources/queue/clear" class="inline-form"><button type="submit" class="danger">Clear queue</button></form></section>
<table><tr><th>Name</th><th>Type</th><th>URL</th><th>Actions</th></tr>${relayRows || '<tr><td colspan="4">No URL relay sources configured.</td></tr>'}</table>
<form method="post" action="/dashboard/sources/ondemand"><label><input type="checkbox" name="enabled" value="true" ${stream.onDemand?.enabled ? 'checked' : ''}> Enable on-demand playback for this stream</label><label><input type="checkbox" name="showWhenOffline" value="true" ${stream.onDemand?.showWhenOffline ? 'checked' : ''}> Show this stream to visitors when I am offline and selected media is available</label><label>On-demand title<input name="title" value="${escapeHtml(stream.onDemand?.title || '')}"></label><button type="submit">Save on-demand settings</button></form>
<form method="post" action="/dashboard/sources/start" class="inline-form"><button type="submit">Start looping selected source as live stream</button></form>
<form method="post" action="/dashboard/sources/stop" class="inline-form"><button type="submit" class="danger">Stop source relay</button></form>
</section>
<section><h2>Latency and buffer</h2><form method="post" action="/dashboard/latency"><label>Stream latency mode<select name="mode"><option value="low" ${stream.latencySettings.mode === 'low' ? 'selected' : ''}>Low latency</option><option value="balanced" ${stream.latencySettings.mode === 'balanced' ? 'selected' : ''}>Balanced</option><option value="stable" ${stream.latencySettings.mode === 'stable' ? 'selected' : ''}>Most stable</option></select></label><label>Target live latency, seconds<input name="targetLatencySeconds" type="number" min="2" max="30" step="0.5" value="${escapeHtml(stream.latencySettings.targetLatencySeconds)}"></label><label>Player buffer, seconds<input name="playerBufferSeconds" type="number" min="4" max="60" step="0.5" value="${escapeHtml(stream.latencySettings.playerBufferSeconds)}"></label><label>Reconnect buffer, seconds<input name="reconnectBufferSeconds" type="number" min="4" max="120" step="1" value="${escapeHtml(stream.latencySettings.reconnectBufferSeconds)}"></label><button type="submit">Save latency settings</button></form><p class="muted">Lower latency reacts faster but needs a stable network. Higher buffer values reduce stalls for mobile or busy networks.</p></section>
<section><h2>Stream profile</h2><form method="post" action="/dashboard/stream"><label>Title<input name="title" value="${escapeHtml(stream.title)}"></label><label>Description<textarea name="description" rows="4">${escapeHtml(stream.description || '')}</textarea></label><label>Links, one per line. Use Label|https://example.com<textarea name="links" rows="4">${escapeHtml(linksText(stream.links))}</textarea></label><label>Optional photo background<input id="backgroundUpload" type="file" accept="image/png,image/jpeg,image/webp"></label><input type="hidden" id="backgroundImageData" name="backgroundImageData"><label><input type="checkbox" name="removeBackground" value="true"> Remove current background</label><label>Visibility<select name="visibility"><option ${stream.visibility === 'public' ? 'selected' : ''}>public</option><option ${stream.visibility === 'unlisted' ? 'selected' : ''}>unlisted</option></select></label><label><input type="checkbox" name="allowComments" value="true" ${stream.allowComments ? 'checked' : ''}> Allow visitor comments</label><button type="submit">Save stream profile</button></form></section>
<section><h2>Support and payment box</h2><p class="muted">Add trusted donation or payment embed HTML for this stream. It is not shown to visitors unless both enabled and shown on the watch page are checked.</p><form method="post" action="/dashboard/support"><label><input type="checkbox" name="enabled" value="true" ${stream.support?.enabled ? 'checked' : ''}> Enable support box for this stream</label><label><input type="checkbox" name="showOnWatchPage" value="true" ${stream.support?.showOnWatchPage ? 'checked' : ''}> Show support box on the visitor watch page</label><label>Placement<select name="placement"><option value="before" ${stream.support?.placement === 'before' ? 'selected' : ''}>Before stream player</option><option value="during" ${stream.support?.placement === 'during' ? 'selected' : ''}>Beside stream player area</option><option value="after" ${!['before', 'during'].includes(stream.support?.placement) ? 'selected' : ''}>After comments and stream details</option></select></label><label>Heading<input name="title" value="${escapeHtml(stream.support?.title || 'Support this stream')}"></label><label>Description<textarea name="description" rows="3">${escapeHtml(stream.support?.description || '')}</textarea></label><label>Payment or donation embed HTML<textarea name="embedHtml" rows="6">${escapeHtml(stream.support?.embedHtml || '')}</textarea></label><button type="submit">Save support settings</button></form>${renderSupportBox(stream, 'dashboard')}</section>
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
const mediaUpload=document.getElementById('mediaUpload');
const mediaUploadData=document.getElementById('mediaUploadData');
if(mediaUpload){mediaUpload.addEventListener('change',async()=>{const files=Array.from(mediaUpload.files||[]);if(!files.length)return;if(files.length>${JSON.stringify(maxBulkUploads)}){setCopyStatus('Select no more than ${maxBulkUploads} files at once.');mediaUpload.value='';mediaUploadData.value='';return;}const tooLarge=files.find((file)=>file.size>${JSON.stringify(maxUploadBytes)});if(tooLarge){setCopyStatus(tooLarge.name+' is too large for this server upload limit.');mediaUpload.value='';mediaUploadData.value='';return;}const readFile=(file)=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,type:file.type,data:String(reader.result||'')});reader.onerror=()=>reject(reader.error||new Error('Read failed'));reader.readAsDataURL(file);});try{const uploads=await Promise.all(files.map(readFile));mediaUploadData.value=JSON.stringify(uploads);setCopyStatus(files.length===1?'Media upload ready to submit.':files.length+' media files ready to upload and queue.');}catch{setCopyStatus('Media file could not be read. Choose the file again.');mediaUpload.value='';mediaUploadData.value='';}});}
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

app.post('/dashboard/sources/select', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const sources = bodyValues(req.body.localMedia)
    .map((localMedia) => sourceFromRequest({ ...req, body: { ...req.body, localMedia, sourceType: 'localMedia' } }, store, req.user))
    .filter(Boolean);
  if (!sources.length) {
    res.status(400).send(page('Source not saved', '<h1>Source not saved</h1><p>Select a valid media file from an enabled folder.</p><a class="button" href="/dashboard">Back to dashboard</a>', req.user));
    return;
  }
  stream.sourceMode = 'media';
  stream.currentSource = sources[0];
  addSourcesToQueue(stream, sources.slice(1));
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_source_selected', payload: { streamId: stream.id, sourceType: sources[0].type, label: sources[0].label, queued: Math.max(0, sources.length - 1) }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard');
});

app.post('/dashboard/sources/url', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  const source = sourceFromRequest({ ...req, body: { ...req.body, sourceType: 'urlRelay' } }, store, req.user);
  if (!source) {
    res.status(400).send(page('Relay source not saved', '<h1>Relay source not saved</h1><p>Use a valid HTTP or HTTPS media URL. URL relay must also be enabled by an admin.</p><a class="button" href="/dashboard">Back to dashboard</a>', req.user));
    return;
  }
  stream.sourceMode = 'url';
  stream.currentSource = source;
  stream.relaySources = [source, ...(stream.relaySources || []).filter((item) => item.url !== source.url)].slice(0, 20);
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'url_relay_source_added', payload: { streamId: stream.id, label: source.label }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard');
});

app.post('/dashboard/sources/upload', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  try {
    const sources = saveUploadedMediaBatch(store, user, stream, req.body);
    const source = sources[0];
    stream.sourceMode = 'media';
    stream.currentSource = source;
    addSourcesToQueue(stream, sources.slice(1));
    stream.onDemand = { ...stream.onDemand, enabled: true, showWhenOffline: true };
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'media_uploaded', payload: { streamId: stream.id, label: source.label, mediaType: source.mediaType, count: sources.length, queued: Math.max(0, sources.length - 1) }, createdAt: nowIso() });
    writeStore(store);
  } catch (error) {
    res.status(400).send(page('Media upload failed', `<h1>Media upload failed</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/dashboard">Back to dashboard</a>`, req.user));
    return;
  }
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
});

app.post('/dashboard/sources/queue/:sourceId/remove', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream && removeQueuedSource(stream, req.params.sourceId)) {
    stream.updatedAt = nowIso();
    store.events.push({ id: id('evt'), type: 'source_queue_removed', payload: { streamId: stream.id, sourceId: req.params.sourceId }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
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
    res.status(500).send(page('Source relay not started', `<h1>Source relay not started</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/dashboard">Back to dashboard</a>`, req.user));
    return;
  }
  store.events.push({ id: id('evt'), type: 'source_relay_started', payload: { streamId: stream.id, sourceType: source.type, label: source.label }, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/dashboard');
});

app.post('/dashboard/sources/stop', requireUser, (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.ownerId === req.user.id);
  if (stream) {
    const stopped = stopSourceProcess(stream.id);
    store.events.push({ id: id('evt'), type: 'source_relay_stopped', payload: { streamId: stream.id, stopped }, createdAt: nowIso() });
    writeStore(store);
  }
  res.redirect('/dashboard');
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
  res.redirect('/dashboard');
});

app.post('/dashboard/support', requireUser, (req, res) => {
  const store = readStore();
  const user = store.users.find((item) => item.id === req.user.id);
  const stream = ensureStreamForUser(store, user);
  stream.support = {
    enabled: req.body.enabled === 'true',
    showOnWatchPage: req.body.showOnWatchPage === 'true',
    placement: ['before', 'during', 'after'].includes(req.body.placement) ? req.body.placement : 'after',
    title: String(req.body.title || 'Support this stream').trim().slice(0, 120) || 'Support this stream',
    description: String(req.body.description || '').trim().slice(0, 1000),
    embedHtml: sanitizeSupportEmbed(req.body.embedHtml)
  };
  stream.updatedAt = nowIso();
  store.events.push({ id: id('evt'), type: 'stream_support_updated', payload: { streamId: stream.id, enabled: stream.support.enabled, showOnWatchPage: stream.support.showOnWatchPage }, createdAt: nowIso() });
  writeStore(store);
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

app.get('/admin/messaging', requireAdmin, (req, res) => {
  const store = readStore();
  const messaging = store.settings.messaging || defaultMessagingSettings();
  const support = store.settings.supportDefaults || defaultSupportSettings();
  const body = `<h1>Admin panel</h1>${adminTabs('messaging')}
<section><h2>Messaging features</h2><form method="post" action="/admin/messaging"><label><input type="checkbox" name="visitorMessagesEnabled" value="true" ${messaging.visitorMessagesEnabled ? 'checked' : ''}> Guests can post stream messages when comments are enabled on the stream</label><label><input type="checkbox" name="loggedInUserMessagesEnabled" value="true" ${messaging.loggedInUserMessagesEnabled ? 'checked' : ''}> Logged-in users can post stream messages</label><label><input type="checkbox" name="reactionsEnabled" value="true" ${messaging.reactionsEnabled ? 'checked' : ''}> Enable reactions on messages</label><label><input type="checkbox" name="requireNameForGuests" value="true" ${messaging.requireNameForGuests ? 'checked' : ''}> Require guests to enter a display name</label><label>Maximum message length<input type="number" min="100" max="5000" step="50" name="maxMessageLength" value="${escapeHtml(messaging.maxMessageLength)}"></label><button type="submit">Save messaging settings</button></form></section>
<section><h2>Default support and payment box</h2><p class="muted">These defaults are copied into new streams. Existing stream owners can change their own support box from the user dashboard. Visitor pages do not show support boxes unless the stream owner or admin enables visitor display.</p><form method="post" action="/admin/support-defaults"><label><input type="checkbox" name="enabled" value="true" ${support.enabled ? 'checked' : ''}> Enable support box by default for new streams</label><label><input type="checkbox" name="showOnWatchPage" value="true" ${support.showOnWatchPage ? 'checked' : ''}> Show support boxes to visitors by default</label><label>Default placement<select name="placement"><option value="before" ${support.placement === 'before' ? 'selected' : ''}>Before stream player</option><option value="during" ${support.placement === 'during' ? 'selected' : ''}>Beside stream player area</option><option value="after" ${!['before', 'during'].includes(support.placement) ? 'selected' : ''}>After comments and stream details</option></select></label><label>Heading<input name="title" value="${escapeHtml(support.title)}"></label><label>Description<textarea name="description" rows="3">${escapeHtml(support.description)}</textarea></label><label>Payment or donation embed HTML<textarea name="embedHtml" rows="6">${escapeHtml(support.embedHtml)}</textarea></label><button type="submit">Save support defaults</button></form></section>`;
  res.send(page('Admin messaging', body, req.user));
});

app.post('/admin/messaging', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.messaging = {
    visitorMessagesEnabled: req.body.visitorMessagesEnabled === 'true',
    loggedInUserMessagesEnabled: req.body.loggedInUserMessagesEnabled === 'true',
    reactionsEnabled: req.body.reactionsEnabled === 'true',
    requireNameForGuests: req.body.requireNameForGuests === 'true',
    maxMessageLength: clampNumber(req.body.maxMessageLength, 100, 5000, 1000)
  };
  store.events.push({ id: id('evt'), type: 'messaging_settings_updated', payload: store.settings.messaging, createdAt: nowIso() });
  writeStore(store);
  res.redirect('/admin/messaging');
});

app.post('/admin/support-defaults', requireAdmin, (req, res) => {
  const store = readStore();
  store.settings.supportDefaults = {
    enabled: req.body.enabled === 'true',
    showOnWatchPage: req.body.showOnWatchPage === 'true',
    placement: ['before', 'during', 'after'].includes(req.body.placement) ? req.body.placement : 'after',
    title: String(req.body.title || 'Support this stream').trim().slice(0, 120) || 'Support this stream',
    description: String(req.body.description || '').trim().slice(0, 1000),
    embedHtml: sanitizeSupportEmbed(req.body.embedHtml)
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
  const body = `<h1>Admin panel</h1>${adminTabs('media')}
<section><h2>Media library folders</h2><p class="muted">Admins control which server folders are available for streamers. Hidden folders remain available to admins but are not shown to normal users. Use one folder per line in this format: label|path|enabled|visible|audio|video. Use disabled, hidden, no-audio, or no-video when needed.</p>
<form method="post" action="/admin/media"><label><input type="checkbox" name="enabled" value="true" ${media.enabled ? 'checked' : ''}> Enable server media library</label><label><input type="checkbox" name="allowUsersToSelectServerMedia" value="true" ${media.allowUsersToSelectServerMedia ? 'checked' : ''}> Users can select media from visible folders</label><label><input type="checkbox" name="uploadsVisibleToUsers" value="true" ${media.uploadsVisibleToUsers ? 'checked' : ''}> Uploaded media folder is visible to users</label><label><input type="checkbox" name="urlRelayEnabled" value="true" ${media.urlRelayEnabled ? 'checked' : ''}> Enable URL relay sources</label><label><input type="checkbox" name="allowUsersToAddRelayUrls" value="true" ${media.allowUsersToAddRelayUrls ? 'checked' : ''}> Users can add their own HTTP or HTTPS relay URLs</label><label>Upload folder<input name="uploadFolder" value="${escapeHtml(media.uploadFolder)}"></label><label>Maximum scan depth<input type="number" min="1" max="8" name="maxScanDepth" value="${escapeHtml(media.maxScanDepth)}"></label><label>Folders<textarea name="folders" rows="8">${escapeHtml(mediaFoldersText(media))}</textarea></label><button type="submit">Save media source settings</button></form></section>
<section><h2>Detected media</h2><table><tr><th>Folder</th><th>Path</th><th>Status</th><th>User access</th><th>Detected files</th></tr>${folderRows || '<tr><td colspan="5">No enabled media folders are configured or reachable.</td></tr>'}</table></section>`;
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
<section><h2>Default encoder settings</h2><form method="post" action="/admin/encoders"><label>Video bitrate<input name="videoBitrate" value="${escapeHtml(settings.videoBitrate)}"></label><label>Audio bitrate<select name="audioBitrate">${audioBitrates.map((rate) => `<option ${rate === settings.audioBitrate ? 'selected' : ''}>${rate}</option>`).join('')}</select></label><label>Audio channels<select name="audioChannels"><option value="stereo" selected>stereo</option></select></label><label>Sample rate<select name="sampleRate"><option ${settings.sampleRate === '44100' ? 'selected' : ''}>44100</option><option ${settings.sampleRate !== '44100' ? 'selected' : ''}>48000</option></select></label><label>Keyframe interval seconds<input name="keyframeIntervalSeconds" type="number" min="1" max="10" value="${escapeHtml(settings.keyframeIntervalSeconds)}"></label><label>Default latency mode<select name="latencyMode"><option value="low" ${settings.latencyMode === 'low' ? 'selected' : ''}>Low latency</option><option value="balanced" ${settings.latencyMode === 'balanced' ? 'selected' : ''}>Balanced</option><option value="stable" ${settings.latencyMode === 'stable' ? 'selected' : ''}>Most stable</option></select></label><label>Target live latency, seconds<input name="targetLatencySeconds" type="number" min="2" max="30" step="0.5" value="${escapeHtml(settings.targetLatencySeconds)}"></label><label>Player buffer, seconds<input name="playerBufferSeconds" type="number" min="4" max="60" step="0.5" value="${escapeHtml(settings.playerBufferSeconds)}"></label><label>HLS segment duration, ms<input name="hlsSegmentDurationMs" type="number" min="1000" max="6000" step="100" value="${escapeHtml(settings.hlsSegmentDurationMs)}"></label><label>HLS part duration, ms<input name="hlsPartDurationMs" type="number" min="100" max="1000" step="50" value="${escapeHtml(settings.hlsPartDurationMs)}"></label><label>HLS segment count<input name="hlsSegmentCount" type="number" min="4" max="20" step="1" value="${escapeHtml(settings.hlsSegmentCount)}"></label><button type="submit">Save encoder defaults</button></form></section>
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
    hlsSegmentCount: clampNumber(req.body.hlsSegmentCount, 4, 20, 8)
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
  res.json({ success: true, stream: publicStreamSummary(stream, store, user?.role === 'admin' || stream.ownerId === user?.id) });
});

app.get('/api/media/catalog', requireUser, (req, res) => {
  const store = readStore();
  res.json({ success: true, folders: mediaCatalog(store, req.user) });
});

app.post('/api/streams/:streamId/comments', (req, res) => {
  const store = readStore();
  const stream = store.streams.find((item) => item.id === req.params.streamId || item.slug === req.params.streamId);
  if (!stream || !stream.allowComments) {
    res.status(403).json({ success: false, error: 'Comments are disabled' });
    return;
  }
  const user = currentUser(req);
  const messaging = store.settings.messaging || defaultMessagingSettings();
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
  const comment = {
    id: id('cmt'),
    streamId: stream.id,
    authorName: authorName || 'Visitor',
    authorType: user ? 'logged-in user' : 'guest',
    authorUserId: user?.id || null,
    messageType,
    message,
    reactions: {},
    status: 'visible',
    createdAt: nowIso()
  };
  store.comments.push(comment);
  store.comments = store.comments.slice(-5000);
  writeStore(store);
  broadcast({ type: 'comment', payload: { ...comment, html: renderComment(comment, messaging.reactionsEnabled) } });
  res.json({ success: true, comment });
});

app.post('/api/comments/:commentId/reactions', (req, res) => {
  const store = readStore();
  const messaging = store.settings.messaging || defaultMessagingSettings();
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
  const comment = store.comments.find((item) => item.id === req.params.commentId && (!streamId || item.streamId === streamId));
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
  console.log(`AAAStreamer listening on ${port}`);
});
