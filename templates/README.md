# Raywonder .github Template Pack

Starter templates for shared governance, WHMCS standards, Installatron guidance,
VoiceLink integration rules, workflows, and issue templates.

These are intentionally written as strong starting points so Codex can merge,
extend, or adapt them in each repo without replacing project-specific logic unless needed.

## Codex fallback behavior
If root-level files already exist in the target `.github` repo, inspect them first:
- `agents.md`
- `governance.md`
- `GOVERNANCE_TEMPLATE.md`
- `README.md`

Then merge these templates in where compatible.

## Suggested use
- Shared/global rules go in `raywonder/.github`
- Product-specific refinements stay in each project repo
- Script-side copies may live under `scripts/*` as a central fallback reference
