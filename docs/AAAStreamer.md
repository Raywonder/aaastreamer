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

## Deployment Domain And Update Requirements

AAAStreamer installs must default to domains owned by the hosting account that runs the service. A self-hosted install should discover account-owned domains, allow the owner to choose the primary domain, and allow optional additional domains or direct IP listeners such as the assigned `64.20.x.x` address.

The admin UI should expose domain/listener configuration instead of requiring manual file edits. The UI should show the API URL, visitor URL, HLS URL, and OBS RTMP ingest URL for each enabled domain/listener.

Future builds must include an update checker that can watch for new versions from the configured source. The default source should be the main/cloud download location, but installs must also support a configured folder or manifest file such as a `.yaml` release manifest. The updater should download, install, relaunch the service, refresh the web UI, and show progress updates during the process.

Until domain selection is implemented in the admin UI, test deployments may use explicit port-based URLs on the account's assigned server IP. Production deployments should use an account-owned domain and reverse proxy once the owner chooses the domain.
