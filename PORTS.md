# PORTS.md
Ports, Services, and Bind Policy (Root)

This file is authoritative for port assignments and exposure decisions.

## Rules
- Prefer stable, documented port assignments.
- Avoid collisions with existing services.
- Public exposure only via reverse proxy on 443 unless explicitly allowed.

## Port table format (screen-reader friendly)
Name | Protocol | Bind Address | Port | Exposure | Owner | Notes
-----|----------|--------------|------|----------|-------|------
Example | TCP | 127.0.0.1 | 3000 | Private | app | Behind NGINX

## Common checks
- lsof -i -P -n | grep LISTEN
- ss -tulpn
- docker ps --format "table {{.Names}}\t{{.Ports}}"

## Reserved
Document ports reserved for:
- cPanel/WHM
- NGINX
- Docker apps (Mastodon/Jellyfin/Mattermost/etc.)
- Monitoring
- VPN/Headscale/Tailscale

## Current shared infrastructure ports
Name | Protocol | Bind Address | Port | Exposure | Owner | Notes
-----|----------|--------------|------|----------|-------|------
SMB / Samba | TCP | 0.0.0.0 on main server | 445 | Direct client access | main server | Used for Mountain Duck and cross-app shared storage via `smb.raywonderis.me` and `files.raywonderis.me`
VoiceLink Main API | TCP | 0.0.0.0 on main server | 3010 | App/API direct | devinecr | Main VoiceLink runtime
VoiceLink Community API | TCP | 0.0.0.0 on VPS | 3010 | App/API direct | devinecr | Community VoiceLink runtime
