# AAAStreamer

AAAStreamer is a self-hosted live streaming backend designed to serve as the
primary streaming service for VoiceLink live streaming, RTMP ingest, and
restreaming workflows.

The target deployment model is server-first:

- RTMP ingest and HLS output on the hosting server
- VoiceLink webhook callbacks for publish, end, and validation events
- Restream fan-out to external platforms
- Accessible web management APIs for stream status and automation
- Primary/secondary upstream support so VoiceLink can fail over cleanly

Default hosted domain families:

- `*.voicelinkapp.app`
- `*.voicelinkapp.dev`
- `*.tappedin.fm`

Additional custom domains can be attached later through dashboard or API
management.

## Current scope

- NGINX RTMP + HLS service configuration
- Node control API for VoiceLink hooks
- built-in visitor watch pages with HLS playback
- built-in login, user dashboard, and admin dashboard
- account, stream key, stream inventory, and comment management
- admin-controlled user signups
- multi-encoder keys and stereo audio bitrate presets
- stream latency, player buffer, and HLS timing controls
- external destination records for YouTube Live, Twitch, Facebook Live, LinkedIn Live, Kick, Restream.io, and custom RTMP services
- optional stream background images, stream links, and iframe embed codes
- direct-host updater with temporary maintenance mode
- OBS-compatible RTMP ingest using per-user stream keys
- live visitor comments with server-sent event updates
- server-ready Docker deployment
- VoiceLink integration points for live streaming modules

## What users can do now

Admins can log in, create users, enable or disable public signups, review streams, set encoder defaults, tune latency and buffer defaults, and inspect recent publish, done, comment, and moderation events. Users can log in, copy their RTMP server URL and stream key, add extra encoder keys, save external destination details, tune stream latency and playback buffer, edit the stream profile, add a background image and links, copy embed code, and open the public watch page for their stream. Visitors can open a stream page, watch HLS playback, and post live comments when comments are enabled for that stream.

OBS settings for a user-created stream:

```text
Server: rtmp://your-domain.example:1935/live
Stream key: shown in the user dashboard
```

## VoiceLink integration

VoiceLink should treat AAAStreamer as the primary live streaming backend.
Secondary stream targets remain optional and are configured separately.

VoiceLink-facing endpoints:

- `POST /api/voicelink/on_publish`
- `POST /api/voicelink/on_done`
- `POST /api/voicelink/validate_user`
- `GET /api/streams`
- `POST /api/streams/:streamId/restream/start`
- `POST /api/streams/:streamId/restream/stop`

## Project layout

- [docs/AAAStreamer.md](/Users/admin/git/Raywonder/aaastreamer/docs/AAAStreamer.md)
  Product and deployment notes moved from the original root markdown file.
- [docker-compose.yml](/Users/admin/git/Raywonder/aaastreamer/docker-compose.yml)
  Server deployment entrypoint.
- [nginx/nginx.conf](/Users/admin/git/Raywonder/aaastreamer/nginx/nginx.conf)
  RTMP ingest and HLS output.
- [api/package.json](/Users/admin/git/Raywonder/aaastreamer/api/package.json)
  VoiceLink control API service.
- [api/src/server.js](/Users/admin/git/Raywonder/aaastreamer/api/src/server.js)
  Webhook and stream-management routes.

## Server deployment

1. Copy `.env.example` to `.env`
2. Set `AAASTREAMER_ADMIN_USER` and `AAASTREAMER_ADMIN_PASSWORD` before the first run
3. Set the public URL, RTMP host, VoiceLink API, and shared secret values
4. Run `docker compose up -d --build`
5. Log in at `/login`, create user accounts, and give each streamer their OBS settings from `/dashboard`

The server intentionally has no hidden default admin password. If no admin env values are provided on first run, the app starts without a login account until one is created through a controlled deployment path.

## Notes

- This repository intentionally does not expose the reusable workflow catalog
  template that was present in the seed repo.
- The repo is trimmed down to AAAStreamer-specific files only.
