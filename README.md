# Raywonder `.GITHUB` Workflow Catalog

This repository provides reusable GitHub Actions workflows for Raywonder/Devine Creations projects.

## Governance alignment
- Native-first build policy
- Minimal token usage
- Least-privilege permissions
- Concurrency with cancel-in-progress
- Caching for language toolchains
- Release trigger on tags: `v*.*.*`

## Reusable workflow refs
Use these from project repos:

- `raywonder/.GITHUB/.github/workflows/ci.yml@main`
- `raywonder/.GITHUB/.github/workflows/security.yml@main`
- `raywonder/.GITHUB/.github/workflows/release.yml@main`
- `raywonder/.GITHUB/.github/workflows/docs.yml@main`
- `raywonder/.GITHUB/.github/workflows/ci-node.yml@main`
- `raywonder/.GITHUB/.github/workflows/ci-php.yml@main`
- `raywonder/.GITHUB/.github/workflows/ci-python.yml@main`
- `raywonder/.GITHUB/.github/workflows/docker-build.yml@main`

## Standard secrets
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_PATH`
- `SERVER_SSH_KEY`
- `WINDOWS_CODESIGN_PFX`
- `WINDOWS_CODESIGN_PASSWORD`
- `APPLE_CERT_P12`
- `APPLE_CERT_PASSWORD`
- `APPLE_TEAM_ID`

## Documentation Release Gate

Before builds or public installer replacement:
1. update docs
2. review docs against the actual feature set
3. confirm docs before replacing live copies or publishing builds

Use first-party docs and in-app docs as the primary user-facing documentation target.

## VoiceLink iOS Standard Build/Upload Command

Use this command for repeat iOS archive + export + TestFlight upload:

```bash
cd /Users/admin/dev/apps/voicelink-local/swift-native/VoiceLinkiOS
APPLE_ID_EMAIL="<apple-id>" APP_SPECIFIC_PASSWORD="<app-specific-password>" AUTO_UPLOAD=1 ./scripts/archive_ios_testflight.sh
```

Rules:
- keep automatic signing enabled
- keep credentials in environment variables only
- if transporter is run manually, include `-itc_provider G5232LU4Z7`
