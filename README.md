# Aether Ops (`ops.aether.cl`)

Jornadas por objetivos (comenzar con objetivos → terminar con el balance), días no disponibles, compras
por proyecto y Say-Do, para **dos empresas en el mismo sitio** (Aether Tech y Datasheq), cada
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
  `@datasheq.com` → Datasheq (configurable con `EMPRESAS`). Un email de otro dominio solo puede ser administrador.
- El primer administrador es `ADMIN_EMAIL`. Desde `/admin` → **Administradores** se agregan otros, con el mismo
  tablero y los mismos permisos.
- **Desactivar, reactivar y eliminar** (Equipo y Administradores): desactivar quita el acceso y conserva todo;
  reactivar vuelve al código inicial. **Eliminar** es definitivo: si la persona tiene jornadas o compras, pasan al
  administrador que se elija (por defecto, quien la supervisa) y aparecen a su nombre con la marca «heredada», así
  los proyectos conservan su costo; sus días no disponibles se borran. Un administrador no puede desactivarse ni
  eliminarse a sí mismo y siempre queda al menos uno activo.
- **Supervisión**: al crear a un integrante se elige qué administradores lo supervisan (por defecto, quien lo
  crea). Puede ser compartida o exclusiva y se cambia en **Equipo**. Standup, disponibilidad y compras se filtran por
  «Mis supervisados» o «Todo el equipo».

## La jornada del integrante (sin horario)

El equipo trabaja por objetivos (boleta de honorarios), así que la aplicación no impone horas:

1. **Comenzar jornada** (botón en `/checkin`, un toque, a cualquier hora y cualquier día): marca el comienzo.
2. En el mismo tablero agrega sus objetivos (sin tope práctico, cada uno con uno o más proyectos), los edita o quita y
   toca cada uno cuando lo logra.
3. **Terminar jornada**: confirma lo logrado, explica lo pendiente y, si quiere, avisa un bloqueo (necesita al
   menos un objetivo).

Comenzar y terminar son eventos que le dan a la jefatura la información final antes del standup. Después de
terminar, todo sigue **editable hasta comenzar la próxima jornada**: agregar, editar, quitar o marcar objetivos,
el motivo de lo pendiente y el bloqueo (si el texto del bloqueo cambia, vuelve a quedar sin resolver).

- Una jornada por día. Si alguien olvida terminarla, **queda abierta** (también pasada la medianoche): al
  volver a la app se le pide terminarla antes de comenzar la siguiente.
- Nada se abre ni se exige por la hora. Fuera de una jornada, la persona ve su tablero: objetivos del día,
  % logrado, su semana y sus compras. En `/mi-progreso`: objetivos logrados en 14 días e historial.
- Sin gamificación: no hay racha, XP, niveles, logros ni confeti. Lo que se mide es el % de objetivos
  logrados (Say-Do), lo mismo que ve la jefatura.
- **Días no disponibles** (ícono de calendario en la cabecera): días completos en que la persona no trabajará,
  para que la jefatura planifique. No cuentan en el Say-Do. No se puede comenzar jornada un día marcado.

**Qué ve la jefatura**: en el standup, la última jornada de cada persona (en curso o terminada, con sus
objetivos y resultado), bloqueos y Say-Do, **sin horas de comienzo ni de término** y sin alertas por días sin
jornada. «Disponibilidad 14 días» muestra quién marcó días como no disponibles.

> Contexto: con boleta de honorarios, imponer horario, controlar asistencia o medir puntualidad son señales de
> subordinación que pueden usarse para calificar la relación como laboral. Por eso la aplicación no exige
> horas, no las muestra a la jefatura y no las usa en ninguna métrica. Esto no es asesoría legal: revisa el
> uso concreto con tu abogado o contador.

## Diseño

Tema claro lavanda e índigo, tarjetas redondeadas y tipografía Inter (incluida en la aplicación, sin
depender de Google Fonts). El equipo usa la app desde el celular (`/checkin`, `/mi-progreso`); jefatura tiene
una barra lateral en escritorio y pestañas en el celular; gerencia, un tablero que funciona en ambos. Los
estados siempre llevan ícono y texto, no solo color.

## Compras

Nombre, descripción (opcional), monto en **pesos chilenos (CLP, sin decimales)** y **uno o más proyectos**. El
interruptor **Agregar envío** permite indicar aparte el costo de despacho (también en CLP); la compra guarda el
total (compra + envío) y muestra el envío por separado («incl. envío $3.500»). Si son varios proyectos, el total,
envío incluido, se reparte en partes iguales (los pesos que sobran van a los primeros). La jefatura aprueba o rechaza (con motivo) en
`/admin` → **Compras**; gerencia ve el costo acumulado de cada proyecto frente a su estimación BOM (las
rechazadas no cuentan).

Cada compra tiene un **tipo de costo**: único / fijo, o recurrente **diario**, **mensual** o **anual** (el monto
registrado es el de un día, un mes o un año, según el tipo). Gerencia lo usa en el **Desglose de costos**.

Cada compra tiene también un **estado de pago**, aparte de la validación: **por enviar a pago** (se enviará a
procesar más adelante), **esperando pago** (ya enviada, falta pagarla) o **comprada** (ya pagada; es el valor por
defecto y el de las compras anteriores a este cambio). Lo elige quien registra la compra y lo mueve sobre todo la
propia persona: en `/checkin` → Compras → **Todas** (y en `/mi-progreso`) ve el historial completo de sus compras,
filtrable por estado de pago, cambia el estado de pago en la misma lista y edita todos los campos de cualquier compra
con **Editar**, aunque ya esté aprobada (la aprobación de la jefatura es solo una confirmación y se conserva). La
jefatura edita todos los campos de cualquier compra y cambia el pago en la columna **Pago** de `/admin` → **Compras**,
que además filtra por estado de pago.
Gerencia ve la sección **Estado de pago de las compras**: las tres listas con su cantidad y total (sin rechazadas).
El estado de pago no cambia el costo: todas las compras aprobadas y por validar suman, estén pagadas o no.

**Compras en dólares.** El monto, el envío y el impuesto tienen cada uno un selector **CLP / US$** (por defecto CLP;
en dólares, hasta 2 decimales). Al guardar, los montos en dólares se convierten a pesos con el **dólar del día**
(dólar observado del Banco Central vía mindicador.cl; si no responde, open.er-api.com) y se guardan en pesos junto
con el valor original en dólares y el dólar usado. No es dinámico: el monto en pesos no cambia con el dólar, salvo
que se vuelvan a editar los montos (entonces toda la compra se reconvierte con el dólar de ese día). Si no se puede
obtener el dólar, la compra en dólares no se guarda (se puede reintentar o ingresar en pesos). Los tres tableros
muestran siempre pesos; equipo y jefatura ven además una nota con los montos en US$ y el dólar usado.

## Vista de gerencia (`/exec`)

Tres focos, en este orden. Los proyectos **entregados no entran** en los indicadores: se listan al final.
Pensada para entenderse de un vistazo: cuatro números grandes arriba, barras de costo, el desglose de costos, una línea de tiempo por
proyecto (etapas reales sobre el plan hasta la entrega estimada, con la marca de «Hoy») y el pipeline en columnas.
Las definiciones quedan en «¿Cómo se calcula?», al final.

| # | Indicador | Meta | Alcance |
|---|---|---|---|
| 1 | **Costo acumulado vs estimación BOM**: compras aprobadas y por validar (envío incluido) de cada proyecto frente al costo estimado antes de comenzarlo | ≤ 100 %; hasta +10 % «en riesgo» (tolerancia editable) | proyectos no entregados; muestra lo agregado en 14 días vs los 14 anteriores |
| 2 | **Tiempo de concepto a cliente**: días desde el inicio del proyecto hasta la entrega, y cuántos en cada etapa | la **fecha estimada de entrega** que la jefatura registra al crear el proyecto (sin otra meta) | proyectos en desarrollo |
| 3 | **Pipeline de desarrollo**: proyectos por etapa (Concepto, Prototipado, Pruebas), cuántos días lleva cada uno en su etapa | aviso cuando una etapa tiene **más de 2 proyectos** | sin entregados ni pausados (los pausados se listan aparte) |

**Desglose de costos** (debajo de Costo vs BOM; cuarto número arriba, «costo total»): todas las compras aprobadas y
por validar de **todos** los proyectos, también entregados y en pausa.

- **Costo total**, separado en **único / fijo** (indigo) y **recurrente** (cian, siempre con el ícono ↻): lo ya
  pagado en compras de cada tipo, con su porcentaje.
- **Costo recurrente** vigente **por día, por mes o por año** (selector Día · Mes · Año; por defecto Mes; en la URL
  `?periodo=dia|mes|anio`). Cada costo se lleva a su equivalente: diario × 365 y mensual × 12 dan el anual; mes = año
  ÷ 12, día = año ÷ 365. Se muestra por tipo (diario, mensual, anual) con su monto en su propia unidad («$1.200 /
  día») y convertido al periodo elegido.
- **Por proyecto**: una barra por proyecto con la misma escala (largo = costo total, dividida en único y recurrente)
  y su costo recurrente vigente en el periodo elegido.
- **Costos recurrentes**: la lista, a un clic, con proyectos, último registro y cuántas veces se registró.
- Si el mismo costo recurrente (mismo nombre, sin distinguir mayúsculas ni tildes, y mismos proyectos) se registra
  varias veces —por ejemplo, el pago de cada mes—, para el costo por periodo cuenta **solo el registro más reciente**
  (el precio vigente); todos los pagos suman al costo total.

- El aviso del pipeline no es un tope ni bloquea nada: es un mensaje para gerencia («Pipeline cargado…
  sumar proyectos nuevos ahora retrasa la entrega de los que ya están en curso»). El umbral es fijo
  (`AVISO_PROYECTOS_POR_ETAPA` en `lib/etapas.ts`).
- **Proyectos entregados** (al final): cada uno se abre con sus propios indicadores — días reales de concepto a
  cliente con el desglose por etapa, entrega frente a su fecha estimada (a tiempo o días de atraso) y costo final
  frente a su estimación BOM.
- **Editar un proyecto**: en `/admin` → **Proyectos**, el botón **Editar** de cada fila cambia código, nombre,
  costo estimado BOM, inicio y entrega estimada. El inicio mueve también el comienzo de su primera etapa y no puede
  quedar después de la etapa siguiente ni de la entrega estimada; un código repetido se rechaza.
- **Historial de etapas**: cada cambio de estado en `/admin` → **Proyectos** queda registrado con la fecha del día
  (dos cambios el mismo día se corrigen entre sí). El botón **Etapas** de cada proyecto permite corregir esas fechas,
  por ejemplo la fecha real de entrega de un proyecto antiguo; la primera fecha es el inicio del proyecto.
- La única meta editable es la **tolerancia de costo** (`/exec`, solo administradores). Objetivos diarios y
  bloqueos ya no están en la vista de gerencia: siguen en el standup de la jefatura. La planificación detallada de
  hitos se gestiona en la carta Gantt.

**Eliminar un proyecto** (`/admin` → **Proyectos**, papelera y confirmar) borra también los objetivos y
compras registrados solo para él; los compartidos con otros proyectos solo lo pierden y el monto se reparte de
nuevo entre los que quedan. No se puede deshacer: para un proyecto real que terminó, usa el estado
«entregado» en vez de eliminarlo.

## Portal gerencial con asistente (`/gerencia`)

Chatbot para que la gerencia levante requerimientos sobre la plataforma DataSheq. Al terminar la entrevista, el
asistente clasifica el requerimiento, lo redacta y crea un **Issue en GitHub** con su ticket.

- **Solo `@datasheq.com`**: cualquier cuenta de ese dominio (equipo, gerencia o administración) entra a hacer sus
  entrevistas, sin necesitar permisos de administración. Cualquier otra cuenta (Gmail, Hotmail, otro dominio) ve
  «Acceso denegado: Este sistema es de uso exclusivo para personal de @datasheq.com», en la página y en la API. El
  ingreso directo es `/login?portal=gerencia` (rechaza otros dominios antes de pedir el código); gerencia de
  Datasheq tiene además un botón **Portal gerencial** en `/exec`.
- **Acceso Administrador**: botón en la barra superior del portal y de cada sala. Un administrador @datasheq.com va
  directo al panel (`/admin?vista=chat`); el resto cierra sesión y entra por `/login?portal=admin` con credenciales
  de administrador (si la cuenta no lo es, vuelve al portal con un aviso).
- **7 salas**, una por módulo: C-Legal (Cumplimiento Legal), C-Controla (Control Documental), C-Previene (Gestor
  Documental), C-Lidera (Programas de Liderazgo), C-Acredita (Gestión del personal), C-Capacita (Gestor del
  conocimiento) y C-Investiga (Reportabilidad e Incidentes). El asistente conoce el propósito de cada una
  (`lib/chat/modulos.ts`) y, si el tema corresponde a otra, lo dice y ofrece el botón para cambiar de sala.
- **Entrevista conversacional**: saludo personalizado, una pregunta a la vez, repreguntas amables si falta
  información y una barra de «% reunido» con lo que aún falta. Botones: **Pasar a la siguiente pregunta**, **Agregar
  más detalles**, **Finalizar y generar requerimiento** y **Finalizar conversación** (sin generar).
- **Una persona por sala**: al entrar, la sala queda reservada para esa persona; quien intente entrar ve «El módulo
  se encuentra en uso por otro usuario. Por favor intenta más tarde». Se libera al finalizar (con o sin
  requerimiento) o tras `CHAT_INACTIVIDAD_MIN` minutos sin actividad (por defecto 15; escribir cuenta como
  actividad). Volver a entrar retoma la conversación; entrar a otra sala libera la anterior.
- **Issue automático**: título `[GER-0001][C-Legal] …`, etiquetas del módulo (`C-Legal`), prioridad
  (`prioridad: alta`), tipo (`tipo: mejora`) y `gerencia` (se crean solas si no existen), y en el cuerpo el ticket,
  los datos de quien lo pidió, resumen, contexto, alcance, criterios de aceptación y la transcripción. Si GitHub no
  responde o falta `GITHUB_TOKEN`, el requerimiento queda guardado y se reenvía desde el panel.
- **Panel del administrador** (`/admin` → **Portal gerencial**, solo administradores @datasheq.com; el resto de
  `/admin` no cambia): estado de las 7 salas (quién la usa, desde cuándo,
  cuándo se libera, botón para liberarla), historial de conversaciones con ticket, prioridad, estado, transcripción y
  enlace directo al Issue (o **Reintentar** si quedó pendiente).
- **IA**: Claude (`CHAT_MODELO`, por defecto `claude-opus-5-5`) con `ANTHROPIC_API_KEY`. Sin clave (o con
  `CHAT_IA=off`) funciona con una entrevista guiada por temas, sin IA.
- **Límites de uso** (cada turno es una llamada a la IA): cada cuenta puede enviar hasta 10 turnos por minuto y
  generar hasta 3 requerimientos por minuto; si se pasa, ve «Vas muy rápido. Espera unos segundos y vuelve a
  intentar» sin perder lo escrito. Cada conversación admite hasta `CHAT_TURNOS_MAX` respuestas del asistente (por
  defecto 40): con la última, el asistente invita a generar el requerimiento y el chat solo permite finalizar. El panel
  muestra los tokens de IA del mes, en total y por módulo.

## Contenido de esta versión

| Incluido | Próxima etapa |
|---|---|
| Ingreso con email + código de 6 dígitos (inicial `000000`, cambio obligatorio, bloqueo por intentos) | Editor de feriados (vienen cargados los de Chile 2026) |
| `/checkin`: comenzar / terminar jornada (eventos, sin horario); objetivos editables en el tablero hasta la próxima jornada | |
| Cuentas: desactivar, reactivar y eliminar (los registros pasan a un administrador) | |
| Objetivos (2 a 4 por día) y compras con uno o más proyectos | |
| Días no disponibles (días completos) para la planificación | |
| `/mi-progreso`: objetivos logrados en 14 días, historial, mis compras, cambio de código | |
| `/admin`: standup (bloqueos → Say-Do < 70% → no disponibles), disponibilidad 14 días, validación de compras, equipo con supervisores, proyectos (crear, editar, eliminar), administradores | |
| `/exec`: costo vs estimación BOM, desglose de costos (total, único vs recurrente, recurrente por día/mes/año y por proyecto), tiempo de concepto a cliente, pipeline por etapa con aviso de carga, entregados con indicadores propios | |
| Historial de etapas de cada proyecto (corregible en Proyectos → Etapas) y edición de los datos del proyecto | |
| `/gerencia`: portal gerencial con asistente (7 salas, una persona por sala, solo @datasheq.com) que crea Issues en GitHub; panel en `/admin` | |

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
- El volumen de Railway pertenece a root: el contenedor inicia como root solo para dejar `/data` a nombre del
  usuario de la aplicación y luego corre sin privilegios. No hace falta `RAILWAY_RUN_UID` (si la agregaste, déjala en `0` o quítala).

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

`.github/workflows/ci.yml` es un flujo de GitHub Actions que, en cada pull request y en cada push a `main`,
ejecuta las pruebas (typecheck, lógica y las pruebas extremo a extremo contra el contenedor, incluido el portal
gerencial) y, en los push a `main`, publica la imagen para `amd64` y `arm64` en `ghcr.io`.

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
   - **Proyectos**: crea los proyectos activos con su fecha estimada de entrega y su costo estimado BOM (sin al
     menos un proyecto activo, el equipo no puede registrar objetivos). Para los que ya van avanzados, cambia el
     estado y corrige las fechas en **Etapas**; registra también los ya entregados para verlos en gerencia.
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

### Actualizar desde la versión 0.8

Migración automática: se agrega `usuarios.admin_id` (registros heredados al eliminar cuentas). Cambia la jornada:
comenzar es un toque y los objetivos se agregan y editan en el tablero, también después de terminar. El botón
«Quitar» del Equipo se reemplaza por **Desactivar** y **Eliminar**.

### Actualizar desde la versión 0.7

Se agrega la tabla `proyecto_etapas` (migración automática). Cada proyecto existente queda en «concepto» desde su
fecha de inicio y, si ya avanzó, en su estado actual desde el día de la actualización: revisa esas fechas en
`/admin` → **Proyectos** → **Etapas** (sobre todo la fecha real de los ya entregados). Las metas de objetivos
diarios y de bloqueos se dejan de usar (quedan guardadas, sin efecto).

### Actualizar desde la versión 0.6

Se agrega la columna `envio_clp` a las compras (migración automática al arrancar; las compras existentes quedan
sin envío). Los totales, el costo por proyecto y los indicadores no cambian.

### Actualizar desde la versión 0.5

Sin cambios de base de datos: actualiza y reinicia. Cambia el diseño completo (tema claro) y se eliminan la
racha, la XP, los niveles, los logros y el confeti. Las funciones y reglas de jornada, compras, standup y
gerencia son las mismas. Nueva dependencia: `@fontsource-variable/inter` (`npm ci` la instala; con Docker no
hay que hacer nada).

### Actualizar desde la versión 0.4

Se agrega la tabla `metas` (migración automática al arrancar). En `/admin` → **Proyectos** la columna
«Presupuesto» pasa a llamarse «Costo estimado BOM» (mismo dato).

### Actualizar desde la versión 0.3

Sin cambios de base de datos: actualiza y reinicia. Lo que cambia:

- Desaparecen las ventanas de 08:30 y 17:00; la jornada se comienza y termina con botones.
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

Para usar un respaldo (por ejemplo, el de producción) en tu computador: copia la carpeta `AAAAMMDD-HHMMSS` del
respaldo, detén el servidor y ejecuta `npm run restaurar -- <carpeta>`. Valida las bases antes de tocar nada, mueve
los datos actuales a `data-anterior-<fecha>/` y deja el respaldo en `./data`. Las cuentas conservan sus códigos de
producción.

---

## 5. Configuración

| Variable | Por defecto | |
|---|---|---|
| `JWT_SECRET` | — | Obligatoria en producción, ≥ 32 caracteres |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` | — | Primer administrador (se crea si no hay ninguno); cualquier dominio |
| `EMPRESAS` | `aether-tech\|Aether Tech\|aether-tech.dev;datasheq\|Datasheq\|datasheq.com` | Empresas: `clave\|Nombre\|dominios` separadas por `;` |
| `PIN_INICIAL` | `000000` | Código inicial de cuentas nuevas o reseteadas |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | Bases SQLite |
| `TZ_NEGOCIO` | `America/Santiago` | Define qué fecha es "hoy" (una jornada por día) |
| `COOKIE_SECURE` | `true` en producción | `false` solo para probar por http sin TLS |
| `TIPO_CAMBIO_USD` | — (dólar observado del día) | Fija el dólar para las compras en US$ (pruebas o sin salida a internet) |
| `ANTHROPIC_API_KEY` | — (entrevista guiada sin IA) | Asistente del portal gerencial con Claude |
| `CHAT_MODELO` | `claude-opus-5-5` | Modelo de Claude del asistente |
| `CHAT_IA` | — | `off` fuerza la entrevista guiada aunque haya clave |
| `CHAT_INACTIVIDAD_MIN` | `15` | Minutos sin actividad tras los que una sala se libera |
| `CHAT_TURNOS_MAX` | `40` | Respuestas del asistente por conversación (tope de uso de la IA) |
| `GITHUB_TOKEN` | — (Issues quedan pendientes) | Token con permiso «Issues: write» sobre el repositorio de los Issues |
| `GITHUB_REPO` | `martiincooper/ops` | Repositorio donde se crean los Issues de los requerimientos |

`ADMIN_EMAIL` solo se usa cuando no hay administradores. Después se gestionan en `/admin` → **Administradores**.
No cambies la `clave` de una empresa con datos: es el nombre de su carpeta.

---

## 6. Pruebas

```bash
npm ci
npm run typecheck
npm run test:logica       # zona horaria, Say-Do, esquema y migraciones, envío, etapas, pipeline, objetivos editables, eliminar cuentas, gerencia, desglose de costos, estado de pago, compras en dólares, portal gerencial (salas, inactividad, cierre de sesión, tickets, límites de uso, consumo, entrevista guiada) (62 pruebas)

# extremo a extremo contra un servidor con datos VACÍOS: dos empresas, aislamiento, supervisión,
# comenzar/terminar jornada, días no disponibles, varios proyectos, objetivos editables, etapas, pipeline, editar y eliminar proyectos, desactivar y eliminar cuentas, tableros, desglose de costos, estado de pago, historial de compras del equipo, compras en dólares, portal gerencial (68 pruebas)
docker build -t aether-ops:test .
docker run -d --name aether-test -p 127.0.0.1:3100:3000 \
  -e JWT_SECRET=$(openssl rand -hex 32) -e ADMIN_EMAIL=admin@aether-tech.dev -e COOKIE_SECURE=false -e TIPO_CAMBIO_USD=950 aether-ops:test
BASE=http://127.0.0.1:3100 ADMIN_EMAIL=admin@aether-tech.dev npm run test:e2e
docker rm -f aether-test
```

---

## 7. Estructura

```
app/globals.css     sistema de diseño (colores, tarjetas, botones)
app/                páginas (login, cambiar-pin, checkin, mi-progreso, admin, exec) y api/ (route handlers)
components/         componentes cliente (PinPad, FormGasto, SelectorProyectos, ModalNoDisponible, Anillo, ui)
components/equipo/  jornada del integrante (comenzar, terminar, tablero)
components/admin/   tablero de jefatura (selector, standup, disponibilidad, compras, equipo, proyectos, administradores, portal gerencial)
components/gerencia/ portal gerencial: salas, chat con el asistente, acceso denegado
lib/chat/           portal gerencial: módulos, bloqueo de salas, entrevista (Claude o guiada), Issues de GitHub
lib/empresas.ts     empresas y dominios
lib/db.ts           una conexión por base (control + una por empresa) + PRAGMA por conexión + migraciones
lib/migraciones.ts  esquemas de control y de empresa (versionados con PRAGMA user_version)
lib/metricas.ts     Say-Do e historial (por objetivos, sin horario)
lib/tableros.ts     cálculos de standup, disponibilidad, compras e indicadores de gerencia
lib/metas.ts        tolerancia de costo de gerencia (por empresa)
lib/etapas.ts       historial de etapas de cada proyecto y umbral del aviso del pipeline
lib/objetivos.ts    objetivos de la jornada editable (agregar, editar, quitar, bloqueo)
lib/registros.ts    eliminar cuentas y traspasar sus registros a un administrador
lib/supervision.ts  administradores ↔ integrantes supervisados
lib/tiempo.ts       fechas de negocio en America/Santiago
lib/reparto.ts      reparto del monto de una compra entre proyectos
lib/auth.ts, jwt.ts, pin.ts, limites.ts   sesiones, hash de códigos, bloqueo por intentos
middleware.ts       enrutamiento de páginas por rol (las rutas /api se autentican solas)
scripts/            local.sh, backup.mjs, test-logica.ts, e2e.mjs
.github/workflows/  CI: pruebas y extremo a extremo en cada pull request; imagen en ghcr.io desde main
docs/               REVISION.md y capturas de pantalla
```
