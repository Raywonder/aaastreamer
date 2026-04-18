# Raywonder Repo Bootstrap (Universal)

Reusable Windows host + repo bootstrap scripts for any `Raywonder/*` repo.

## Purpose
- Shared setup for humans and agents.
- Works outside product repos so tooling is centralized.

## Files
- `run-repo-bootstrap.bat` : update target repo + host setup
- `run-repo-update.bat` : git pull + conditional `.sh` LF normalization
- `run-host-setup.bat` : OpenSSH + keys + optional Tailscale SSH + .NET + WiX + Git LFS
- `run-enroll-all.sh` / `run-enroll-all.bat` : apply `.raywonder-sync` template to all local `Raywonder/*` repos and write inventory manifest
- `run-sync-all.sh` / `run-sync-all.bat` : refresh enrollment + optional pull for all tracked local Raywonder repos
- `.local/key.txt` : machine-specific SSH public keys (ignored from git)
- `scripts/key.template.txt` : shared template/example key file

## Usage (Windows)
1. Add your SSH public key(s) to `.local\\key.txt` (copy from `scripts\\key.template.txt`).
2. Run full bootstrap for current directory repo:
   - `run-repo-bootstrap.bat`
3. Or target a specific repo:
   - `run-repo-bootstrap.bat C:\Users\40493\git\raywonder\some-repo`

## Notes
- `run-host-setup.bat` should be run from an Administrator terminal.
- `.sh` line-endings are only fixed when CRLF is detected.
- `state/raywonder_repo_inventory.json` tracks local enrolled repos and remote Raywonder repos not cloned locally.

## Cross-repo sync usage
- macOS/Linux inventory + template refresh only:
  - `./run-sync-all.sh`
- macOS/Linux inventory + template refresh + git pull on all tracked repos:
  - `./run-sync-all.sh --pull`
- Windows inventory + template refresh only:
  - `run-sync-all.bat`
- Windows inventory + template refresh + git pull on all tracked repos:
  - `run-sync-all.bat --pull`
