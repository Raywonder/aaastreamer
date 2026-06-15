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
- tracked token share links with direct technical URLs available to signed-in users and clients that need them
- tabbed user dashboard for overview, media management, calendar, stream profile, support/payments, and advanced settings
- separate admin pages for streams, accounts, signup settings, branding, messaging, share links, payments, install/licensing, media, encoder defaults, and updates
- optional user signup page controlled from the admin panel
- platform branding controls for the public name, sub-heading, slogan, tagline, and description shown on default installs
- enhanced guest and logged-in user stream messaging with message types, reactions, admin moderation, guest review, blocked-word auto-hiding, and retention cleanup
- optional support/payment embed boxes configured by admins or stream owners, hidden from visitors by default
- offline-safe public listings that hide stream links unless the creator is live or on-demand content is available
- server media folders, streamer uploads, galleries, and URL relay sources for on-demand playback or looped source broadcasts
- checkbox-based media selection, check-all controls, detected filenames/metadata/chapters, logged-in one-minute previews, delayed auto-enable for uploads, queue auto-add, media auto-refresh, fade controls, and loop/sequential/random relay actions
- scheduled live windows and scheduled pre-created media shows
- multi-encoder keys per account for OBS, Ecamm Live, Audio Hijack workflows, Streamlabs, Larix, vMix, and other RTMP tools
- stereo audio bitrate presets from 96k through 320k
- stream latency and player buffer controls for low-latency, balanced, or stable playback
- optional stream background images, external links, and iframe embed codes
- live visitor comments
- accessible management APIs
- moderation-aware validation hooks
- analytics-ready event payloads
- self-hosted installer with systemd, nginx, WHMCS/license, social sharing, and DNS provider hooks

## Built-in panels

- `/` lists public streams for visitors.
- `/s/:slug` opens a public watch page with HLS playback and live comments.
- `/login` signs users and admins in.
- `/dashboard` shows streamers a tabbed panel for connection details, copy/share controls, stream-key management, encoder keys, destination records, media management, scheduled shows, embed code, support/payment settings, and stream profile editing.
- `/signup` allows new users to create accounts when signups are enabled.
- `/admin/streams` lets admins view streams and recent events.
- `/admin/accounts` lets admins create and review users.
- `/admin/signups` controls whether user signup is enabled and what role new accounts receive.
- `/admin/branding` controls the platform name, sub-heading, slogan, tagline, and public description.
- `/admin/messaging` controls guest messages, logged-in user messages, reactions, guest-name requirements, message length, and default support/payment-box settings.
- `/admin/share-links` shows tracked token share URLs, direct URLs, use counts, and last-used timestamps.
- `/admin/payments` controls WHMCS and Stripe routing.
- `/admin/install` controls install identity, license metadata, and DNS provider settings.
- `/admin/media` controls server media folders, uploaded media location, URL relay permissions, scan depth, and whether folders are visible to normal users.
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

Users can copy the server URL, stream key, tracked token share URL, direct watch page, and HLS playback URL from the dashboard. The dashboard can also open the platform share sheet for the token share URL when the browser supports it. The stream-key rotation button revokes the current key and generates a replacement in one confirmed action; the old key will no longer be accepted for future publishes.

Account security is managed from the Account tab. Users can set a notification email, configure reminders when no notification email is present, enable self-service recovery with a private recovery code, turn on built-in authenticator-app two-factor authentication, and register passkeys. Passkeys are domain-scoped by browser rules; when an install adds or moves to a new domain, admins should add that domain under the install DNS/auth-domain settings and users should register a passkey from the new domain.

The dashboard also provides an iframe embed code for the public stream page and
lets streamers add an optional background image, useful links, and a support or
payment box for the watch page. Support boxes are hidden from visitors by
default until the stream owner explicitly enables visitor display. Background
images are stored as small data images in the local JSON store, so use
compressed web images rather than large originals.

## Messaging and support

Admins can enable or disable stream messages separately for guests and logged-in
users. Guest messages can require a display name, and message length is capped by
the admin setting. Stream messages support comment, question, and support-message
types. When reactions are enabled, viewers can react with like, love, applause,
or thanks, and live viewers receive updates through the existing event stream.

The admin messaging panel also includes moderation controls. Admins can hold
guest messages for review, auto-hide messages containing configured words or
phrases, approve hidden or pending messages, hide messages without deleting
them, delete messages that should not be retained, cap the total stored message
count, and auto-clear messages after a selected number of hours or days. This
keeps busy stream chats responsive while still preserving enough recent context
for moderation.

Admins can configure default support-box text and embed HTML from
`/admin/messaging`. Each streamer can override those values from `/dashboard`.
The box can be placed before the stream player, near the stream player, or after
comments and stream details. The box is not shown to visitors unless visitor
display is enabled for that stream.

## Media library, uploads, and URL relay

AAAStreamer hides stream playback links from visitors when a creator is offline
unless the stream owner has enabled on-demand playback and selected a valid
media source. This prevents stale HLS links, stream keys, or inactive watch
links from being exposed as playable content.

Admins can configure approved media folders from `/admin/media`. Folder records
use `label|path|enabled|visible|audio|video`; use `hidden` for admin-only
folders, `disabled` to turn a folder off, `no-audio` or `no-video` to limit file
types. The default configuration looks for common server media folders including
`/mnt/backup/media`, `/mnt/backup/audio-description`, `/mnt/backup/music`,
`/mnt/*/media`, `/mnt/*/audio-description`, `/mnt/*/music`,
`/home/dom/*html/uploads/website*/Audio`, and
`/home/dom/*html/uploads/website*/galleries`. The uploaded-media folder is also
exposed as a managed media folder. Symbolic links are followed when they resolve
to playable files.

Streamers can:

- select approved server media as their stream source using checkboxes
- check all available media items when building a queue
- upload one or more supported audio or video files into the configured upload folder
- choose whether uploads auto-enable immediately or after a configured delay
- choose whether uploaded media is automatically added to the queue
- keep the media management tab auto-refreshing when new media appears
- review title, filename, duration, size, detected metadata, and chapter count
- open a logged-in-only one-minute preview with fade in and fade out before
  enabling a file for visitors
- add HTTP or HTTPS URL relay sources
- use quick source setup cards for RTMP encoders, audio stream URLs, video
  stream or file URLs, HLS playlists, server media, uploads, and custom RTMP
  sources
- enable on-demand playback so an offline stream can still be watched
- choose loop, sequential, random, start, stop, or disable actions for the
  source relay that publishes selected media through the local RTMP ingest path
  with `ffmpeg`
- set fade-in, fade-out, and crossfade target values for media playback

URL relays support remote media URLs and live HTTP audio/video streams. Local
media and URL relays can be used for 24/7 channels, music streams,
audio-description streams, training material, or replay content. Admins decide
which server folders are visible to users and which remain hidden for
admin-curated streams.

## Calendar and internal scheduler

The dashboard calendar schedules future shows. A show can be a live encoder
window, where OBS, Ecamm, Audio Hijack, Larix, or another encoder supplies the
stream, or a pre-created media show that starts an uploaded/server media source
at the scheduled time. The internal scheduler runs inside the server process,
writes events, emits live notifications over server-sent events, and stops
scheduler-started media at the configured end time.

Paid scheduled admission is not shown until the checkout-to-access-pass
enforcement path is complete. Support payments are available today; gated event
access is deliberately kept out of the UI until it can be enforced end to end.

## Share links and Mastodon

Tracked token URLs are the default share format for guests and dashboard share
actions. Direct watch and HLS URLs still work for desktop clients, VLC, and
advanced users who need backend or player access, but they are hidden from the
default guest sharing path.

Admins can audit share links from `/admin/share-links`. When
`AAASTREAMER_MASTODON_INSTANCE_URL` and `AAASTREAMER_MASTODON_ACCESS_TOKEN` are
configured, stream owners can post their tracked share link through the
configured Mastodon identity, such as a TappedIn bot or user on `md.tappedin.fm`.

## Installer, licensing, and DNS

`scripts/install-aaastreamer-server.sh` is the first Linux server installer. It
installs dependencies, creates a service user, pulls the app, creates owned
data, media, and upload folders under `/var/lib/aaastreamer` by default, writes
the env file, creates a systemd service, and optionally writes an nginx vhost.
Self-hosted installs should use those owned folders unless an administrator
explicitly grants the service account access to mounted media paths.

Self-hosted and managed installs keep their own local creator payment methods,
but license and invoice tracking remain linked to the Devine Creations WHMCS
portal using license key, install ID, domain, edition, product ID, and
validation status. DNS automation is provider-backed; Cloudflare record creation
is supported when the API token and zone ID are configured.

## Encoder and destination setup

AAAStreamer accepts RTMP publishes from common tools including:

- OBS Studio
- Ecamm Live
- Audio Hijack paired with an RTMP-capable broadcaster
- Streamlabs
- Larix Broadcaster
- vMix
- any custom RTMP or RTMPS encoder

The user dashboard shows quick source setup next to the manual custom RTMP
source path. RTMP users can copy a complete direct publish URL when their
software supports one URL field, or copy the separate server URL and stream key
for OBS-style setup. URL relay presets fill the source label, media type, and
example URL format before the user submits the source.

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
Live, LinkedIn Live, Kick, Restream.io, Rumble, X, and custom RTMP or RTMPS
services. The destination form shows provider setup links and the services a
provider can reach, such as Restream's connected channels. Manual RTMP details
remain available behind a details control for services that require direct
server/key setup. Streamers can enable or disable each destination with
checkboxes before saving their live destination choices.

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

AAAStreamer's approved commercial strategy is documented in
`docs/COMMERCIAL-STRATEGY.md`. Current commercial priorities are hosted
platform delivery, self-hosted licensed installs, and managed deployment
services. Community Edition is intentionally delayed until the commercial
platform, documentation, support process, and recurring revenue are stable.

## Future work

- database-backed analytics beyond the current JSON store
- per-room and per-server stream policy sync from VoiceLink
- chat relay integration with external systems
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
