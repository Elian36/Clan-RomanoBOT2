#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="clan-romano-bot.service"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
SERVICE_FILE="$SERVICE_DIR/$SERVICE_NAME"
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Este script solo se puede ejecutar en Linux con systemd." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1 || ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "No se pudo conectar al administrador systemd del usuario. Inicia una sesión normal de Debian e inténtalo de nuevo." >&2
  exit 1
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js no está instalado o no está en PATH." >&2
  exit 1
fi

NODE_VERSION="$("$NODE_BIN" --version)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if (( NODE_MAJOR < 20 )); then
  echo "Se requiere Node.js 20 o superior; encontrado: $NODE_VERSION." >&2
  exit 1
fi

if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  echo "No existe $PROJECT_DIR/.env. Configura las credenciales antes de iniciar el bot." >&2
  exit 1
fi

if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
  echo "No existe node_modules. Ejecuta 'npm ci' dentro del proyecto primero." >&2
  exit 1
fi

mkdir -p "$SERVICE_DIR"
TEMP_SERVICE="$(mktemp "$SERVICE_DIR/$SERVICE_NAME.XXXXXX")"
trap 'rm -f "$TEMP_SERVICE"' EXIT

cat >"$TEMP_SERVICE" <<EOF
[Unit]
Description=Clan Romano Mineflayer bot
After=network-online.target

[Service]
Type=simple
WorkingDirectory="$PROJECT_DIR"
ExecStart="$NODE_BIN" bot.js
Restart=always
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=default.target
EOF

if ! cmp -s "$TEMP_SERVICE" "$SERVICE_FILE"; then
  mv "$TEMP_SERVICE" "$SERVICE_FILE"
  systemctl --user daemon-reload
fi
trap - EXIT

systemctl --user enable "$SERVICE_NAME"
if systemctl --user is-active --quiet "$SERVICE_NAME"; then
  systemctl --user restart "$SERVICE_NAME"
  ACTION="reiniciado"
else
  systemctl --user start "$SERVICE_NAME"
  ACTION="iniciado"
fi

echo "Bot $ACTION. Logs: journalctl --user -u $SERVICE_NAME -f"
systemctl --user --no-pager --full status "$SERVICE_NAME"
