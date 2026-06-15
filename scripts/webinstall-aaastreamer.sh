#!/usr/bin/env bash
set -euo pipefail

# Web/agent-side installer helper for customer-owned servers.
# This script does not contain secrets. Pass license and SSH values through the
# environment from WHMCS, the admin UI, or a short-lived deployment job.

TARGET_HOST="${TARGET_HOST:-}"
TARGET_USER="${TARGET_USER:-root}"
TARGET_PORT="${TARGET_PORT:-22}"
TARGET_DOMAIN="${TARGET_DOMAIN:-${DOMAIN:-}}"
TARGET_DIR="${TARGET_DIR:-/opt/aaastreamer}"
TARGET_DATA_DIR="${TARGET_DATA_DIR:-/var/lib/aaastreamer}"
TARGET_SERVICE_NAME="${TARGET_SERVICE_NAME:-aaastreamer}"
TARGET_PUBLIC_URL="${TARGET_PUBLIC_URL:-}"
TARGET_APP_PORT="${TARGET_APP_PORT:-8095}"
CONFIRM_OWNED_SERVER="${CONFIRM_OWNED_SERVER:-false}"

REPO_URL="${REPO_URL:-https://github.com/Raywonder/aaastreamer.git}"
BRANCH="${BRANCH:-main}"
AAASTREAMER_LICENSE_TIER="${AAASTREAMER_LICENSE_TIER:-self-hosted-starter}"
AAASTREAMER_INSTALL_AUTH_MODE="${AAASTREAMER_INSTALL_AUTH_MODE:-license-token}"
AAASTREAMER_WHMCS_PRODUCT_ID="${AAASTREAMER_WHMCS_PRODUCT_ID:-}"
AAASTREAMER_WHMCS_PRODUCT_CODE="${AAASTREAMER_WHMCS_PRODUCT_CODE:-self-hosted-starter}"
AAASTREAMER_WHMCS_CLIENT_ID="${AAASTREAMER_WHMCS_CLIENT_ID:-}"
AAASTREAMER_WHMCS_CLIENT_EMAIL="${AAASTREAMER_WHMCS_CLIENT_EMAIL:-}"
AAASTREAMER_LICENSE_KEY="${AAASTREAMER_LICENSE_KEY:-}"
AAASTREAMER_INSTALL_ID="${AAASTREAMER_INSTALL_ID:-}"
AAASTREAMER_EDITION="${AAASTREAMER_EDITION:-self-hosted}"

if [[ "$CONFIRM_OWNED_SERVER" != "true" ]]; then
  echo "Set CONFIRM_OWNED_SERVER=true after verifying the target server/domain belongs to the installing customer." >&2
  exit 2
fi

if [[ -z "$TARGET_HOST" || -z "$TARGET_DOMAIN" ]]; then
  echo "TARGET_HOST and TARGET_DOMAIN are required." >&2
  exit 2
fi

if [[ ! "$TARGET_DOMAIN" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "TARGET_DOMAIN contains unsupported characters." >&2
  exit 2
fi

if [[ -z "$TARGET_PUBLIC_URL" ]]; then
  TARGET_PUBLIC_URL="https://${TARGET_DOMAIN}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLER="${SCRIPT_DIR}/install-aaastreamer-server.sh"
if [[ ! -f "$INSTALLER" ]]; then
  echo "Cannot find install-aaastreamer-server.sh next to this helper." >&2
  exit 1
fi

echo "Installing AAAStreamer on ${TARGET_USER}@${TARGET_HOST}:${TARGET_PORT} for ${TARGET_DOMAIN}"
echo "Install directory: ${TARGET_DIR}"
echo "Data directory: ${TARGET_DATA_DIR}"
echo "Tier: ${AAASTREAMER_LICENSE_TIER}"

ssh -p "$TARGET_PORT" "${TARGET_USER}@${TARGET_HOST}" "mkdir -p /tmp/aaastreamer-webinstall && chmod 700 /tmp/aaastreamer-webinstall"
scp -P "$TARGET_PORT" "$INSTALLER" "${TARGET_USER}@${TARGET_HOST}:/tmp/aaastreamer-webinstall/install-aaastreamer-server.sh"

remote_env=(
  "APP_DIR=$(printf '%q' "$TARGET_DIR")"
  "DATA_DIR=$(printf '%q' "$TARGET_DATA_DIR")"
  "MEDIA_DIR=$(printf '%q' "${TARGET_DATA_DIR}/media")"
  "UPLOAD_DIR=$(printf '%q' "${TARGET_DATA_DIR}/uploads")"
  "DOMAIN=$(printf '%q' "$TARGET_DOMAIN")"
  "PUBLIC_URL=$(printf '%q' "$TARGET_PUBLIC_URL")"
  "APP_PORT=$(printf '%q' "$TARGET_APP_PORT")"
  "SERVICE_NAME=$(printf '%q' "$TARGET_SERVICE_NAME")"
  "REPO_URL=$(printf '%q' "$REPO_URL")"
  "BRANCH=$(printf '%q' "$BRANCH")"
  "AAASTREAMER_LICENSE_TIER=$(printf '%q' "$AAASTREAMER_LICENSE_TIER")"
  "AAASTREAMER_INSTALL_AUTH_MODE=$(printf '%q' "$AAASTREAMER_INSTALL_AUTH_MODE")"
  "AAASTREAMER_WHMCS_PRODUCT_ID=$(printf '%q' "$AAASTREAMER_WHMCS_PRODUCT_ID")"
  "AAASTREAMER_WHMCS_PRODUCT_CODE=$(printf '%q' "$AAASTREAMER_WHMCS_PRODUCT_CODE")"
  "AAASTREAMER_WHMCS_CLIENT_ID=$(printf '%q' "$AAASTREAMER_WHMCS_CLIENT_ID")"
  "AAASTREAMER_WHMCS_CLIENT_EMAIL=$(printf '%q' "$AAASTREAMER_WHMCS_CLIENT_EMAIL")"
  "AAASTREAMER_LICENSE_KEY=$(printf '%q' "$AAASTREAMER_LICENSE_KEY")"
  "AAASTREAMER_INSTALL_ID=$(printf '%q' "$AAASTREAMER_INSTALL_ID")"
  "AAASTREAMER_EDITION=$(printf '%q' "$AAASTREAMER_EDITION")"
  "AAASTREAMER_CLIENT_LINKED=true"
  "AAASTREAMER_LOCK_CLIENT_LINKED_SETTINGS=true"
)

ssh -t -p "$TARGET_PORT" "${TARGET_USER}@${TARGET_HOST}" "sudo env ${remote_env[*]} bash /tmp/aaastreamer-webinstall/install-aaastreamer-server.sh"
ssh -p "$TARGET_PORT" "${TARGET_USER}@${TARGET_HOST}" "rm -rf /tmp/aaastreamer-webinstall"

echo "AAAStreamer web install finished for ${TARGET_PUBLIC_URL}"
