#!/usr/bin/env bash
set -euo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$BASE/scripts/enroll_raywonder_repos.py"
