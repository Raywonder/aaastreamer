# Vibe Coding Toolkit
_Curated for Raywonder / Devine Creations repos_

This file is a shared shortlist of external AI-coding tools, patterns, and references worth reusing across VoiceLink, OpenLink, HubNode, and related apps.

It is intentionally curated from:
- `filipecalegario/awesome-vibe-coding`
- our current native-first, accessibility-first, low-regression workflow

Source repository:
- https://github.com/filipecalegario/awesome-vibe-coding

## Why this exists

The upstream list is broad. This file keeps the subset that is most useful for this workspace:
- terminal-first coding agents
- reusable agent guidance formats
- task-management patterns for long-running multi-repo work
- documentation formats that help future agents recover context quickly

## Recommended for this workspace

### Terminal / local coding agents
- OpenAI Codex CLI
  Best fit for the current local workflow and codebase surgery.
- OpenCode
  Good secondary terminal agent for provider flexibility and multi-session workflows.
- Aider
  Useful for smaller git-first patch sessions.
- Claude Code
  Useful where deeper long-form planning or alternate model behavior helps.

### Shared agent docs and rules
- `AGENTS.md`
  Keep repo-local agent operating rules explicit.
- `llms.txt`
  Useful for making docs and hosted references easier for tools to consume.
- `Context7`
  Good pattern for version-aware docs retrieval where supported.

### Task management / orchestration
- Claude Task Master
  Useful reference for breaking large work into smaller tracked chunks.
- vibe-kanban
  Useful concept for AI-agent task boards when a repo needs long-running parallel work.
- Archon
  Useful reference for knowledge/task backbone patterns.

### Local / desktop multi-agent references
- Superset
  Relevant idea for worktree-isolated parallel agent execution.
- Dyad
  Useful reference for local-first AI app workflows.

### IDE / extension references
- Continue
  Good open-source pattern for IDE + CLI + source-controlled AI checks.
- Cline / Roo Code / Kilo Code
  Useful references for agent UX, MCP-aware workflows, and memory-bank style operations.

## Rules for adoption

Do not add tools to project repos blindly.

Before adding any external tool or workflow pattern:
1. Prefer native/local workflows already used in this repo family.
2. Check accessibility impact for any UI-facing tool output.
3. Check security/secrets handling.
4. Avoid adding another runtime or dependency unless it solves a concrete recurring problem.
5. Prefer documentation, templates, and scripts in `.GITHUB` before tool-specific lock-in.

## Current reuse targets

These are the best immediate places to apply ideas from the upstream list:

### `.GITHUB` shared docs
- strengthen `agents.md`
- keep `WORKFLOWS.md` aligned with terminal-first agent workflows
- add recovery docs for long-running feature tracks

### Project templates
- reusable implementation checklists
- shared release/runbook templates
- task breakdown templates for multi-platform features

### Future additions worth considering
- a shared `AI_TASK_TEMPLATE.md`
- a shared `AI_RELEASE_CHECKLIST.md`
- a shared `RECOVERY_NOTES.md` format for paused work
- optional `llms.txt` in public docs roots

## Upstream categories most relevant here

From the upstream repo, the most relevant sections for this workspace are:
- Command Line Tools
- Task Management for AI Coding
- Documentation for AI Coding

Those sections contain the highest-value references for this repo family.
