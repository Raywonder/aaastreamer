# SYSTEMRULES.md
System Rules and Infrastructure Configuration (AUTHORITATIVE)
Last updated: 2026-02-17

This document contains immutable infrastructure configuration that must be followed for all work on this system.
All agents must read this file and always verify tasks are running on the proper server before executing.

IMPORTANT:
- Do not store secrets (passwords, private keys, API keys, seed phrases) in this file.
- Usernames/endpoints are okay; secrets must live in secure storage per secrets-layout.md.
- When this file changes, agents must treat it as HIGH IMPACT and re-validate network + ports + backups.

============================================================
PRIMARY SERVERS
============================================================

Server | IP Range | SSH Port | Primary Users
Main Server | 64.20.46.178–64.20.46.182 | 450 | devinecr, dom, root, tappedin, ecriptoapp, bemamediaplayerapp, flexpbxuser
VPS | 208.73.204.162 | 22 | devinecr, root, flexpbxuser

SSH Key (shared)
- Key Name: raywonder
- Location: ~/.ssh/raywonder
- Backup: dev/ssh-keys-backup/
- Used for all servers and accounts (root and user access)
- Do NOT copy this key to third parties. If access is needed, generate a separate key and scope it.

Connection examples (verify host before running commands)
Main Server:
- ssh -i ~/.ssh/raywonder -p 450 root@64.20.46.178
- ssh -i ~/.ssh/raywonder -p 450 devinecr@64.20.46.178

VPS:
- ssh -i ~/.ssh/raywonder devinecr@208.73.204.162

============================================================
DOMAINS AND NAMESERVERS (PERMANENT)
============================================================

Nameserver configuration (all domains use ns1–ns4.raywonderis.me):
Nameserver | IP
ns1 | 64.20.46.178
ns2 | 64.20.46.179
ns3 | 64.20.46.180
ns4 | 64.20.46.181

Reserved infrastructure IP:
- 64.20.46.182 is reserved for vpn/tailscale/headscale/wireguard and related network services.

Domain registry (authoritative)
Domain | Registrar | Nameservers | Contact Email
devine-creations.com | eNom/WHMCS | ns1–ns4.raywonderis.me | admin@devine-creations.com
devinecreations.net | eNom/WHMCS | ns1–ns4.raywonderis.me | admin@devinecreations.net
raywonderis.me | eNom/WHMCS | ns1–ns4.raywonderis.me | admin@raywonderis.me
bemamediaplayer.app | eNom/WHMCS | ns1–ns4.raywonderis.me | admin@bemamediaplayer.app
ecripto.app | eNom/WHMCS | ns1–ns4.raywonderis.me | admin@ecripto.app
tappedin.fm | Namecheap | manual update required | admin@tappedin.fm

DNS zone files location
- /var/named/domain.db

============================================================
TOOLING + API REDUNDANCY POLICY (AUTHORITATIVE)
============================================================

Tooling facts:
- dom user: Homebrew is installed and may be used for tooling on that account.
- tappedin user: Ollama is installed and should be preferred for local AI tasks.
- devinecr user: canonical API sources live under /home/devinecr/apps/hubnode/* (and related API roots).

API redundancy policy:
- devinecr hosts the canonical (upstream) API implementations.
- each runtime user may maintain its own local API copy under /home/<user>/apps to avoid single-control-plane dependency.

Agent behavior:
- Default: prefer the local API copy for the runtime user running the service.
- Sync/updates: pull from devinecr canonical API, then deploy per-user copies to keep autonomy.
- Never assume WHMCS is required at runtime.
- Never break local copies unless explicitly instructed.
- Document API sync/update in:
  - docs/runtime/services.md
  - docs/runtime/recovery.md

Safety:
- Versioning rules apply: same-version patch/minor only by default.
- Major upgrades or migrations require confirmation.

============================================================
HEADSCALE / OVERLAY NETWORK DEVICE INVENTORY (MANDATORY)
============================================================

Agents must keep an up-to-date device inventory at:
- headscale_network_devices.md (root of the dev workspace on all synced devices)

Rules:
- Track which devices belong to who.
- Track which services are reachable over the overlay network.
- Do not add devices or change ACLs without confirmation.
- If device list is missing or stale, switch to report-only mode and request updates.

============================================================
WHMCS ACCOUNTS (PERMANENT)
============================================================

Domain | Client ID | Email | Billing
ecripto.app | 7 | support@ecripto.app | $0.00 (Free Account)
bemamediaplayer.app | 8 | support@bemamediaplayer.app | $0.00 (Free Account)

eNom API (NO SECRETS HERE)
- Username: Dstansberry
- API Endpoint: https://reseller.enom.com/interface.asp
- Credentials must be stored securely (vault/env), not in docs.

============================================================
MEDIA SERVERS (JELLYFIN)
============================================================

Server | Internal Port | Domain | Owner
TappedIn Media | 9096 | media.tappedin.fm | tappedin
Dom Media | 9097 | media.raywonderis.me | dom

Media paths
- /home/tappedin/apps/media
- /home/dom/apps/media
  - subfolders: music, VIDEO, music-videos, AudioDescribedContent, books&dramas, books
- /home/devinecr/apps/media
- /home/tetoeehoward/apps/media
- /home/wharper/apps/media

============================================================
SHARED SMB FILESERVING (AUTHORITATIVE)
============================================================

Purpose
- Cross-app file transfer and shared storage over SMB for macOS, Windows, Mountain Duck, and server-side integrations.
- Primary storage root lives on the main server backup volume under `/mnt/backup`.

Primary storage model
- Each VM, VPS, or hosted server instance keeps its own local app data and media directories as the primary live runtime storage.
- SMB is the shared backup, archive, migration, and cross-device transfer layer unless a specific app is explicitly configured to read directly from SMB at runtime.
- Agents must not silently convert an app from local-primary storage to SMB-primary storage without explicit approval and app-specific validation.

Two-layer SMB model
- Local SMB may be used as the primary shared storage layer for a specific VM, VPS, site, office, or home-network environment.
- Central SMB on the main server remains the secondary/global backup, sync, archive, and migration layer.
- When both layers exist, apps should prefer:
  - local app disk first
  - local SMB second
  - central SMB third
- Cross-server and disaster-recovery workflows should sync upward into the central SMB layer instead of treating each local SMB instance as globally authoritative.

Server and access facts
- Main SMB hostnames:
  - `smb.raywonderis.me`
  - `files.raywonderis.me`
- Main SMB server IP:
  - `64.20.46.178`
- SMB/CIFS port:
  - `445/tcp`
- Current shared SMB username:
  - `voicelinkshare`
- Password must NOT be stored in tracked repo files. Retrieve it from secure storage or the active operator vault.

Canonical share roots on the main server
- `/mnt/backup/shared-files`
- `/mnt/backup/voicelink`
- `/mnt/backup/openlink`
- `/mnt/backup/bema`
- `/mnt/backup/flexpbx`
- `/mnt/backup/flexphone`
- `/mnt/backup/openclaw`
- `/mnt/backup/media`

Published SMB share names
- `shared-files`
- `voicelink`
- `openlink`
- `bema`
- `flexpbx`
- `flexphone`
- `openclaw`
- `media`
- compatibility share:
  - `voicelink-share`

Expected usage
- `shared-files`: general cross-app exchange and offload area
- `voicelink`: VoiceLink uploads, exports, shared storage, and admin-managed file sharing
- `openlink`: OpenLink releases and cross-device transfer
- `bema`: Bema releases and shared assets
- `flexpbx`: PBX backups, exports, prompts, and queue-related assets
- `flexphone`: client installers and shared support files
- `openclaw`: agent/runtime assets and shared AI support files
- `media`: Jellyfin and media-library import/sync staging

Extended usage
- Virtual machines and client sandboxes may mount these SMB shares when they need access to the same central assets or archive roots.
- Mastodon and similar hosted social stacks may use the shared storage layout for server-hosted media directories, exports, and migration/offload staging when approved for that app instance.
- Prefer app-specific roots for hosted media workloads instead of storing Mastodon assets in `shared-files` long-term.

Suggested hosted media roots
- Mastodon shared media staging:
  - `/mnt/backup/mastodon`
- Generic federated/social media staging:
  - `/mnt/backup/media`

Operational rules
- Prefer SMB for large archive offload and shared app assets when SSH/SFTP is unnecessary.
- Apps may expose these shares in admin/config UIs, but must never hardcode the password in tracked source.
- When documenting mount paths for apps, prefer the hostname form first and raw IP as fallback.
- Keep per-app files in the matching share root instead of mixing everything into `shared-files`.
- If DNS is not yet propagated on a client, use `64.20.46.178` temporarily.
- VM images, Mastodon media volumes, and other large hosted assets should default to `/mnt/backup/...` roots so local server disks are not treated as the primary long-term archive.
- Default backup/sync pattern:
  - local VM/VPS/app storage first
  - local SMB copy/sync second when available
  - central SMB copy/sync third
  - restore or migration from the appropriate SMB layer when needed

Connection examples
- `smb://voicelinkshare@smb.raywonderis.me/shared-files`
- `smb://voicelinkshare@smb.raywonderis.me/voicelink`
- `smb://voicelinkshare@smb.raywonderis.me/media`
- `smb://voicelinkshare@64.20.46.178/shared-files`

============================================================
VOICELINK CONFIGURATION
============================================================

Locations
Main Server: /home/devinecr/apps/voicelink-local/
VPS: /home/devinecr/apps/voicelink-local/
Local Dev (Windows): C:\Users\40493\dev\apps\voicelink-local\

API port
- Main: 3010

Federated Jellyfin config
- /data/federated-jellyfin.json

Key files
- source/utils/federated-jellyfin-manager.js
- source/routes/local-server.js
- data/deploy.json

VoiceLink shared storage defaults
- File sharing and second-drive storage should prefer:
  - `/mnt/backup/voicelink`
- VoiceLink admin settings may surface SMB host/share discovery using:
  - `smb.raywonderis.me`
  - `files.raywonderis.me`
- VoiceLink/Jellyfin shared import roots may include:
  - `/mnt/backup/media`
  - `/mnt/backup/voicelink`
  - `/mnt/backup/shared-files`

============================================================
NGINX CONFIGURATIONS
============================================================

Location
- /etc/nginx/conf.d/

Key proxy configs
Config File | Domain | Backend
media-tappedin.conf | media.tappedin.fm | 127.0.0.1:9096
dom-jellyfin.conf | media.raywonderis.me | 127.0.0.1:9097

============================================================
PORT RESTRICTIONS
============================================================

Reserved ports (NEVER USE)
- 2082–2087 (cPanel)
- 2095, 2077 (cPanel)

Application port ranges (guideline)
- 3000–5000: standard application ports
- 9096–9100: media servers

============================================================
USER ACCOUNTS ON MAIN SERVER
============================================================

User | Purpose | Home
devinecr | Primary service account | /home/devinecr
dom | Dom’s Jellyfin | /home/dom
tappedin | TappedIn services | /home/tappedin
tetoeehoward | Media storage | /home/tetoeehoward
wharper | Media storage | /home/wharper

============================================================
FILESYSTEM ORGANIZATION (CANONICAL)
============================================================

/home/devinecr/apps/project-name/
- source/        Application source code
- data/          Runtime data and configs
- build-temp/    Build artifacts
- releases/      Release packages

/home/devinecr/public_html/project-name/
- Frontend/static files

============================================================
PROCESS MANAGEMENT (NODE.JS)
============================================================

PM2 ONLY (Node.js) examples
- pm2 start source/server/main.js --name project-api
- pm2 restart project-api
- pm2 logs project-api --lines 50
- pm2 save
- pm2 startup

FORBIDDEN
- systemd for Node.js apps
- CSF (ConfigServer Firewall)
- LFD (Login Failure Daemon)

============================================================
PERMISSIONS (CRITICAL)
============================================================

Standard permissions (template; adjust for other users as needed)
- chown -R devinecr:devinecr /home/devinecr/apps/project-name
- chmod -R 755 /home/devinecr/apps/project-name
- find /home/devinecr/apps/project-name -type f -exec chmod 644 {} \;
- find /home/devinecr/apps/project-name -name "*.sh" -exec chmod 755 {} \;

============================================================
RELATED DOCUMENTATION FILES (AUTHORITATIVE)
============================================================

These files must always be followed when present:
1) global-Infrastructure.md
2) global-PROJECT_SETUP_GUIDELINES.md
3) Global-README_FOR_AGENTS.md

Copy/pin to:
- .claude/
- project roots as needed for tooling visibility

============================================================
END
============================================================
