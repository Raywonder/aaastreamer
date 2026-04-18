#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $0 --local [version] [windows_native_project_root]
  $0 --remote <win_host> <win_user> [version] [windows_native_project_root]
USAGE
}

DEFAULT_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_PATH_DEFAULT="$HOME/.ssh/raywonder"

run_local() {
  local version="${1:-$DEFAULT_VERSION}"
  local project_root="${2:-$HOME/dev/apps/voicelink-local/windows-native}"
  local setup_ps="$(wslpath -w "$SCRIPT_DIR/setup_windows_builder.ps1")"
  local project_win="$(wslpath -w "$project_root")"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$setup_ps" -ProjectRoot "$project_win" -RunBuild -Version "$version"
}

run_remote() {
  local host="$1"
  local user="$2"
  local version="${3:-$DEFAULT_VERSION}"
  local project_root="${4:-C:\\Users\\$user\\dev\\apps\\voicelink-local\\windows-native}"
  local key_path="${SSH_KEY_PATH:-$KEY_PATH_DEFAULT}"

  ssh -o BatchMode=yes -o ConnectTimeout=8 -i "$key_path" "$user@$host" "echo ok" >/dev/null

  local ps="C:\\Users\\$user\\dev\\apps\\.GITHUB\\voicelink-windows-builder\\scripts\\setup_windows_builder.ps1"
  ssh -i "$key_path" "$user@$host" "powershell -NoProfile -ExecutionPolicy Bypass -File \"$ps\" -ProjectRoot \"$project_root\" -RunBuild -Version \"$version\""
}

case "${1:-}" in
  --local)
    run_local "${2:-$DEFAULT_VERSION}" "${3:-}"
    ;;
  --remote)
    [[ $# -ge 3 ]] || { usage; exit 1; }
    run_remote "$2" "$3" "${4:-$DEFAULT_VERSION}" "${5:-}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
