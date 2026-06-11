#!/usr/bin/env bash
set -euo pipefail

ROOT="${AAASTREAMER_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
STORE="${AAASTREAMER_STORE:-$ROOT/api/data/aaastreamer.json}"
PM2_NAME="${AAASTREAMER_PM2_NAME:-aaastreamer-api}"
LOG="${AAASTREAMER_UPDATE_LOG:-$ROOT/update.log}"

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

{
  echo "[$(date -Is)] AAAStreamer update started in $ROOT"
  set_maintenance true "AAAStreamer is installing an update. Please reconnect shortly."
  git -C "$ROOT" fetch --all --prune
  git -C "$ROOT" pull --ff-only
  npm --prefix "$ROOT/api" install --omit=dev
  node --check "$ROOT/api/src/server.js"
  pm2 restart "$PM2_NAME" --update-env
  sleep 2
  set_maintenance false ""
  echo "[$(date -Is)] AAAStreamer update completed"
} >>"$LOG" 2>&1
