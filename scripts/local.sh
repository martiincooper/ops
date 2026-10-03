#!/usr/bin/env bash
# Ejecuta Aether Ops en este computador SIN Docker (macOS o Linux), en http://localhost:3000.
# Uso:  ADMIN_EMAIL=tu@correo ./scripts/local.sh        (la primera vez)
#       ./scripts/local.sh                              (siguientes veces: usa .env.local)
# Datos en ./data (bases SQLite). Borra esa carpeta para empezar de cero.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js 20 o superior: https://nodejs.org (o 'brew install node@22')." >&2
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Se requiere Node 20 o superior (instalado: $(node -v))." >&2
  exit 1
fi

# Configuración local (no se versiona: .env.local está en .gitignore)
if [ ! -f .env.local ]; then
  : "${ADMIN_EMAIL:?Define ADMIN_EMAIL la primera vez, ej: ADMIN_EMAIL=tu@correo ./scripts/local.sh}"
  {
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "ADMIN_EMAIL=${ADMIN_EMAIL}"
    echo "ADMIN_NOMBRE=${ADMIN_NOMBRE:-Administrador}"
    echo "COOKIE_SECURE=false"
  } > .env.local
  echo "Creado .env.local (administrador: ${ADMIN_EMAIL})"
fi
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  npm ci --no-audit --no-fund
fi
npm run build

# El servidor standalone necesita los estáticos junto a él
cp -R public .next/standalone/
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static

export DATA_DIR="$(pwd)/data" PORT="${PORT:-3000}" HOSTNAME=127.0.0.1 NODE_ENV=production
echo
echo "  Aether Ops listo en  http://localhost:${PORT}"
echo "  Administrador: ${ADMIN_EMAIL}  ·  código inicial: ${PIN_INICIAL:-000000} (se pide cambiarlo)"
echo "  Detener: Ctrl+C"
echo
exec node .next/standalone/server.js
