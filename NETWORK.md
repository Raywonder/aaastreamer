# NETWORK.md
Network and Exposure Rules (Root)

This file defines network boundaries for services in this repo/workspace.
It is intended for agents (Codex/OpenClaw/OpenCode) and humans.

## Principles
- Default: private by default (no public exposure).
- Expose only through approved reverse proxy + TLS.
- Prefer VPN/overlay networks (Headscale/Tailscale) for admin access.
- Validate port conflicts before binding.

## Environments
Describe which environment(s) this applies to:
- [ ] Production server (AlmaLinux + cPanel/WHM + Docker)
- [ ] Local macOS
- [ ] Windows
- [ ] WSL
- [ ] Virtual Machines / client sandboxes

## Approved ingress paths
List the only allowed inbound paths:
- NGINX reverse proxy on 443 with managed TLS
- Specific subdomains under controlled domains
- VPN-only admin endpoints (no public bind)
- Explicitly approved direct-access exception:
  - SMB on `445/tcp` for `smb.raywonderis.me` and `files.raywonderis.me`
  - Use for managed file sharing and Mountain Duck style mounts, not for browser traffic

## Shared storage clients
- Approved SMB clients include:
  - macOS
  - Windows
  - virtual machines / client sandboxes
  - server-hosted app runtimes that need managed shared media access
- Mastodon and similar hosted apps may mount or reference approved backup-volume media roots through the shared storage model when documented for that instance.

## Disallowed
- Binding admin services to 0.0.0.0 without explicit approval
- Opening firewall ports without confirmation
- Exposing databases publicly

## Overlay networks
If using Headscale/Tailscale:
- Admin access is via overlay IPs only
- Document overlay CIDRs, node names, ACL expectations here

## Docker networks
List Docker subnets and purpose:
- <docker_subnet>: <purpose> (example: 192.168.80.0/20 Mastodon network)

## Required checks before changes
- Confirm current listening ports
- Confirm firewall policy
- Confirm reverse proxy routes
- Confirm DNS and TLS readiness

## Change log
- Date:
- What changed:
- Why:
