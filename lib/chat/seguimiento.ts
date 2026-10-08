// Seguimiento de los requerimientos (#6): trae de GitHub el estado de los Issues creados por el portal (etiqueta
// «gerencia») y lo guarda en chat_conversaciones. Se consulta como máximo cada 10 minutos (al abrir el panel o
// «Mis requerimientos»); si GitHub falla, queda el último estado conocido con su fecha.
// Sin "server-only" para poder probarlo con un GitHub simulado: la configuración (token incluido) llega por parámetro.
import type Database from "better-sqlite3";

type DB = Database.Database;

export interface ConfigGithub {
  api: string; // https://api.github.com (o la de GitHub Enterprise)
  repo: string; // dueño/repositorio
  token: string;
}

export interface EstadoIssue {
  numero: number;
  estado: "open" | "closed";
  motivo: string | null; // state_reason: completed, not_planned, reopened…
  asignado: string | null; // login de la primera persona asignada
}

export const ETIQUETA_ISSUES = "gerencia";
const POR_PAGINA = 100;
const MAX_PAGINAS = 10;

/** Issues con la etiqueta «gerencia» (abiertos y cerrados); con `desde`, solo los que cambiaron desde ese instante. */
export async function listarIssues(cfg: ConfigGithub, desde?: string | null): Promise<EstadoIssue[]> {
  const lista: EstadoIssue[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const q = new URLSearchParams({ labels: ETIQUETA_ISSUES, state: "all", per_page: String(POR_PAGINA), page: String(pagina) });
    if (desde) q.set("since", desde);
    const res = await fetch(`${cfg.api}/repos/${cfg.repo}/issues?${q}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aether-ops",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub respondió HTTP ${res.status}`);
    const datos = (await res.json()) as {
      number: number;
      state: string;
      state_reason?: string | null;
      assignees?: { login: string }[];
      assignee?: { login: string } | null;
      pull_request?: unknown;
    }[];
    for (const i of datos) {
      if (i.pull_request) continue; // la API de Issues también devuelve pull requests
      lista.push({
        numero: i.number,
        estado: i.state === "closed" ? "closed" : "open",
        motivo: i.state_reason ?? null,
        asignado: i.assignees?.[0]?.login ?? i.assignee?.login ?? null,
      });
    }
    if (datos.length < POR_PAGINA) break;
  }
  return lista;
}

/**
 * Guarda los estados recibidos y marca todos los Issues conocidos como consultados en `ahora`
 * (los que no vinieron no cambiaron desde la consulta anterior). Devuelve cuántos se actualizaron.
 */
export function aplicarEstados(db: DB, lista: EstadoIssue[], ahora = new Date()): number {
  const iso = ahora.toISOString();
  return db.transaction(() => {
    let n = 0;
    const upd = db.prepare(
      "UPDATE chat_conversaciones SET issue_estado = ?, issue_motivo = ?, issue_asignado = ? WHERE issue_numero = ?",
    );
    for (const i of lista) n += upd.run(i.estado, i.motivo, i.asignado, i.numero).changes;
    db.prepare("UPDATE chat_conversaciones SET issue_actualizado_en = ? WHERE issue_numero IS NOT NULL").run(iso);
    return n;
  })();
}

// ── Consulta con límite de frecuencia (estado del proceso: hay un solo contenedor)
export const CADA_MS = 10 * 60_000; // automática: como máximo cada 10 minutos
export const FORZADA_MS = 60_000; // botón «Actualizar» del panel: como máximo cada minuto
const MARGEN_MS = 60_000; // `since` con un minuto de margen por diferencias de reloj

let ultimoOk: number | null = null;
let ultimoIntento: number | null = null;
let ultimoError: string | null = null;
let enCurso: Promise<void> | null = null;

export interface EstadoSincronizacion {
  sincronizado_en: string | null;
  error: string | null;
}

export function estadoSincronizacion(): EstadoSincronizacion {
  return { sincronizado_en: ultimoOk ? new Date(ultimoOk).toISOString() : null, error: ultimoError };
}

/** Solo para pruebas. */
export function reiniciarSincronizacion() {
  ultimoOk = ultimoIntento = null;
  ultimoError = null;
  enCurso = null;
}

/** Trae los estados de GitHub si corresponde (sin configuración no hace nada). Nunca lanza: guarda el error. */
export async function sincronizar(
  db: DB,
  cfg: ConfigGithub | null,
  op: { forzar?: boolean; ahora?: number } = {},
): Promise<EstadoSincronizacion> {
  if (!cfg) return estadoSincronizacion();
  const ahora = op.ahora ?? Date.now();
  const espera = op.forzar ? FORZADA_MS : CADA_MS;
  if (enCurso) {
    await enCurso;
    return estadoSincronizacion();
  }
  if (ultimoIntento !== null && ahora - ultimoIntento < espera) return estadoSincronizacion();
  ultimoIntento = ahora;
  enCurso = (async () => {
    try {
      const desde = ultimoOk ? new Date(ultimoOk - MARGEN_MS).toISOString() : null;
      aplicarEstados(db, await listarIssues(cfg, desde), new Date(ahora));
      ultimoOk = ahora;
      ultimoError = null;
    } catch (e) {
      ultimoError = (e as Error).message || "No se pudo consultar GitHub";
      console.warn("[chat-seguimiento]", ultimoError);
    }
  })();
  try {
    await enCurso;
  } finally {
    enCurso = null;
  }
  return estadoSincronizacion();
}

// ── Estado para mostrar
export type EstadoVisible = "pendiente" | "abierto" | "en_curso" | "cerrado" | "descartado";

export const NOMBRE_ESTADO: Record<EstadoVisible, string> = {
  pendiente: "Pendiente de envío",
  abierto: "Abierto",
  en_curso: "En curso",
  cerrado: "Cerrado",
  descartado: "Descartado",
};

/** Abierto, en curso (con persona asignada), cerrado o descartado (cerrado como «no planificado»). */
export function estadoVisible(c: {
  issue_numero: number | null;
  issue_estado: string | null;
  issue_motivo: string | null;
  issue_asignado: string | null;
}): EstadoVisible {
  if (!c.issue_numero) return "pendiente";
  if (c.issue_estado === "closed") return c.issue_motivo === "not_planned" ? "descartado" : "cerrado";
  return c.issue_asignado ? "en_curso" : "abierto";
}
