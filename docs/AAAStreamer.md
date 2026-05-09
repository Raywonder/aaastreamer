# AAAStreamer

## Overview

AAAStreamer is a self-hosted, multi-platform live streaming system designed for
accessibility, automation, and scalability.

## Features

- RTMP ingest
- HLS output
- VoiceLink webhook integration
- Multi-platform restream support
- accessible management APIs
- moderation-aware validation hooks
- analytics-ready event payloads

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

- persistent stream inventory and analytics storage
- per-room and per-server stream policy sync from VoiceLink
- chat relay integration
- transcription pipeline hooks
