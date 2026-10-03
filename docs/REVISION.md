# Aether Ops — Spec review and design decisions

Review of the original spec (schema, `/checkin` component, `/api/bitacora`, deployment).
Each finding lists the failure and what this codebase does instead. Severity:
**B** = blocking (security or data integrity), **C** = correctness, **M** = data model, **D** = deployment.

## 1. Blocking

| # | Finding | Failure scenario | Fix in this codebase |
|---|---|---|---|
| B1 | Identity read from `x-user-id` request header | Any client sends `x-user-id: <other id>` and acts as that user. The JWT cookie described in the spec is never checked by the route. | Every handler calls `requireUsuario()`: verifies the JWT cookie, then reloads the user from SQLite (active flag + session version). Header is never read. |
| B2 | `checkout_tarde` updates `WHERE id = ?` with client-supplied `bitacora_id` and task ids | User A closes / rewrites user B's log and tasks (IDOR). | Bitácora is derived from (session user, today). Task updates use `WHERE id = ? AND bitacora_id = ?`; unknown ids → 400. |
| B3 | `ruta_comprobante` is sent by the client; no upload endpoint exists | Client can store any path (`../../etc/passwd`) and later have it served; in practice no file is ever uploaded (the `<input>` has no handler). | Multipart upload to `POST /api/gastos`; server generates the file name, checks magic bytes (JPEG/PNG/WEBP/HEIC/PDF), enforces 10 MB. |
| B4 | Receipts in `/data/comprobantes` have no serving route | Next standalone does not serve `/data`; the admin/exec views can't show them. Serving them as static files would make them public. | `GET /api/comprobantes/:gastoId`: owner, admin or executive only; `nosniff`, `private` cache, PDF sandboxed. |
| B5 | `PRAGMA foreign_keys` / `busy_timeout` set only in the schema script | Both are **per connection**. `new Database()` in the route doesn't set them → FKs silently not enforced, concurrent writes fail with `SQLITE_BUSY` instead of waiting. | One process-wide connection (`lib/db.ts`) sets WAL, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL` on open. |
| B6 | Check-in labelled idempotent but isn't | Double tap / retry on bad mobile network → second insert hits `UNIQUE(usuario_id, fecha)` → uncaught 500. | Second morning submit returns the existing log (200, `ya_existia: true`). |
| B7 | Checkout can be repeated | Second submit overwrites `checkout_tarde` (breaks the 19:30 streak rule) and inserts every expense again. | Closed log → 409. Expenses are their own endpoint with document de-duplication (M5). |
| B8 | `docker run -p 3000:3000` | Publishes on 0.0.0.0, bypassing the TLS proxy. Docker also bypasses `ufw`. | `-p 127.0.0.1:3000:3000`. |
| B9 | No backup of `app.db` / receipts | Disk loss = all financial records gone. Copying `app.db` while running without the `-wal` file gives an inconsistent copy. | `scripts/backup.mjs` uses SQLite's online backup API; README has the cron line and receipt sync. |

## 2. Correctness

| # | Finding | Failure scenario | Fix |
|---|---|---|---|
| C1 | "Today" computed with `toISOString()` (UTC) | Chile is UTC-3 (summer, now) / UTC-4 (winter). After 21:00 local (20:00 in winter) "today" becomes tomorrow: late checkout looks up a non-existent log, the OOO date picker forbids today. | All business dates come from `lib/tiempo.ts` (`America/Santiago`, configurable). The client gets `hoy` from the server. |
| C2 | `CURRENT_TIMESTAMP` stored as `YYYY-MM-DD HH:MM:SS` (UTC, no zone) | JS parses it as **local** time; the "before 19:30" streak check is off by 3–4 h. | Timestamps stored as ISO-8601 with `Z`; local time derived with `Intl`. |
| C3 | No input validation | Bad `estado` → CHECK violation → 500; 0 or 10 tasks accepted although the spec says 2–4. | zod schemas on every endpoint; 2–4 tasks; only projects in `concepto/prototipado/pruebas`. |
| C4 | `postergado_ooo` is never set; partial OOO affects nothing | Someone leaving at 14:00 for the doctor fails Say-Do. | Full-day OOO on a day with an open log moves pending tasks to `postergado_ooo` (reverted if the OOO is cancelled). With any OOO that day, the user can mark a task "postergado por ausencia" at checkout. Those tasks are excluded from Say-Do. |
| C5 | OOO modal button only closes the modal; no `motivo` field; no way to cancel an OOO | OOO is never stored. | `POST/GET /api/ooo`, `DELETE /api/ooo/:id`; modal has motivo, list of upcoming absences with cancel. |
| C6 | One `bloqueo` text field in the UI, but the API stores `motivo_pendiente` per task | Per-task reasons are always empty. | Each pending task requires a reason; separate optional "Necesito ayuda (bloqueo)" field feeds the admin standup. |
| C7 | Expense form has no project selector; `gastos.proyecto_id` is NOT NULL. Tasks send `proyecto_codigo`, API expects `proyecto_id` | Insert fails. | Project selector in both forms, ids sent. |
| C8 | Expenses only saved inside checkout | Can't declare a purchase on a day without a log, after closing, or on OOO. | `POST /api/gastos` independent; linked to today's log when one exists. |
| C9 | Streak and Say-Do rules undefined for weekends, holidays, OOO, unclosed days | Streak breaks every Monday; forgetting to close has no effect. | See §4. |
| C10 | `<input accept="image/*" capture="environment">` only | Chilean facturas are electronic (DTE) and usually arrive by e-mail as PDF; `capture` forces the camera on Android, so the PDF can't be attached. | Two buttons: "Tomar foto" (camera) and "Subir archivo" (image or PDF). Photos are downscaled client-side to ≤2000 px JPEG (~300 KB instead of 3–8 MB). |
| C11 | All inputs use `text-xs` (12 px) | iOS Safari zooms the page on every field focus (< 16 px). | Inputs are 16 px; labels stay small. |

## 3. Data model

| # | Finding | Fix |
|---|---|---|
| M1 | CLP stored as `REAL` | `INTEGER` (CLP has no decimals; float sums drift). |
| M2 | IVA basis ambiguous: "Costo Neto / Base" for both document types | Rule adopted: **factura** → enter amounts as printed on the lines (net); IVA recoverable = round(19 % × (item + envío)). **boleta / extranjero** → enter amounts paid; IVA recoverable = 0. `gastos.iva_clp` is computed server-side and stored, so the exec view sums it directly. Prototype cost = item + envío (net for factura, gross otherwise) — the IVA on a factura is recovered and not a project cost. Admin can correct rounding during validation (pass 2). |
| M3 | Imports (DigiKey, Mouser, AliExpress) are neither factura nor boleta | Third type `extranjero` (no recoverable IVA). Whether customs IVA paid on imports is creditable is a question for your accountant; the field exists to separate it. |
| M4 | A factura only gives crédito fiscal if issued to the company's RUT; nothing captures the issuer | `rut_emisor` (validated, módulo 11), required for factura. |
| M5 | No de-duplication; folio is unique per issuer, not globally | `UNIQUE(rut_emisor, tipo_documento, folio_documento)` → same document can't be claimed twice (409). |
| M6 | No validation state for the "Mesa de Validación Financiera" | `estado` (pendiente/aprobado/rechazado), `validado_por`, `validado_en`, `observacion`. |
| M7 | Blocks have no resolution state, but `/admin` must list "bloqueos activos no resueltos" | `bitacoras.bloqueo_resuelto_en/_por`. |
| M8 | `ausencias_ooo UNIQUE(usuario_id, fecha, hora_inicio, hora_fin)` | SQLite treats NULLs as distinct → unlimited duplicate full-day rows. Replaced by a partial unique index on full-day rows, a CHECK (partial ⇒ both hours and start < end) and an overlap check in the API. |
| M9 | Lead time needs a start date; `proyectos` has none | `fecha_inicio` added. |
| M10 | No login fields on `usuarios` | `pin_hash`, `debe_cambiar_pin`, `version_sesion`, `intentos_fallidos`, `bloqueado_hasta`. |
| M11 | Holidays not modelled | `feriados` table, seeded with the 2026 national holidays. Add 2027 before January. |

## 4. Rules the spec left open (current rules — see §9; change in `lib/metricas.ts`)

- **Jornada**: started and finished by the person with buttons, any time, any day; one per calendar day
  (America/Santiago). An unfinished jornada stays open until finished, even past midnight.
- **Say-Do** (per jornada and 14 days): achieved ÷ (committed − postponed), over jornadas dated in the last 14
  days, excluding the one in progress. Old unfinished jornadas (pre-0.4 data) count their pending items as not done.
- **Streak**: consecutive finished jornadas with Say-Do ≥ 75 %. Days without a jornada are ignored; a finished
  jornada below 75 % (or an old unfinished one) resets it; the jornada in progress doesn't count yet.
- No rule uses the time of day.

## 5. Login (email + 6-digit code, as requested)

- Admin adds/removes e-mails in `/admin`. Initial code `000000` (env `PIN_INICIAL`), forced change on first login.
- **Risk**: until a person logs in, anyone who knows their e-mail can log in with `000000` and set the code. Mitigation: ask people to log in the day their account is created; admin can reset a code (back to initial + forced change + all sessions revoked).
- A 6-digit code is only safe with throttling: per-account lock after 5 failures (15 min, doubling up to 24 h) and per-IP limit (30 attempts / 15 min). Trivial codes are rejected (`000000`, repeated digits, ascending/descending runs, the initial code).
- Hash: scrypt with per-user salt. Sessions: HS256 JWT in an HTTP-only, `SameSite=Lax`, `Secure` cookie, 30 days, revoked by bumping `version_sesion` (code change, reset, deactivation).
- "Delete" a user with history = deactivate (financial records must keep their author). Users without history are hard-deleted.

## 6. Deployment

| # | Finding | Fix |
|---|---|---|
| D1 | "Proxy must point the CNAME `ops.aether.cl` to port 3000" mixes DNS and proxy | DNS (A/AAAA or CNAME) points to the host; ports aren't part of DNS. The proxy forwards to `127.0.0.1:3000`. |
| D2 | Nginx default `client_max_body_size 1m` | Receipt uploads fail with 413. Set `15m` (Caddy has no default limit). |
| D3 | No `JWT_SECRET`, no bootstrap admin | Container refuses to start in production without `JWT_SECRET` (≥32 chars). First start creates the admin from `ADMIN_EMAIL`. |
| D4 | No healthcheck | `HEALTHCHECK` on `/api/health` (checks DB). |
| D5 | Tailwind: spec uses `tailwind.config.js`; Next 15 ships Tailwind v4, which is CSS-first and ignores that file. Component hard-codes hex values instead of the tokens; `animate-in` needs a plugin | Tokens defined with `@theme` in `app/globals.css` (`bg-aether-bg`, `text-aether-success`…); animations are plain CSS. |
| D6 | `better-sqlite3` is a native addon | Built and run on the same base image (`node:22-bookworm-slim`) so the binary matches libc/arch; marked as server-external package. |
| D7 | (Found while testing this build, not in the spec) Next 15.5 Node.js middleware on `/api/*` | Intermittent 500 on multipart receipt uploads ("Response body object should not be disturbed or locked"), ~1 in 3 test runs. Middleware now only matches pages; every route handler authenticates on its own. 5 consecutive clean runs after the change. |
| D8 | Railway (target host): rejects the Dockerfile `VOLUME` instruction; volumes are mounted root-owned; data must live on a volume | `VOLUME` removed (compose and `docker run -v` mount `/data` explicitly). The image starts as root only to prepare `/data`: `scripts/arranque.cjs` chowns it to uid 1001 and drops to that user before loading the server (same pattern as the official Postgres/Redis images; first attempt relied on `RAILWAY_RUN_UID=0` + `USER 1001`, which failed on Railway). If dropping is not permitted it continues as root with a warning; if `/data` isn't writable it exits with an explicit message; on Railway without a volume it warns. `scripts/backup.mjs` run as root switches to the data folder's owner. Client IP for rate limiting = last `X-Forwarded-For` entry, which is what Railway's edge guarantees. |

## 7. Pass 2 — two companies and management dashboards

**Tenancy.** One SQLite file per company (`/data/empresas/<clave>/app.db` + its own `comprobantes/`) and a
`control.db` for admins and supervision. The login email's domain selects the company; team and executive
sessions carry that company and every query runs against its file, so cross-company reads aren't possible by
construction (a gasto id from the other company simply doesn't exist in this DB → 404). Admins live in
`control.db`, may use any email domain, and pick the company per request (`?empresa=`), validated server-side;
for team and executive accounts that parameter is ignored. Emails are unique across admins and all companies.

**Supervision.** Many-to-many (`control.db.supervision`: admin × company × member), set when creating a team
account (defaults to the creator) and editable later; removing an admin removes their supervision rows. Standup,
capacity and expense views filter by "my supervised" or "whole team".

**Decisions taken here (change if needed):**
- Admins don't keep a daily log (they have no account in a company DB). If you also want to log your own day,
  create a separate team account with your company email.
- Any admin can validate any expense of either company; validations store the admin's id and name.
- Capacity baseline: workday 08:30–18:00 (env `JORNADA`); a partial absence subtracts its overlap with it.
  *(Replaced in pass 4 by whole-day availability.)*
- Executive "cost per solution" excludes rejected expenses and includes pending ones (shown separately).
- The IVA share uses net factura amounts vs gross boleta amounts (what each document shows).

**Still open:** holiday editor (2026 Chilean holidays seeded in each company DB; add 2027 before January).

## 8. Pass 3 — simpler purchases, multiple projects, time-aware home

Requested changes, and what replaces earlier decisions:

**Purchases are name + description + amount + project(s).** Document type, folio, RUT (M4, M5), shipping, IVA
split (M2, M3) and receipt upload/serving (B3, B4, C10, D2) were removed, with their endpoints and columns.
`gastos.monto_clp` is the total paid. Validation (approve / reject with reason) and the exec budget view remain;
the exec IVA card is gone.

**Several projects per objective and per purchase.** Join tables `tarea_proyectos` and `gasto_proyectos`
(cascade on delete). A purchase's amount is split equally across its projects and the share is stored per row
(`gasto_proyectos.monto_clp`, remainder pesos to the first ones), so per-project sums always add up to the
total. Objectives count once for Say-Do regardless of how many projects they touch. The API still accepts the
old single `proyecto_id` field. Every project must be active and belong to the caller's company (different
company → 400).

**Migration (schema v2, automatic on start).** Existing purchases: amount = item + shipping + IVA; type, folio,
RUT and shipping are written into the description; the old project becomes its only project. Existing
objectives keep their project. Tables are rebuilt through temporary copies so `DROP TABLE` doesn't cascade.
Covered by a test that migrates a v1 database with data and checks `foreign_key_check`.

**Time-aware home** *(replaced in pass 4 — no time windows)*. A survey is mandatory only inside its
window and only if still pending; any other time the member gets a dashboard (objectives with tap-to-complete,
level/XP, streaks, week strip, achievements, purchases). Submitting the morning survey returns to the
dashboard — the afternoon close is not opened right away. The browser recomputes the view every 30 s from the
Chile clock (`Intl` with `America/Santiago`, independent of the server or device time zone), so the view
switches at 08:30 / 17:00 without reloading. Verified with a simulated clock at 07:30, 08:31, 09:10, 12:00,
13:00, 17:40 and 21:00.

**Project deletion** (added directly on the Mac copy after v0.2; ported to the new tables). Deletes the
project and the objectives/purchases that belong only to it; shared ones lose the project and the purchase
amount is re-split among the remaining projects; an open log left with no objectives is removed so the person
can log again. Irreversible and it erases financial records — prefer the `entregado` state for real projects.
Admin only; covered by an e2e test.

**Gamification.** XP: objective done +10, objectives logged in the morning window +3, close within the
afternoon window +5, perfect day +15; level n needs 50·n·(n−1) XP. Achievements are computed from history (no
extra tables). Confetti on logging objectives, completing one, and closing the day; disabled under
`prefers-reduced-motion`.

## 9. Pass 4 — goal-based work, no schedule

The team works on boleta de honorarios, so the app no longer ties anything to the clock. In Chile, a fixed
schedule, attendance control or punctuality metrics are indicators of subordination that can be used to
reclassify a freelance relationship as employment (Código del Trabajo arts. 7–8); this design avoids
building those signals into the tool. Not legal advice.

- **Start / finish instead of morning / afternoon surveys.** `POST /api/jornada/comenzar` (objectives) and
  `POST /api/jornada/terminar` (results), any time. Time windows, the "late" banners, and the env vars
  `VENTANA_MANANA`, `VENTANA_TARDE` and `JORNADA` are gone (`lib/jornada.ts` removed).
- **One jornada per day; a forgotten one stays open.** "In progress" = the person's most recent jornada if
  unfinished, whatever its date. Starting is refused (409) while one is open, after today's was finished, or
  on a day marked unavailable. Finishing and ticking objectives act on the jornada in progress, derived from
  the session — never from a client-sent id. No schema change: same `bitacoras` table (`checkin_manana` =
  start, `checkout_tarde` = finish).
- **Metrics without time** (§4). XP: objective +10, finished jornada +5, perfect jornada +15. Achievements
  "Madrugador" and "Puntual" replaced by "Constante" (10 finished jornadas) and "Todoterreno" (objectives
  achieved in 3 projects).
- **Admins see results, not hours.** Standup shows each person's latest jornada (in progress or finished)
  with objectives and outcome; no start/finish times, no "no log today" / "days without log" alerts. Priority:
  blockers → Say-Do < 70 % → unavailable today → rest. Start/finish times are shown only to the person.
- **Unavailable days** replace OOO: whole days only (`/api/no-disponible`), for planning; they never affect the
  streak. Partial absences from earlier versions are ignored; postponing objectives "por ausencia" is no
  longer offered (old postponed items keep their state). The 14-day view counts available working days.

## 10. Pass 5 — executive KPIs (SMART)

The executive view had three tiles (global Say-Do, spend, pending purchases) and two lists, without targets or
periods, and the Say-Do label read like project progress. Replaced by four KPIs ordered by relevance to
upper management, each with definition, value, target, period, status and comparison:

1. **Projects on schedule** — active projects not past their committed delivery date. Target 100 %. Point in
   time (no history of project states, so no comparison). Projects due within 14 days are listed as such.
2. **Accumulated cost vs BOM estimate** — there are no budgets; each project has a BOM cost estimate made before
   it starts (stored in `proyectos.presupuesto_clp`, relabelled in the UI). Within ≤ 100 %; up to +tolerance
   (default 10 %) = at risk; above = off target. Comparison: cost added in the last 14 days vs the previous 14.
3. **Team daily-objective completion** — achieved ÷ committed objectives of finished jornadas, last 14 days vs
   previous 14; target ≥ 80 % (at risk within 10 pp). Explicitly labelled as day-to-day execution, not project
   milestones (managed in the Gantt chart).
4. **Unresolved blockers** — target: none open longer than N days (default 3); at risk if any open.

Pending purchases left the executive view (they remain in the admin validation desk). Targets live in a new
per-company `metas` table (schema v3), editable by admins only (`PUT /api/admin/metas`); defaults in
`lib/metas.ts`.
