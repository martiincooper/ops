// Envío de los requerimientos a GitHub con reintentos automáticos (el mismo programador reintenta los turnos del asistente,
// ver ./asistente). Si el envío falla por un error transitorio
// (red, tiempo de espera, 5xx, límite de uso), queda programado un reintento a 1, 2, 5, 15, 30 y 60 minutos; después
// queda pendiente para «Reintentar» desde el panel. Los errores definitivos (token, permisos, datos) no se reintentan.
// Un mismo requerimiento nunca se envía dos veces a la vez (botón y reintento automático), y al reintentar se busca
// primero si el Issue ya existe. Sin "server-only": lo prueba scripts/test-logica.ts con un GitHub simulado.
import type Database from "better-sqlite3";
import { type DatosIssue, ErrorGithub, type OpcionesPeticion, crearIssueEn } from "./githubApi";
import { moduloPorClave, repoDe } from "./catalogo";
import type { Modulo } from "./modulos";
import { mensajes, participantes, solicitud } from "./salas";
import type { ConfigCuenta } from "./seguimiento";

type DB = Database.Database;

/** Minutos de espera antes de cada reintento automático. */
export const ESPERAS_MIN = [1, 2, 5, 15, 30, 60];
export const MAX_REINTENTOS = ESPERAS_MIN.length;
export const SIN_TOKEN = "GITHUB_TOKEN no está configurado en el servidor";
export const SIN_REPO = "pendiente: sala sin repositorio";

const enCurso = new Set<string>();

export interface ResultadoEnvio {
  ok: boolean;
  error?: string;
  /** Próximo reintento automático (ISO), si quedó programado. */
  reintento_en?: string | null;
}

/** Enlace (protegido por el login de ops) a una foto de la solicitud; PORTAL_URL es la dirección pública de ops. */
export const enlaceFoto = (id: number) => `${(process.env.PORTAL_URL ?? "").replace(/\/+$/, "")}/api/chat/adjuntos/${id}`;

function datosDelIssue(db: DB, id: string): DatosIssue {
  const s = solicitud(db, id);
  if (!s || s.estado !== "terminada" || !s.titulo || !s.spec) throw new Error("La solicitud no tiene especificación");
  return {
    ticket: s.ticket,
    modulo: moduloPorClave(db, s.sala) as Modulo,
    titulo: s.titulo,
    spec: s.spec,
    solicitantes: participantes(db, id),
    moduloNuevo: !!s.modulo_nuevo,
    fotos: mensajes(db, id).flatMap((m) => m.adjuntos.map((a) => ({ nombre: a.nombre, url: enlaceFoto(a.id) }))),
  };
}

/**
 * Crea el Issue de una solicitud ya terminada y guarda el resultado. Si falla por un error transitorio, programa
 * el siguiente reintento automático (mientras queden). Lanza Error si la solicitud no está terminada.
 */
export async function enviarIssue(
  db: DB,
  id: string,
  cuenta: ConfigCuenta | null,
  op: OpcionesPeticion & { ahora?: () => Date } = {},
): Promise<ResultadoEnvio> {
  const ahora = op.ahora ?? (() => new Date());
  const datos = datosDelIssue(db, id);
  const c = solicitud(db, id)!;
  if (c.issue_numero) return { ok: true };
  if (enCurso.has(id)) return { ok: false, error: "El requerimiento ya se está enviando a GitHub" };
  enCurso.add(id);
  try {
    if (!cuenta) throw new ErrorGithub(SIN_TOKEN, false);
    // Cada módulo envía a su propio repositorio
    const repo = repoDe(db, c.sala);
    if (!repo) throw new ErrorGithub(SIN_REPO, false);
    // Si hubo un intento anterior, pudo llegar a GitHub aunque se perdiera la respuesta: buscar antes de crear
    const issue = await crearIssueEn(cuenta, repo, datos, { ...op, comprobarDuplicado: c.issue_intentos > 0 || !!c.issue_error });
    // Recién creado: abierto y sin asignar hasta la próxima consulta a GitHub (#6)
    db.prepare(
      `UPDATE chat_solicitudes
          SET issue_numero = ?, issue_url = ?, issue_repo = ?, issue_error = NULL, issue_estado = 'open', issue_actualizado_en = ?,
              issue_proximo_intento = NULL
        WHERE id = ?`,
    ).run(issue.numero, issue.url, repo, ahora().toISOString(), id);
    return { ok: true };
  } catch (e) {
    const transitorio = e instanceof ErrorGithub ? e.transitorio : false;
    const error = e instanceof ErrorGithub ? e.message : "Error inesperado al crear el Issue";
    if (!(e instanceof ErrorGithub)) console.error("[chat-github]", e);
    const intentos = c.issue_intentos;
    const proximo =
      transitorio && intentos < MAX_REINTENTOS ? new Date(ahora().getTime() + ESPERAS_MIN[intentos] * 60_000).toISOString() : null;
    db.prepare("UPDATE chat_solicitudes SET issue_error = ?, issue_intentos = ?, issue_proximo_intento = ? WHERE id = ?").run(
      error,
      transitorio ? intentos + 1 : intentos,
      proximo,
      id,
    );
    if (transitorio) console.warn(`[chat-github] ${error}; ${proximo ? `reintento automático a las ${proximo}` : "sin más reintentos automáticos"}`);
    return { ok: false, error, reintento_en: proximo };
  } finally {
    enCurso.delete(id);
  }
}

/** Requerimientos con un reintento automático vencido, o esperando que su sala tenga repositorio y ya lo tiene. */
export function pendientesDeReintento(db: DB, ahora = new Date()): string[] {
  const filas = db
    .prepare(
      `SELECT id, sala, issue_error FROM chat_solicitudes
        WHERE estado = 'terminada' AND spec IS NOT NULL AND issue_numero IS NULL
          AND ((issue_proximo_intento IS NOT NULL AND issue_proximo_intento <= ?) OR issue_error = ?)
        ORDER BY ticket`,
    )
    .all(ahora.toISOString(), SIN_REPO) as { id: string; sala: string; issue_error: string | null }[];
  return filas.filter((f) => f.issue_error !== SIN_REPO || repoDe(db, f.sala)).map((f) => f.id);
}

/** Reintenta los envíos vencidos, de a uno. Devuelve cuántos se enviaron. */
export async function procesarPendientes(
  db: DB,
  cuenta: ConfigCuenta | null,
  op: OpcionesPeticion & { ahora?: () => Date } = {},
): Promise<number> {
  if (!cuenta) return 0;
  let enviados = 0;
  for (const id of pendientesDeReintento(db, (op.ahora ?? (() => new Date()))())) {
    const r = await enviarIssue(db, id, cuenta, op);
    if (r.ok) enviados++;
  }
  return enviados;
}

const global = globalThis as unknown as { __aetherReintentos?: ReturnType<typeof setInterval> };

/** Revisa cada minuto los reintentos vencidos (una sola vez por proceso, también con recargas de `next dev`). */
export function iniciarReintentos(
  obtenerDb: () => DB,
  obtenerCfg: () => ConfigCuenta | null,
  cadaMs = 60_000,
  turnos?: (db: DB) => Promise<number>,
) {
  if (global.__aetherReintentos) return;
  let ocupado = false;
  global.__aetherReintentos = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const n = await procesarPendientes(obtenerDb(), obtenerCfg());
      if (n) console.info(`[chat-github] ${n} requerimiento(s) enviado(s) a GitHub en reintento automático`);
      const t = turnos ? await turnos(obtenerDb()) : 0;
      if (t) console.info(`[chat-asistente] ${t} turno(s) del asistente completado(s) en reintento automático`);
    } catch (e) {
      console.error("[chat-github] reintentos automáticos:", e);
    } finally {
      ocupado = false;
    }
  }, cadaMs);
  global.__aetherReintentos.unref?.();
}
