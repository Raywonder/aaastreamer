#!/usr/bin/env bash
set -euo pipefail
cd /home/devinecr/apps/aaastreamer-worktree
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
    export "$key=$value"
  done < .env
fi
exec /home/linuxbrew/.linuxbrew/bin/node api/src/server.js
