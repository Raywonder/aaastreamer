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
- stream inventory and target management
- server-ready Docker deployment
- VoiceLink integration points for live streaming modules

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
2. Set VoiceLink API and shared secret values
3. Run `docker compose up -d --build`
4. Point VoiceLink live stream modules at the API base URL for this service

## Notes

- This repository intentionally does not expose the reusable workflow catalog
  template that was present in the seed repo.
- The repo is trimmed down to AAAStreamer-specific files only.
