# PROJECT GOVERNANCE TEMPLATE (UNIVERSAL)

Last updated: 2026-02-26
Applies to: All agents (Codex, Claude, OpenCode, Ollama), all repos, all distribution channels.

This file is a reusable governance template for any project.

Copy into a repository as:

governance.md
or
GOVERNANCE.md

If missing, AI agents SHOULD generate it automatically.

This template supports:

* open source projects
* commercial software
* hybrid platforms
* distributed services
* app store deployments
* server software

============================================================
SECTION 0 – PROJECT PROFILE (FILL IN)
=====================================

Project name:
Primary owner:
Business/entity (if applicable):
Primary domains (optional):
Repo visibility: public | private | mixed
License model: open-source | commercial | dual | undecided
Distribution channels: direct | appstore | playstore | windows_store | web | server
Support contact (optional):
Canonical policies URL(s) (privacy, support, terms) (optional):

============================================================
SECTION 1 – CURRENT STATE
=========================

Current repo license shown on Git host:

README license statements:

Contributors:

Key dependencies and license risks (GPL/AGPL/LGPL):

API pattern source (if any):

Release status:

pre-release | v1.0 | stable | maintenance

Rules:

README MUST match LICENSE and package metadata.

No conflicting license statements in docs, headers, or badges.

============================================================
SECTION 2 – DOCUMENT GENERATION (SOURCE OF TRUTH)
=================================================

Agents may generate or update governance-related documents.

Documents may begin as placeholders and be refined over time,
but must remain internally consistent.

Documents that may be generated or updated:

LICENSE
EULA.md
CLA.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
PRIVACY_POLICY.md
SUPPORT.md
THIRD_PARTY_NOTICES.md
RELEASE_CHECKLIST.md
docs/distribution.md
docs/licensing.md
docs/api-integration.md

Rules:

If a document already exists → update in place.

Do NOT create duplicates such as:

LICENSE vs LICENSE.md vs COPYING.

Any documentation change affecting public claims MUST also update README.

============================================================
SECTION 3 – REQUIRED OUTPUTS FOR AGENTS
=======================================

When performing governance work agents MUST output:

1. Files created or modified (exact paths)
2. Whether files were generated or updated
3. Any placeholders inserted
4. Validation checklist:

README license matches LICENSE
No duplicate license files
Distribution rules respected
No secrets committed

============================================================
SECTION 4 – LICENSING OPTIONS
=============================

Open source:

MIT
Apache-2.0
GPL-3.0
AGPL-3.0

Confirm compatibility with dependencies.

Commercial:

LICENSE text required
EULA required
Distribution restrictions defined

Dual licensing:

Public SDK/protocol → permissive license
Private services/apps → commercial license

Relicensing rule:

Before changing LICENSE agents must produce:

Relicensing Readiness Report including:

contributor ownership status
dependency license audit
rewrite plan for incompatible code

============================================================
SECTION 5 – DISTRIBUTION CHANNEL RULES
======================================

Distribution channel variable:

DIST_CHANNEL

Possible values:

direct
appstore
playstore
windows_store

Rules:

direct:

auto-updater allowed
signature verification required

appstore:

disable internal updaters
no runtime code downloading
updates delivered by store

playstore / windows_store:

follow store policy restrictions

If store channels are planned but not active:

mark them as reserved.

============================================================
SECTION 6 – SELF HOSTED SERVER DISTRIBUTION
===========================================

If server installers exist define:

private operation allowed
redistribution rules
white-label rules

Security rules:

no secrets in build artifacts
builds must be reproducible from tagged source.

============================================================
SECTION 7 – WEBSITE POLICY SYNCHRONIZATION
==========================================

If privacy/support/terms exist on websites:

Prefer canonical URLs instead of copying text.

If duplication exists:

content MUST stay synchronized.

Agents must verify before release.

============================================================
SECTION 8 – CONTRIBUTIONS
=========================

If external contributions allowed:

CLA required before merging significant changes.

Repository must include:

CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md

If contributions are NOT accepted:

state clearly in README.

============================================================
SECTION 9 – VERSIONING + RELEASE
================================

Version format:

MAJOR.MINOR.PATCH

Rules:

MAJOR → breaking changes
MINOR → new features
PATCH → bug fixes

Release requirements:

create tag
publish release notes
update documentation

============================================================
SECTION 10 – AGENT EXECUTION RULES
==================================

Agents MUST:

create branch before large changes
avoid committing secrets
keep documentation accessible
update documentation when behavior changes

Agents MUST NOT assume infrastructure details.

============================================================
SECTION 11 – PLATFORM ARCHITECTURE (OPTIONAL)
=============================================

Some projects operate within a distributed platform architecture.

Typical model:

Client Apps
│
Reverse Proxy
│
Authelia Authentication
│
API Gateway
│
Platform Services
│
Federation Nodes

API gateways act as a single entry point routing requests to backend
services while simplifying client interaction.

Authelia works with reverse proxies to determine whether requests
should be allowed, denied, or redirected for authentication.

Applications may still implement independent login systems such as:

Google OAuth
Apple login
Mastodon authentication
internal user accounts

============================================================
SECTION 12 – DOMAIN NAMESPACE MODEL
===================================

Projects should follow a domain namespace structure.

Example:

project.app
api.project.app
hub.project.app
nodes.project.app
community.project.app
download.project.app

Guidelines:

root domain → user-facing site
api.* → public APIs
hub.* → gateway services
nodes.* → distributed nodes
community.* → user communities

All services must use HTTPS.

============================================================
SECTION 13 – INFRASTRUCTURE GOVERNANCE
======================================

Infrastructure services may include:

authentication gateways
API gateways
deployment automation
federation services

Deployment preference:

native installs
system services
PM2 services

Containers only when required by application.

============================================================
SECTION 14 – SERVICE RECOVERY
=============================

All services must support automatic recovery.

Native services:

systemd restart policies

Node services:

PM2 startup
PM2 resurrect

Containers:

restart unless-stopped
health checks
self repair scripts

============================================================
SECTION 15 – AGENT MAINTENANCE TASKS
====================================

Agents (including Codex) should proactively maintain governance.

Suggested tasks:

create missing governance files
update outdated policies
remove obsolete notes
generate missing documentation

Examples:

Create:

docs/licensing.md
docs/distribution.md
docs/api-integration.md

Update:

README licensing section
distribution documentation

Remove:

duplicate or outdated notes

============================================================
SECTION 16 – AGENT FILE CREATION RULES
======================================

If repository lacks required files agents may create:

LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
SUPPORT.md
THIRD_PARTY_NOTICES.md
docs/* documentation

Files must be generated with placeholders where needed.

============================================================
SECTION 17 – DOCUMENTATION RELEASE GATE
=======================================

Before build or release:

1 documentation update pass
2 documentation review pass
3 confirmation
4 then release artifacts

Documentation includes:

user docs
admin docs
install docs
in-app help
download pages

============================================================
SECTION 18 – APPLE CERTIFICATES + APP STORE RUNBOOK
===================================================

Triggered when requests involve:

TestFlight
App Store
signing certificates
in-app purchases

Agent rules:

only provide next step guidance
supply exact values where required
update documentation as progress occurs

Required certificate creation order:

Apple Development
Apple Distribution
Developer ID Application
Developer ID Installer

CSR workspace:

/Users/admin/dev/appstore/csr

Upload only .csr files.

============================================================
END OF TEMPLATE
===============
