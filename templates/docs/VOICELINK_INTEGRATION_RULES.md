# VoiceLink Integration Rules
Last updated: 2026-04-03

Browser admin UI and desktop admin control panel should read the same install/license state where possible.

## Suggested routes
- `/admin/install`
- `/admin/license`
- `/admin/domain-binding`

## Suggested endpoints
- `POST /api/install/register`
- `POST /api/install/validate-license`
- `GET /api/install/status`
- `GET /.well-known/voicelink.json`
