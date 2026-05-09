# VoiceLink Integration

AAAStreamer is intended to be the primary live streaming backend for VoiceLink.

## Primary usage

VoiceLink live modules should send publish lifecycle events to the AAAStreamer
API and use the RTMP/HLS services here as the main ingest path.

Primary VoiceLink callbacks:

- `POST /api/voicelink/validate_user`
- `POST /api/voicelink/on_publish`
- `POST /api/voicelink/on_done`
- `GET /api/streams`
- `GET /api/streams/:streamId`

## Expected VoiceLink payload fields

- `streamId`
- `roomId`
- `title`
- `source`
- `streamKey`
- `userId`
- `serverId`

NGINX RTMP sends form-encoded callback payloads. VoiceLink may send JSON. The
AAAStreamer API accepts both.

## RTMP ingest

Default ingest:

```text
rtmp://<stream-host>/live/<streamId>
```

The RTMP `on_publish` hook calls `POST /api/voicelink/on_publish`. That endpoint
must both validate and record the stream because NGINX RTMP accepts the publish
only when the callback returns a success response.

The RTMP `on_done` hook calls `POST /api/voicelink/on_done` and marks the stream
as ended.

When `AAASTREAMER_PUBLIC_URL` is configured, stream records include:

```text
<AAASTREAMER_PUBLIC_URL>/hls/<streamId>.m3u8
```

## Auth model

For an internal Docker-only deployment, `AAASTREAMER_REQUIRE_SECRET=false` keeps
RTMP callbacks simple.

For exposed API routes, set:

```text
AAASTREAMER_REQUIRE_SECRET=true
VOICELINK_SHARED_SECRET=<shared-secret>
```

VoiceLink should then send the secret as `x-voicelink-secret`. If NGINX RTMP is
also calling the API across an exposed network, include the same secret in the
callback URL query string.

## Failover model

- AAAStreamer: primary live stream backend
- secondary providers: optional fallback restream targets
- VoiceLink should retain provider priority outside this repo

## Hosting note

This service is designed to run directly on the target server where live
streaming is hosted. Docker deployment is included so the server can build and
run the service locally.

## Default domain families

Primary hosted domain families for this deployment:

- `*.voicelinkapp.app`
- `*.voicelinkapp.dev`
- `*.tappedin.fm`

Additional custom domains should be added later through dashboard or API
management once that layer is implemented.
