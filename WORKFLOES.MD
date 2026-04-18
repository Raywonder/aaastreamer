# Devine Creations Governance: Codex Prompts + GitHub Actions Workflow Kit
_Last updated: 2026-02-23 (America/New_York)_

This file is meant to be **read first** by Codex (and any other agent) before doing work in any repo.

It provides:
- **Token-saving prompt templates** for Codex
- A **standard GitHub Actions workflow structure** you can copy into repos (starting with **voicelink**)
- Rules for **cross-platform native builds** (Electron only if absolutely necessary)

> Notes from your public repos list: **voicelink** and **hubnode** are good starters, and voicelink already contains a `.github/workflows` folder plus native build folders like `swift-native/` and `windows-native/`.  
> Source: https://github.com/Raywonder?tab=repositories and https://github.com/Raywonder/voicelink

---

## 0) Prime Directive (read this in 10 seconds)

1. **Native-first**: build native clients (Swift, WinUI/.NET/C++ etc) first. Electron is last resort.
2. **Small diffs**: change the smallest surface area possible. Prefer config + workflow updates.
3. **One source of truth**: put shared CI logic in reusable workflows (or a central “workflow kit” folder).
4. **Fast + cheap**: cache aggressively, avoid rebuilding unchanged targets, and don’t run heavy jobs on every push.
5. **Ship artifacts**: GitHub keeps build artifacts; your server hosts the “official” downloads.

---

## 1) Codex prompt templates (token savers)

### 1.1 “Do the smallest thing” template
Copy/paste to Codex:

**Prompt:**
- Repo: <REPO_NAME>
- Goal: <ONE SENTENCE>
- Constraints:
  - native-first; electron last resort
  - smallest diff; no refactors unless required
  - add/adjust GitHub Actions workflows only if needed
- Deliverables:
  - list of files changed
  - exact commands to run locally (mac/windows/linux)
  - workflow names + triggers

**Rules:**
- If info is missing, infer from repo files first.
- If still ambiguous, propose a default that won’t break CI.

### 1.2 “Implement a workflow without burning tokens”
**Prompt:**
You are adding CI workflows to <REPO_NAME>.  
Reuse the standard workflow kit patterns from this file.  
Do not invent build steps: detect package managers and existing scripts.  
Prefer `npm ci`, `pnpm i --frozen-lockfile`, or `pip install -r` based on what exists.  
Add caching.  
Make workflows modular with `workflow_call` where possible.

### 1.3 “Change request from an issue/feature”
**Prompt:**
Implement <FEATURE> in <REPO_NAME>.  
Before coding, produce:
1) “Impact map” (what files likely touched)
2) “CI impact” (what workflows need adjustment)
3) “Test plan” (fast tests, then full tests)
Then implement with smallest diff.

### 1.4 “Release packaging”
**Prompt:**
Add a release pipeline for <REPO_NAME>:
- On tag `v*`, build native artifacts for macOS + Windows (+ Linux if relevant)
- Upload to GitHub Release
- Also prepare a server upload bundle path like:
  `https://devine-creations.com/downloads/<repo>/<tag>/`
Do not hardcode credentials in repo; use GitHub Secrets.

### 1.5 “Doc sync / docs build”
**Prompt:**
Add a docs workflow for <REPO_NAME>:
- Build docs (if docs tool exists) and publish either:
  - GitHub Pages (optional), or
  - upload artifact only
Do not add new doc frameworks unless the repo already uses one.

---

## 2) Standard GitHub Actions layout (copy into repos)

### 2.1 Recommended files per repo
```
.github/
  workflows/
    ci.yml
    release.yml
    security.yml
    docs.yml
    housekeeping.yml
```

**Optional “reusable workflow kit” repo** (recommended later):
- Create `Raywonder/.github` (or `devinecreations/.github`) and put reusable workflows there.
- Then each repo can do:
  `uses: Raywonder/.github/.github/workflows/node-ci.yml@main`

This keeps all repos consistent and saves time.

---

## 3) Workflow goals (what each does)

### 3.1 `ci.yml` (fast, on every PR)
- Lint + unit tests
- Build (but not full packaging)
- Matrix:
  - `ubuntu-latest` for fast JS/Python checks
  - `windows-latest` only if Windows-only code paths exist
  - `macos-latest` only if Swift/mac native code paths exist
- Use `paths-ignore` to avoid running on docs-only edits

### 3.2 `release.yml` (heavy, only on tags / manual)
- Full packaging
- Upload artifacts
- Create/attach GitHub Release assets
- Optionally: publish to your server via SSH/SFTP or API (secrets required)

### 3.3 `security.yml` (scheduled + PR)
- Dependency scanning / basic SAST where applicable
- Keep it minimal to avoid noise

### 3.4 `docs.yml`
- Build docs if present (MkDocs, Docusaurus, Sphinx, etc)
- Publish to GitHub Pages or artifact only

### 3.5 `housekeeping.yml`
- Ensure formatting, verify lockfiles, check repo hygiene
- Weekly schedule, not on every commit

---

## 4) Starter workflow templates (drop-in)

These templates are **generic** and should be adjusted based on each repo’s tech.

### 4.1 `ci.yml` (Node/TS baseline)
Create: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [ main ]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  node-ci:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Use Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install
        run: |
          if [ -f package-lock.json ]; then npm ci
          elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile
          elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile
          else npm i
          fi

      - name: Lint (if present)
        run: |
          npm run -s lint --if-present

      - name: Test (if present)
        run: |
          npm test --if-present

      - name: Build (if present)
        run: |
          npm run -s build --if-present
```

### 4.2 `security.yml` (lightweight, sane defaults)
Create: `.github/workflows/security.yml`

```yaml
name: Security

on:
  pull_request:
  schedule:
    - cron: "23 6 * * 1"  # Mondays 06:23 UTC
  workflow_dispatch:

jobs:
  deps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Dependency Review
        uses: actions/dependency-review-action@v4
```

### 4.3 `release.yml` (tagged releases with artifacts)
Create: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags: [ "v*" ]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ ubuntu-latest, windows-latest, macos-latest ]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Set version
        shell: bash
        run: echo "TAG=${GITHUB_REF_NAME}" >> $GITHUB_ENV

      # ---- Node example (adjust per repo) ----
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install
        shell: bash
        run: |
          if [ -f package-lock.json ]; then npm ci
          elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile
          elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile
          else npm i
          fi

      - name: Build
        shell: bash
        run: npm run -s build --if-present

      - name: Package (customize)
        shell: bash
        run: |
          mkdir -p dist-artifacts
          # Example: copy built outputs (adjust)
          if [ -d dist ]; then cp -R dist dist-artifacts/; fi
          if [ -d build ]; then cp -R build dist-artifacts/; fi

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ github.event.repository.name }}-${{ env.TAG }}-${{ runner.os }}
          path: dist-artifacts

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: release-bundle

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: release-bundle/**/*
```

---

## 5) VoiceLink-specific CI guidance (starter plan)

VoiceLink is special because it’s not “just Node”: it has native folders and build instructions. Source: repo structure shows `swift-native/` and `windows-native/` alongside web/client code.  
Source: https://github.com/Raywonder/voicelink

### 5.1 VoiceLink workflow strategy
- **PR CI (`ci.yml`)**
  - Always run: Node lint/test/build (fast)
  - Run native checks conditionally:
    - macOS job only when files under `swift-native/**` changed
    - Windows job only when files under `windows-native/**` changed
- **Release (`release.yml`)**
  - Build:
    - macOS native installer/package
    - Windows native installer/package
    - Optional: web bundle
  - Upload all to GitHub Release
  - Optionally push a copy to your server downloads directory

### 5.2 Conditional native jobs example
Add to `ci.yml` (after `node-ci`) if you want conditional builds:

```yaml
  changes:
    runs-on: ubuntu-latest
    outputs:
      swift: ${{ steps.filter.outputs.swift }}
      win: ${{ steps.filter.outputs.win }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            swift:
              - 'swift-native/**'
            win:
              - 'windows-native/**'

  mac-native:
    needs: changes
    if: needs.changes.outputs.swift == 'true'
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build mac native (placeholder)
        run: |
          echo "TODO: call VoiceLink's mac build script"
          # e.g. ./scripts/build-macos.sh

  win-native:
    needs: changes
    if: needs.changes.outputs.win == 'true'
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build windows native (placeholder)
        run: |
          echo "TODO: call VoiceLink's windows build script"
          # e.g. .\build-windows.bat
```

**Codex instruction:** when wiring these up, it must read existing files like `WINDOWS_BUILD_INSTRUCTIONS.md`, `MACOS_BUILD_INSTRUCTIONS.md`, and existing `build*.bat` scripts and use those instead of inventing commands.

---

## 6) HubNode-specific CI guidance (starter plan)

HubNode is tagged as Python on your repo list. Source: https://github.com/Raywonder/hubnode  
(If HubNode also uses Node, treat it as a mixed repo.)

### 6.1 Python CI baseline (drop-in)
Create: `.github/workflows/ci-python.yml` (or merge into `ci.yml`)

```yaml
name: CI (Python)

on:
  pull_request:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  py:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
      - name: Install
        run: |
          if [ -f requirements.txt ]; then pip install -r requirements.txt
          elif [ -f pyproject.toml ]; then pip install -e .
          fi
      - name: Lint/Test (if present)
        run: |
          python -m compileall . || true
          pytest -q || true
```

---

## 7) Server-hosted downloads (pattern)

Your “official downloads” live on your server, with GitHub as a backup mirror.

**Standard path pattern (recommended):**
- Server: `https://devine-creations.com/downloads/<repo>/<tag>/<artifact>`
- Mirror: GitHub Releases for the same tag

**Never** store server credentials in the repo.
Use GitHub Secrets and a deploy key, or a server-side “upload API endpoint” that accepts short-lived tokens.

---

## 8) Compatibility with other workflow packs

If a repo already has workflows:
1. Keep them if they’re compatible (don’t break the existing build).
2. Only replace when:
   - you can prove the new workflow is simpler, faster, and produces the same artifacts
   - you preserve existing release tags and artifact naming
3. Prefer merging via **reusable workflows** rather than copy-pasting huge YAML everywhere.

---

## 9) What Codex should do next (recommended order)

### For `Raywonder/voicelink`
1. Inventory existing scripts:
   - `package.json` scripts
   - `WINDOWS_BUILD_INSTRUCTIONS.md` and `MACOS_BUILD_INSTRUCTIONS.md`
   - `build*.bat` and `build.sh`
2. Implement:
   - `ci.yml` (Node fast path + conditional native builds)
   - `release.yml` (tag build + release assets)
   - `security.yml` (dependency review)
3. Confirm artifacts:
   - predictable names
   - uploaded to GitHub release
4. Optional:
   - server upload step (only once secrets are ready)

### For `Raywonder/hubnode`
1. Detect Python tooling (`requirements.txt`, `pyproject.toml`, etc)
2. Add Python CI + optional release packaging (wheel / zip bundle)

---

## 10) Quick “agent checklist” (do not skip)

Before any change:
- [ ] Identify repo type(s): Node / Python / Swift / Windows native / Rust / etc
- [ ] Find existing build scripts and reuse them
- [ ] Add caching (npm/pnpm/yarn, pip, cargo, etc)
- [ ] Make PR CI fast; make release pipeline heavy
- [ ] Keep artifacts + release notes consistent
- [ ] Don’t introduce Electron unless you can justify why native is impossible

---

## Appendix A: Why workflow triggers matter (for agents)

GitHub Actions supports triggers like `push`, `pull_request`, `workflow_dispatch`, `workflow_call`, and schedules.  
Reference: GitHub docs on workflow triggers and events.

- Triggers reference: https://docs.github.com/actions/using-workflows/events-that-trigger-workflows
