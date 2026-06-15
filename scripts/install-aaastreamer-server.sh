#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-aaastreamer}"
APP_DIR="${APP_DIR:-/opt/aaastreamer}"
APP_PORT="${APP_PORT:-8095}"
DATA_DIR="${DATA_DIR:-/var/lib/aaastreamer}"
MEDIA_DIR="${MEDIA_DIR:-${DATA_DIR}/media}"
UPLOAD_DIR="${UPLOAD_DIR:-${DATA_DIR}/uploads}"
PUBLIC_URL="${PUBLIC_URL:-}"
RTMP_HOST="${RTMP_HOST:-localhost}"
RTMP_APP_NAME="${RTMP_APP_NAME:-live}"
SERVICE_NAME="${SERVICE_NAME:-aaastreamer}"
REPO_URL="${REPO_URL:-https://github.com/Raywonder/aaastreamer.git}"
BRANCH="${BRANCH:-main}"
CREATE_NGINX="${CREATE_NGINX:-true}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
AAASTREAMER_LICENSE_TIER="${AAASTREAMER_LICENSE_TIER:-self-hosted-starter}"
AAASTREAMER_INSTALL_AUTH_MODE="${AAASTREAMER_INSTALL_AUTH_MODE:-license-token}"
AAASTREAMER_WHMCS_PRODUCT_ID="${AAASTREAMER_WHMCS_PRODUCT_ID:-}"
AAASTREAMER_WHMCS_PRODUCT_CODE="${AAASTREAMER_WHMCS_PRODUCT_CODE:-self-hosted-starter}"
AAASTREAMER_WHMCS_CLIENT_ID="${AAASTREAMER_WHMCS_CLIENT_ID:-}"
AAASTREAMER_WHMCS_CLIENT_EMAIL="${AAASTREAMER_WHMCS_CLIENT_EMAIL:-}"
AAASTREAMER_LICENSE_KEY="${AAASTREAMER_LICENSE_KEY:-}"
AAASTREAMER_INSTALL_ID="${AAASTREAMER_INSTALL_ID:-}"
AAASTREAMER_EDITION="${AAASTREAMER_EDITION:-self-hosted}"
AAASTREAMER_CLIENT_LINKED="${AAASTREAMER_CLIENT_LINKED:-true}"
AAASTREAMER_LOCK_CLIENT_LINKED_SETTINGS="${AAASTREAMER_LOCK_CLIENT_LINKED_SETTINGS:-true}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer as root or with sudo." >&2
  exit 1
fi

if [[ -z "$PUBLIC_URL" && -n "$DOMAIN" ]]; then
  PUBLIC_URL="https://${DOMAIN}"
fi

echo "Installing AAAStreamer server"
echo "App user: ${APP_USER}"
echo "App dir: ${APP_DIR}"
echo "Data dir: ${DATA_DIR}"
echo "Media dir: ${MEDIA_DIR}"
echo "Upload dir: ${UPLOAD_DIR}"
echo "Port: ${APP_PORT}"
echo "Public URL: ${PUBLIC_URL:-not set yet}"

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates nodejs npm ffmpeg nginx
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y git curl ca-certificates nodejs npm ffmpeg nginx
  elif command -v yum >/dev/null 2>&1; then
    yum install -y git curl ca-certificates nodejs npm ffmpeg nginx
  else
    echo "Unsupported package manager. Install git, nodejs, npm, ffmpeg, and nginx, then rerun." >&2
    exit 1
  fi
}

ensure_user() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  fi
}

install_source() {
  mkdir -p "$APP_DIR"
  if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" npm --prefix "$APP_DIR/api" ci --omit=dev
}

prepare_storage() {
  mkdir -p "$DATA_DIR" "$MEDIA_DIR" "$UPLOAD_DIR"
  chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
  chmod 750 "$DATA_DIR" "$MEDIA_DIR" "$UPLOAD_DIR"
}

write_env() {
  mkdir -p /etc/aaastreamer
  umask 077
  cat >/etc/aaastreamer/aaastreamer.env <<EOF_ENV
AAASTREAMER_PORT=${APP_PORT}
AAASTREAMER_PUBLIC_URL=${PUBLIC_URL}
AAASTREAMER_HLS_BASE_URL=${PUBLIC_URL}
AAASTREAMER_RTMP_HOST=${RTMP_HOST}
RTMP_APP_NAME=${RTMP_APP_NAME}
AAASTREAMER_REGISTRATION_ENABLED=true
AAASTREAMER_UPLOAD_LIMIT=75mb
AAASTREAMER_MAX_UPLOAD_BYTES=78643200
AAASTREAMER_DATA_DIR=${DATA_DIR}
AAASTREAMER_MEDIA_FOLDERS=Server media|${MEDIA_DIR}|enabled|visible|audio|video
AAASTREAMER_UPLOAD_FOLDER=${UPLOAD_DIR}
# Optional integrations. Set values after install, then restart ${SERVICE_NAME}.
AAASTREAMER_WHMCS_URL=
AAASTREAMER_WHMCS_API_IDENTIFIER=
AAASTREAMER_WHMCS_API_SECRET=
AAASTREAMER_WHMCS_API_ACCESS_KEY=
AAASTREAMER_WHMCS_DEFAULT_CLIENT_ID=
AAASTREAMER_WHMCS_PAYMENT_METHOD=
AAASTREAMER_STRIPE_SECRET_KEY=
AAASTREAMER_STRIPE_WEBHOOK_SECRET=
AAASTREAMER_MASTODON_INSTANCE_URL=https://md.tappedin.fm
AAASTREAMER_MASTODON_ACCESS_TOKEN=
AAASTREAMER_MASTODON_ACCOUNT_LABEL=TappedIn
# Licensing remains tied to Devine Creations/WHMCS for customer-owned installs.
AAASTREAMER_LICENSE_ENABLED=true
AAASTREAMER_LICENSE_SERVER_URL=https://devine-creations.com
AAASTREAMER_LICENSE_TIER=${AAASTREAMER_LICENSE_TIER}
AAASTREAMER_INSTALL_AUTH_MODE=${AAASTREAMER_INSTALL_AUTH_MODE}
AAASTREAMER_WHMCS_PRODUCT_ID=${AAASTREAMER_WHMCS_PRODUCT_ID}
AAASTREAMER_WHMCS_PRODUCT_CODE=${AAASTREAMER_WHMCS_PRODUCT_CODE}
AAASTREAMER_WHMCS_CLIENT_ID=${AAASTREAMER_WHMCS_CLIENT_ID}
AAASTREAMER_WHMCS_CLIENT_EMAIL=${AAASTREAMER_WHMCS_CLIENT_EMAIL}
AAASTREAMER_LICENSE_KEY=${AAASTREAMER_LICENSE_KEY}
AAASTREAMER_INSTALL_ID=${AAASTREAMER_INSTALL_ID}
AAASTREAMER_INSTALL_DOMAIN=${DOMAIN}
AAASTREAMER_EDITION=${AAASTREAMER_EDITION}
AAASTREAMER_CLIENT_LINKED=${AAASTREAMER_CLIENT_LINKED}
AAASTREAMER_LOCK_CLIENT_LINKED_SETTINGS=${AAASTREAMER_LOCK_CLIENT_LINKED_SETTINGS}
# DNS automation is intentionally provider-backed. Configure these only for domains you own.
AAASTREAMER_DNS_PROVIDER=
AAASTREAMER_DNS_API_URL=
AAASTREAMER_DNS_API_TOKEN=
AAASTREAMER_DNS_ZONE_ID=
AAASTREAMER_DNS_DEFAULT_TARGET=
AAASTREAMER_DNS_DEFAULT_NAMESERVERS=
EOF_ENV
}

write_systemd() {
  cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<EOF_SERVICE
[Unit]
Description=AAAStreamer API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}/api
EnvironmentFile=/etc/aaastreamer/aaastreamer.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${APP_DIR}/api/data ${DATA_DIR} ${MEDIA_DIR} ${UPLOAD_DIR} /tmp /var/tmp

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

write_nginx() {
  if [[ "$CREATE_NGINX" != "true" || -z "$DOMAIN" ]]; then
    return
  fi
  cat >"/etc/nginx/conf.d/${SERVICE_NAME}.conf" <<EOF_NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF_NGINX
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
  if [[ -n "$EMAIL" ]] && command -v certbot >/dev/null 2>&1; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" || true
  fi
}

install_packages
ensure_user
install_source
prepare_storage
write_env
write_systemd
write_nginx

echo "AAAStreamer installed."
echo "Service: systemctl status ${SERVICE_NAME}"
echo "Environment: /etc/aaastreamer/aaastreamer.env"
if [[ -n "$PUBLIC_URL" ]]; then
  echo "Open: ${PUBLIC_URL}"
fi
