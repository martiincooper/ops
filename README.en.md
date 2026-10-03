# Aether Ops (`ops.aether.cl`) — English

Goal-based work sessions ("jornadas": start with objectives → finish with results), unavailable days, purchases
per project, streak, Say-Do and achievements, for two companies on one site. Built for a team that works by
goals with no fixed hours (freelancers on boleta de honorarios). Single container: Next.js 15 standalone + SQLite (WAL). UI in Spanish.

The Spanish [`README.md`](README.md) is the maintained one; this file is a summary.
Design decisions and spec review: [`docs/REVISION.md`](docs/REVISION.md).

## Two companies, one site

- The login email's domain picks the company and its database: `@aether-tech.dev` → Aether Tech,
  `@datasheq.cl` → Datasheq (env `EMPRESAS`). Team and executive accounts only ever see their own company.
- Admins (middle management) live in `control.db`, can have any email domain, and switch companies with a
  selector in `/admin` (standup, 14-day capacity, purchase validation, team with supervisors, projects, admins)
  and `/exec`. The first admin is `ADMIN_EMAIL`; admins add other admins.
- Supervision is many-to-many (admin ↔ team member, per company), set when creating an account and editable later.
- Data: `/data/control.db` and `/data/empresas/<clave>/app.db`.

## Team member's jornada (no schedule)

- **Comenzar jornada** (button, any time, any day): 2–4 objectives, each with one or more projects.
- Tick objectives as they're achieved (confetti, +10 XP). **Terminar jornada**: results, reasons for pending
  items, optional blocker.
- One jornada per day. A forgotten one stays open (also past midnight) and must be finished before starting
  the next. Nothing is opened or required by the clock.
- Streak = consecutive finished jornadas with ≥75 % achieved; days without a jornada don't break it.
  XP: objective +10, finished jornada +5, perfect jornada +15. No time-based metrics or achievements.
- Unavailable days (whole days) for planning; they don't affect the streak.
- Admins see each person's latest jornada (objectives and results), blockers and Say-Do — never start/finish
  times, and no alerts for days without work. Rationale: with boleta de honorarios, fixed hours, attendance
  control or punctuality metrics are indicators of an employment relationship (not legal advice).

Objectives and purchases can belong to **one or more projects**. A purchase is name, optional description,
amount (CLP) and projects; with several projects the amount is split equally (leftover pesos go to the first ones).

Deleting a project (`/admin` → Proyectos) also deletes objectives and purchases that belong only to it; shared
ones just lose it and the purchase amount is re-split. Irreversible.

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

## Run

```bash
# Docker
cp .env.example .env          # set JWT_SECRET (openssl rand -hex 32) and ADMIN_EMAIL
docker compose up -d --build  # http://localhost:3000 → ADMIN_EMAIL / 000000

# Without Docker (Node 20+)
ADMIN_EMAIL=martin@aether-tech.dev ./scripts/local.sh
```

Upgrading from 0.3: no schema change; `VENTANA_MANANA`, `VENTANA_TARDE` and `JORNADA` are no longer used.
Upgrading from 0.2: back up, then restart with the new code. Each company DB migrates on start (purchase amount
becomes the total paid; document type, folio, RUT and shipping are kept in the description; existing
objectives and purchases keep their single project). The `comprobantes/` folders are no longer used.

## Tests

```bash
npm run typecheck
npm run test:logica   # timezone, goal-based streak, Say-Do, XP, schema + migration, availability, split, exec (23)
# end-to-end against a server with an EMPTY data dir (41)
BASE=http://127.0.0.1:3100 ADMIN_EMAIL=admin@aether-tech.dev npm run test:e2e
```

## Configuration

| Variable | Default | |
|---|---|---|
| `JWT_SECRET` | — | Required in production, ≥ 32 chars |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` | — | First admin, created when there are none; any domain |
| `EMPRESAS` | `aether-tech\|Aether Tech\|aether-tech.dev;datasheq\|Datasheq\|datasheq.cl` | `key\|Name\|domains`, `;`-separated |
| `PIN_INICIAL` | `000000` | Initial code for new and reset accounts |
| `DATA_DIR` | `/data` (Docker), `./data` (local) | SQLite databases |
| `TZ_NEGOCIO` | `America/Santiago` | Defines which date is "today" (one jornada per day) |
| `COOKIE_SECURE` | `true` in production | `false` only for plain-http testing |

Production (reverse proxy, backups, first-day checklist): see the Spanish README, sections 3–4.
