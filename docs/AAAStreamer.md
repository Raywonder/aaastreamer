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
- user dashboard with streaming server URL, stream key, watch/HLS links, copy/share buttons, and stream-key rotation controls
- separate admin pages for streams, accounts, signup settings, encoder defaults, and updates
- optional user signup page controlled from the admin panel
- multi-encoder keys per account for OBS, Ecamm Live, Audio Hijack workflows, Streamlabs, Larix, vMix, and other RTMP tools
- stereo audio bitrate presets from 96k through 320k
- stream latency and player buffer controls for low-latency, balanced, or stable playback
- optional stream background images, external links, and iframe embed codes
- live visitor comments
- accessible management APIs
- moderation-aware validation hooks
- analytics-ready event payloads

## Built-in panels

- `/` lists public streams for visitors.
- `/s/:slug` opens a public watch page with HLS playback and live comments.
- `/login` signs users and admins in.
- `/dashboard` shows streamers their connection details, copy/share controls, stream-key management, encoder keys, destination records, embed code, and stream profile editor.
- `/signup` allows new users to create accounts when signups are enabled.
- `/admin/streams` lets admins view streams and recent events.
- `/admin/accounts` lets admins create and review users.
- `/admin/signups` controls whether user signup is enabled and what role new accounts receive.
- `/admin/encoders` controls default encoder, audio, latency, buffer, and HLS timing settings.
- `/admin/updater` controls update source, maintenance mode, and the direct-host updater.

## OBS ingest

Each account has a primary stream key and can create additional encoder keys.
Use the server URL shown in the user dashboard and the selected stream key in
OBS or another RTMP client.

The default RTMP application is `live`, so the raw server URL is:

```text
rtmp://HOSTNAME:1935/live
```

By default, unknown stream keys are rejected. Set `AAASTREAMER_ALLOW_AD_HOC_STREAMS=true` only for open testing environments.

Users can copy the server URL, stream key, watch page, and HLS playback URL from the dashboard. The dashboard can also open the platform share sheet for the public watch page when the browser supports it. Regenerating or revoking a stream key immediately replaces the stored key for that user and stream; the old key will no longer be accepted for future publishes.

The dashboard also provides an iframe embed code for the public stream page and
lets streamers add an optional background image and useful links for the watch
page. Background images are stored as small data images in the local JSON store,
so use compressed web images rather than large originals.

## Encoder and destination setup

AAAStreamer accepts RTMP publishes from common tools including:

- OBS Studio
- Ecamm Live
- Audio Hijack paired with an RTMP-capable broadcaster
- Streamlabs
- Larix Broadcaster
- vMix
- any custom RTMP or RTMPS encoder

Recommended defaults:

- Stereo audio
- 48 kHz sample rate
- 160k audio bitrate for general use
- 192k to 320k audio bitrate for music-heavy streams
- 2 second keyframe interval
- low-latency mode with 2 second target latency and 4 second player buffer
- low-latency HLS with 1 second segments, 200 ms parts, and 7 retained segments

Each stream can override latency mode, target live latency, player buffer, and
reconnect buffer from the user dashboard. Lower latency is best for interactive
events and live chat. Higher buffer values are better for mobile visitors or
busy networks where avoiding stalls matters more than shaving off seconds.

External destination records can be stored for YouTube Live, Twitch, Facebook
Live, LinkedIn Live, Kick, Restream.io, and custom RTMP or RTMPS services. These
records keep platform connection details organized with the account. Streamers
can still publish directly from OBS, Ecamm, or other software to those platforms.

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
- LinkedIn Live
- Kick
- Restream.io
- custom RTMP endpoints

The account dashboard stores external destination connection records now. Future
fan-out workers can consume the same records to push one AAAStreamer input to
multiple destinations.

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

The admin updater page allows admins to set the update manifest URL, enable or
disable maintenance mode, and start the direct-host update process. The included
`scripts/update-aaastreamer.sh` script enables maintenance mode, pulls the latest
repository changes, installs API dependencies, checks server syntax, restarts the
PM2 service, and disables maintenance mode again.

Until domain selection is implemented in the admin UI, test deployments may use
explicit port-based URLs on the account's assigned server IP. Production
deployments should use an account-owned domain and reverse proxy once the owner
chooses the domain.
