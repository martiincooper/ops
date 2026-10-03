# Aether Ops (`ops.aether.cl`)

Jornadas por objetivos (comenzar con objetivos → terminar con el balance), días no disponibles, compras
por proyecto, racha, Say-Do y logros, para **dos empresas en el mismo sitio** (Aether Tech y Datasheq), cada
una con su propia base de datos. Pensado para un equipo que trabaja **por objetivos, sin horario**. Un solo contenedor: Next.js 15 (standalone) + SQLite (WAL).

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
  crea). Puede ser compartida o exclusiva y se cambia en **Equipo**. Standup, disponibilidad y compras se filtran por
  «Mis supervisados» o «Todo el equipo».

## La jornada del integrante (sin horario)

El equipo trabaja por objetivos (boleta de honorarios), así que la aplicación no impone horas:

1. **Comenzar jornada** (botón en `/checkin`, a cualquier hora y cualquier día): define de 2 a 4 objetivos,
   cada uno con uno o más proyectos. Queda registrada la hora de comienzo.
2. Mientras trabaja, toca cada objetivo cuando lo logra (confeti y +10 XP).
3. **Terminar jornada**: confirma lo logrado, explica lo pendiente y, si quiere, avisa un bloqueo.

- Una jornada por día. Si alguien olvida terminarla, **queda abierta** (también pasada la medianoche): al
  volver a la app se le pide terminarla antes de comenzar la siguiente.
- Nada se abre ni se exige por la hora. Fuera de una jornada, la persona ve su tablero: nivel y XP, racha,
  Say-Do 14 días, su semana, logros y compras.
- **Racha**: jornadas terminadas seguidas con al menos 75 % de sus objetivos logrados. Los días sin jornada
  no la cortan; una jornada terminada bajo 75 % la reinicia.
- **XP**: objetivo logrado +10, jornada terminada +5, jornada perfecta (100 %) +15. Ningún logro depende de
  la hora (no hay "puntual" ni "madrugador").
- **Días no disponibles** (ícono de calendario en la cabecera): días completos en que la persona no trabajará,
  para que la jefatura planifique. No afectan la racha. No se puede comenzar jornada un día marcado.

**Qué ve la jefatura**: en el standup, la última jornada de cada persona (en curso o terminada, con sus
objetivos y resultado), bloqueos y Say-Do, **sin horas de comienzo ni de término** y sin alertas por días sin
jornada. «Disponibilidad 14 días» muestra quién marcó días como no disponibles.

> Contexto: con boleta de honorarios, imponer horario, controlar asistencia o medir puntualidad son señales de
> subordinación que pueden usarse para calificar la relación como laboral. Por eso la aplicación no exige
> horas, no las muestra a la jefatura y no las usa en ninguna métrica. Esto no es asesoría legal: revisa el
> uso concreto con tu abogado o contador.

## Compras

Nombre, descripción (opcional), monto en pesos y **uno o más proyectos**. Si son varios, el monto se reparte en
partes iguales (los pesos que sobran van a los primeros). La jefatura aprueba o rechaza (con motivo) en
`/admin` → **Compras**; gerencia ve el gasto por proyecto frente a su presupuesto (las rechazadas no cuentan).

**Eliminar un proyecto** (`/admin` → **Proyectos**, papelera y confirmar) borra también los objetivos y
compras registrados solo para él; los compartidos con otros proyectos solo lo pierden y el monto se reparte de
nuevo entre los que quedan. No se puede deshacer: para un proyecto real que terminó, usa el estado
«entregado» en vez de eliminarlo.

## Contenido de esta versión

| Incluido | Próxima etapa |
|---|---|
| Ingreso con email + código de 6 dígitos (inicial `000000`, cambio obligatorio, bloqueo por intentos) | Editor de feriados (vienen cargados los de Chile 2026) |
| `/checkin`: comenzar / terminar jornada sin horario, tablero con progreso, nivel, logros y confeti | |
| Objetivos (2 a 4 por día) y compras con uno o más proyectos | |
| Días no disponibles (días completos) para la planificación | |
| `/mi-progreso`: racha, historial de 14 días, mis compras, cambio de código | |
| `/admin`: standup (bloqueos → Say-Do < 70% → no disponibles), disponibilidad 14 días, validación de compras, equipo con supervisores, proyectos (crear, editar, eliminar), administradores | |
| `/exec`: gasto por proyecto vs presupuesto, por validar, lead time, Say-Do global 14 días | |

---

## 0. Producción en Railway

El repositorio es [github.com/martiincooper/ops](https://github.com/martiincooper/ops) y Railway lo despliega con
el `Dockerfile` de la raíz (no hace falta `railway.json`). Cada push a `main` genera un despliegue nuevo.

1. **Proyecto**: en Railway, *New Project → Deploy from GitHub repo → martiincooper/ops*. Si el repositorio no
   aparece, dale acceso a la app de Railway en GitHub. Railway detecta el `Dockerfile`.
2. **Volumen (obligatorio)**: agrega un volumen al servicio montado en **`/data`**. Sin volumen, las bases
   SQLite se borran en cada despliegue (el registro lo avisa con `AVISO: no hay volumen en Railway`).
3. **Variables** del servicio:

   | Variable | Valor |
   |---|---|
   | `JWT_SECRET` | resultado de `openssl rand -hex 32` (guárdalo: si cambia, se cierran todas las sesiones) |
   | `ADMIN_EMAIL` | `martin@aether-tech.dev` |
   | `ADMIN_NOMBRE` | `Martin` |
   | `RAILWAY_RUN_UID` | `0` — el volumen de Railway pertenece a root; el contenedor ajusta los permisos de `/data` al arrancar y luego corre sin privilegios |
   | `PORT` | `3000` |
   | `PIN_INICIAL` | opcional pero recomendado: un código de 6 dígitos que no sea trivial, en vez de `000000` |

   No definas `COOKIE_SECURE=false`: Railway sirve todo por HTTPS.
4. **Healthcheck**: en la configuración del servicio, *Healthcheck Path* = `/api/health`.
5. **Dominio**: en *Networking*, genera un dominio `*.up.railway.app` (puerto 3000) para probar. Para
   `ops.aether.cl`, agrega un *Custom Domain* y crea en tu DNS los registros que Railway indique (un `CNAME`
   y, si lo pide, un `TXT` de verificación). El certificado lo emite Railway.
6. **Respaldos**: activa los respaldos programados del volumen en Railway (diarios o semanales).
7. **Primer ingreso**: apenas termine el primer despliegue, entra con `ADMIN_EMAIL` y el código inicial y crea
   tu código. Luego sigue la sección 3 (proyectos, equipo, administradores).

Tener en cuenta:

- Un solo servicio y una sola réplica (SQLite en un volumen; Railway no permite réplicas con volumen).
- Con volumen, cada despliegue tiene unos segundos sin servicio: Railway no monta el mismo volumen en dos
  despliegues a la vez.
- Los datos que probaste en tu computador (`./data`) no se suben: producción parte vacía.
- Si el registro dice `No se puede escribir en /data`, falta `RAILWAY_RUN_UID=0`.

---

## 1. Ejecutar con Docker (recomendado)

Requisitos: Docker 24+ (Docker Desktop en Mac/Windows, Docker Engine en Linux).

```bash
git clone https://github.com/martiincooper/ops.git
cd ops
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

Los datos (bases SQLite) quedan en el volumen de Docker `aether-data`, que
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
(typecheck, lógica y las 41 pruebas extremo a extremo contra el contenedor) y publica la imagen para
`amd64` y `arm64` en `ghcr.io`. Viene desactivado; para activarlo:

```bash
mkdir -p .github/workflows
git mv ci/github-actions.yml .github/workflows/ci.yml
git commit -m "Activar CI" && git push
```

Como el repositorio es privado, el servidor necesita iniciar sesión una vez con un token personal de GitHub
con permiso `read:packages`:

```bash
echo <TOKEN> | docker login ghcr.io -u martiincooper --password-stdin
docker pull ghcr.io/martiincooper/ops:latest
```

y en `docker-compose.yml` reemplaza `build: .` por `image: ghcr.io/martiincooper/ops:latest`.

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

## 4. Producción en un servidor propio (`ops.aether.cl` sin Railway)

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

**Nginx** — la línea marcada es obligatoria:

```nginx
server {
    server_name ops.aether.cl;
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
# /etc/cron.d/aether-ops — 02:30 todas las noches: copia consistente de SQLite (guarda 30) y copia a otro equipo
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
/data/empresas/datasheq/app.db           datos de Datasheq
/data/respaldos/                         copias de scripts/backup.mjs
```

### Actualizar desde la versión 0.3

Sin cambios de base de datos: actualiza y reinicia. Lo que cambia:

- Desaparecen las ventanas de 08:30 y 17:00; la jornada se comienza y termina con botones.
- La racha y la XP se recalculan con las reglas por objetivos (los cierres antiguos fuera de hora ahora cuentan).
- Las ausencias parciales antiguas dejan de mostrarse; las de día completo pasan a ser días no disponibles.
- Las variables `VENTANA_MANANA`, `VENTANA_TARDE` y `JORNADA` ya no se usan (puedes quitarlas del `.env`).

### Actualizar desde la versión 0.2

Basta con actualizar el código y reiniciar (`docker compose up -d --build` o `./scripts/local.sh`). Al arrancar,
cada base de empresa se migra sola:

- Compras: el monto pasa a ser el total pagado (ítem + envío + IVA). Tipo de documento, folio, RUT y envío
  quedan escritos en la descripción. Cada compra queda asociada a su proyecto de antes.
- Objetivos: cada objetivo queda asociado a su proyecto de antes.
- La carpeta `comprobantes/` de cada empresa ya no se usa. Respáldala si quieres conservar las fotos y luego
  bórrala.

Respalda antes de actualizar (`node scripts/backup.mjs` o `docker exec aether-ops node scripts/backup.mjs`).

---

## 5. Configuración

| Variable | Por defecto | |
|---|---|---|
| `JWT_SECRET` | — | Obligatoria en producción, ≥ 32 caracteres |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` | — | Primer administrador (se crea si no hay ninguno); cualquier dominio |
| `EMPRESAS` | `aether-tech\|Aether Tech\|aether-tech.dev;datasheq\|Datasheq\|datasheq.cl` | Empresas: `clave\|Nombre\|dominios` separadas por `;` |
| `PIN_INICIAL` | `000000` | Código inicial de cuentas nuevas o reseteadas |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | Bases SQLite |
| `TZ_NEGOCIO` | `America/Santiago` | Define qué fecha es "hoy" (una jornada por día) |
| `COOKIE_SECURE` | `true` en producción | `false` solo para probar por http sin TLS |

`ADMIN_EMAIL` solo se usa cuando no hay administradores. Después se gestionan en `/admin` → **Administradores**.
No cambies la `clave` de una empresa con datos: es el nombre de su carpeta.

---

## 6. Pruebas

```bash
npm ci
npm run typecheck
npm run test:logica       # zona horaria, racha por objetivos, Say-Do, XP, esquema y migración, disponibilidad, reparto, gerencia (23 pruebas)

# extremo a extremo contra un servidor con datos VACÍOS: dos empresas, aislamiento, supervisión,
# comenzar/terminar jornada, días no disponibles, varios proyectos, eliminar proyectos, tableros (41 pruebas)
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
components/         componentes cliente (PinPad, FormGasto, SelectorProyectos, ModalNoDisponible, Anillo)
components/equipo/  jornada del integrante (comenzar, terminar, tablero, confeti, logros)
components/admin/   tablero de jefatura (selector, standup, disponibilidad, compras, equipo, proyectos, administradores)
lib/empresas.ts     empresas y dominios
lib/db.ts           una conexión por base (control + una por empresa) + PRAGMA por conexión + migraciones
lib/migraciones.ts  esquemas de control y de empresa (versionados con PRAGMA user_version)
lib/metricas.ts     reglas de racha y Say-Do (por objetivos, sin horario)
lib/tableros.ts     cálculos de standup, disponibilidad, compras y gerencia
lib/supervision.ts  administradores ↔ integrantes supervisados
lib/tiempo.ts       fechas de negocio en America/Santiago
lib/reparto.ts      reparto del monto de una compra entre proyectos
lib/auth.ts, jwt.ts, pin.ts, limites.ts   sesiones, hash de códigos, bloqueo por intentos
middleware.ts       enrutamiento de páginas por rol (las rutas /api se autentican solas)
scripts/            local.sh, backup.mjs, test-logica.ts, e2e.mjs
ci/                 flujo de GitHub Actions (desactivado hasta moverlo a .github/workflows/)
docs/               REVISION.md y capturas de pantalla
```
