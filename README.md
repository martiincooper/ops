# Aether Ops (`ops.aether.cl`)

Bitácora diaria (objetivos de la mañana → cierre de la tarde), ausencias (OOO), rendición de compras con
separación de IVA, racha y Say-Do, para **dos empresas en el mismo sitio** (Aether Tech y Datasheq), cada una
con su propia base de datos. Un solo contenedor: Next.js 15 (standalone) + SQLite (WAL).

- Revisión técnica de la especificación original y decisiones tomadas: [`docs/REVISION.md`](docs/REVISION.md) (en inglés)
- English version of this README: [`README.en.md`](README.en.md)

## Empresas y roles

| Quién | Email | Qué ve |
|---|---|---|
| **Equipo** | del dominio de su empresa | `/checkin` y `/mi-progreso` de su empresa |
| **Gerencia general** | del dominio de su empresa | `/exec` (tablero móvil) **solo de su empresa** |
| **Administradores** (jefatura intermedia) | **cualquier dominio** | `/admin` con **selector de empresa**, y `/exec` de cualquiera de las dos |

- El dominio del email decide la empresa y la base de datos: `@aether-tech.dev` → Aether Tech,
  `@datasheq.cl` → Datasheq (configurable con `EMPRESAS`). Un email de otro dominio solo puede ser administrador.
- El primer administrador es `ADMIN_EMAIL`. Desde `/admin` → **Administradores** se agregan otros, con el mismo
  tablero y los mismos permisos.
- **Supervisión**: al crear a un integrante se elige qué administradores lo supervisan (por defecto, quien lo
  crea). Puede ser compartida o exclusiva y se cambia en **Equipo**. Standup, capacidad y compras se filtran por
  «Mis supervisados» o «Todo el equipo».

## Contenido de esta versión

| Incluido | Próxima etapa |
|---|---|
| Ingreso con email + código de 6 dígitos (inicial `000000`, cambio obligatorio, bloqueo por intentos) | Editor de feriados (vienen cargados los de Chile 2026) |
| `/checkin`: objetivos de la mañana (2 a 4), cierre de la tarde, anillo Say-Do en vivo, racha | |
| Fuera de oficina: día completo / parcial, cancelar; lo postergado no cuenta en Say-Do | |
| Compras: factura / boleta / extranjero, validación de RUT, folio duplicado, foto o PDF | |
| `/mi-progreso`: racha, historial de 14 días, mis compras, cambio de código | |
| `/admin`: standup (bloqueos → Say-Do < 70% → ausentes), capacidad 14 días, validación de compras con vista del comprobante, equipo con supervisores, proyectos, administradores | |
| `/exec`: costo de prototipo por solución (componentes + flete vs presupuesto), recuperación de IVA, lead time, Say-Do global 14 días | |

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
(typecheck, lógica y las 38 pruebas extremo a extremo contra el contenedor) y publica la imagen para
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
2. Con el selector en **Aether Tech** y luego en **Datasheq**:
   - **Proyectos**: crea los proyectos activos (sin al menos uno, el equipo no puede registrar objetivos).
   - **Equipo**: agrega a cada persona (rol Equipo o Gerencia) y elige quién la supervisa.
3. **Administradores**: agrega a otros jefes si corresponde.
4. **Pide a cada persona que ingrese ese mismo día**: hasta que cambie el código inicial, cualquiera que conozca
   su email podría entrar con `000000`.
5. Antes de enero: agrega los feriados 2027 a la tabla `feriados` de cada empresa (formato en `lib/migraciones.ts`).

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

`scripts/backup.mjs` respalda **todas** las bases (`control.db` y una por empresa) con la API de respaldo en
caliente de SQLite, verifica cada copia con `integrity_check` y deja `respaldos/AAAAMMDD-HHMMSS/`. No copies los
`.db` con `cp` mientras la aplicación corre: sin el archivo `-wal` la copia puede quedar inconsistente.

Estructura de datos:

```
/data/control.db                         administradores y supervisión
/data/empresas/aether-tech/app.db        datos de Aether Tech
/data/empresas/aether-tech/comprobantes/ fotos y PDF de compras de Aether Tech
/data/empresas/datasheq/app.db           datos de Datasheq
/data/empresas/datasheq/comprobantes/
```

---

## 5. Configuración

| Variable | Por defecto | |
|---|---|---|
| `JWT_SECRET` | — | Obligatoria en producción, ≥ 32 caracteres |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` | — | Primer administrador (se crea si no hay ninguno); cualquier dominio |
| `EMPRESAS` | `aether-tech\|Aether Tech\|aether-tech.dev;datasheq\|Datasheq\|datasheq.cl` | Empresas: `clave\|Nombre\|dominios` separadas por `;` |
| `JORNADA` | `08:30-18:00` | Horario base para descontar ausencias parciales en la capacidad |
| `PIN_INICIAL` | `000000` | Código inicial de cuentas nuevas o reseteadas |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | Bases SQLite + comprobantes |
| `TZ_NEGOCIO` | `America/Santiago` | Define "hoy", el corte de las 19:30 y la racha |
| `COOKIE_SECURE` | `true` en producción | `false` solo para probar por http sin TLS |

`ADMIN_EMAIL` solo se usa cuando no hay administradores. Después se gestionan en `/admin` → **Administradores**.
No cambies la `clave` de una empresa con datos: es el nombre de su carpeta.

---

## 6. Pruebas

```bash
npm ci
npm run typecheck
npm run test:logica       # zona horaria, racha, Say-Do, esquema, empresas, capacidad, gerencia, RUT, códigos (20 pruebas)

# extremo a extremo contra un servidor con datos VACÍOS: dos empresas, aislamiento, supervisión, tableros (38 pruebas)
docker build -t aether-ops:test .
docker run -d --name aether-test -p 127.0.0.1:3100:3000 \
  -e JWT_SECRET=$(openssl rand -hex 32) -e ADMIN_EMAIL=admin@aether-tech.dev -e COOKIE_SECURE=false aether-ops:test
BASE=http://127.0.0.1:3100 ADMIN_EMAIL=admin@aether-tech.dev npm run test:e2e
docker rm -f aether-test
```

---

## 7. Estructura

```
app/                páginas (login, cambiar-pin, checkin, mi-progreso, admin, exec) y api/ (route handlers)
components/         componentes cliente (PinPad, Checkin, FormGasto, ModalOoo, Anillo)
components/admin/   tablero de jefatura (selector, standup, capacidad, compras, equipo, proyectos, administradores)
lib/empresas.ts     empresas y dominios
lib/db.ts           una conexión por base (control + una por empresa) + PRAGMA por conexión + migraciones
lib/migraciones.ts  esquemas de control y de empresa (versionados con PRAGMA user_version)
lib/metricas.ts     reglas de racha y Say-Do
lib/tableros.ts     cálculos de standup, capacidad, compras y gerencia
lib/supervision.ts  administradores ↔ integrantes supervisados
lib/tiempo.ts       fechas de negocio en America/Santiago
lib/auth.ts, jwt.ts, pin.ts, limites.ts   sesiones, hash de códigos, bloqueo por intentos
middleware.ts       enrutamiento de páginas por rol (las rutas /api se autentican solas)
scripts/            local.sh, backup.mjs, test-logica.ts, e2e.mjs
ci/                 flujo de GitHub Actions (desactivado hasta moverlo a .github/workflows/)
docs/               REVISION.md y capturas de pantalla
```
