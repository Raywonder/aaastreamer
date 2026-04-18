# BOOTSTRAP-GOVERNANCE.md

Bootstrap governance installation (Codex / OpenClaw / OpenCode / Claude)

Purpose:

Allow an agent to install governance files into standard locations
BEFORE beginning work.

Governance must be installed safely without interrupting existing projects.

This bootstrap installs rule discovery files so agents know how to behave.

==================================================
GOLDEN RULE
===========

Installing or updating governance documentation must be **non-destructive**.

Agents must NOT:

• modify project source code
• change dependencies
• refactor existing code
• restart services
• alter running containers
• alter git history

Governance bootstrap only installs documentation and rule files.

==================================================
STEP 1 — DETECT ENVIRONMENT
===========================

Agents must detect runtime environment.

Possible environments:

Server (Linux multi-user host)

macOS

Windows

WSL

Virtual Machine

Environment metadata to detect:

OS
DISTRO (Linux)
HOST TYPE
USER CONTEXT
WORKSPACE ROOT

Example classifications:

Server:
Linux multi-user host
Primary deployment environment

macOS:
Local development workstation

Windows:
Local development workstation

WSL:
Windows Linux development environment

VM:
Virtualized environment (cloud or local)

==================================================
STEP 2 — CHOOSE GOVERNANCE INSTALL LOCATION
===========================================

### Server (preferred multi-user pattern)

Copy contents of:

.agents/server-linux/

Into:

/home/<current_user>/shared/agents/

Permissions:

directory → 700
files → 600
(optional group read → 640)

Agents must NOT access other users’ shared directories
without explicit authorization.

---

### macOS

Copy contents of:

.agents/macos/

Into:

~/.config/devinecreations/agents/

---

### Windows

Copy contents of:

.agents/windows/

Into one of:

%USERPROFILE%.devinecreations\agents\

or

%APPDATA%\DevineCreations\agents\

---

### WSL

Copy contents of:

.agents/wsl/

Into:

~/.config/devinecreations/agents/

---

### Virtual Machine

Copy contents of:

.agents/vm/

Into:

~/.config/devinecreations/agents/

or server-style:

/home/<current_user>/shared/agents/

==================================================
STEP 3 — CONFIRM RULE DISCOVERY
===============================

Agents must confirm these files exist and are readable.

Required rule files:

agents.md
SYSTEMRULES.md
NETWORK.md
PORTS.md
codex.guardrails.md
agents.locator

If missing:

Copy from:

.agents/common/

Never overwrite existing files without confirmation.

==================================================
STEP 4 — LOAD RULES
===================

After bootstrap, agents must load rule hierarchy.

Rule discovery order:

agents.locator
agents.md
systemrules.md
global infrastructure rules
project rules

Agents must obey:

• stop conditions
• backup requirements
• accessibility requirements
• network boundaries
• container rules
• infrastructure rules

==================================================
STEP 5 — DO NOT AFFECT EXISTING WORK
====================================

Governance bootstrap must not alter project state.

Agents must NOT:

change git state
modify source code
install dependencies
restart services
rebuild containers

After governance installation is confirmed,
normal work may begin.

==================================================
STEP 6 — AGENT MAINTENANCE TASKS
================================

Agents may perform governance maintenance tasks.

Examples:

Create missing governance files:

governance.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
SUPPORT.md

Create documentation directories:

docs/
docs/runtime/

Agents may also:

update outdated governance files
remove obsolete comments or notes
replace placeholder sections when information becomes available

Agents must report:

files created
files updated
placeholders inserted
files removed

==================================================
STEP 7 — PLATFORM ARCHITECTURE AWARENESS
========================================

Some projects run within a platform architecture.

Typical structure:

Client Apps
│

==================================================
VOICElink IOS BUILD/UPLOAD STANDARD
==================================================

When VoiceLink iOS build/upload is requested, agents should run:

`cd /Users/admin/dev/apps/voicelink-local/swift-native/VoiceLinkiOS`

`APPLE_ID_EMAIL="<apple-id>" APP_SPECIFIC_PASSWORD="<app-specific-password>" AUTO_UPLOAD=1 ./scripts/archive_ios_testflight.sh`

Keep signing automatic for routine cycles and keep credentials out of tracked files.
Reverse Proxy
│
Authentication Layer (Authelia)
│
API Gateway (HubNode)
│
Application Services
│
Federation Nodes

API gateway architecture provides a single entry point for
client requests and routes them to backend services. ([microservices.io][1])

Reverse proxy authentication systems like Authelia determine
whether requests are allowed or blocked before reaching services. ([Authelia][2])

Applications may still implement independent login systems:

Google OAuth
Apple Sign-In
Mastodon authentication
internal login systems

==================================================
STEP 8 — OPTIONAL FILE GENERATION
=================================

If repositories lack governance documentation,
agents may create the following files.

LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
SUPPORT.md

docs/licensing.md
docs/distribution.md
docs/api-integration.md

Files should include placeholders where required.

==================================================
STEP 9 — DOCUMENTATION RELEASE GATE
===================================

All governed projects must follow this documentation gate
before builds or releases are published.

Required order:

1. documentation update pass
2. documentation review pass
3. confirmation
4. release actions allowed

Release actions include:

live documentation replacement
build generation
installer upload
release publication

Documentation scope includes:

user documentation
admin documentation
install guides
hosting documentation
in-app help text
download pages
status pages
project website documentation

Review must confirm:

documentation matches real functionality
roles and permissions documented
removed features removed from docs
download artifacts accurate

Default rule:

Prefer first-party documentation and in-app help over
GitHub README links when available.

==================================================
END OF BOOTSTRAP
================

[1]: https://microservices.io/patterns/apigateway.html?utm_source=chatgpt.com "Pattern: API Gateway / Backends for Frontends"
[2]: https://www.authelia.com/overview/prologue/architecture/?utm_source=chatgpt.com "Architecture | Overview"
