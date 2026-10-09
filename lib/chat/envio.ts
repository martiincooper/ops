// Envío de los requerimientos a GitHub con reintentos automáticos. Si el envío falla por un error transitorio
// (red, tiempo de espera, 5xx, límite de uso), queda programado un reintento a 1, 2, 5, 15, 30 y 60 minutos; después
// queda pendiente para «Reintentar» desde el panel. Los errores definitivos (token, permisos, datos) no se reintentan.
// Un mismo requerimiento nunca se envía dos veces a la vez (botón y reintento automático), y al reintentar se busca
// primero si el Issue ya existe. Sin "server-only": lo prueba scripts/test-logica.ts con un GitHub simulado.
import type Database from "better-sqlite3";
import type { Requerimiento } from "./flujo";
import { type DatosIssue, ErrorGithub, type OpcionesPeticion, crearIssueEn } from "./githubApi";
import { type Modulo, moduloPorClave } from "./modulos";
import { conversacion, mensajes } from "./salas";
import type { ConfigGithub } from "./seguimiento";

type DB = Database.Database;

/** Minutos de espera antes de cada reintento automático. */
export const ESPERAS_MIN = [1, 2, 5, 15, 30, 60];
export const MAX_REINTENTOS = ESPERAS_MIN.length;
export const SIN_TOKEN = "GITHUB_TOKEN no está configurado en el servidor";

const enCurso = new Set<string>();

export interface ResultadoEnvio {
  ok: boolean;
  error?: string;
  /** Próximo reintento automático (ISO), si quedó programado. */
  reintento_en?: string | null;
}

function datosDelIssue(db: DB, id: string): DatosIssue {
  const c = conversacion(db, id);
  if (!c || c.estado !== "generada" || !c.ticket || !c.requerimiento_json) {
    throw new Error("La conversación no tiene un requerimiento generado");
  }
  return {
    ticket: c.ticket,
    modulo: moduloPorClave(c.modulo) as Modulo,
    requerimiento: JSON.parse(c.requerimiento_json) as Requerimiento,
    solicitante: { nombre: c.usuario_nombre, email: c.usuario_email },
    conversacionId: c.id,
    fecha: c.terminada_en ?? c.iniciada_en,
    transcripcion: mensajes(db, id)
      .filter((m) => m.autor !== "sistema")
      .map((m) => ({ autor: m.autor === "robot" ? "Asistente" : c.usuario_nombre, texto: m.texto })),
  };
}

/**
 * Crea el Issue de un requerimiento ya generado y guarda el resultado. Si falla por un error transitorio, programa
 * el siguiente reintento automático (mientras queden). Lanza Error si la conversación no tiene requerimiento.
 */
export async function enviarIssue(
  db: DB,
  id: string,
  cfg: ConfigGithub | null,
  op: OpcionesPeticion & { ahora?: () => Date } = {},
): Promise<ResultadoEnvio> {
  const ahora = op.ahora ?? (() => new Date());
  const datos = datosDelIssue(db, id);
  const c = conversacion(db, id)!;
  if (c.issue_numero) return { ok: true };
  if (enCurso.has(id)) return { ok: false, error: "El requerimiento ya se está enviando a GitHub" };
  enCurso.add(id);
  try {
    if (!cfg) throw new ErrorGithub(SIN_TOKEN, false);
    // Si hubo un intento anterior, pudo llegar a GitHub aunque se perdiera la respuesta: buscar antes de crear
    const issue = await crearIssueEn(cfg, datos, { ...op, comprobarDuplicado: c.issue_intentos > 0 || !!c.issue_error });
    // Recién creado: abierto y sin asignar hasta la próxima consulta a GitHub (#6)
    db.prepare(
      `UPDATE chat_conversaciones
          SET issue_numero = ?, issue_url = ?, issue_error = NULL, issue_estado = 'open', issue_actualizado_en = ?,
              issue_proximo_intento = NULL
        WHERE id = ?`,
    ).run(issue.numero, issue.url, ahora().toISOString(), id);
    return { ok: true };
  } catch (e) {
    const transitorio = e instanceof ErrorGithub ? e.transitorio : false;
    const error = e instanceof ErrorGithub ? e.message : "Error inesperado al crear el Issue";
    if (!(e instanceof ErrorGithub)) console.error("[chat-github]", e);
    const intentos = c.issue_intentos;
    const proximo =
      transitorio && intentos < MAX_REINTENTOS ? new Date(ahora().getTime() + ESPERAS_MIN[intentos] * 60_000).toISOString() : null;
    db.prepare("UPDATE chat_conversaciones SET issue_error = ?, issue_intentos = ?, issue_proximo_intento = ? WHERE id = ?").run(
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

/** Requerimientos con un reintento automático vencido. */
export function pendientesDeReintento(db: DB, ahora = new Date()): string[] {
  return (
    db
      .prepare(
        `SELECT id FROM chat_conversaciones
          WHERE estado = 'generada' AND issue_numero IS NULL AND issue_proximo_intento IS NOT NULL AND issue_proximo_intento <= ?
          ORDER BY issue_proximo_intento`,
      )
      .all(ahora.toISOString()) as { id: string }[]
  ).map((f) => f.id);
}

/** Reintenta los envíos vencidos, de a uno. Devuelve cuántos se enviaron. */
export async function procesarPendientes(db: DB, cfg: ConfigGithub | null, op: OpcionesPeticion & { ahora?: () => Date } = {}): Promise<number> {
  if (!cfg) return 0;
  let enviados = 0;
  for (const id of pendientesDeReintento(db, (op.ahora ?? (() => new Date()))())) {
    const r = await enviarIssue(db, id, cfg, op);
    if (r.ok) enviados++;
  }
  return enviados;
}

const global = globalThis as unknown as { __aetherReintentos?: ReturnType<typeof setInterval> };

/** Revisa cada minuto los reintentos vencidos (una sola vez por proceso, también con recargas de `next dev`). */
export function iniciarReintentos(obtenerDb: () => DB, obtenerCfg: () => ConfigGithub | null, cadaMs = 60_000) {
  if (global.__aetherReintentos) return;
  let ocupado = false;
  global.__aetherReintentos = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const n = await procesarPendientes(obtenerDb(), obtenerCfg());
      if (n) console.info(`[chat-github] ${n} requerimiento(s) enviado(s) a GitHub en reintento automático`);
    } catch (e) {
      console.error("[chat-github] reintentos automáticos:", e);
    } finally {
      ocupado = false;
    }
  }, cadaMs);
  global.__aetherReintentos.unref?.();
}
