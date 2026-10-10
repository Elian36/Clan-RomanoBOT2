#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BOT_SCRIPT="$PROJECT_DIR/scripts/start-or-restart.sh"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Este instalador solo se puede ejecutar en Linux." >&2
  exit 1
fi

if [[ ! -f "$BOT_SCRIPT" ]]; then
  echo "No se encontró el script de inicio: $BOT_SCRIPT" >&2
  exit 1
fi

if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP_DIR="$(xdg-user-dir DESKTOP)"
else
  DESKTOP_DIR=""
fi
DESKTOP_DIR="${DESKTOP_DIR:-$HOME/Desktop}"
mkdir -p "$DESKTOP_DIR"

escape_desktop_argument() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//%/%%}"
  printf '"%s"' "$value"
}

LAUNCHER="$DESKTOP_DIR/Clan Romano Bot.desktop"
TEMP_LAUNCHER="$(mktemp "$DESKTOP_DIR/.clan-romano-bot.XXXXXX")"
trap 'rm -f "$TEMP_LAUNCHER"' EXIT

{
  printf '[Desktop Entry]\n'
  printf 'Version=1.0\n'
  printf 'Type=Application\n'
  printf 'Name=Clan Romano Bot\n'
  printf 'Comment=Inicia o reinicia el bot de Minecraft\n'
  printf 'Terminal=true\n'
  printf 'Exec=/bin/bash %s\n' "$(escape_desktop_argument "$BOT_SCRIPT")"
  printf 'Path=%s\n' "$PROJECT_DIR"
  printf 'Categories=Utility;\n'
} >"$TEMP_LAUNCHER"

chmod 755 "$TEMP_LAUNCHER"
mv -f "$TEMP_LAUNCHER" "$LAUNCHER"
trap - EXIT

echo "Acceso directo creado: $LAUNCHER"
echo "Haz doble clic en 'Clan Romano Bot' para iniciar o reiniciar el servicio."
echo "Si Debian lo solicita, elige 'Permitir ejecutar' o 'Allow Launching'."
