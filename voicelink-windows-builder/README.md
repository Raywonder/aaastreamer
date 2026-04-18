# VoiceLink Windows Builder (External)

Standalone Windows setup/build toolchain kept outside app repos.

## Location
- `~/DEV/APPS/.GITHUB/voicelink-windows-builder`

## One-step update on Windows
- Run `pull-update.bat` from this folder.
- It performs `git pull --ff-only` and fixes `*.sh` line endings only if needed.

## Full one-step setup + build
- Run `run-all.bat [version] [projectRoot]`
- Example: `run-all.bat 1.0.0 C:\Users\40493\dev\apps\voicelink-local\windows-native`

## Files
- `run-setup.bat` : installs/configures OpenSSH + key auth + optional toolchain
- `run-build.bat` : builds MSI and setup EXE
- `run-all.bat` : update + setup + build
- `pull-update.bat` : safe updater + automatic line-ending repair for shell scripts
- `.local/key.txt` : machine-specific SSH public keys (ignored from git)
- `scripts/key.template.txt` : shared template/example key file
- `scripts/run_from_wsl.sh` : WSL local/remote helper

## Quick start on Windows
1. Add SSH public key(s) to `.local\\key.txt` (copy from `scripts\\key.template.txt`).
2. Run (Administrator CMD/PowerShell):
   - `run-setup.bat`
3. Build:
   - `run-build.bat 1.0.0`

## WSL examples
- Local build: `./scripts/run_from_wsl.sh --local 1.0.0`
- Remote build: `./scripts/run_from_wsl.sh --remote 100.64.0.5 40493 1.0.0`
