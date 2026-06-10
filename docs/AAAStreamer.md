# AAAStreamer

## Overview

AAAStreamer is a self-hosted, multi-platform live streaming system designed for
accessibility, automation, and scalability.

## Features

- RTMP ingest
- HLS output
- VoiceLink webhook integration
- Multi-platform restream support
- visitor watch pages
- user dashboard with OBS server URL and stream key
- admin dashboard for users, streams, and recent events
- live visitor comments
- accessible management APIs
- moderation-aware validation hooks
- analytics-ready event payloads

## Built-in panels

- `/` lists public streams for visitors.
- `/s/:slug` opens a public watch page with HLS playback and live comments.
- `/login` signs users and admins in.
- `/dashboard` shows streamers their OBS settings and stream profile editor.
- `/admin` lets admins create accounts, view streams, and inspect events.

## OBS ingest

Each account has a stream key. Use the server URL shown in the user dashboard and the account stream key in OBS or another RTMP client.

The default RTMP application is `live`, so the raw server URL is:

```text
rtmp://HOSTNAME:1935/live
```

By default, unknown stream keys are rejected. Set `AAASTREAMER_ALLOW_AD_HOC_STREAMS=true` only for open testing environments.

## VoiceLink API Integration

Endpoints:

- `POST /api/voicelink/on_publish`
- `POST /api/voicelink/on_done`
- `POST /api/voicelink/validate_user`

VoiceLink usage goals:

- validate stream ownership before publish
- attach room or bot metadata to stream sessions
- trigger automation on publish and on end
- use AAAStreamer as the primary stream service for VoiceLink live modules
- keep secondary stream services available as fallback

## Multi-platform streaming

Restream targets can include:

- YouTube Live
- Twitch
- Facebook Live
- Substack Live
- custom RTMP endpoints

## Hosting model

This system is intended to run directly on the hosting server where streams are
served. Docker deployment is included for predictable server setup.

## Future work

- database-backed analytics beyond the current JSON store
- per-room and per-server stream policy sync from VoiceLink
- chat relay integration
- transcription pipeline hooks
