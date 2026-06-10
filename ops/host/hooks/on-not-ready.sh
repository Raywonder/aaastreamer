#!/usr/bin/env bash
set -u
path=${MTX_PATH:-}
key=${path##*/}
[ -n $key ] || exit 0
curl -fsS -X POST \
  --get 'http://127.0.0.1:8095/api/voicelink/on_done' \
  --data-urlencode streamKey=${key} \
  --data-urlencode streamId=${key} \
  --data-urlencode name=${key} \
  --data-urlencode 'app=live' >/dev/null || true
