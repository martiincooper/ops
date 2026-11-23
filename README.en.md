# Aether Ops (`ops.aether.cl`) — English

Goal-based work sessions ("jornadas": start with objectives → finish with results), unavailable days, purchases
per project and Say-Do, for two companies on one site. Built for a team that works by
goals with no fixed hours (freelancers on boleta de honorarios). Single container: Next.js 15 standalone + SQLite (WAL). UI in Spanish.

The Spanish [`README.md`](README.md) is the maintained one; this file is a summary.
Design decisions and spec review: [`docs/REVISION.md`](docs/REVISION.md).

## Two companies, one site

- The login email's domain picks the company and its database: `@aether-tech.dev` → Aether Tech,
  `@datasheq.com` → Datasheq (env `EMPRESAS`). Team and executive accounts only ever see their own company.
- Admins (middle management) live in `control.db`, can have any email domain, and switch companies with a
  selector in `/admin` (standup, 14-day capacity, purchase validation, team with supervisors, projects, admins)
  and `/exec`. The first admin is `ADMIN_EMAIL`; admins add other admins.
- Accounts can be deactivated (no access, data kept), reactivated, or deleted permanently. Deleting a team member
  with jornadas or purchases moves those records to an admin (default: their supervisor), shown as "heredada",
  so project costs are unchanged. Admins cannot deactivate/delete themselves; at least one stays active.
- Supervision is many-to-many (admin ↔ team member, per company), set when creating an account and editable later.
- Data: `/data/control.db` and `/data/empresas/<clave>/app.db`.

## Team member's jornada (no schedule)

- **Comenzar jornada** (button, one tap, any time, any day) marks the start. Objectives (no practical limit, each with one
  or more projects) are added, edited, removed and ticked on the dashboard. **Terminar jornada**: results, reasons
  for pending items, optional blocker (needs at least one objective).
- Start and finish are events that give admins the final picture before the standup. After finishing, everything
  (objectives, done/pending, reasons, blocker) stays editable until the next jornada starts.
- One jornada per day. A forgotten one stays open (also past midnight) and must be finished before starting
  the next. Nothing is opened or required by the clock.
- No gamification (no streak, XP, levels, achievements or confetti). The one measure is the share of
  objectives achieved (Say-Do), the same number admins see. No time-based metrics.
- Unavailable days (whole days) for planning; they don't count toward Say-Do.
- Admins see each person's latest jornada (objectives and results), blockers and Say-Do — never start/finish
  times, and no alerts for days without work. Rationale: with boleta de honorarios, fixed hours, attendance
  control or punctuality metrics are indicators of an employment relationship (not legal advice).

Objectives and purchases can belong to **one or more projects**. A purchase is name, optional description,
amount in Chilean pesos (CLP, no decimals), an optional shipping cost (CLP, behind an "Agregar envío" toggle) and
projects. The total (purchase + shipping) is stored and the shipping part shown separately; with several projects
the total, shipping included, is split equally (leftover pesos go to the first ones).
Each purchase also has a **payment status**, separate from validation: "por enviar a pago" (to be sent for payment
processing later), "esperando pago" (sent, awaiting payment) or "comprada" (already paid; the default, and what
existing purchases get — `gastos.estado_pago`, automatic migration). It is set when registering and moved mainly by the
teammate: `/checkin` → Compras → **Todas** (and `/mi-progreso`) lists their full purchase history, filterable by
payment status, with the status changeable inline and every field editable via **Editar** even after approval (admin
approval is just a confirmation and is kept). Admins edit every field of any purchase and change the status from the
**Pago** column in `/admin` → Compras, which also filters by it. The executive
view lists the three groups with count and total ("Estado de pago de las compras", rejected excluded). Payment
status does not change any cost figure.
Purchase, shipping and tax amounts each have a **CLP / US$** switch (CLP by default; USD allows cents). On save, USD
amounts are converted to pesos at the **day's dollar rate** (Banco Central "dólar observado" via mindicador.cl,
falling back to open.er-api.com) and stored in CLP alongside the original USD values and the rate used. Not dynamic:
the CLP amount only changes when the amounts are edited again (the whole purchase is then reconverted at that day's
rate). If no rate is available the USD purchase is not saved. All three dashboards always show CLP; team and admin
lists add a note with the USD values and rate. `TIPO_CAMBIO_USD` pins the rate (tests, offline servers).

Editing a project (`/admin` → Proyectos → Editar) changes code, name, BOM estimate, start and estimated delivery
dates; the start date also moves the first stage and cannot pass the next stage or the delivery date.
Deleting a project (`/admin` → Proyectos) also deletes objectives and purchases that belong only to it; shared
ones just lose it and the purchase amount is re-split. Irreversible.

## Design

Light lavender + indigo theme, rounded cards, Inter typeface (self-hosted via `@fontsource-variable/inter`, no
Google Fonts). Team screens are phone-first; admin has a desktop sidebar and tabs on phones; the executive view
works on both. Status is always icon + text, never color alone.

## Deploy on Railway

Repo: [github.com/martiincooper/ops](https://github.com/martiincooper/ops). Railway builds the root `Dockerfile`
(no `railway.json`; the Dockerfile has no `VOLUME` instruction, which Railway rejects).

1. New Project → Deploy from GitHub repo → `martiincooper/ops`.
2. Attach a volume mounted at **`/data`** (required — without it the SQLite files are wiped on every deploy).
3. Variables: `JWT_SECRET` (`openssl rand -hex 32`), `ADMIN_EMAIL=martin@aether-tech.dev`, `ADMIN_NOMBRE`,
   `PORT=3000`, optionally a non-trivial `PIN_INICIAL`. Railway volumes are root-owned: the container starts as
   root only to chown `/data`, then `scripts/arranque.cjs` drops to uid 1001 before loading the server
   (no `RAILWAY_RUN_UID` needed).
4. Healthcheck path `/api/health`; generate a domain on port 3000 or add `ops.aether.cl` as a custom domain.
5. Enable scheduled volume backups. One replica only; a few seconds of downtime per deploy (volume).

## Executive view (`/exec`)

Three focus areas; **delivered projects are excluded** from them and listed at the bottom. Built to be read at a
glance: four big numbers, cost bars, the cost breakdown, a per-project timeline (actual stages over the plan to the estimated delivery,
with a "Hoy" marker) and the pipeline as columns; definitions sit in a collapsed "¿Cómo se calcula?".
1) **Accumulated cost vs BOM estimate** (target ≤ 100 %, up to +10 % = at risk; the tolerance is the only editable
target), projects not yet delivered. 2) **Concept-to-customer time**: days from project start to delivery and per
stage, measured against the **estimated delivery date** entered when the project is created (no other target).
3) **Development pipeline** by stage (Concepto, Prototipado, Pruebas) with days in the current stage; when a stage
holds **more than 2 projects** a Spanish warning tells management that adding projects now delays the ones in
progress (a deterrent, not a cap; threshold `AVISO_PROYECTOS_POR_ETAPA` in `lib/etapas.ts`). Each delivered
project expands to its own KPIs: real concept-to-customer days by stage, delivery vs its estimated date, final cost
vs its BOM estimate.

**Cost breakdown** ("Desglose de costos", below Costo vs BOM, plus a fourth headline number, total cost): every
approved and pending purchase of **all** projects, delivered and paused included. Total cost split into one-off
(indigo) and recurring (cyan, always with the ↻ icon); the current recurring cost **per day, month or year**
(Día · Mes · Año switch, default month, `?periodo=dia|mes|anio`): daily × 365 and monthly × 12 give the yearly
amount, month = year ÷ 12, day = year ÷ 365, shown per cost type in its own unit ("$1.200 / día") and converted to
the chosen period; one bar per project on a common scale (total cost, split one-off / recurring) with its recurring
cost for the period; and the collapsible list of recurring costs. When the same recurring cost (same name, ignoring
case and accents, and same projects) is logged more than once — e.g. every monthly payment — only the most recent
entry counts for the per-period figure; every payment still adds to the total. Each purchase's cost type (one-off, or
recurring daily / monthly / yearly; the amount is for one day, month or year) is set when it is registered.

Stage changes are recorded with the day's date (`proyecto_etapas`, schema v5) and can be
corrected in `/admin` → Proyectos → Etapas. Daily objectives and blockers left the executive view (still in the
admin standup).

## Executive portal with assistant (`/gerencia`)

A chatbot where management raises requirements about the DataSheq platform. At the end of the interview the
assistant classifies the requirement, writes it up and creates a **GitHub Issue** with a ticket number.

Screenshots: [sign-in](docs/capturas/v09-21-portal-ingreso.png) ·
[rooms and my requirements](docs/capturas/v09-22-portal-salas.png) ·
[conversation](docs/capturas/v09-23-portal-sala-conversacion.png) ·
[conversation on a phone](docs/capturas/v09-24-portal-sala-movil.png) ·
[room in use](docs/capturas/v09-25-portal-sala-ocupada.png) ·
[access denied](docs/capturas/v09-26-portal-acceso-denegado.png) ·
[requirement generated](docs/capturas/v09-27-portal-requerimiento-generado.png) ·
[admin panel](docs/capturas/v09-28-admin-portal-gerencial.png)

- **Datasheq executives and admins only**: executives (`executive`) of the Datasheq company and any admin (any
  email domain) get in. Any other account (team, executives of other companies) gets 403 and "El portal gerencial es
  solo para gerencia de Datasheq" on the page and the API. Direct sign-in: `/login?portal=gerencia`; Datasheq
  executives also get a **Portal gerencial** button in `/exec`.
- **Acceso Administrador**: a button in the portal and room headers. An admin goes straight to the
  panel (`/admin?vista=chat`); anyone else is signed out and sent to `/login?portal=admin` (non-admin accounts land
  back in the portal with a notice).
- **Admin-managed rooms** (`lib/chat/catalogo.ts`, table `chat_modulos`): admins manage them in `/admin?vista=chat`
  → **Salas** (name, area, description, hex colour, order and autonomy `revisar` / `automático`, which has no effect
  yet). The key is the slug of the name at creation and can never be edited. Rooms are never deleted: they are
  **archived** (hidden from the portal, listed under "Archivadas" with their history kept) and can be restored. There
  are no hard-coded rooms.
- **"Próximamente" rooms**: the portal shows managers the active rooms in order; rooms without a verified repository
  are grey, "Próximamente", and cannot be opened (404). Linking a repository comes in the next ticket. Each Issue
  stores the repository it was created in.
- **Every room is a shared group chat** (text only for now; no assistant, photos or "Terminar"): opening it shows
  the full history of all its requests, each message with author and time, your own on the right. Sending stores the
  message and returns at once; if the room has no open request the message opens one (numbered `GER-000n`), and the
  sender becomes a participant. Any number of executives can be in a room at the same time: **no room lock, no "en
  uso", no heartbeat and no inactivity expiry**; a request stays open with no timeout. Clients poll every 2.5 seconds
  for messages newer than the last seen id (`GET /api/chat/salas/<room>?desde=<id>`). Data in `control.db`:
  `chat_solicitudes` (at most one open per room), `chat_mensajes`, `chat_participantes` and `chat_modulos` (empty;
  the admin-managed rooms ticket will use it).
- **Automatic Issue**: title `[GER-0001][C-Legal] …`, labels for the module (`C-Legal`), `gerencia` and `ready-for-human` (created if
  missing), and a body with the ticket, participants, summary and conversation. Nothing triggers it yet (the
  assistant and "Terminar" come in later tickets): delivery and its retries are ready for finished requests.
- **Automatic retries**: on a transient GitHub failure (network, timeout, 5xx or rate limit) the request is retried up
  to 3 times right away (honoring `Retry-After`); if it still fails, the server retries it on its own after 1, 2, 5,
  15, 30 and 60 minutes, and the panel shows when the next attempt is due. Before each retry it looks for an existing
  Issue with the same ticket so nothing is duplicated, and a requirement is never sent twice at the same time.
  Permanent errors (missing `GITHUB_TOKEN`, token without permission, unknown repository) are not retried
  automatically: the requirement is stored and can be resent from the panel with **Reintentar**.
- **DataSHEQ credentials**: Issues are created with the token of DataSHEQ's GitHub account (`GITHUB_CUENTA`,
  default `datasheq-creator`). Before sending, the token's owner is checked (`GET /user`); a token from another
  account is rejected (permanent error, no retries).
- **Requirement tracking**: each Issue's state is fetched from GitHub (Issues labeled `gerencia`) at most every
  10 minutes when the panel or the portal is opened; **Actualizar** in the panel forces it (at most once a minute).
  States: Pendiente de envío, Abierto, En curso (has an assignee), Cerrado and Descartado (closed as not planned).
  **Mis requerimientos** in the portal shows each person only their own (the Issue link only to admins, since others
  may not have access to the repository). If GitHub does not respond, the last known state is shown with its date.
- **Usage limit** (protects the server): 30 messages per account per minute ("Vas muy rápido…", nothing typed is
  lost).
- **Admin panel** (`/admin` → Portal gerencial, any admin; the rest of `/admin` is unchanged): the
  7 rooms with their repository and whether a request is open, request history with ticket, participants, state,
  GitHub state (column and filter), transcript and Issue link (or **Reintentar**).
- Data lives in `control.db` (`chat_solicitudes`, `chat_mensajes`, `chat_participantes`, `chat_modulos`; automatic migrations; v7 wipes the old chat data and restarts tickets at GER-0001).

## Run

```bash
# Docker
cp .env.example .env          # set JWT_SECRET (openssl rand -hex 32) and ADMIN_EMAIL
docker compose up -d --build  # http://localhost:3000 → ADMIN_EMAIL / 000000

# Without Docker (Node 20+)
ADMIN_EMAIL=martin@aether-tech.dev ./scripts/local.sh
```

To use a backup locally (e.g. production's, made with `node scripts/backup.mjs`): copy its `AAAAMMDD-HHMMSS`
folder, stop the server and run `npm run restaurar -- <folder>`. It checks the databases first, moves the current
data to `data-anterior-<date>/` and puts the backup in `./data`. Accounts keep their production codes.

Upgrading to the executive portal: `control.db` migrates on start (new `chat_*` tables and columns); nothing else
changes.
Upgrading from 0.8: automatic migration (`usuarios.admin_id` for inherited records); one-tap start with objectives
edited on the dashboard; Equipo's "Quitar" becomes Desactivar / Eliminar.
Upgrading from 0.7: adds `proyecto_etapas` (automatic migration): existing projects get "concepto" from their start
date and, if further along, their current stage from the upgrade date — correct those dates in Proyectos → Etapas
(especially real delivery dates).
Upgrading from 0.6: adds `gastos.envio_clp` (automatic migration; existing purchases get 0). Totals unchanged.
Upgrading from 0.5: no schema change. New UI; streak, XP, levels, achievements and confetti removed; same
features and rules otherwise. New dependency `@fontsource-variable/inter` (`npm ci`; nothing to do with Docker).
Upgrading from 0.4: adds the `metas` table (automatic migration); "Presupuesto" is relabeled "Costo estimado BOM".
Upgrading from 0.3: no schema change; `VENTANA_MANANA`, `VENTANA_TARDE` and `JORNADA` are no longer used.
Upgrading from 0.2: back up, then restart with the new code. Each company DB migrates on start (purchase amount
becomes the total paid; document type, folio, RUT and shipping are kept in the description; existing
objectives and purchases keep their single project). The `comprobantes/` folders are no longer used.

## Tests

```bash
npm run typecheck
npm run test:logica   # timezone, Say-Do, schema + migrations, shipping, stages, pipeline, editable objectives, account deletion, exec, cost breakdown, payment status, USD purchases, executive portal (v7 migration, group-chat rooms, history, tickets, usage limit, Issue tracking and send retries against a mock GitHub) (70)
# end-to-end against a server with an EMPTY data dir, started with TIPO_CAMBIO_USD=950 (69, executive portal included)
BASE=http://127.0.0.1:3100 ADMIN_EMAIL=admin@aether-tech.dev npm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs typecheck, the logic tests and the end-to-end tests against the Docker image on
every pull request and push to `main`; pushes to `main` also publish the `amd64` + `arm64` image to `ghcr.io`.

## Configuration

| Variable | Default | |
|---|---|---|
| `JWT_SECRET` | — | Required in production, ≥ 32 chars |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` | — | First admin, created when there are none; any domain |
| `EMPRESAS` | `aether-tech\|Aether Tech\|aether-tech.dev;datasheq\|Datasheq\|datasheq.com` | `key\|Name\|domains`, `;`-separated |
| `PIN_INICIAL` | `000000` | Initial code for new and reset accounts |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | SQLite databases |
| `TZ_NEGOCIO` | `America/Santiago` | Defines which date is "today" (one jornada per day) |
| `COOKIE_SECURE` | `true` in production | `false` only for plain-http testing |
| `TIPO_CAMBIO_USD` | — (day's observed dollar rate) | Pins the dollar rate for USD purchases (tests, offline servers) |
| `GITHUB_TOKEN` | — (Issues stay pending) | DataSHEQ account token with "Issues: write" on the module repositories |
| `INTERVIEW_URL`, `INTERVIEW_TOKEN` | — (the assistant does not answer; messages are kept and retried) | URL and bearer token of the implement-all-cloud interview seat |
| `GITHUB_CUENTA` | `datasheq-creator` | DataSHEQ's GitHub account: sends with another account's token are rejected |
| `GITHUB_API_URL` | `https://api.github.com` | GitHub API (GitHub Enterprise or a mock GitHub in tests) |

Production (reverse proxy, backups, first-day checklist): see the Spanish README, sections 3–4.
