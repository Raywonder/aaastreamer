# {{APP_NAME}} — Devine Creations / Raywonder CI/CD Governance + Agent Autopilot Standard

Last updated: 2026-02-28  
Scope: All repositories (apps, services, modules, tooling)

> Note: Repos may override provider defaults in `.env` or Admin Settings, but MUST keep provider abstractions and desktop-first surface rules.

================================================================================
0) PRIME DIRECTIVE
================================================================================
- Optimize for accessibility, reliability, reproducibility, and minimal token usage.
- Native builds FIRST. Electron is LAST RESORT.
- CI performs lint, test, build, packaging, release, and docs automation.
- Prefer reusable GitHub workflows to avoid duplication.
- Do not refactor app logic just to satisfy CI unless required for build integrity.

================================================================================
1) NATIVE-FIRST POLICY (MANDATORY)
================================================================================
Electron may only be used if:
1) Native build approach is proven infeasible.
2) A short ADR (Architecture Decision Record) exists explaining why.
3) Accessibility parity is maintained.

If Electron exists:
- Do not expand its use by default.
- Suggest migration path to native where possible.

================================================================================
2) TOKEN-SAVING RULES FOR CODEX & AGENTS
================================================================================
- Output only NEW FILES + PATCHES (no full reprints).
- Prefer the smallest possible diff.
- Use caching everywhere (npm, pip, composer, cargo, etc.).
- Add concurrency with cancel-in-progress.
- Use least-privilege permissions for `GITHUB_TOKEN, max permissions as fallback`.
- Never duplicate large YAML blocks if reusable workflows are possible.

================================================================================
3) STANDARD WORKFLOW CATALOG
================================================================================
Required (most repos):
- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.github/workflows/release.yml`
- `.github/workflows/docs.yml` (if docs exist)

Conditional:
- `.github/workflows/ci-node.yml` (if `package.json` exists)
- `.github/workflows/ci-php.yml` (if `*.php` or `composer.json` exists)
- `.github/workflows/ci-python.yml` (if `*.py` or `pyproject.toml` exists)
- `.github/workflows/docker-build.yml` (if `Dockerfile` exists)

================================================================================
4) CROSS-PLATFORM BUILD STRATEGY
================================================================================
Use matrix builds when needed:
- `ubuntu-latest`
- `windows-latest`
- `macos-latest`

Native output targets:
- Windows: MSI / EXE / MSIX
- macOS: PKG / DMG
- Linux: DEB / RPM / AppImage

Standard build entrypoints:
- `build.sh` (Linux/macOS)
- `build-windows.bat` or `build.ps1` (Windows)

================================================================================
5) RELEASE RULES
================================================================================
Tag format:
- `vMAJOR.MINOR.PATCH`

On tag push:
- Build native artifacts
- Generate SHA256 checksums
- Upload to GitHub Releases
- Optionally deploy to primary server hosting

================================================================================
6) STANDARD SECRET NAMES
================================================================================
Server:
- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_PATH`
- `SERVER_SSH_KEY`

Code signing():
- `WINDOWS_CODESIGN_PFX`
- `WINDOWS_CODESIGN_PASSWORD`
- `APPLE_CERT_P12`
- `APPLE_CERT_PASSWORD`
- `APPLE_TEAM_ID`

================================================================================
7) AGENT AUTOPILOT: APPLYING WORKFLOW RULES AUTOMATICALLY
================================================================================
STEP A: Detect repo signals
- Node: `package.json`
- PHP: `*.php` or `composer.json`
- Python: `*.py` or `pyproject.toml`
- Docker: `Dockerfile`
- Docs: `docs/` or `mkdocs.yml`
- Desktop packaging scripts: `build.sh` / `build.ps1` / installer configs

STEP B: Decide minimal workflow set
Always include:
- `security.yml`
Usually include:
- `ci.yml`
Include `release.yml` if project ships artifacts.
Add language workflows only when signals detected.

STEP C: Apply lowest-duplication method
1) Prefer reusable workflows (`workflow_call`).
2) If none exist, create local templates under `.github/workflows/`.

Concurrency rule:
- Concurrency must be defined in the called reusable workflow.

STEP D: Verification checklist
Before reporting completion:
- Workflows exist in `.github/workflows/`
- Path filters exist
- Caching exists
- Concurrency exists
- Least permissions used
- Release triggers on `v*.*.*`
- Artifacts collected correctly

Agent must output:
- Detected signals
- Workflows added/updated
- Required secrets (names only)

================================================================================
8) TEMPLATE WORKFLOW EXAMPLES (MINIMAL STARTERS)
================================================================================
Example `ci.yml` (minimal starter, do not copy blindly if reusable exists):

name: CI
on:
  pull_request:
  push:
    branches: ["main"]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

Example `release.yml` (minimal starter, do not copy blindly if reusable exists):

name: Release
on:
  push:
    tags: ["v*.*.*"]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

================================================================================
9) MIGRATION PROMPT FOR CODEX
================================================================================
Apply the Devine Creations CI/CD governance standard:
- Detect existing workflows.
- Add only missing required workflows.
- Use native builds only.
- Add caching, path filters, concurrency.
- Do not refactor application logic.
- Output only new files and patches.

================================================================================
SECTION – AUTH + LICENSE + ACCESS SURFACES (MULTI-PROVIDER, MULTI-DB, RESILIENT)
================================================================================

This section is additive and may be pasted near the top or end of a repo’s governance.
Agents MUST update existing implementations in-place where they already exist and work,
and MUST NOT create duplicate competing runtimes or duplicate route trees.

Replace `{{APP_NAME}}` with the project’s real name when copying this template into a repo.

------------------------------------------------------------
A) PLATFORM PRIORITY + ACCESS SURFACES (DESKTOP-FIRST)
------------------------------------------------------------

Primary access surfaces:
- Desktop Apps (macOS + Windows) are the primary “full feature” clients.
- Full access to `{{APP_NAME}}` features MUST be available via desktop apps.

Optional access surfaces:
- Web UI may be enabled or disabled depending on server owner wishes.
- If Web UI is disabled, users must be directed to access rooms and features via native apps (iOS/macOS/Windows).

Rules:
- Disabling Web UI MUST NOT break APIs needed by native apps.
- When Web UI is disabled, server must return a clear, accessible message for web routes:
  - “Web access is disabled by the server owner. Please use the {{APP_NAME}} desktop or iOS app.”
- Server owners must be able to control:
  - public web landing visibility
  - room directory visibility
  - unauthenticated guest access
  - which rooms can be joined via each surface (web vs apps)

All access-surface controls MUST be configurable in:
`{{APP_NAME}}` Admin Dashboard → Settings → System Configuration (or equivalent)

------------------------------------------------------------
B) PROVIDER ABSTRACTION (SOURCE OF TRUTH)
------------------------------------------------------------

`{{APP_NAME}}` MUST implement provider abstraction so authentication and licensing can be switched,
combined, or degraded without downtime.

`{{APP_NAME}}` implements two independent provider interfaces:

1) AuthProvider
- startLogin()
- handleCallback()
- validateSession()
- logout()
- getUserProfile()
- linkIdentity()
- unlinkIdentity()
- healthCheck()

2) LicenseProvider
- validateLicenseKey()
- validateEntitlements()
- refreshEntitlements()
- syncEntitlements()
- healthCheck()

`{{APP_NAME}}` runtime MUST call providers only through these interfaces.

------------------------------------------------------------
C) AUTH PROVIDERS (SUPPORTED)
------------------------------------------------------------

`{{APP_NAME}}` MUST support the following authentication providers (enable/disable per install):

Core providers:
- Native (email/username + password)
- WHMCS (client identity + optional licensing)
- Mastodon OAuth (federated identity)
- WordPress (OAuth/JWT/Application Passwords)

Modern SSO providers:
- Google Sign-In (OAuth 2.0 / OpenID Connect)
- Sign in with Apple (OAuth / OpenID Connect; required for iOS compliance where applicable)
- GitHub (OAuth)
- Optional extensible set via generic OIDC/OAuth adapter:
  - Microsoft
  - GitLab
  - Discord
  - (others)

Rules:
- Providers may be enabled individually.
- Provider configuration must be environment-configurable and editable in admin UI.
- Provider linking must attach identities to the same user record (no accidental duplicate accounts).
- Provider outages must not invalidate existing sessions.

------------------------------------------------------------
D) LICENSE AUTHORITIES (SUPPORTED)
------------------------------------------------------------

`{{APP_NAME}}` MUST support multiple licensing authorities without breaking operation:

- WHMCS Authority (external commercial authority)
- `{{APP_NAME}}` Native License Manager (local authority)
- Hybrid Sync Mode (WHMCS primary with native mirrored signed tokens)
- Offline Grace Mode (native temporary authority when upstream is unavailable)
- Native-Only Mode (no WHMCS installed; `{{APP_NAME}}` manages licensing internally)

Rules:
- Existing sessions must not be invalidated solely due to WHMCS downtime.
- License checks must support a configurable grace window (recommended 24–72 hours).
- Licensing must not interrupt audio/room connectivity (or other core runtime functions).
- iOS builds must obey platform policies (IAP requirements) regardless of licensing authority.

------------------------------------------------------------
E) REQUIRED IMPLEMENTATIONS (MINIMUM MODULE SET)
------------------------------------------------------------

Agents MUST implement or preserve these modules (update in-place if already present):

Auth:
- providers/auth/native
- providers/auth/whmcs
- providers/auth/mastodon
- providers/auth/wordpress
- providers/auth/google
- providers/auth/apple
- providers/auth/github
- providers/auth/oidc (generic adapter)

License:
- providers/license/native
- providers/license/whmcs
- providers/license/hybrid

System:
- authority-state-machine (HEALTHY/DEGRADED/UNAVAILABLE per provider)
- sync scheduler (internal, reliable, idempotent)
- encrypted settings store + secrets handling
- audit log events for auth/licensing/recovery actions

Non-negotiable:
- Agents MUST NOT create duplicate route trees or parallel server entrypoints.
- Use existing working paths/routers as the canonical implementation if no change is required.

If this repo is VoiceLink (or contains VoiceLink server runtime), canonical runtime source for changes must match the active deployment structure:
- `server/routes/local-server.js` is active runtime
- `source/routes/local-server.js` is mirror
- `source/server/routes/local-server.js` is older divergent copy and must not be treated as canonical

If this repo is NOT VoiceLink:
- Establish and declare a single canonical server entrypoint in this repo (one file).
- Mirror copies may exist, but only one can be canonical.

------------------------------------------------------------
F) STORAGE BACKENDS (MULTI-DB SUPPORT)
------------------------------------------------------------

`{{APP_NAME}}` MUST support multiple data stores for user/session/license/system metadata.

Supported DB engines:
- SQLite (default for local installs and small nodes)
- MySQL
- MariaDB
- PostgreSQL

Rules:
- Data models must remain consistent across DB backends.
- Migrations must be automated and idempotent.
- Provider-agnostic core tables/collections must exist for:
  - users
  - identities (linked provider identities per user)
  - sessions
  - roles + roleAssignments
  - licenseEntitlements
  - trustScore
  - recoveryTokens + recoveryCodes
  - systemSettings (auth + smtp + notifications + provider configs)
  - syncJobs + jobHistory
  - auditLog

------------------------------------------------------------
G) FIRST-RUN OWNER BOOTSTRAP (ADMIN = OWNER)
------------------------------------------------------------

On first setup of any `{{APP_NAME}}` install:
- The first successfully created admin account MUST be assigned Owner of the install.
- Owner is the highest local authority role (Owner > Admin > Moderator > User).
- Owner privileges MUST remain enforceable even if external providers are unavailable.

Owner assignment:
- If the first user is created via any provider (WHMCS/Mastodon/WordPress/Google/Apple/GitHub/Native)
  and is designated admin (or installer marks them admin), they become Owner.
- If upstream provider lacks role concept, installer must explicitly prompt:
  “Designate this first account as Owner?”

Installer MUST generate an Owner Recovery Kit:
- One-time recovery codes (displayed once, exportable)
- “Break Glass” instructions (local-only)
- A reminder if SMTP is not yet configured

------------------------------------------------------------
H) SMTP + EMAIL BOOTSTRAP (BUILT-IN MAIL CONFIG)
------------------------------------------------------------

`{{APP_NAME}}` must support email notifications and recovery via SMTP.

Rules:
- SMTP setup is optional at install time.
- If SMTP is not configured:
  - Owner/admin credentials and recovery codes MUST still be displayed once and saved locally/exportable.
  - System must remind admins that email delivery is disabled.
- When SMTP is configured later:
  - System can optionally re-send account setup emails and enable email-based recovery.

SMTP configuration must be available in:
Admin Dashboard → Settings → Authentication/Login (or System Configuration)

Required templates:
- account created
- admin created
- password reset
- recovery code usage
- provider link/unlink notices
- license grace mode warnings (optional)
- provider health degradation alerts (optional)

------------------------------------------------------------
I) ACCOUNT RECOVERY (NO DB DIGGING)
------------------------------------------------------------

`{{APP_NAME}}` MUST provide recovery methods that do not require database access.

Required recovery methods:
- One-time recovery codes (install-time and regenerable)
- Email-based reset (when SMTP configured)
- Admin “Break Glass” recovery mode (local-only, time-limited, logged)
- Provider re-link recovery (Mastodon/WordPress/WHMCS/Google/Apple/GitHub)

Rules:
- Break Glass mode requires local server access or pre-issued recovery key.
- All recovery events must be audited and visible in admin UI.
- Recovery flows must be screen-reader friendly and deterministic.

------------------------------------------------------------
J) IDENTITY LINKING + ROLE/ENTITLEMENT RESOLUTION
------------------------------------------------------------

Users may link multiple identities:
- Mastodon OAuth identity
- WordPress identity
- WHMCS identity
- Google identity
- Apple identity
- GitHub identity
- Native identity (email/username+password)

Rules:
- Linking identities must not create duplicate user accounts.
- Each user has a configurable “Primary Login Method,” but may switch methods if allowed.
- Role + entitlement resolution must be deterministic with documented precedence rules.

Suggested precedence (configurable):
1) Owner override (local)
2) Local role assignment (`{{APP_NAME}}`)
3) WHMCS entitlements/roles (if enabled)
4) Provider claims mapping (OIDC scopes/claims)
5) Default role (User)

------------------------------------------------------------
K) SYNC SCHEDULER (BUILT-IN, IDP + LICENSE SYNC)
------------------------------------------------------------

`{{APP_NAME}}` includes a built-in internal scheduler to keep data in sync across providers and authorities.

Scheduler responsibilities:
- Provider health checks
- Identity sync (profile updates, verified email status, etc.)
- Role/entitlement refresh
- License token refresh (hybrid mode)
- Cleanup/rotation of session tokens
- Alert dispatch for repeated failures

Rules:
- Jobs are queued, retried with exponential backoff, and recorded in jobHistory.
- Sync must be idempotent (safe to re-run).
- Provider unavailability flips only that provider to DEGRADED/UNAVAILABLE.
- Sync never interrupts core runtime functionality.

------------------------------------------------------------
L) DEGRADED MODE + OFFLINE GRACE (RESILIENCE)
------------------------------------------------------------

`{{APP_NAME}}` tracks provider health:
- HEALTHY
- DEGRADED
- UNAVAILABLE

Behavior:
- Existing sessions continue normally.
- New login attempts fail only for the impacted provider with precise messaging:
  “Authentication provider temporarily unavailable.”
- License checks may enter OFFLINE_GRACE for a configurable window.
- Core runtime functionality MUST NOT be interrupted by auth/licensing outages.
- Admins should receive alerts when a provider enters DEGRADED/UNAVAILABLE.

------------------------------------------------------------
M) ADMIN UI REQUIREMENTS (AUTHENTICATION/LOGIN TAB)
------------------------------------------------------------

All provider configuration, linking controls, health indicators, recovery tools, and sync status MUST be available within:
Admin Dashboard → Settings → Authentication/Login (or System Configuration)

This settings area must include:
- enable/disable toggles for each provider (native, whmcs, mastodon, wordpress, google, apple, github, oidc)
- provider configuration forms (URLs, client IDs, secrets, scopes, redirect URIs)
- provider health indicators + last check time
- role mapping rules per provider
- license authority mode selection (WHMCS_PRIMARY / HYBRID_SYNC / NATIVE_ONLY / OFFLINE_GRACE)
- SMTP configuration + send test email
- recovery settings (codes, break-glass)
- sync scheduler status + job history
- web UI access toggles (enabled/disabled; landing, directory, join rules)
- guest access toggles + restrictions by surface
- audit log viewer for auth/licensing/recovery actions

Rule:
- This tab is additive: create missing sections only; update existing sections if incomplete; never duplicate.

------------------------------------------------------------
N) NOTIFICATIONS (PUSHOVER SUPPORTED)
------------------------------------------------------------

`{{APP_NAME}}` supports Pushover notifications for operational and security events.

Requirements:
- Full Pushover API support is allowed and encouraged for admin alerts.
- Configurable per install and optionally per admin user.
- Can be disabled globally or per alert type.

Recommended alert triggers:
- auth provider enters DEGRADED/UNAVAILABLE
- license grace mode activated
- repeated sync job failures exceed threshold
- SMTP misconfiguration detected
- break-glass recovery used
- DB unreachable or migration failure
- core runtime process health failure (PM2/system service down)

------------------------------------------------------------
O) STORE CHANNEL COMPATIBILITY (DIST_CHANNEL)
------------------------------------------------------------

DIST_CHANNEL rules apply:
- direct builds:
  - self-updater allowed (must verify signatures)
  - server-managed licensing allowed
- appstore builds:
  - self-updater disabled
  - premium unlock must comply with Apple IAP policies
- playstore/windows_store:
  - store-equivalent constraints apply

Auth providers may be available across platforms, but entitlements must respect channel constraints.

================================================================================
PATCH LIST + IMPLEMENTATION PLAN (AGENT-EXECUTABLE)
================================================================================

Agents MUST implement the above using the existing working runtime and routes where possible.
Do not introduce parallel server entrypoints.

A) CANONICAL ENTRYPOINTS (DO NOT DUPLICATE)
- Use: `server/routes/local-server.js` (active runtime)
- Mirror updates in: `source/routes/local-server.js`
- Do NOT treat: `source/server/routes/local-server.js` as canonical

B) FILES TO ADD (ONLY IF MISSING)

1) `server/auth/provider-interface.js`
- Exports AuthProvider base interface + adapter helpers

2) `server/auth/providers/`
- `native/`
  - `native-provider.js` (email/username + password)
  - `native-routes.js` (register/login/logout/session)
- `whmcs/`
  - `whmcs-provider.js` (existing endpoints kept; refactor into provider)
- `mastodon/`
  - `mastodon-provider.js` (OAuth)
- `wordpress/`
  - `wordpress-provider.js` (JWT/OAuth/App Passwords adapters)
- `google/`
  - `google-provider.js` (OIDC)
- `apple/`
  - `apple-provider.js` (OIDC)
- `github/`
  - `github-provider.js` (OAuth)
- `oidc/`
  - `oidc-provider.js` (generic OIDC adapter for future providers)

3) `server/license/provider-interface.js`
- Exports LicenseProvider base interface

4) `server/license/providers/`
- `native/`
  - `native-license-provider.js`
  - `token-signer.js` (signed entitlement tokens)
- `whmcs/`
  - `whmcs-license-provider.js`
- `hybrid/`
  - `hybrid-license-provider.js` (WHMCS + mirrored local token)

5) `server/system/`
- `authority-state-machine.js` (provider health tracking)
- `health-monitor.js` (periodic provider checks)
- `scheduler.js` (job queue + retry/backoff)
- `jobs/`
  - `sync-identities.js`
  - `sync-entitlements.js`
  - `refresh-license-tokens.js`
  - `rotate-sessions.js`
  - `provider-health-check.js`
- `audit-log.js`

6) `server/storage/`
- `db.js` (adapter layer: sqlite/mysql/mariadb/postgres)
- `migrations/` (idempotent migrations)
- `models/` (users, identities, sessions, roles, entitlements, recovery, settings, jobs, audit)

7) `server/notifications/`
- `notifier-interface.js`
- `pushover-notifier.js`

8) `server/admin-ui/`
- `settings-authentication-login.js` (schema + handlers backing the admin dashboard tab)
- `settings-system-config.js` (web UI toggles, guest access, surface rules)
- (If UI already exists elsewhere, update in-place instead of creating new)

C) FILES TO UPDATE (IN-PLACE)

1) `server/routes/local-server.js`
- Route existing working WHMCS endpoints through provider abstraction (no behavior regressions)
- Add auth provider routing without breaking current paths
- Add surface gating (web enabled/disabled) for web routes only
- Ensure API routes used by desktop apps remain available

2) `source/routes/local-server.js`
- Mirror the same changes as runtime source-of-truth

3) Any existing auth/whmcs bridge code
- Keep paths stable:
  - `/api/auth/whmcs/login`
  - `/api/auth/whmcs/session/:token`
  - `/api/auth/whmcs/logout`
  - `/api/auth/whmcs/sso/start`
- Only refactor behind the interface; do not change URLs unless absolutely necessary

D) CONFIG (ENV + ADMIN UI)
Add config schema (if missing):
- `AUTH_PROVIDERS_ENABLED` (comma list)
- `LICENSE_AUTHORITY_MODE` (WHMCS_PRIMARY | HYBRID_SYNC | NATIVE_ONLY | OFFLINE_GRACE)
- `DB_ENGINE` (sqlite | mysql | mariadb | postgres)
- `DB_URL` / `DB_HOST` / `DB_USER` / `DB_PASS` / `DB_NAME`
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`
- `PUSHOVER_APP_TOKEN` / `PUSHOVER_USER_KEY`
- `WEB_UI_ENABLED` (true/false)
- `GUEST_ACCESS_ENABLED` (true/false)
- Provider-specific OAuth creds (e.g., `GOOGLE_CLIENT_ID`, etc.)

Admin Dashboard must allow editing these safely (store secrets encrypted).

E) MINIMUM FUNCTIONALITY GATES (MUST PASS)
- Existing WHMCS auth endpoints keep working with same paths and expected behaviors
- Desktop apps retain full access regardless of web UI enabled/disabled
- Web UI disablement only blocks web pages, not APIs
- First admin becomes Owner; Recovery Kit generated even without SMTP
- Recovery flows work without database access
- Provider DEGRADED/UNAVAILABLE states show precise errors for new logins
- Existing sessions continue; license grace prevents sudden lockouts
- Scheduler jobs run; failures logged; optional Pushover alerts fire

F) AGENT OUTPUT REQUIREMENTS (MANDATORY)
When implementing this section, the agent MUST output:
1) Files changed/created (exact paths)
2) What was generated vs updated
3) Any placeholders inserted (clear list)
4) Any admin pages/paths requiring updates
5) Validation checklist results:
- No duplicate runtime entrypoints created
- Existing WHMCS auth endpoints unchanged
- Desktop-first behavior verified
- Web UI gating verified
- Recovery + owner bootstrap verified
- Provider health states verified
- No secrets committed

================================================================================
END OF FILE
================================================================================
```

================================================================================
DOCUMENTATION RELEASE GATE
================================================================================

All governed projects must follow this documentation gate before build and
release work is considered complete.

Required order:
1. Documentation update pass
2. Documentation review pass
3. Final confirmation
4. Only then:
   - live doc replacement
   - build generation
   - installer upload
   - release publication

Documentation scope includes:
- user docs
- admin docs
- install/hosting docs
- in-app help text
- downloads pages
- bugtracker/status pages
- project web docs URLs

Review must confirm:
- docs match actual feature behavior
- role/permission boundaries are documented correctly
- renamed/removed features are reflected
- artifact names, versions, and download references are current

Default rule:
- Prefer first-party docs and in-app docs over GitHub README links for end
  users whenever those docs exist.

================================================================================
APPLE CERTIFICATES + APP STORE BILLING AUTORUNBOOK (MANDATORY WHEN NEEDED)
================================================================================

Trigger condition:
- Any request mentioning App Store, TestFlight, certificates, signing, IAP,
  subscriptions, payments, payouts, or Apple distribution.

Agent execution rules:
1. Run in "next-step only" mode for beginner guidance.
2. Tell the user only the immediate next click/action.
3. If values are required, provide exact values/format.
4. Update docs in-place as the user progresses.

Required certificate creation order:
1. Apple Development
2. Apple Distribution
3. Developer ID Application
4. Developer ID Installer (optional; only for .pkg distribution)

Required file preparation:
1. Ensure CSR workspace exists:
   - `/Users/admin/dev/appstore/csr`
2. Ensure upload mapping doc exists:
   - `/Users/admin/dev/appstore/csr/UPLOAD_ORDER.md`
3. Never upload private `.key` files; upload `.csr` files only.

App Store Connect "Create New App" minimum fields:
1. Platform
2. App Name
3. Primary Language
4. Bundle ID (must match Apple Developer ID entry exactly)
5. SKU (internal unique string)

Payments and subscriptions governance:
1. Payments default destination is the account in:
   - App Store Connect -> Agreements, Tax, and Banking -> Banking
2. Real billing starts only after app + IAP are approved and live.
3. TestFlight uses test billing, not production customer charges.
4. Subscription product IDs must be immutable and documented.

Skip logic:
1. When steps are already completed, docs must explicitly say "skip".
2. Agent must not re-run completed steps unless user asks.

Minimum output per App Store/TestFlight support turn:
1. Exact next step
2. Exact field values (if needed)
3. What to skip because already done

================================================================================
VOICELINK IOS BUILD + TESTFLIGHT COMMAND STANDARD
================================================================================

Agents must use the same command path for repeatable iOS build/upload:

`cd /Users/admin/dev/apps/voicelink-local/swift-native/VoiceLinkiOS`

`APPLE_ID_EMAIL="<apple-id>" APP_SPECIFIC_PASSWORD="<app-specific-password>" AUTO_UPLOAD=1 ./scripts/archive_ios_testflight.sh`

Rules:
1. Keep automatic signing enabled for routine build cycles.
2. Do not persist credentials in tracked repo files.
3. If transporter is run manually, include `-itc_provider G5232LU4Z7`.
4. If archive/upload fails, fix the root cause and rerun this same command.
5. Always increment iOS build number before upload to force a new binary.
6. If transporter reports an asset is already uploaded, treat it as no new release and rebuild with incremented build number.
