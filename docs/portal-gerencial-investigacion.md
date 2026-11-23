# Portal gerencial (ops chatbot): what exists, what is decided, how we get there

## Context

`martiincooper/ops` (Aether Ops, Next.js 15 + SQLite, Railway) got a "portal gerencial" from another dev
(Sarai, PRs #1 to #24, 7 to 20 Oct). Intended product: gerentes of Datasheq open the room of a module, talk in a
shared group chat with an AI that grills them until it understands the request, press "Terminar", and the result
lands in that module's repo as a spec, then tickets, then the implement-all-cloud fleet. Rooms are managed by the
admin from the ops admin panel.

Research against `origin/main` at c9a9f05 (2026-11-19); decisions taken with the owner on 2026-11-23 (section 3
replaces the earlier draft design).

## 1. What is built today (origin/main)

| Area | State | Where |
|---|---|---|
| Rooms | 7 hard-coded modules (C-Legal, C-Controla, C-Previene, C-Lidera, C-Acredita, C-Capacita, C-Investiga) | `lib/chat/modulos.ts` |
| Room → repo | Env var `GITHUB_REPOS="c-acredita=owner/repo,..."`; default maps only C-Legal → `datasheq-creator/clegal-railway` (`REPOS_POR_DEFECTO`). Change needs a Railway redeploy. Also set in `.github/workflows/ci.yml` and `scripts/e2e.mjs` | `lib/chat/repos.ts` |
| Room visibility | Rooms without repo are **hidden** (not grey) and answer 404 | `lib/chat/salas.ts` (`estadoSalas`, `entrarSala`), `components/gerencia/Portal.tsx` |
| Interview | **No LLM.** Claude was removed in PR #19. Fixed decision trees with buttons; the requirement is assembled by rules | `lib/chat/arboles.ts`, `lib/chat/flujo.ts`, `docs/arboles-de-decision.md`, `scripts/arboles-md.ts` |
| Concurrency | **One person per room.** `chat_salas.modulo` is a primary key lock; others see "en uso"; freed on finish, logout or 15 min idle | `lib/chat/salas.ts`, `lib/migraciones.ts` v2 |
| Output | **One issue** per conversation `[GER-000n][C-Legal] título`, labels module / prioridad / tipo / `gerencia` / `ready-for-human`, with transcript | `lib/chat/githubApi.ts` (`crearIssueEn`, `cuerpoIssue`) |
| Delivery | Solid: token must belong to `datasheq-creator` (`verificarCuenta`), dedup by ticket prefix, retries at 1/2/5/15/30/60 min, manual "Reintentar". A pending send picks the room's **current** repo at send time (`envio.ts:68`); tracking follows `issue_repo` saved per conversation | `lib/chat/envio.ts`, `lib/chat/seguimiento.ts` |
| Tracking | Issue state synced back; "Mis requerimientos" for the gerente; history in admin | `lib/chat/seguimiento.ts`, `components/gerencia/MisRequerimientos.tsx` |
| Admin panel | Read-only: rooms, who is inside, force-release, history, retry. Shows each room's repo or "Oculta", cannot edit it | `components/admin/ChatGerencia.tsx`, `app/api/admin/chat/*` |
| Access | Portal: **any** `@datasheq.com` account (roles `team`, `executive`, `admin`). Admin panel: admins whose email is `@datasheq.com`. Admins live in `control.db` with no company, which is why the panel checks the domain | `lib/chat/servicio.ts` (`requireGerencia`, `requireAdminPortal`), `lib/auth.ts` |
| Migrations | `control.db` is at v6 (next: v7) | `lib/migraciones.ts` (`MIGRACIONES_CONTROL`) |
| Tests | `scripts/test-logica.ts` (77, includes a simulated GitHub server), `scripts/e2e.mjs` (70, against a running server) | |
| CI | GitHub Actions runs typecheck + test:logica, then e2e inside the Docker image. The fleet runs `bash scripts/ci.sh` instead (no docker): typecheck, test:logica, build, e2e against the standalone server on `$PORT` with an empty temporary `DATA_DIR` | `.github/workflows/ci.yml`, `scripts/ci.sh`, `.claude/implement-all.json` |

Repo facts (2026-11-23): `martiincooper/ops` is **public**. Of the module repos, only `martiincooper/C-Acredita` has
`datasheq-creator` as collaborator; C-Legal, C-Controla, C-Guia and c-template do not (yet). Test issues #21 and #23
are already closed; #2 (activation with a fine-grained token) is open and out of date.

## 2. Findings that shaped the design

- Issues #21/#23 were created in `martiincooper/ops` before PR #24 introduced one repo per room.
- The portal never lists GitHub repos; it shows hard-coded rooms that have an entry in `GITHUB_REPOS`.
- A **fine-grained PAT cannot reach collaborator repos of another user's personal account**: the portal needs a
  **classic PAT with `repo` scope** from `datasheq-creator`.
- The fleet discovers work with `gh search issues --owner martiincooper --label ready-for-agent`, so issues must live
  in `martiincooper/*`; authorship by `datasheq-creator` is fine.
- `/ask-matt` is a router (user-invocable only); for a request it routes to the main flow `/grill-with-docs` →
  `/to-spec` → `/to-tickets`. An unattended interviewer runs `/grill-with-docs` directly.

## 3. Decided design (this spec)

### Rooms and access
- The portal starts with **zero rooms**. Migration v7 creates `chat_modulos` (clave, nombre, área, descripción,
  color, orden, `repo` nullable, `repo_verificado_en`, `autonomia` `revisar|automatico` default `revisar`,
  archivado) and **wipes all chat data** (conversations, messages, locks) and restarts the counter at GER-0001.
  Issues already on GitHub are left alone.
- Removed: the 7 hard-coded rooms, the decision trees and their docs/script, `GITHUB_REPOS`, `REPOS_POR_DEFECTO`.
- **Admin panel: any user with role `admin`**, whatever their email domain. Only admins create, edit, link,
  archive and restore rooms. The key is generated from the name and cannot be edited.
- **Repo verification on save**: the link (URL or `owner/repo`) is checked with the `datasheq-creator` token
  (`GET /repos/{owner}/{repo}`): push permission and issues enabled, else an inline error.
- **Gerentes** (only `executive` accounts of the Datasheq company, plus admins; `team` refused) see the rooms the
  admin created: **grey and disabled without a verified repo**, clickable with one. They never edit rooms.
- **Archive, never delete**: an archived room disappears from the portal, is listed under "Archivadas" in the
  panel, can be restored; history is kept. Unlinking, changing the repo or archiving is refused while the room has
  an open request with messages; the panel's "Cerrar conversación" closes it without sending.
- `autonomia` is shown and saved but has no effect yet.

### The room: a group chat
- Each room is **one shared chat like iMessage**: everyone sees the full history, each message shows its author,
  one open request at a time, polling every 2 to 3 s, no lock and no 15-minute expiry.
- Text and photos (JPG, PNG, WEBP; ≤ 5 MB each, ≤ 6 per request), stored on the ops Railway volume under `/data`
  (reachable via `railway ssh`, included in backups). The issue lists login-protected links to ops, visible to
  admins and portal users.
- **The AI grills** until it understands: one question per turn, addressed to the room, messages arriving while it
  thinks are coalesced, "El asistente está pensando…". When done it writes a summary and shows **"Terminar"** and
  **"Se me olvidó algo"** to everyone; first press wins. "Se me olvidó algo" resumes the grilling on the same
  request.
- **"Terminar"**: the seat runs `/to-spec`; ops publishes the spec in the room's repo as `datasheq-creator`, labels
  `gerencia` + `spec` + `ready-for-human`, with the existing dedup, retries and tracking. Everyone sees "Guardado
  y enviado a revisión ✓"; the next message starts a new request. "Mis requerimientos" lists the requests the
  gerente took part in.
- **Seat unavailable** (down, redeploy, usage window, timeout): the message is saved, the chat says the assistant
  is busy, ops retries at 1/2/5/15/30 min then every 30 min; the panel shows assistant health and "Reintentar".
  No fallback questions.

### The interview seat (implement-all-cloud)
- One `claude -p --resume <session>` per request, cwd = the module's clone on its base branch (cloned if missing),
  tools `Read, Grep, Glob, LS, Skill` only (gerente text is untrusted: no Bash, no edits, no network).
- Runs `/grill-with-docs`; glossary terms and decisions go into the spec instead of `GLOSSARY.md`/ADRs.
- Asks gerentes **only business questions** (what, for whom, why, today's situation, what counts as done,
  deadlines) in Chilean Spanish without code vocabulary; **decides every technical question from the code**.
- The spec (Spanish) separates "Decisiones del negocio (confirmadas con gerencia)" and "Decisiones técnicas
  (tomadas por el asistente a partir del código)". The bar: a spec you can hand to `/to-tickets` with nothing left
  to decide.
- Runs on the fleet's subscription login (`CLAUDE_CODE_OAUTH_TOKEN`).

### Panel, docs, tests
- Panel health lines: GitHub token (valid, account `datasheq-creator`) and interview seat.
- README: classic `repo`-scope PAT from `datasheq-creator` as `GITHUB_TOKEN`, accept collaborator invitations,
  create rooms and paste repo links. Close #2 pointing at the spec.
- Tests use only a simulated GitHub and a simulated seat: no real token, no Claude, no browser, no docker.

## 4. Next step, decided but not in this spec
- A fleet **spec worker** polls `ready-for-tickets` and runs `/to-tickets` headless with the sizing rules; the room's
  `autonomia` then gates `ready-for-human` vs `ready-for-agent`. Goal: most specs become tickets with no human
  review. Until then, you run `/to-tickets` on the `ready-for-human` specs.

## 5. Risks
- **Claude account**: a multi-user chat on a Claude Code subscription login may fall outside the subscription's
  terms, and it shares usage windows with the fleet (a busy fleet makes gerentes wait, a busy grilling day pauses
  tickets). Switching the seat to an API key needs no design change.
- Every merge into implement-all-cloud redeploys the fleet and the seat; in-flight turns are retried by ops.
- Latency of 10 to 60 s per turn.
- `ops` is public: specs about modules are published in the (private) module repos, not here.
