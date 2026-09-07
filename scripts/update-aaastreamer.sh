#!/usr/bin/env bash
set -euo pipefail

ROOT="${AAASTREAMER_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
STORE="${AAASTREAMER_STORE:-$ROOT/api/data/aaastreamer.json}"
MANIFEST_URL="${AAASTREAMER_UPDATE_MANIFEST_URL:-https://aaastreamer.devinecreations.net/releases/latest.json}"
HEALTH_URL="${AAASTREAMER_HEALTH_URL:-http://127.0.0.1:8095/health}"
PM2_NAME="${AAASTREAMER_PM2_NAME:-aaastreamer-api}"
SERVICE_NAME="${AAASTREAMER_SERVICE_NAME:-aaastreamer}"
MEDIA_SERVICE_NAME="${AAASTREAMER_MEDIA_SERVICE_NAME:-aaastreamer-mediamtx}"
# Keep the log outside the application tree so the directory swap cannot move
# the active log into the rollback tree that is removed after verification.
LOG="${AAASTREAMER_UPDATE_LOG:-$(dirname "$ROOT")/aaastreamer-update.log}"

maintenance_enabled=false
swap_started=false
swap_completed=false
update_succeeded=false
work_dir=""
rollback_root=""
failed_root=""
preserved_store=""
store_relative=""

set_maintenance() {
  local enabled="$1"
  local message="$2"
  [[ -f "$STORE" ]] || return 0
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

restart_services() {
  if command -v systemctl >/dev/null 2>&1 && systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl restart "$SERVICE_NAME"
    if systemctl cat "${MEDIA_SERVICE_NAME}.service" >/dev/null 2>&1; then
      systemctl restart "$MEDIA_SERVICE_NAME"
      systemctl is-active --quiet "$MEDIA_SERVICE_NAME"
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

wait_for_health() {
  local attempt
  for attempt in {1..15}; do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "AAAStreamer did not become healthy at $HEALTH_URL." >&2
  return 1
}

safe_remove_tree() {
  local target="$1"
  local parent
  [[ -n "$target" && "$target" != "/" && -d "$target" ]] || return 0
  parent="$(cd "$(dirname "$target")" && pwd -P)"
  [[ "$parent" == "$(cd "$(dirname "$ROOT")" && pwd -P)" ]] || {
    echo "Refusing to remove unexpected update path: $target" >&2
    return 1
  }
  rm -rf -- "$target"
}

on_exit() {
  local status=$?
  trap - EXIT ERR INT TERM

  if [[ "$update_succeeded" != "true" && "$swap_started" == "true" && -d "$rollback_root" ]]; then
    if [[ "$swap_completed" == "true" && -d "$ROOT" ]]; then
      failed_root="${ROOT}.failed.$(date -u +%Y%m%dT%H%M%SZ).$$"
      mv -- "$ROOT" "$failed_root" || true
    fi
    if [[ ! -e "$ROOT" ]]; then
      mv -- "$rollback_root" "$ROOT" || true
      swap_started=false
      swap_completed=false
      restart_services || true
      wait_for_health || true
    fi
  fi

  if [[ "$maintenance_enabled" == "true" && -f "$STORE" ]]; then
    set_maintenance false "" || true
  fi

  if [[ "$update_succeeded" == "true" ]]; then
    safe_remove_tree "$rollback_root"
  fi
  if [[ -n "$work_dir" && -d "$work_dir" ]]; then
    safe_remove_tree "$work_dir" || true
  fi
  exit "$status"
}

trap on_exit EXIT ERR INT TERM

run_update() {
  local root_parent manifest_file archive_file extract_dir candidate_root
  local version archive_url expected_sha actual_sha listing_file type_listing
  local -a manifest_fields top_entries

  command -v curl >/dev/null
  command -v node >/dev/null
  command -v npm >/dev/null
  command -v tar >/dev/null
  command -v sha256sum >/dev/null

  [[ "$MANIFEST_URL" == https://* ]] || {
    echo "The release manifest URL must use HTTPS." >&2
    return 1
  }

  ROOT="$(cd "$ROOT" && pwd -P)"
  root_parent="$(cd "$(dirname "$ROOT")" && pwd -P)"
  work_dir="$(mktemp -d "$root_parent/.aaastreamer-update.XXXXXXXX")"
  manifest_file="$work_dir/manifest.json"
  archive_file="$work_dir/release.tar.gz"
  extract_dir="$work_dir/extracted"
  listing_file="$work_dir/archive-files.txt"
  type_listing="$work_dir/archive-types.txt"
  mkdir -p "$extract_dir"

  curl --fail --silent --show-error --location \
    --proto '=https' --proto-redir '=https' \
    --output "$manifest_file" "$MANIFEST_URL"

  mapfile -t manifest_fields < <(
    MANIFEST_PATH="$manifest_file" node --input-type=module <<'NODE'
import fs from 'fs';
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, 'utf8'));
const values = [
  manifest.version,
  manifest.archiveUrl ?? manifest.archive?.url,
  manifest.sha256 ?? manifest.archive?.sha256
];
if (values.some(value => typeof value !== 'string' || !value.trim() || /[\r\n\0]/u.test(value))) {
  throw new Error('Manifest must contain string version, archiveUrl, and sha256 fields.');
}
for (const value of values) console.log(value.trim());
NODE
  )
  [[ "${#manifest_fields[@]}" -eq 3 ]] || {
    echo "The release manifest is incomplete." >&2
    return 1
  }
  version="${manifest_fields[0]}"
  archive_url="${manifest_fields[1]}"
  expected_sha="${manifest_fields[2],,}"
  [[ "$archive_url" == https://* ]] || {
    echo "The release archive URL must use HTTPS." >&2
    return 1
  }
  [[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] || {
    echo "The release manifest contains an invalid SHA-256 value." >&2
    return 1
  }

  echo "[$(date -Is)] Downloading AAAStreamer $version"
  curl --fail --silent --show-error --location \
    --proto '=https' --proto-redir '=https' \
    --output "$archive_file" "$archive_url"
  actual_sha="$(sha256sum "$archive_file" | awk '{print tolower($1)}')"
  [[ "$actual_sha" == "$expected_sha" ]] || {
    echo "Release archive checksum verification failed." >&2
    return 1
  }

  tar -tzf "$archive_file" >"$listing_file"
  [[ -s "$listing_file" ]] || {
    echo "The release archive is empty." >&2
    return 1
  }
  if awk '
    /^\// { bad=1 }
    /(^|\/)\.\.($|\/)/ { bad=1 }
    /\\/ { bad=1 }
    END { exit bad ? 0 : 1 }
  ' "$listing_file"; then
    echo "The release archive contains an unsafe path." >&2
    return 1
  fi
  tar -tvzf "$archive_file" >"$type_listing"
  if awk 'substr($0, 1, 1) ~ /[lhbcp]/ { found=1 } END { exit found ? 0 : 1 }' "$type_listing"; then
    echo "The release archive contains links or special files, which are not allowed." >&2
    return 1
  fi

  tar --extract --gzip --file "$archive_file" --directory "$extract_dir" \
    --no-same-owner --no-same-permissions

  candidate_root="$extract_dir"
  mapfile -t top_entries < <(find "$extract_dir" -mindepth 1 -maxdepth 1 -print)
  if [[ "${#top_entries[@]}" -eq 1 && -d "${top_entries[0]}" ]]; then
    candidate_root="${top_entries[0]}"
  fi
  [[ -f "$candidate_root/api/package.json" && -f "$candidate_root/api/src/server.js" ]] || {
    echo "The release archive does not contain a valid AAAStreamer application." >&2
    return 1
  }

  npm --prefix "$candidate_root/api" install --omit=dev --ignore-scripts
  node --check "$candidate_root/api/src/server.js"

  case "$(cd "$(dirname "$STORE")" 2>/dev/null && pwd -P)/$(basename "$STORE")" in
    "$ROOT"/*)
      store_relative="${STORE#"$ROOT"/}"
      if [[ -f "$STORE" ]]; then
        preserved_store="$work_dir/preserved-store.json"
        cp -p -- "$STORE" "$preserved_store"
      fi
      ;;
  esac

  set_maintenance true "AAAStreamer is installing an update. Please reconnect shortly."
  maintenance_enabled=true
  if [[ -n "$preserved_store" ]]; then
    cp -p -- "$STORE" "$preserved_store"
  fi

  rollback_root="${ROOT}.rollback.$(date -u +%Y%m%dT%H%M%SZ).$$"
  [[ ! -e "$rollback_root" ]] || {
    echo "Rollback path already exists: $rollback_root" >&2
    return 1
  }
  mv -- "$ROOT" "$rollback_root"
  swap_started=true
  mv -- "$candidate_root" "$ROOT"
  swap_completed=true

  if [[ -n "$preserved_store" ]]; then
    mkdir -p "$(dirname "$ROOT/$store_relative")"
    cp -p -- "$preserved_store" "$ROOT/$store_relative"
  fi

  restart_services
  wait_for_health
  set_maintenance false ""
  maintenance_enabled=false
  update_succeeded=true
  echo "[$(date -Is)] AAAStreamer $version update completed and passed health checks"
}

mkdir -p "$(dirname "$LOG")"
{
  echo "[$(date -Is)] AAAStreamer release update started in $ROOT"
  run_update
} >>"$LOG" 2>&1
