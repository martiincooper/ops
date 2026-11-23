#!/usr/bin/env bash
# Verificación completa sin Docker: tipos, pruebas de lógica, build y pruebas de extremo a extremo contra el servidor
# standalone con datos vacíos. Es el `ci` que ejecuta la flota (implement-all-cloud) en cada PR y en main.
# Uso: bash scripts/ci.sh            (PORT elige el puerto del servidor de prueba; por defecto 3100)
set -euo pipefail
cd "$(dirname "$0")/.."

npm run typecheck
npm run test:logica
npm run build

cp -R public .next/standalone/
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static

PUERTO="${PORT:-3100}"
DATOS="$(mktemp -d)"
REGISTRO="$DATOS/servidor.log"
ADMIN=admin@aether-tech.dev

# GitHub simulado (sin token real): el servidor lo usa con GITHUB_API_URL para verificar los repositorios de las salas
node scripts/github-falso.mjs "$DATOS/puerto-github" >"$DATOS/github.log" 2>&1 &
PID_GITHUB=$!
# Asiento de entrevista simulado (sin Claude real): el servidor lo usa con INTERVIEW_URL e INTERVIEW_TOKEN
TOKEN_ASIENTO=token-asiento-falso
INTERVIEW_TOKEN="$TOKEN_ASIENTO" node scripts/asiento-falso.mjs "$DATOS/puerto-asiento" >"$DATOS/asiento.log" 2>&1 &
PID_ASIENTO=$!
trap 'kill "$PID_GITHUB" "$PID_ASIENTO" 2>/dev/null || true; rm -rf "$DATOS"' EXIT
for _ in $(seq 1 30); do [ -s "$DATOS/puerto-github" ] && [ -s "$DATOS/puerto-asiento" ] && break; sleep 0.2; done
[ -s "$DATOS/puerto-github" ] || { cat "$DATOS/github.log"; exit 1; }
[ -s "$DATOS/puerto-asiento" ] || { cat "$DATOS/asiento.log"; exit 1; }
GITHUB_FALSO="http://127.0.0.1:$(cat "$DATOS/puerto-github")"
ASIENTO_FALSO="http://127.0.0.1:$(cat "$DATOS/puerto-asiento")"

env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production PORT="$PUERTO" HOSTNAME=127.0.0.1 DATA_DIR="$DATOS" \
  ADMIN_EMAIL="$ADMIN" JWT_SECRET="$(openssl rand -hex 32)" COOKIE_SECURE=false TIPO_CAMBIO_USD=950 GITHUB_TOKEN=token-falso GITHUB_API_URL="$GITHUB_FALSO" \
  INTERVIEW_URL="$ASIENTO_FALSO" INTERVIEW_TOKEN="$TOKEN_ASIENTO" \
  node .next/standalone/server.js >"$REGISTRO" 2>&1 &
PID=$!
trap 'kill "$PID" "$PID_GITHUB" "$PID_ASIENTO" 2>/dev/null || true; rm -rf "$DATOS"' EXIT

for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PUERTO/api/health" >/dev/null && break
  kill -0 "$PID" 2>/dev/null || { cat "$REGISTRO"; exit 1; }
  sleep 1
done
curl -sf "http://127.0.0.1:$PUERTO/api/health" >/dev/null || { echo "El servidor no respondió en el puerto $PUERTO"; cat "$REGISTRO"; exit 1; }

DATA_DIR="$DATOS" ASIENTO="$ASIENTO_FALSO" BASE="http://127.0.0.1:$PUERTO" ADMIN_EMAIL="$ADMIN" node scripts/e2e.mjs || { echo "--- registro del servidor"; tail -50 "$REGISTRO"; exit 1; }
