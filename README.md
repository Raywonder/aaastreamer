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
- enhanced guest and logged-in user stream messaging with reactions, admin moderation, blocked-word auto-hiding, guest review, and automatic message retention cleanup
- optional donation or payment support boxes configured by admins or stream owners, hidden from visitors by default
- tracked token share links for public sharing, with direct technical URLs still available to signed-in users and clients that need them
- offline-safe stream pages: public stream links and playback URLs are hidden unless the creator is live or on-demand content is enabled
- tabbed media management with checkboxes, check-all selection, bulk user media uploads, delayed auto-enable, queued media playback, automatic media refresh, and HTTP/HTTPS URL relay sources for on-demand playback or looped 24/7 streams
- calendar scheduling for live encoder windows and pre-created media shows, backed by the internal scheduler
- multi-encoder keys and stereo audio bitrate presets
- stream latency, player buffer, and HLS timing controls
- external destination records for YouTube Live, Twitch, Facebook Live, LinkedIn Live, Kick, Restream.io, Rumble, X, and custom RTMP services, with provider setup links and manual RTMP details kept secondary
- optional stream background images, stream links, and iframe embed codes
- direct-host updater with temporary maintenance mode
- self-hosted server installer with systemd, nginx, licensing, WHMCS, social sharing, and DNS provider configuration hooks
- OBS-compatible RTMP ingest using per-user stream keys
- live visitor comments with server-sent event updates
- server-ready Docker deployment
- VoiceLink integration points for live streaming modules

## What users can do now

Admins can log in, create users, enable or disable public signups, set platform branding, configure guest and logged-in messaging, moderate messages, set retention windows for snappy chat pages, set support/payment-box defaults, configure WHMCS and Stripe payment routing, choose which server media folders are available to streamers, review tracked share links, configure install/licensing/DNS settings, review streams, set encoder defaults, tune latency and buffer defaults, and inspect recent publish, done, payment, comment, and moderation events. Users can log in, copy their RTMP server URL and stream key, copy a tracked token share link, reveal direct watch/HLS URLs when needed for desktop clients or media players, revoke and generate a new stream key in one confirmed action, add extra encoder keys, bulk upload media, select or multi-select approved server media with checkboxes, queue media for continuous playback, add URL relay sources, schedule live or media-backed shows, save external destination details, tune stream latency and playback buffer, edit the stream profile, add a background image and links, configure an optional support/payment box, add general embedded content, link PayPal/Stripe/Cash App/Apple Pay URLs, connect a Stripe account ID plus client ID or client email for invoice payments, copy embed code, and open the public watch page for their stream. Visitors receive token-style share URLs by default, can open a stream page only when the creator is live or on-demand playback is enabled, watch HLS or on-demand playback, post live comments when messaging is enabled, react to visible messages when reactions are enabled, and start configured WHMCS invoice or Stripe Checkout support payments.

Users can also manage account security from their dashboard: notification email reminders, self-service recovery, built-in authenticator-app 2FA, passkeys, and confirmation preferences for add, remove, go-live, and disable actions. Admins can edit existing accounts, roles, active state, linked client details, notification emails, and password resets from the Accounts admin section.

## Payments and platform share

AAAStreamer supports three payment paths:

- Creator links and embeds: stream owners can add PayPal, Stripe Payment Link, Cash App, Apple Pay/payment URLs, notes, or trusted embed HTML.
- WHMCS invoices: when `AAASTREAMER_WHMCS_*` environment variables are configured, the visitor support form can create a WHMCS invoice for the stream owner's linked client ID. Admin-owned streams fall back to the configured platform default client ID so Devine Creations invoices and license-account continuity remain connected. The dashboard accepts one client lookup field and can resolve either client ID or client email when the WHMCS API is configured.
- Stripe Checkout and Connect: when `AAASTREAMER_STRIPE_SECRET_KEY` is configured, the visitor support form creates a Stripe Checkout Session. If the stream owner sets a Stripe Connect account ID, AAAStreamer creates a destination-charge style Checkout Session and applies the configured platform support share, defaulting to 15 percent, as the application fee. Stripe webhook updates require `AAASTREAMER_STRIPE_WEBHOOK_SECRET` and the callback URL `/api/payments/stripe/webhook`.

Secrets must stay in environment variables or another server-side secret store. Do not store API secrets in the JSON data file or public docs.

Paid scheduled access is intentionally not exposed in the calendar UI until the checkout-to-access-pass path is fully enforced on watch and embed routes. Support payments are live; gated event admission is a separate release gate.

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
as `/mnt/backup/media`, `/mnt/backup/audio-description`, `/mnt/backup/music`,
matching `/mnt/*/media`, `/mnt/*/audio-description`, `/mnt/*/music`, and
website upload paths such as `/home/dom/*html/uploads/website*/Audio` and
`/home/dom/*html/uploads/website*/galleries`. Symbolic links to media files are
followed when they resolve safely to playable files.
Streamers can also upload one or more supported audio/video files into the
configured upload folder, select approved server media with checkboxes, use a
check-all control, add selected media into a playback queue, and select HTTP or
HTTPS media URLs as relay sources when admins allow it.

The dashboard can start the selected server media file or URL relay as an RTMP
source using `ffmpeg`. A single selected source loops for 24/7 style streams;
when a queue is present, AAAStreamer advances through queued media and rotates
played sources to the back of the queue so the stream continues without manual
restart. Stream owners can set uploads to auto-enable, delay enablement after
upload, auto-add uploaded files to the queue, auto-refresh the media tab when
new files appear, preview a one-minute logged-in-only clip before enabling a
file, set fade-in/fade-out targets, or choose loop, sequential, random, and
stop/disable actions from a single relay action menu. Detected metadata,
durations, filenames, and chapter counts are shown in the media tables so the
operator can see what will be played. This supports music, audio-description,
video, or remote stream URLs, while keeping normal OBS/Ecamm RTMP ingest
available.

## Calendar and scheduler

The dashboard calendar can schedule either live encoder windows or pre-created
media shows. Media-backed shows are started by the internal scheduler when their
start time arrives and stopped when their end time arrives, if an end time is
configured. Live encoder windows are tracked as scheduled events so operators
can prepare and notify viewers, while the actual audio/video still comes from
OBS, Ecamm, Audio Hijack, Larix, or another encoder.

Scheduler events are written to the event log and emitted over the existing
server-sent event channel. Browser/device push subscriptions are not enabled by
default until VAPID credentials and a notification policy are configured.

## Share links and social sharing

AAAStreamer generates tracked token share links such as `/go/<token>` for each
stream. These are the default links shown to guests and used by the dashboard
share action. Direct watch, HLS, and embed URLs remain available to signed-in
users, moderators, admins, desktop clients, VLC, and other media tools that need
direct technical URLs.

Admins can review tracked share links from `/admin/share-links`, including
stream owner, token URL, direct URL, use count, and last-used time. Mastodon
sharing can be enabled with `AAASTREAMER_MASTODON_INSTANCE_URL` and
`AAASTREAMER_MASTODON_ACCESS_TOKEN`; dashboard sharing posts the tracked token
URL through the configured service identity, such as a TappedIn account on
`md.tappedin.fm`.

## Self-hosted installer, licensing, and DNS

The Linux server installer is `scripts/install-aaastreamer-server.sh`. It
creates a service account, installs dependencies, pulls the repository, creates
owned data/media/upload folders under `/var/lib/aaastreamer` by default, writes
`/etc/aaastreamer/aaastreamer.env`, creates a systemd service, and can create an
nginx vhost when `DOMAIN` is provided. Self-hosted installs should keep media
inside folders owned by the app user unless the admin deliberately adds a
mounted or external folder that the service account can read.

Customer-owned installs can use their own PayPal, Apple Pay, Stripe links, or
other creator payment methods. License, invoice, install ID, product ID, domain,
edition, and validation state remain linked to the Devine Creations WHMCS
licensing path through the install and admin settings. Internal Devine
Creations infrastructure remains unrestricted by license limits.

The admin install page includes DNS configuration fields and a Cloudflare record
creator. DNS changes only run when a provider token and zone ID are configured
in environment variables; unsupported or unconfigured providers report a clear
failure instead of making a pretend change.

Current production migration note: `aaastreamer.devinecreations.net` can remain
as a compatibility alias while the canonical hosted install moves under the
TappedIn account, such as `live.tappedin.fm` or `tappedin.fm/live`.

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

- [docs/COMMERCIAL-STRATEGY.md](/Users/admin/git/Raywonder/aaastreamer/docs/COMMERCIAL-STRATEGY.md)
  Approved hosted, self-hosted licensed, managed deployment, pricing, licensing,
  offline grace, internal licensing, and product-positioning strategy.
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
