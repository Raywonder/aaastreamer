#!/usr/bin/env bash
set -euo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$BASE/scripts/sync_all_local_repos.py" "$@"
