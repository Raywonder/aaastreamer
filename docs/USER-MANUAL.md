# AAAStreamer User Manual

AAAStreamer is a hosted or self-hosted live streaming control panel. It handles
RTMP ingest, HLS playback, public watch pages, media relays, scheduled shows,
visitor messages, support payments, external site connectors, and admin tools
for accounts, branding, media, payments, updates, and licensing.

This manual is written for three groups:

- stream owners and broadcasters who need to go live, manage media, and share a stream
- administrators who manage accounts, settings, plugins, payments, media folders, updates, and licensing
- support or agent operators who help someone get activated without taking over their account

## How AAAStreamer Compares With Hosted Streaming Platforms

AAAStreamer provides many tools people expect from a conventional hosted
streaming platform. Creators can publish live or on-demand audio and video,
use a browser or an encoder such as OBS, relay Icecast or Shoutcast audio,
embed a player on another site, and optionally send social notices when their
server has that feature configured.

The main difference is where the service can run and who controls it.
AAAStreamer is available as a paid hosted service and can also be installed on
a system a customer controls. An installation may serve a whole system, one
user, or a container, depending on its license and configuration. Owners can
use their own domains, move content and settings between supported installs,
and connect independently operated servers and social services. This supports
portability and federation instead of requiring every stream to remain on one
central website.

Each AAAStreamer account can keep a local password or passkey even when it is
linked to WordPress, Mastodon, or another supported identity. This fallback
helps the creator retain access if a provider login is revoked, unavailable,
or intentionally unlinked.

Creators retain control of their original content and account data. Using
AAAStreamer to carry a stream does not by itself transfer ownership of that
content to the software project or hosting platform. Creators are still
responsible for obtaining the rights, licenses, releases, and consent needed
for what they publish. Exact rights and obligations can also depend on the
creator's agreements, location, service provider, and applicable law; this
manual does not make a legal guarantee.

AAAStreamer is designed to support free expression and to avoid unnecessary
central control over lawful streams. That does not mean that every server must
carry every kind of material or that moderation is never allowed. A server may
act on unlawful content, security threats, abuse, spam, privacy violations,
non-consensual material, or copyright complaints handled through an applicable
process. Network, data-center, domain, and other providers may also impose
terms that the server owner must follow.

Official hosted AAAStreamer servers may apply their own published acceptable
use, privacy, moderation, and complaint policies. A self-hosting operator sets
the rules for that server, subject to applicable law and provider terms. Those
rules should be easy to find, written in plain language, and applied as
consistently and transparently as practical. Before publishing sensitive or
controversial material, creators should review the rules of the exact server
they plan to use.

## Account Activation And First Login

An account can exist before it is fully activated for streaming. A standard
user account can sign in, review account tools, manage security settings, and
request broadcaster access. Broadcaster access generates the stream record and
stream key needed for OBS, Ecamm, Audio Hijack, Streamlabs, vMix, Larix, or
another RTMP encoder.

To get started:

1. Open the AAAStreamer login page.
2. Sign in with your AAAStreamer username/password or passkey. If the owner has
   enabled a paired WordPress site or Mastodon server, you may use that identity
   instead.
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

### OBS and other RTMP apps

In OBS, open **Settings > Stream**, choose **Custom**, put the AAAStreamer
**Server URL** in **Server**, and put the **Primary stream key** in **Stream
Key**. Do not add the key to the server URL unless the app specifically asks
for one complete publish URL. Start with one destination and confirm the watch
page before adding restream destinations.

Audio-only producers can use the same RTMP server and stream key. Disable the
video track in the encoder when the app supports a true audio-only publish. If
it does not, a small static video canvas is acceptable.

### Going live from a web browser

Some installations provide a **Broadcast from this browser** panel after sign
in. It can publish a microphone, camera, screen, or an allowed combination
without installing OBS or the AAAStreamer desktop client. The browser asks for
permission before sharing each device or screen.

Browser broadcasting is available only when the server owner has configured a
secure WHIP ingest endpoint. If the panel is absent or says that browser
broadcasting is unavailable, use OBS, another RTMP encoder, or ask the server
owner to configure WHIP. HTTPS is required for normal browser microphone,
camera, and screen permissions.

Before selecting **Go live**:

1. Choose microphone, camera, screen, or the combination you intend to share.
2. Confirm the browser's device preview and audio level.
3. Close any other app that is already using the microphone or camera.
4. Start the broadcast and then verify the public watch page.
5. Use **Stop broadcast** before closing the tab or signing out.

Screen sharing can expose notifications, passwords, and private windows. Select
one window or browser tab when that is enough, and review the preview before
publishing.

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

## Choosing And Configuring A Source

Use the source type that matches the address or content you actually have:

| Source | What to enter | When to use it |
| --- | --- | --- |
| Server media | A file selected from an administrator-approved folder | Music, programs, or videos already stored on the server |
| Upload | An audio or video file from your device | Content that is not yet on the server |
| HTTP/HTTPS media | A direct audio or video file URL | A remote MP3, AAC, FLAC, MP4, or other supported file |
| HLS | The direct `.m3u8` playlist URL | A live or on-demand HLS feed, not its web player page |
| Icecast | The public listener URL for the mount point | An Icecast audio stream such as `https://radio.example/stream.mp3` |
| Shoutcast | The direct public listener URL | A Shoutcast station feed, not the station directory or admin page |
| OBS/RTMP | The server URL and stream key from **Encoders** | A live microphone, camera, screen, or produced program |
| Browser broadcast | Microphone, camera, or screen selected in the browser panel | Going live without an encoder, only when WHIP is configured |

Give every saved source a plain **Content name** that listeners will understand.
Choose **audio** or **video** based on the incoming content, then choose the
matching protocol. A normal website page, embedded player page, Jellyfin page,
Icecast status page, or Shoutcast administration page is not a playable source
URL.

After saving a source, use **Start streaming this source** and confirm the
public watch page. If playback fails, first open the source URL in a suitable
player such as VLC. An address that works only after a website login or depends
on short-lived browser cookies usually cannot be relayed by the server.

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

Use **HTTP or HTTPS media** for a direct remote file, **HLS** for an `.m3u8`
playlist, **Icecast** for an Icecast mount listener URL, and **Shoutcast** for a
Shoutcast listener URL. AAAStreamer sends the relay through its local playback
path so the public page can keep using the install's normal HLS output.

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
- optional linked WordPress and Mastodon sign-in identities
- a local fallback password even when the account was first created by social sign-in

On server versions that include the external-authentication feature, WordPress
and Mastodon sign-in are optional and configurable by the server owner. A first
social sign-in may create a standard AAAStreamer account only when both public
registration and social-account creation are enabled. External identities do
not import administrator or server-manager privileges; an AAAStreamer
administrator must grant those roles explicitly. Installing connector 0.2.1
alone does not deploy this server feature.

When first signing in through WordPress or Mastodon, AAAStreamer can create a
provider-linked account if the server owner allows it. If you already have a
local AAAStreamer account, sign in to that account first and link the provider
from **Account**. This keeps streams, domains, schedules, media, and licensing
on one account. Do not create a second account just to link a provider unless
you intentionally want separate accounts.

The normal Mastodon choice for a TappedIn installation is `md.tappedin.fm`.
The normal choice for `aaastreamer.devinecreations.net` is
`mastodon.devinecreations.net`. Server owners can configure other Mastodon
instances. AAAStreamer uses the selected instance's OAuth authorization page,
so local registration rules, approval requirements, disabled applications, and
other instance policies still apply. Authenticating proves control of that
Mastodon identity; it does not automatically make the person an AAAStreamer
administrator.

AAAStreamer recommends keeping a separate local password or passkey on the same
account. That fallback lets the user revoke or lose one provider without losing
the AAAStreamer account, its streams, media, schedule, or license linkage. A
user may also keep an entirely separate administrator account for emergency
recovery. The Account tab prevents removal of the final usable sign-in method.

Server owners configure WordPress/Mastodon availability, account creation,
identity linking, optional exact-email auto-linking, and fallback policy from
Admin > Signups. Exact-email auto-linking is disabled initially. The safer
method is to sign in locally first and choose Link from the Account tab.

An owner may allow a linked Mastodon identity to manage a stream, server, or
account by granting the matching AAAStreamer role. The role remains an
AAAStreamer setting and can be removed without deleting the Mastodon account.
Likewise, unlinking or revoking one provider does not delete the AAAStreamer
account or its content when another usable sign-in method remains.

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

Connector version 0.2.1 includes its own HLS audio support for browsers that do
not play HLS audio natively. Browsers with native HLS support continue to use
their built-in player. The connector also retries through WordPress's query
REST route when a site's pretty REST URL is unavailable or returns an error.
This helps sites whose permalink or web-server rules do not expose the usual
pretty REST path.

Admins can review connected plugin sites, plugin version, enabled/disabled
state, comments state, health level, last check-in time, and last error.

Connector health is based on plugin status, errors, enabled state, and how
recently the site checked in. A healthy plugin should report its version,
stream mapping, comment behavior, and latest check-in without persistent errors.
Version 0.2.1 corrects the settings-save check-in and live-status detection, so
save the connector settings once after upgrading and then review the reported
health and mapped stream.

The connector checks the official AAAStreamer master update manifest for new
versions. Its WordPress update package is a public ZIP, so the WordPress site
does not need Gitea credentials or access to the private source repository.
The public ZIP may be mirrored from the corresponding private Gitea release;
the master manifest remains the address WordPress uses for update discovery.
Existing connector settings and stream mappings should be retained during an
upgrade, but the administrator should verify them afterward.

Version 0.2.1 contains the WordPress side of a signed, five-minute, one-time
sign-in bridge. It requires a supporting AAAStreamer server version and an
authorized client pairing before it can be used. The separate server-side
authentication feature branch is not installed merely by updating the
WordPress connector, and production SSO should not be treated as proven until
the server feature has been deployed, configured, and tested on that install.
When available, the connector must check in with an authorized AAAStreamer
client token belonging to the stream owner or an administrator; AAAStreamer
stores only the derived token hash used to verify assertions. If a person
already has an AAAStreamer account, link the WordPress identity while signed in
locally so a duplicate account is not created. A server owner may disable
WordPress sign-in while leaving the player and comments connector enabled.

Treat site-specific labels, such as
SoulFoodRadio-style examples, as defaults or examples rather than global product
requirements.

## Mastodon Publishing

Mastodon sign-in and Mastodon publishing are separate controls. Linking an
identity does not give AAAStreamer permission to post. A server owner must
enable the publishing integration, and each user must choose the event types
they want published.

The per-user Mastodon publisher belongs to the separate server feature branch.
Documentation of its settings is not proof that it is deployed or working on a
production server. Treat publishing as available only after the exact server
has exposed the controls and completed a successful authorized test post.

When the per-user publisher is configured, available choices include:

- a notice when a stream goes live
- a scheduled reminder a chosen number of minutes before going live
- now-playing or metadata changes while a source is playing
- posts from the stream owner's linked account
- inclusion of the `#aaastreamer` tag

An optional installation-wide AAAStreamer bot that mentions the stream owner is
a separate future mode; it is not enabled by the per-user publisher. Do not
assume scheduled, automatic, metadata, mention, or bot posting is active on an
installation until the corresponding controls and a successful test post are
visible. The current
manual **Share on Mastodon** action, where present, is a separate server-side
sharing feature and may use installation-level credentials rather than the
user's linked sign-in identity.

Users should be able to revoke posting permission without losing sign-in,
streams, or account data. Server owners should keep provider client secrets and
bot tokens in protected server configuration, never in a public profile or the
AAAStreamer JSON data file.

## Admin Area

Admins get an Admin link after login. Admin pages include:

- **Streams**: review streams and recent activity
- **Accounts**: create users, edit roles, activate/deactivate users, link client IDs/emails, and reset passwords
- **Signups**: enable or disable user signup, choose the default signup role, and configure WordPress/Mastodon sign-in and linking policy
- **Branding**: platform name, sub-heading, slogan, tagline, and description
- **Messaging**: guest/user messages, reactions, review settings, blocked words, retention, and support-box defaults
- **Share links**: tracked token links, direct URLs, use counts, and last-used time
- **Plugin connector**: external site connector settings, global access, linked-account requirements, and health review
- **Payments**: WHMCS and Stripe payment routing
- **Install and licensing**: install identity, license metadata, product/client settings, DNS provider settings, and auth domains
- **Media sources**: server media folders, upload folder, URL relay permissions, scan depth, user visibility, and detected files
- **Encoder settings**: default bitrate, sample rate, latency, buffer, and HLS timing
- **Updater**: update source, install latest update, maintenance mode, and restart playback recovery

### Stream footer and disclaimer

Under **Admin > Branding**, the server owner can set the hosting website URL,
show or hide that website link, show or hide the streamer disclaimer, and edit
the disclaimer text. The footer appears below the comments area on stream
pages. Use the installation owner's root website, such as `https://tappedin.fm`,
rather than an internal control-panel or stream URL.

The included disclaimer is balanced for general use: it explains that streams
and comments come from independent creators, that creators are responsible for
their content and permissions, and that concerns should be reported to the
stream owner or hosting provider. Owners may keep it as written, replace it
with their own reviewed text, or disable it. Showing the website link is a
separate switch from showing the disclaimer.

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
- confirm the selected protocol matches the source: direct media, HLS,
  Icecast, or Shoutcast
- confirm you entered a direct media, playlist, mount, or listener URL rather
  than a website player, status page, or administration page
- confirm the relay process is running
- try a one-minute preview for local media

If an account was restored but its stream is blank, first determine which of
these cases applies:

- **No source is configured:** the account and stream may be healthy but have
  nothing assigned to play. Ask the stream owner which relay, upload, server
  file, or encoder should belong to that stream, then configure only that
  source.
- **A source is configured but unreadable:** preserve the saved source record
  while checking its URL or file path, file permissions, media format, network
  access, and relay status. Repair or replace it only with the stream owner's
  approval.

Do not automatically fill a restored blank stream with media found elsewhere
on the server. A readable file is not proof that it belongs to that account,
and starting it could publish unrelated or private content. Preserve source
ownership and stream mapping during recovery. For example, several restored
accounts can correctly remain offline and await their owners' source choices
while other mapped streams resume playback.

If browser broadcasting is unavailable:

- confirm the install has a configured WHIP ingest endpoint
- use the AAAStreamer page over HTTPS
- allow microphone, camera, or screen permission in the browser
- close another app that may already control the selected device
- use OBS or another RTMP encoder when WHIP is not configured

If WordPress or Mastodon sign-in fails:

- confirm the server owner has enabled that provider under Admin > Signups
- for WordPress, confirm the site connector is paired and has checked in
- for Mastodon, confirm you chose a configured instance and approved the OAuth
  request on that same instance
- sign in with the local AAAStreamer password or passkey fallback
- link the provider from **Account** after local sign-in if you already have an
  account and want to avoid a duplicate
- ask an administrator to verify the linked identity and AAAStreamer role;
  social identity alone does not grant administrator access

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
