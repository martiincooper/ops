# Aether Ops (`ops.aether.cl`)

Bitácora diaria (objetivos de la mañana → cierre de la tarde), ausencias (OOO), rendición de compras con
separación de IVA, racha y Say-Do. Un solo contenedor: Next.js 15 (standalone) + SQLite (WAL).

- Revisión técnica de la especificación original y decisiones tomadas: [`docs/REVISION.md`](docs/REVISION.md) (en inglés)
- English version of this README: [`README.en.md`](README.en.md)

## Contenido de esta versión

| Incluido | Próxima etapa |
|---|---|
| Ingreso con email + código de 6 dígitos (inicial `000000`, cambio obligatorio, bloqueo por intentos) | Vista `/exec` (gasto por solución, IVA recuperado, lead time, Say-Do global) |
| `/checkin`: objetivos de la mañana (2 a 4), cierre de la tarde, anillo Say-Do en vivo, racha | `/admin`: matriz de standup, capacidad 14 días, mesa de validación financiera |
| Fuera de oficina: día completo / parcial, cancelar; lo postergado no cuenta en Say-Do | Editor de feriados (vienen cargados los de Chile 2026) |
| Compras: factura / boleta / extranjero, validación de RUT, folio duplicado, foto o PDF | |
| `/mi-progreso`: racha, historial de 14 días, mis compras, cambio de código | |
| `/admin`: agregar/quitar personas, roles, resetear código, proyectos | |

---

## 1. Ejecutar con Docker (recomendado)

Requisitos: Docker 24+ (Docker Desktop en Mac/Windows, Docker Engine en Linux).

```bash
git clone https://github.com/<tu-usuario>/aether-ops.git
cd aether-ops
cp .env.example .env
```

Edita `.env`:

```bash
JWT_SECRET=<pega aquí el resultado de: openssl rand -hex 32>
ADMIN_EMAIL=martin@aether-tech.dev
ADMIN_NOMBRE=Martin
COOKIE_SECURE=false        # solo para probar en http://localhost; en producción (HTTPS) déjalo en true
```

Construye y levanta:

```bash
docker compose up -d --build
docker compose ps            # debe decir "healthy" después de ~20 s
```

Abre **http://localhost:3000** e ingresa con `ADMIN_EMAIL` y el código `000000`. Se te pedirá crear tu
propio código de 6 dígitos.

Comandos útiles:

```bash
docker compose logs -f                       # ver registros
docker compose restart                       # reiniciar
docker compose down                          # detener (los datos se conservan)
docker compose up -d --build                 # actualizar tras un git pull
docker exec aether-ops node scripts/backup.mjs   # respaldo manual de la base
```

Los datos (base `app.db` y carpeta `comprobantes/`) quedan en el volumen de Docker `aether-data`, que
sobrevive a `down`, reinicios y actualizaciones. En el servidor conviene una carpeta fija del anfitrión:

```bash
sudo mkdir -p /var/lib/aether-ops && sudo chown -R 1001:1001 /var/lib/aether-ops   # el contenedor corre como uid 1001
echo "AETHER_DATA=/var/lib/aether-ops" >> .env
docker compose up -d
```

### Sin docker compose

```bash
docker build -t aether-ops:latest .

sudo mkdir -p /var/lib/aether-ops && sudo chown -R 1001:1001 /var/lib/aether-ops

docker run -d --name aether-ops --restart always \
  -p 127.0.0.1:3000:3000 \
  -v /var/lib/aether-ops:/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_EMAIL=martin@aether-tech.dev \
  -e ADMIN_NOMBRE=Martin \
  aether-ops:latest
```

Guarda el `JWT_SECRET` que uses (por ejemplo en `.env`): si cambia, todas las sesiones se cierran.
El contenedor **no arranca** sin un `JWT_SECRET` de al menos 32 caracteres.

### Imagen ya construida (GitHub Container Registry, opcional)

`ci/github-actions.yml` es un flujo de GitHub Actions que, en cada push a `main`, ejecuta las pruebas
(typecheck, lógica y las 40 pruebas extremo a extremo contra el contenedor) y publica la imagen para
`amd64` y `arm64` en `ghcr.io`. Viene desactivado; para activarlo:

```bash
mkdir -p .github/workflows
git mv ci/github-actions.yml .github/workflows/ci.yml
git commit -m "Activar CI" && git push
```

Como el repositorio es privado, el servidor necesita iniciar sesión una vez con un token personal de GitHub
con permiso `read:packages`:

```bash
echo <TOKEN> | docker login ghcr.io -u <tu-usuario> --password-stdin
docker pull ghcr.io/<tu-usuario>/aether-ops:latest
```

y en `docker-compose.yml` reemplaza `build: .` por `image: ghcr.io/<tu-usuario>/aether-ops:latest`.

---

## 2. Ejecutar sin Docker (para probar en tu computador)

Requisito: Node.js 20 o superior.

```bash
ADMIN_EMAIL=martin@aether-tech.dev ./scripts/local.sh
```

La primera vez crea `.env.local` con un secreto aleatorio, instala dependencias y compila (2–3 min).
Luego queda en **http://localhost:3000**. Las siguientes veces basta con `./scripts/local.sh`.
Datos en `./data` (bórrala para empezar de cero). Detener con `Ctrl+C`.

---

## 3. Primer día

1. Ingresa con tu email y `000000`, crea tu código.
2. `/admin` → **Proyectos**: crea los proyectos activos (sin al menos uno, el equipo no puede registrar objetivos).
3. `/admin` → **Equipo**: agrega a cada persona. **Pídeles que ingresen ese mismo día**: hasta que cambien
   el código inicial, cualquiera que conozca su email podría entrar con `000000`.
4. Antes de enero: agrega los feriados 2027 a la tabla `feriados` (formato en `lib/migraciones.ts`).

---

## 4. Producción en `ops.aether.cl`

### DNS y proxy inverso (HTTPS)

DNS: registro `A`/`AAAA` (o `CNAME`) de `ops.aether.cl` apuntando al servidor. Los puertos no van en el DNS;
el proxy reenvía a `127.0.0.1:3000`. El contenedor solo escucha en loopback, así que el proxy es la única
entrada pública.

**Caddy** (certificado automático) — `/etc/caddy/Caddyfile`:

```caddy
ops.aether.cl {
    reverse_proxy 127.0.0.1:3000
}
```

**Nginx** — las dos líneas marcadas son obligatorias:

```nginx
server {
    server_name ops.aether.cl;
    client_max_body_size 15m;                 # obligatorio: el valor por defecto (1m) rechaza fotos de boletas (413)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;          # obligatorio: la verificación de origen compara Origin con Host
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # listen 443 ssl; ssl_certificate ... (certbot --nginx)
}
```

### Respaldos

```bash
# /etc/cron.d/aether-ops — 02:30 todas las noches: copia consistente de SQLite (guarda 30) + comprobantes a otro equipo
# (con AETHER_DATA=/var/lib/aether-ops)
30 2 * * * root docker exec aether-ops node scripts/backup.mjs && rsync -a /var/lib/aether-ops/ respaldo:/srv/aether-ops/
```

No copies `app.db` con `cp` mientras la aplicación corre: sin el archivo `-wal` la copia puede quedar
inconsistente. `scripts/backup.mjs` usa la API de respaldo en caliente de SQLite y verifica la copia con
`integrity_check`.

---

## 5. Configuración

| Variable | Por defecto | |
|---|---|---|
| `JWT_SECRET` | — | Obligatoria en producción, ≥ 32 caracteres |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` | — | Administrador que se crea en el primer arranque (si no hay usuarios) |
| `PIN_INICIAL` | `000000` | Código inicial de cuentas nuevas o reseteadas |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | Base SQLite + comprobantes |
| `TZ_NEGOCIO` | `America/Santiago` | Define "hoy", el corte de las 19:30 y la racha |
| `COOKIE_SECURE` | `true` en producción | `false` solo para probar por http sin TLS |

`ADMIN_EMAIL` solo se usa cuando la base está vacía. Para cambiar de administrador después, hazlo desde
`/admin` (asignar rol "Jefatura (admin)" a otra persona).

---

## 6. Pruebas

```bash
npm ci
npm run typecheck
npm run test:logica       # zona horaria, racha, Say-Do, restricciones del esquema, RUT, códigos (16 pruebas)

# extremo a extremo contra un servidor con base VACÍA (40 pruebas)
docker build -t aether-ops:test .
docker run -d --name aether-test -p 127.0.0.1:3100:3000 \
  -e JWT_SECRET=$(openssl rand -hex 32) -e ADMIN_EMAIL=admin@aether.cl -e COOKIE_SECURE=false aether-ops:test
BASE=http://127.0.0.1:3100 ADMIN_EMAIL=admin@aether.cl npm run test:e2e
docker rm -f aether-test
```

---

## 7. Estructura

```
app/                páginas (login, cambiar-pin, checkin, mi-progreso, admin, exec) y api/ (route handlers)
components/         componentes cliente (PinPad, Checkin, FormGasto, ModalOoo, AdminPanel, Anillo)
lib/db.ts           conexión única a SQLite + PRAGMA por conexión + migraciones
lib/migraciones.ts  esquema (versionado con PRAGMA user_version)
lib/metricas.ts     reglas de racha y Say-Do
lib/tiempo.ts       fechas de negocio en America/Santiago
lib/auth.ts, jwt.ts, pin.ts, limites.ts   sesiones, hash de códigos, bloqueo por intentos
middleware.ts       enrutamiento de páginas por rol (las rutas /api se autentican solas)
scripts/            local.sh, backup.mjs, test-logica.ts, e2e.mjs
ci/                 flujo de GitHub Actions (desactivado hasta moverlo a .github/workflows/)
docs/               REVISION.md y capturas de pantalla
```
