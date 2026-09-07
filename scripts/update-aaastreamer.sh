#!/usr/bin/env bash
set -euo pipefail

ROOT="${AAASTREAMER_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
STORE="${AAASTREAMER_STORE:-$ROOT/api/data/aaastreamer.json}"
PM2_NAME="${AAASTREAMER_PM2_NAME:-aaastreamer-api}"
SERVICE_NAME="${AAASTREAMER_SERVICE_NAME:-aaastreamer}"
MEDIA_SERVICE_NAME="${AAASTREAMER_MEDIA_SERVICE_NAME:-aaastreamer-mediamtx}"
LOG="${AAASTREAMER_UPDATE_LOG:-$ROOT/update.log}"
maintenance_enabled=false

set_maintenance() {
  local enabled="$1"
  local message="$2"
  STORE_PATH="$STORE" ENABLED="$enabled" MESSAGE="$message" node --input-type=module <<'NODE'
import fs from 'fs';
const file = process.env.STORE_PATH;
const store = JSON.parse(fs.readFileSync(file, 'utf8'));
store.settings ||= {};
store.settings.maintenanceMode = {
  enabled: process.env.ENABLED === 'true',
  message: process.env.MESSAGE || ''
};
store.events ||= [];
store.events.push({
  id: `evt_${Date.now().toString(16)}`,
  type: process.env.ENABLED === 'true' ? 'maintenance_enabled_by_updater' : 'maintenance_disabled_by_updater',
  payload: {},
  createdAt: new Date().toISOString()
});
fs.writeFileSync(file, JSON.stringify(store, null, 2));
NODE
}

clear_maintenance_on_failure() {
  local status=$?
  if [[ "$maintenance_enabled" == "true" && -f "$STORE" ]]; then
    set_maintenance false "" || true
  fi
  exit "$status"
}

restart_services() {
  if command -v systemctl >/dev/null 2>&1 && systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
    if systemctl cat "${MEDIA_SERVICE_NAME}.service" >/dev/null 2>&1; then
      systemctl restart "$MEDIA_SERVICE_NAME"
    fi
    systemctl is-active --quiet "$SERVICE_NAME"
    return
  fi
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart "$PM2_NAME" --update-env
    return
  fi
  echo "No ${SERVICE_NAME} systemd unit or PM2 installation was found." >&2
  return 1
}

trap clear_maintenance_on_failure ERR

{
  echo "[$(date -Is)] AAAStreamer update started in $ROOT"
  set_maintenance true "AAAStreamer is installing an update. Please reconnect shortly."
  maintenance_enabled=true
  git -C "$ROOT" fetch --all --prune
  git -C "$ROOT" pull --ff-only
  npm --prefix "$ROOT/api" install --omit=dev
  node --check "$ROOT/api/src/server.js"
  restart_services
  sleep 2
  set_maintenance false ""
  maintenance_enabled=false
  echo "[$(date -Is)] AAAStreamer update completed"
} >>"$LOG" 2>&1
