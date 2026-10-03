# Aether Ops (`ops.aether.cl`) — English

Daily log (morning objectives → afternoon close), out-of-office, purchases per project, streak, Say-Do and
achievements, for two companies on one site. Single container: Next.js 15 standalone + SQLite (WAL). UI in Spanish.

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

## Team member's day (Chile time)

| Time | Not done yet | Done |
|---|---|---|
| before 08:30 | dashboard, invitation to log objectives | dashboard |
| **08:30–10:30** | **morning survey (mandatory)** | dashboard |
| 10:30–17:00 | dashboard, button to log late objectives | dashboard; tick objectives as they are achieved |
| **17:00–19:30** | **afternoon close (mandatory)** | dashboard |
| after 19:30 | dashboard, prompt to close anyway (counts for Say-Do, not for the streak) | dashboard |

Surveys are only forced inside their window; finishing one returns to the dashboard. Weekends and holidays:
always the dashboard. Windows: `VENTANA_MANANA`, `VENTANA_TARDE`. The dashboard shows today's objectives
(tap to complete, with confetti), completion ring, level and XP, current and best streak, 14-day Say-Do,
the week, achievements and today's purchases.

Objectives and purchases can belong to **one or more projects**. A purchase is name, optional description,
amount (CLP) and projects; with several projects the amount is split equally (leftover pesos go to the first ones).

Deleting a project (`/admin` → Proyectos) also deletes objectives and purchases that belong only to it; shared
ones just lose it and the purchase amount is re-split. Irreversible.

## Run

```bash
# Docker
cp .env.example .env          # set JWT_SECRET (openssl rand -hex 32) and ADMIN_EMAIL
docker compose up -d --build  # http://localhost:3000 → ADMIN_EMAIL / 000000

# Without Docker (Node 20+)
ADMIN_EMAIL=martin@aether-tech.dev ./scripts/local.sh
```

Upgrading from 0.2: back up, then restart with the new code. Each company DB migrates on start (purchase amount
becomes the total paid; document type, folio, RUT and shipping are kept in the description; existing
objectives and purchases keep their single project). The `comprobantes/` folders are no longer used.

## Tests

```bash
npm run typecheck
npm run test:logica   # timezone, windows, streak, Say-Do, XP, schema + migration, companies, split, exec metrics (25)
# end-to-end against a server with an EMPTY data dir (40)
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
| `TZ_NEGOCIO` | `America/Santiago` | Defines "today", survey windows and streaks |
| `VENTANA_MANANA` | `08:30-10:30` | Morning survey window |
| `VENTANA_TARDE` | `17:00-19:30` | Afternoon close window; its end is the streak cut-off |
| `JORNADA` | `08:30-18:00` | Workday used to subtract partial absences in capacity |
| `COOKIE_SECURE` | `true` in production | `false` only for plain-http testing |

Production (reverse proxy, backups, first-day checklist): see the Spanish README, sections 3–4.
