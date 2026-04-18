
# UNIVERSAL GOVERNANCE TEMPLATE (FALLBACK)

Last updated: 2026-03-07

Purpose:
This file is the universal fallback governance template used when:
- a repository has no governance.md
- a repository contains a conflicting or incomplete governance.md
- agents need a baseline governance structure

Preferred location:
.github/governance.md

Fallback filename:
governance.md or GOVERNANCE.md

MERGE RULE:
If a governance.md already exists in a repository:
1. Agents MUST attempt a safe merge.
2. If existing rules do not conflict, include the original rules in this template.
3. If rules conflict or cannot be safely merged, replace with this template.
4. Agents must preserve workflow behavior whenever possible.

This template is designed for:
- open source projects
- commercial software
- hybrid software platforms
- server applications
- distributed platforms
- accessibility-first development environments

============================================================
GLOBAL BUILD, INSTALLER, ACCESSIBILITY, TESTING, AND CLEANUP GOVERNANCE
============================================================

These rules apply to ALL projects automatically.

Agents must follow these before executing other project instructions.

PRINCIPLES

1. Native builds first
2. Accessible design required
3. Signed binaries required
4. Automated testing required
5. Reproducible builds
6. Secure distribution
7. Clean build environments

Electron packaging is not allowed unless explicitly approved.

============================================================
WINDOWS INSTALLER GOVERNANCE
============================================================

Preferred installer systems:

1. Inno Setup
2. NSIS
3. WiX Toolset
4. Advanced Installer (free edition)

Installers must support:

- uninstall
- upgrade detection
- silent install
- Start Menu shortcuts
- optional desktop shortcut

Example outputs:

appname-1.0.0-windows-x64-setup.exe
appname-1.0.0-windows-x64-portable.zip

Portable builds must always be available.

============================================================
CODE SIGNING GOVERNANCE
============================================================

All release binaries must be signed.

Windows:
signtool or osslsigncode

macOS:
codesign + notarization

Linux:
sha256 + optional GPG signatures

============================================================
ACCESSIBILITY GOVERNANCE
============================================================

Applications must support:

- NVDA
- JAWS
- VoiceOver
- Orca
- Windows Narrator

Preferred APIs:

- Windows UI Automation
- IAccessible2
- AccessKit

NVDA integration allowed using:

nvdaControllerClient.dll

Applications must function even if NVDA is not running.

Speech routing may use:

- NVDA speech engine
- Microsoft SAPI
- screen reader engines

Braille compatibility must be preserved.

##Project rules before or during building
 and coding
If agent needs clarification on a step in a repo, the agent should interview the user relentlessly about every aspect of the plan until all have reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide the agent's recommended answer.
Ask the questions one at a time.
If a question can be answered by exploring the codebase, explore the codebase instead."


============================================================
AUTOMATED TESTING GOVERNANCE
============================================================

Preferred framework:

pytest

Install:

pip install pytest pytest-cov pytest-xdist pytest-mock

Run tests:

pytest

Coverage:

pytest --cov=src

Tests must pass before release.

============================================================
CROSS PLATFORM TESTING
============================================================

Tests should run on:

- Windows
- macOS
- Linux

Agents must validate:

- file paths
- environment variables
- installer behavior
- accessibility APIs

============================================================
FILE CLEANUP GOVERNANCE
============================================================

Agents must remove unnecessary files after builds.

Examples:

temporary build files
temporary scripts
intermediate artifacts
old logs

Safe to remove:

build/tmp
dist/tmp
*.tmp
*.obj
*.cache

Never remove:

release artifacts
versioned downloads

Logs older than 30 days may be removed unless archived.

============================================================
REPRODUCIBLE BUILDS
============================================================

Artifacts must include:

version
platform
architecture

Example:

voicelink-1.0.0-windows-x64-setup.exe

============================================================
BUILD PIPELINE ORDER
============================================================

1 compile application
2 run automated tests
3 generate installer
4 generate portable build
5 sign binaries
6 notarize macOS builds
7 generate checksums
8 verify signatures
9 publish artifacts

============================================================
DISTRIBUTION CHANNELS
============================================================

Artifacts may be distributed via:

- GitHub Releases
- WHMCS downloads
- mirrors
- package repositories
- direct downloads

============================================================
FALLBACK RULE
============================================================

If installer generation fails:

portable build must still be distributed.

============================================================
END OF TEMPLATE
