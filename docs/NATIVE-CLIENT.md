# AAAStreamer Native Client Plan

This is the build target for the official AAAStreamer desktop clients for
Windows and macOS.

The official client should be native, not Electron. Tony Gebhard's
`AAADesktop/` Restream accessibility work remains valuable source material for
keyboard flow, screen-reader announcements, chat reading, privacy wording, and
streamer-first workflows, but the production client should connect directly to
AAAStreamer and use platform-native UI.

## Product Shape

The desktop client is for broadcasters, station operators, moderators, and
admins who need a faster, more accessible control surface than a browser tab.
It should work well with NVDA, JAWS, Narrator, VoiceOver, keyboard-only use, and
low-vision/high-contrast display settings.

Primary surfaces:

- Dashboard: connection state, live/offline state, current source, now playing,
  viewer-safe links, and recent events.
- Go live: copy OBS/Ecamm/Larix settings, reveal stream keys with confirmation,
  rotate keys, manage extra encoder keys, and start/stop supported relays.
- Media: browse approved server folders, uploads, URL relay sources, queue,
  loop/sequential/random modes, fade settings, and one-minute previews.
- Schedule: create live encoder windows and media-backed shows, review upcoming
  shows, and cancel/toggle scheduled items.
- Destinations: manage external RTMP destinations, enable/disable one or many,
  and keep provider setup links close without hiding manual RTMP details.
- Chat/moderation: read live messages, speak new messages aloud when enabled,
  react, approve/hide/delete messages within role permissions, and keep the
  visible log bounded.
- Profile/support: stream title, description, background image, links, embed
  code, support box, and payment links.
- Admin mode: accounts, stream inventory, branding, messaging defaults, media
  folders, encoder defaults, payments, install/licensing, DNS, updater, and
  share-link audit, gated by server role.

## Platform Direction

Use a shared server API contract and shared behavior tests, not a shared web UI.

- Windows: WinUI 3 or WPF on .NET, depending on packaging and screen-reader
  proof. Prefer WinUI 3 if accessibility testing is clean; use WPF if it proves
  more stable with NVDA/JAWS for the first release.
- macOS: SwiftUI/AppKit where VoiceOver behavior needs AppKit control. Build on
  the Mac mini lane when signing, packaging, or VoiceOver testing is needed.
- wxPython smoke lane: keep a small cross-platform Python/wxPython client under
  `clients/wxpython-smoke/` for fast API and accessibility experiments before
  committing every idea to WPF/WinUI and SwiftUI/AppKit.
- Shared protocol: OpenAPI-style JSON contract generated from the Node backend
  or maintained alongside it until route coverage is complete.
- Shared non-UI behavior: request/response fixtures, keyboard workflow checklist,
  screen-reader announcement expectations, and platform-neutral terminology.

Do not make the official app an Electron shell. The existing Electron
AAADesktop tree can stay as imported source/reference material and a quick
prototype lane.

OBS integration belongs at the desktop edge, not inside the core server
contract. The official client may later use OBS WebSocket to detect scenes,
show local status, copy RTMP settings, or offer one-button setup, but
AAAStreamer must remain compatible with any RTMP encoder, including OBS, Ecamm,
Larix, Audio Hijack, and hardware encoders.

## Backend API Needed

The current backend already has useful JSON endpoints such as:

- `GET /api/health`
- `GET /api/me`
- `GET /api/streams`
- `GET /api/streams/:streamId`
- `GET /api/streams/:streamId/links`
- `POST /api/streams/:streamId/links`
- `POST /api/streams/:streamId/comments`
- `POST /api/comments/:commentId/reactions`
- `POST /api/streams/:streamId/playback/ensure`
- `POST /api/streams/:streamId/restream/start`
- `POST /api/streams/:streamId/restream/stop`
- `GET /api/media/catalog`

Most dashboard and admin actions are still form routes. The native clients
should not scrape HTML. Add a stable `/api/client/v1` surface for the official
apps.

Minimum client API surface:

- `POST /api/client/v1/session/login`
- `POST /api/client/v1/session/logout`
- `GET /api/client/v1/session/me`
- `GET /api/client/v1/device/me`
- `POST /api/client/v1/device/check-in`
- `POST /api/client/v1/auth/start`
- `GET /api/client/v1/auth/poll/:pollToken`
- `GET /api/client/v1/bootstrap`
- `GET /api/client/v1/events`
- `GET /api/client/v1/streams`
- `GET /api/client/v1/streams/:streamId`
- `PATCH /api/client/v1/streams/:streamId/profile`
- `POST /api/client/v1/streams/:streamId/stream-key/rotate`
- `GET /api/client/v1/streams/:streamId/encoders`
- `POST /api/client/v1/streams/:streamId/encoders`
- `DELETE /api/client/v1/streams/:streamId/encoders/:encoderId`
- `GET /api/client/v1/streams/:streamId/sources`
- `POST /api/client/v1/streams/:streamId/sources/select`
- `POST /api/client/v1/streams/:streamId/sources/url`
- `POST /api/client/v1/streams/:streamId/sources/upload`
- `POST /api/client/v1/streams/:streamId/sources/start`
- `POST /api/client/v1/streams/:streamId/sources/stop`
- `POST /api/client/v1/streams/:streamId/sources/action`
- `GET /api/client/v1/streams/:streamId/schedule`
- `POST /api/client/v1/streams/:streamId/schedule`
- `PATCH /api/client/v1/streams/:streamId/schedule/:showId`
- `DELETE /api/client/v1/streams/:streamId/schedule/:showId`
- `GET /api/client/v1/streams/:streamId/destinations`
- `POST /api/client/v1/streams/:streamId/destinations`
- `PATCH /api/client/v1/streams/:streamId/destinations/:destinationId`
- `DELETE /api/client/v1/streams/:streamId/destinations/:destinationId`
- `GET /api/client/v1/streams/:streamId/comments`
- `PATCH /api/client/v1/comments/:commentId/moderation`
- `GET /api/client/v1/media/catalog`
- `GET /api/client/v1/admin/*` for role-gated admin panels after broadcaster
  workflows are proven.

Authentication should support password plus existing TOTP/passkey paths where
practical. The first native path is a device authorization flow:
`auth/start` returns a short user code and approval URL, the signed-in web
session approves that code, and `auth/poll` returns a bearer token for the
native client. Tokens should be revocable and stored only in platform secure
storage: Windows Credential Manager/DPAPI and macOS Keychain. Stream keys,
destination keys, and payment/account identifiers must never be logged.

## Release Phases

1. API contract and smoke client:
   Add `/api/client/v1/bootstrap`, session/me, stream list/detail, events, and
   a generated contract file. Build a read-only native shell on both platforms
   that logs in, lists streams, reads live state, and receives events.

   Current spike: `clients/wxpython-smoke/` can run a headless
   health/bootstrap check without wxPython and a graphical wxPython device-auth
   smoke client when wxPython is installed.

2. Broadcaster control:
   Add profile editing, stream-key handling, encoder keys, source selection,
   URL relay, media relay start/stop, queue management, and schedule create/edit.

3. Chat and voice:
   Add live chat/moderation API coverage, bounded chat log, optional spoken
   chat, per-user voice settings, and platform-native pause/stop speaking.

4. Admin mode:
   Add accounts, media folders, messaging defaults, branding, share links,
   payments, install/licensing, DNS, and updater controls.

5. Packaging:
   Windows installer/MSIX plus portable build; macOS signed/notarized app and
   DMG/zip. Both builds should expose version, server compatibility version,
   update channel, and diagnostics export with secrets redacted.

## Accessibility Rules

- Every primary action must be reachable by keyboard.
- Every state-changing action must have an accessible announcement.
- Destructive or secret-revealing actions default focus to the safe choice.
- Stream keys and destination secrets are hidden until explicitly revealed.
- Busy states must not trap focus or cause repeated screen-reader chatter.
- Lists must be virtualized or paged so large media libraries and busy chats do
  not overload the accessibility tree.
- High contrast, reduced motion, and large text must be tested on both
  platforms before release claims.

## First Build Checklist

- Add the `/api/client/v1` route group with JSON-only responses.
- Add a contract/fixture folder under `docs/client-api/`.
- Add read-only smoke tests for auth, stream list, stream detail, and events.
- Create `clients/windows/` and `clients/macos/` only after the API contract has
  a working smoke test.
- Verify against the live hosted install and a local/dev install before calling
  any client build ready.
