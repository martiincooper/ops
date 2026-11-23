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

env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production PORT="$PUERTO" HOSTNAME=127.0.0.1 DATA_DIR="$DATOS" \
  ADMIN_EMAIL="$ADMIN" JWT_SECRET="$(openssl rand -hex 32)" COOKIE_SECURE=false TIPO_CAMBIO_USD=950 GITHUB_TOKEN= \
  node .next/standalone/server.js >"$REGISTRO" 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true; rm -rf "$DATOS"' EXIT

for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PUERTO/api/health" >/dev/null && break
  kill -0 "$PID" 2>/dev/null || { cat "$REGISTRO"; exit 1; }
  sleep 1
done
curl -sf "http://127.0.0.1:$PUERTO/api/health" >/dev/null || { echo "El servidor no respondió en el puerto $PUERTO"; cat "$REGISTRO"; exit 1; }

DATA_DIR="$DATOS" BASE="http://127.0.0.1:$PUERTO" ADMIN_EMAIL="$ADMIN" node scripts/e2e.mjs || { echo "--- registro del servidor"; tail -50 "$REGISTRO"; exit 1; }
