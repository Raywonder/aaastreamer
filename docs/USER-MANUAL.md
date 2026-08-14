# AAAStreamer User Manual

AAAStreamer is a hosted or self-hosted live streaming control panel. It handles
RTMP ingest, HLS playback, public watch pages, media relays, scheduled shows,
visitor messages, support payments, external site connectors, and admin tools
for accounts, branding, media, payments, updates, and licensing.

This manual is written for three groups:

- stream owners and broadcasters who need to go live, manage media, and share a stream
- administrators who manage accounts, settings, plugins, payments, media folders, updates, and licensing
- support or agent operators who help someone get activated without taking over their account

## Account Activation And First Login

An account can exist before it is fully activated for streaming. A standard
user account can sign in, review account tools, manage security settings, and
request broadcaster access. Broadcaster access generates the stream record and
stream key needed for OBS, Ecamm, Audio Hijack, Streamlabs, vMix, Larix, or
another RTMP encoder.

To get started:

1. Open the AAAStreamer login page.
2. Sign in with the username and password provided by the site owner or admin.
3. If the account is not yet a broadcaster account, choose **Get broadcast access and generate stream key**.
4. Open the Dashboard.
5. Review the Overview and Encoders tabs.
6. Copy the RTMP server URL and stream key into your encoder.
7. Open the public watch page or share link when you are ready to test.

If a user is not sure whether the account is activated, check the Dashboard. A
non-activated account shows a user panel and a broadcast access button instead
of the full broadcaster tabs.

## Dashboard Overview

The Dashboard is the main user workspace. It is available after login and is
split into tabs:

- **Overview**: share links, direct watch link, HLS URL, embed code, stream status, queue status, enabled destinations, visible/pending messages, and recent activity
- **Media management**: server media, uploads, URL relay sources, source queue, preview, auto-refresh, playback behavior, and on-demand options
- **Encoders**: RTMP server URL, primary stream key, extra encoder keys, audio settings, video settings, HLS output, latency, and buffer controls
- **Destinations**: YouTube Live, Twitch, Facebook Live, LinkedIn Live, Kick, Restream.io, Rumble, X, and custom RTMP/RTMPS targets
- **Calendar**: scheduled live windows and scheduled media shows
- **Plugin connector**: external site connector settings, WordPress shortcodes, health status, comments behavior, and connected site check-ins
- **Stream profile**: title, description, slug, links, visibility, background image, extra embed content, and comments toggle
- **Support and payments**: support box settings, creator payment links, Stripe Connect, WHMCS invoice client lookup, Cash App, Apple Pay/payment links, and embed HTML
- **Account**: display name, linked client ID/email, notification email, What's new preference, action confirmation preferences, recovery, 2FA, and passkeys
- **Advanced**: on-demand display and offline visibility controls
The logged-in navigation also includes **Manual**, which opens this manual
without changing the current dashboard role or tab flow.

## Going Live With An Encoder

AAAStreamer accepts RTMP publishes from common live tools. OBS-style apps
usually ask for a server URL and stream key. Other apps may accept a single
direct publish URL.

Use the Encoders tab:

1. Copy **Server URL**.
2. Copy **Primary stream key** or another enabled encoder key.
3. Paste those values into OBS or another encoder.
4. Use stereo audio when possible.
5. Use a 48 kHz sample rate when the encoder supports it.
6. Use 160k audio bitrate for general speech streams.
7. Use 192k to 320k for music-heavy streams.
8. Use a 2 second keyframe interval for video.
9. Start streaming in the encoder.
10. Open the watch page and confirm playback.

The raw RTMP application is normally:

```text
rtmp://HOSTNAME:1935/live
```

Unknown stream keys are rejected unless the server is deliberately configured
for open testing.

## Stream Keys And Encoder Keys

Every broadcaster has a primary stream key. Additional encoder keys can be
created for separate apps or devices. For example, one key can be named OBS
Windows, another Ecamm Mac, and another Audio Hijack.

Use extra keys when:

- you want separate keys for different machines
- you need to disable one encoder without replacing every encoder setting
- you want to track which app or machine is currently live
- multiple producers may connect at different times

Revoking the primary key generates a replacement. Any encoder still using the
old key will stop working until updated. Use the confirmation prompt carefully.

## Share Links, Watch Pages, HLS, And Embeds

AAAStreamer gives each stream a tracked share link. This is the preferred public
link because it can be counted and audited by admins.

The Dashboard also shows direct links:

- **Share link**: the normal visitor link, usually `/go/<token>`
- **Direct watch page**: the stream page, usually `/s/<slug>`
- **HLS playback URL**: direct player URL for tools like VLC or technical clients
- **Web embed code**: iframe code for embedding the stream page

Visitors only see playable links when the stream is live or when on-demand
playback is enabled and a valid source is available. This prevents stale HLS
links from being exposed when nothing is playing.

## Media Management

Media management is used for server-hosted files, uploaded files, URL relays,
and continuous on-demand playback.

Streamers can:

- select approved server media from visible folders
- use checkboxes and check-all controls to build a queue
- search and filter large server media libraries before adding files to the queue
- jump through media by first letter or number
- upload one or more audio/video files when uploads are allowed
- auto-enable uploads immediately or after a delay
- auto-add uploads to the queue
- auto-refresh the media tab when files appear
- preview a one-minute clip before enabling a file
- add HTTP or HTTPS media URLs as relay sources
- start, stop, loop, randomize, or disable source relays
- keep a continuous queue running for 24/7 channels
- set fade-in, fade-out, and crossfade values
- choose whether on-demand playback is visible when offline

The media table can show title, filename, duration, size, media type, detected
metadata, and chapter count when available.

For large libraries, use **Browse server media** on the Media management tab.
Search title, file, folder, or path; choose a folder or audio/video type; use
the A-Z and 0-9 letter navigation; choose page size; then check the visible page
or individual media cards before starting playback or adding the selection to
the queue.

## URL Relay Sources

URL relays let AAAStreamer publish a remote media URL or stream through the
local RTMP/HLS path. This is useful for internet radio streams, audio files,
video files, HLS playlists, and other HTTP/HTTPS sources.

Admins decide whether users can add their own URL relay sources. If enabled,
streamers can choose a source preset, paste a media URL, save it, and start it
as the current stream source.

Use URL relays for:

- radio relays
- replay channels
- music streams
- training material
- audio-described content
- server-to-server stream sources

## Scheduled Shows And Calendar

The Calendar tab creates future shows. A show can be:

- a live encoder window, where the person streams from OBS or another encoder
- a media-backed show, where AAAStreamer starts a selected media source at the scheduled time

Scheduled media shows can stop at a configured end time. Scheduler actions are
recorded in the event log and emitted through live event updates.

Paid scheduled admission is intentionally not shown until access enforcement is
complete. Support payments are available today; gated event admission is a
separate release gate.

## Destinations And Restreaming

Destinations describe external services or subchannels that may receive the
stream. AAAStreamer includes presets for:

- YouTube Live
- Twitch
- Facebook Live
- LinkedIn Live
- Kick
- Restream.io
- Rumble Live
- X Live
- custom RTMP or RTMPS services

Destination records can be enabled or disabled individually or in bulk. Manual
RTMP details stay collapsed unless opened.

Enabling a destination means it is allowed to receive stream output. It does not
replace the streamer's responsibility to configure the external service with the
correct stream key or event settings.

Some restream endpoints record start/stop requests and events for integration
workflows. Confirm the specific install's restream worker or external platform
configuration before promising automatic fan-out to every saved destination.

## Stream Profile

The Stream profile tab controls how the stream appears to visitors.

Streamers can manage:

- stream title
- stream slug
- stream description
- public/unlisted visibility
- stream links
- background image
- extra embed or content blocks
- visitor comments toggle

Background images are stored as small data images in the local store, so use
compressed web images rather than large originals.

## Visitor Messages, Comments, And Reactions

Visitor stream messaging can be enabled or disabled by admins and by stream
settings. The system supports:

- guest messages
- logged-in user messages
- guest display-name requirement
- message length limits
- comment, question, and support-message types
- live Server-Sent Event updates
- reactions such as like, love, applause, and thanks
- moderation status: visible, pending, hidden, or deleted
- blocked-word auto-hiding
- guest review before public display
- message retention limits and cleanup

Admins and moderators should hide messages when they should stop displaying but
remain useful for review. Delete messages only when they should be removed from
retained history.

## Support And Payments

AAAStreamer supports creator support boxes and platform payment routing.

Creators can add:

- PayPal URL
- Stripe payment link
- Stripe Connect account ID
- Cash App URL
- Apple Pay or other payment URL
- payment notes
- trusted embed HTML
- WHMCS client ID or client email for invoice support payments

Admins can configure platform defaults and payment readiness. Stripe Checkout
requires a server-side Stripe secret key. WHMCS invoice payments require WHMCS
API settings. Secrets belong in environment variables, not in the JSON data file
or public docs.

Support boxes are hidden from visitors by default until the stream owner enables
visitor display.

## Account Settings And Security

The Account tab includes identity, notification, confirmation, recovery, and
authentication settings.

Users can manage:

- display name
- linked client ID or client email
- notification email
- notification email reminders
- What's new display preference
- action confirmations
- go-live countdown
- recovery code
- authenticator-app two-factor authentication
- passkeys

Passkeys are domain-scoped by browser rules. If an install moves to a new
domain, admins should configure the domain in install DNS/auth-domain settings,
and users should register a passkey from the new domain.

## Plugin Connector

The Plugin connector tab is the external site integration area. Today it covers
the WordPress connector, but the tab is intentionally named for future plugins
too.

Streamers can save:

- site URL
- listen page URL
- plugin REST base URL
- whether the connection is enabled
- whether comments are allowed from the plugin page
- whether comments should be hidden on the normal AAAStreamer watch page

The current WordPress plugin shortcodes are:

```text
[aaastreamer_player]
[aaastreamer_comments]
[aaastreamer_account_panel]
```

Admins can review connected plugin sites, plugin version, enabled/disabled
state, comments state, health level, last check-in time, and last error.

Connector health is based on plugin status, errors, enabled state, and how
recently the site checked in. A healthy plugin should report its version,
stream mapping, comment behavior, and latest check-in without persistent errors.

The WordPress plugin also includes account-panel and SSO-style helper behavior
for connected sites. Treat site-specific default labels, such as
SoulFoodRadio-style examples, as defaults or examples rather than global product
requirements.

## Admin Area

Admins get an Admin link after login. Admin pages include:

- **Streams**: review streams and recent activity
- **Accounts**: create users, edit roles, activate/deactivate users, link client IDs/emails, and reset passwords
- **Signups**: enable or disable user signup and choose the default signup role
- **Branding**: platform name, sub-heading, slogan, tagline, and description
- **Messaging**: guest/user messages, reactions, review settings, blocked words, retention, and support-box defaults
- **Share links**: tracked token links, direct URLs, use counts, and last-used time
- **Plugin connector**: external site connector settings, global access, linked-account requirements, and health review
- **Payments**: WHMCS and Stripe payment routing
- **Install and licensing**: install identity, license metadata, product/client settings, DNS provider settings, and auth domains
- **Media sources**: server media folders, upload folder, URL relay permissions, scan depth, user visibility, and detected files
- **Encoder settings**: default bitrate, sample rate, latency, buffer, and HLS timing
- **Updater**: update source, install latest update, maintenance mode, and restart playback recovery

## Media Sources Admin

Admins control which server folders users can select from. Folder records are
managed as rows with checkboxes and action menus rather than raw path editing.

Admins can:

- enable or disable the media library
- allow users to select visible server media
- expose or hide the uploaded media folder
- enable URL relay sources
- allow users to add their own HTTP/HTTPS relay URLs
- set maximum scan depth
- enable or disable folders
- make folders visible or admin-only
- allow audio, video, or both
- bulk change selected folders with confirmation

Common configured folders include backup media, music, audio-description media,
user media, website upload folders, and the app upload folder.

## Updater And Restart Playback Recovery

The Updater page lets admins save an update manifest URL, start an update, turn
maintenance mode on/off, and control restart playback recovery.

The app updater, server installer, guarded web installer, restart recovery, and
plugin connector update metadata are separate pieces:

- the app updater updates the AAAStreamer app process
- maintenance mode protects users while the app update runs
- restart playback recovery resumes eligible relays after restart
- the server installer prepares a Linux host
- the guarded web installer runs the server installer over approved SSH
- plugin connector update metadata records plugin status and preferences, but actual plugin update delivery depends on the connected plugin workflow

Restart playback recovery can automatically resume live relays and continuous
on-demand channels after AAAStreamer restarts. This is helpful for 24/7 streams
and server media channels. If disabled, admins or stream owners must restart
media relays manually after a restart.

## Installer, Licensing, And DNS

AAAStreamer can run as a hosted service, self-hosted install, managed install,
or internal enterprise deployment.

The installer can:

- create a service account
- install dependencies
- pull the repository
- create data, media, and upload folders
- write the environment file
- create a systemd service
- optionally create an nginx vhost

The install and licensing settings connect an install to product ID, license
key, install ID, domain, edition, deployment tier, WHMCS client ID/email, and
validation state.

DNS automation is provider-backed. Cloudflare record creation works when the API
token and zone ID are configured. Unsupported or unconfigured providers should
report a clear failure rather than pretending a DNS change happened.

## VoiceLink And API Integration

VoiceLink can treat AAAStreamer as its primary live streaming backend.

Important integration endpoints:

```text
POST /api/voicelink/on_publish
POST /api/voicelink/on_done
POST /api/voicelink/validate_user
GET  /api/streams
GET  /api/streams/:streamId
POST /api/streams/:streamId/restream/start
POST /api/streams/:streamId/restream/stop
POST /api/streams/:streamId/comments
POST /api/comments/:commentId/reactions
POST /api/streams/:streamId/support-payments
POST /api/payments/stripe/webhook
```

If `AAASTREAMER_REQUIRE_SECRET=true`, VoiceLink webhook requests must provide
the shared secret expected by the server.

## Accessibility Notes

AAAStreamer should remain usable with keyboard navigation, screen readers, and
clear form labels. Most major actions are normal links, buttons, checkboxes,
selects, text fields, and tables. Confirmation prompts are used for actions
that can affect live streams or remove saved settings.

Recommended operator practice:

- read the active tab heading before making changes
- review selected checkboxes before bulk media or destination actions
- copy stream settings from read-only fields to avoid typing mistakes
- keep direct HLS URLs available for VLC and accessible media players
- use descriptive stream titles and link labels
- test watch pages after branding or media changes

## Troubleshooting

If a stream is not visible to visitors:

- confirm the stream is live, or on-demand playback is enabled with a valid source
- confirm the watch page link is correct
- confirm the encoder is using the correct RTMP server URL and stream key
- confirm the stream key has not been revoked
- check recent stream activity on the Dashboard
- check admin stream events if you are an admin

If media does not play:

- confirm the media folder is enabled
- confirm the file type is supported
- confirm the folder is visible to users if a non-admin needs it
- confirm URL relay is enabled if using a remote URL
- confirm the relay process is running
- try a one-minute preview for local media

If a support payment cannot be created:

- confirm Stripe or WHMCS is enabled in Admin payments
- confirm server-side secrets are configured
- confirm the stream or account has a linked client ID/email when using WHMCS
- confirm the support box is enabled and shown to visitors if visitors need it

If passkeys fail:

- confirm the current domain is listed in install DNS/auth-domain settings
- use HTTPS
- register the passkey from the same domain where it will be used
- keep a recovery method available

If updates interrupt playback:

- open Admin, then Updater
- enable restart playback recovery
- confirm the affected stream has a valid current source or queue
- restart the app only after confirming the WhatsApp or support channel used for coordination will stay reachable

## Safe Agent And Support Workflow

When an agent or support helper is assisting a customer:

- verify the customer by the channel and account context available
- use the customer's display name in conversation
- do not expose stream keys, secrets, or client IDs in public channels
- ask before messaging another person
- explain whether the account is activated or still waiting for broadcast access
- guide the user to the manual, Dashboard, and activation button
- confirm before changing live destinations, stream keys, payments, DNS, or licensing
- document what was changed and where the customer can review it
Crossfade is stored as part of media behavior settings. Current relay behavior
uses the stream source and fade targets; deeper crossfade mixing should be
treated as planned behavior unless the install has been updated with that media
pipeline.
