# Governance Template
Last updated: 2026-04-03

Applies to:
- shared governance in `.github`
- all repos unless overridden by project-specific docs
- Codex, Claude, OpenCode, OpenClaw, and other agentic tooling

## Prime directive
Optimize for:
- accessibility
- reliability
- reproducibility
- minimal disruption to production
- clean documentation and upgrade paths

## Merge-before-replace rule
If an existing file is present:
1. inspect it first
2. preserve compatible project-specific rules
3. merge in shared rules where safe
4. replace only when the old file is missing, broken, obsolete, or clearly incompatible

## Fallback lookup order
Codex should inspect:
1. repo-local docs
2. `.github/templates/*`
3. root `.github/*`
4. `scripts/*` fallback copies

## Billing and licensing defaults
- WHMCS is the billing authority
- WHMCS is the license authority where licensing is used
- Installatron is the deployment/install lifecycle layer for supported web apps
- product repos own runtime logic

## `.well-known`
Use sparingly for non-secret metadata only.
Never overwrite `acme-challenge`.
