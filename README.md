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
- admin-controlled platform naming, sub-heading, slogan, tagline, and description
- enhanced guest and logged-in user stream messaging with reactions
- optional donation or payment support boxes configured by admins or stream owners, hidden from visitors by default
- offline-safe stream pages: public stream links and playback URLs are hidden unless the creator is live or on-demand content is enabled
- server media library sources, user media uploads, and HTTP/HTTPS URL relay sources for on-demand playback or looped 24/7 streams
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

Admins can log in, create users, enable or disable public signups, set platform branding, configure guest and logged-in messaging, set support/payment-box defaults, choose which server media folders are available to streamers, review streams, set encoder defaults, tune latency and buffer defaults, and inspect recent publish, done, comment, and moderation events. Users can log in, copy their RTMP server URL and stream key, add extra encoder keys, upload media, select approved server media, add URL relay sources, save external destination details, tune stream latency and playback buffer, edit the stream profile, add a background image and links, configure an optional support/payment box, copy embed code, and open the public watch page for their stream. Visitors can open a stream page only when the creator is live or on-demand playback is enabled, watch HLS or on-demand playback, post live comments when messaging is enabled, and react to visible messages when reactions are enabled.

OBS settings for a user-created stream:

```text
Server: rtmp://your-domain.example:1935/live
Stream key: shown in the user dashboard
```

## Media sources and offline visibility

Visitor-facing stream links are shown only when a stream is live or when the
stream owner enables on-demand playback and selects a valid source. Offline
streams without on-demand content are hidden from the public stream list, and
embed pages do not expose HLS URLs for them.

Admins manage server media folders from `/admin/media`. Each folder can be
enabled, disabled, visible to users, hidden for admin-only use, and limited to
audio or video. The default folder list includes common server media paths such
as `/mnt/backup/media`, `/mnt/backup/audio-description`, and `/mnt/backup/music`.
Streamers can also upload supported audio/video files into the configured upload
folder and select HTTP or HTTPS media URLs as relay sources when admins allow it.

The dashboard can start the selected server media file or URL relay as a looped
RTMP source using `ffmpeg`. This supports 24/7 style streams from music,
audio-description, video, or remote stream URLs, while keeping normal OBS/Ecamm
RTMP ingest available.

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
