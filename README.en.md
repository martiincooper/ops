# Aether Ops (`ops.aether.cl`) — English

Daily log (morning objectives → afternoon close), out-of-office, purchase receipts with IVA split, streak and Say-Do.
Single container: Next.js 15 standalone + SQLite (WAL). UI in Spanish.

**Read first:** [`docs/REVISION.md`](docs/REVISION.md) — what was wrong in the original spec and what this code does instead.

## Scope of this version

| Done | Next pass |
|---|---|
| Login with email + 6-digit code (initial `000000`, forced change, lockout) | `/exec` metrics (cost per solution, IVA recovered, lead time, global Say-Do) |
| `/checkin`: morning objectives (2–4), afternoon close, live Say-Do ring, streak | `/admin` standup matrix, 14-day capacity strip, finance validation desk |
| OOO: full day / partial, cancel, postponed tasks excluded from Say-Do | Holiday editor (2026 Chilean holidays are seeded) |
| Expenses: factura / boleta / extranjero, RUT check, duplicate detection, photo or PDF | |
| `/mi-progreso`: streak, 14-day history, my expenses, change code | |
| `/admin`: add/remove people, roles, reset code, projects | |

## Run locally

```bash
npm ci
cp .env.example .env.local        # set ADMIN_EMAIL; JWT_SECRET optional in dev
npm run dev                       # http://localhost:3000 → log in with ADMIN_EMAIL / 000000
```

Data goes to `./data` (`app.db` + `comprobantes/`). Delete the folder to start over.

## Tests

```bash
npm run typecheck
npm run test:logica               # timezone, streak, Say-Do, schema constraints, RUT, codes (16 tests)

# end-to-end against a running server with an EMPTY data dir (40 tests)
npm run build
DATA_DIR=/tmp/aether-e2e ADMIN_EMAIL=admin@aether.cl JWT_SECRET=$(openssl rand -base64 48) \
  COOKIE_SECURE=false PORT=3100 node .next/standalone/server.js &
BASE=http://127.0.0.1:3100 npm run test:e2e
```

(For the standalone server outside Docker, copy `public/` and `.next/static/` into `.next/standalone/` first.)

## Deploy

```bash
# 1. Persistent data on the host (container runs as uid 1001)
sudo mkdir -p /var/lib/aether-ops/comprobantes
sudo chown -R 1001:1001 /var/lib/aether-ops

# 2. Build and run — port bound to loopback only; the proxy is the only public entry
docker build -t aether-ops:latest .
docker run -d --name aether-ops --restart always \
  -p 127.0.0.1:3000:3000 \
  -v /var/lib/aether-ops:/data \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e ADMIN_EMAIL=jefatura@aether.cl \
  -e ADMIN_NOMBRE="Jefatura Operaciones" \
  aether-ops:latest
```

Keep the `JWT_SECRET` value (e.g. in an env file) — changing it logs everyone out. Or use `docker compose up -d` with a `.env` file (see `docker-compose.yml`).
The container refuses to start without a `JWT_SECRET` of at least 32 characters.

### DNS and reverse proxy

DNS: an `A`/`AAAA` record (or `CNAME`) for `ops.aether.cl` pointing to the server. Ports are not part of DNS; the proxy forwards to `127.0.0.1:3000`.

Caddy (automatic TLS):

```caddy
ops.aether.cl {
    reverse_proxy 127.0.0.1:3000
}
```

Nginx (TLS via certbot): the two lines marked are required.

```nginx
server {
    server_name ops.aether.cl;
    client_max_body_size 15m;                 # required: default 1m rejects receipt photos (413)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;          # required: same-origin check on POST compares Origin with Host
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # listen 443 ssl; ssl_certificate ... (certbot --nginx)
}
```

### Backups

```bash
# /etc/cron.d/aether-ops — 02:30 nightly: consistent SQLite copy (keeps 30) + receipts to a second disk/host
30 2 * * * root docker exec aether-ops node scripts/backup.mjs && rsync -a /var/lib/aether-ops/ backup-host:/srv/aether-ops/
```

Don't copy `app.db` with `cp` while the app runs: without the `-wal` file the copy can be inconsistent. `scripts/backup.mjs` uses SQLite's online backup API and runs `integrity_check` on the result.

## First day checklist

1. Log in as `ADMIN_EMAIL` with `000000`, set your own code.
2. `/admin` → Proyectos: create the active projects (team can't log objectives without at least one).
3. `/admin` → Equipo: add each person. **Ask them to log in the same day**: until they change it, anyone who knows their e-mail can log in with the initial code.
4. Before January: add 2027 holidays to the `feriados` table (see `lib/migraciones.ts` for the format).

## Configuration

| Variable | Default | |
|---|---|---|
| `JWT_SECRET` | — | Required in production, ≥ 32 chars |
| `ADMIN_EMAIL` / `ADMIN_NOMBRE` | — | Admin created on first start when there are no users |
| `PIN_INICIAL` | `000000` | Initial code for new and reset accounts |
| `DATA_DIR` | `/data` (prod), `./data` (dev) | SQLite + receipts |
| `TZ_NEGOCIO` | `America/Santiago` | Defines "today", the 19:30 cut-off and streaks |
| `COOKIE_SECURE` | `true` in production | Set `false` only for plain-http testing |

## Layout

```
app/                pages (login, cambiar-pin, checkin, mi-progreso, admin, exec) and api/ route handlers
components/         client components (PinPad, Checkin, FormGasto, ModalOoo, AdminPanel, Anillo)
lib/db.ts           single SQLite connection + per-connection PRAGMAs + migrations
lib/migraciones.ts  schema (versioned with PRAGMA user_version)
lib/metricas.ts     streak and Say-Do rules
lib/tiempo.ts       business dates in America/Santiago
lib/auth.ts, jwt.ts, pin.ts, limites.ts   sessions, code hashing, lockout
middleware.ts       page routing by role (API routes authenticate themselves)
scripts/            backup.mjs, test-logica.ts, e2e.mjs
```
