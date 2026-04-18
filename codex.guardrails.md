# codex.guardrails.md
Codex Guardrails for Devine Creations / Raywonder

Codex must keep the master rules intact and ensure project-level rules inherit from root governance.

## 1) Mandatory preflight for any task
- Locate and load governance:
  - agents.md (repo-local if present)
  - root-level *.md constraints (NETWORK/PORTS/SECURITY/DEPLOY/RUNBOOK/BACKUP/README)
  - user/global agents.md
- Identify environment:
  - server vs local vs WSL vs VM
  - OpenClaw UI vs Codex CLI/editor
- Identify blast radius:
  - which services, ports, domains, users are touched

## 2) Network + exposure rules
If any markdown defines network boundaries or port policies:
- obey them
- do not expose services publicly
- do not open firewall rules
- do not bind to 0.0.0.0 unless explicitly allowed
If unclear: report-only mode.

## 3) Rule integrity enforcement
If a folder under apps/ lacks rule pointers, Codex may add:
- a one-line inheritance note in README.md or docs
- a local stub agents.md pointing back to canonical governance

Never overwrite existing rule docs without confirmation.

### Stub template (repo/local)
Create `apps/<project>/agents.md` (only if missing):
---
This project inherits governance from the root agents.md.
See: ../../agents.md
---

### README pointer template
Add near top (only if missing):
---
This project inherits governance from the root agents.md (governance + safety + accessibility + deployment rules).
---

## 4) Deployment checklist (must output before apply)
Codex must output:
- Plan summary
- Risk level
- Backup plan
- Rollback plan
- Validation commands

Codex must run/require:
- NGINX: nginx -t before reload
- Docker: compose config validation before up
- Ports: verify availability and conflicts
- Auth/SSL: confirm boundaries + confirmation gating

## 5) Regression + accessibility gates
- No sweeping refactors
- No mass formatting changes
- No dependency upgrades without compatibility scan
- Preserve semantic HTML and keyboard navigation

## 6) Stop conditions
If any stop condition triggers in agents.md, Codex must stop and report.

End.


## 7) Dev root workspace fallback
If working under a shared workspace root (example: ~/dev) that contains governance files
(agents.md, SYSTEMRULES.md, NETWORK.md, PORTS.md), Codex must load them as fallback rules
when repo-local instruction files are absent.
