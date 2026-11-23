// Repositorio de cada sala: se acepta como URL o «dueño/repo», se guarda normalizado y se verifica con la cuenta de
// DataSHEQ (datasheq-creator) al guardar. Sin "server-only" para poder probarlo contra un GitHub simulado.
import type Database from "better-sqlite3";
import { ErrorModulo, type DatosModulo, crearModulo, editarModulo, fijarRepo, moduloPorClave, exigirSinConversacion } from "./catalogo";
import { ErrorGithub, type OpcionesPeticion, peticion, verificarCuenta } from "./githubApi";
import { enviarIssue } from "./envio";
import { type Modulo, codigoTicket } from "./modulos";
import { type Solicitud, solicitud } from "./salas";
import { type ConfigCuenta, paraRepo } from "./seguimiento";

type DB = Database.Database;

export const MSG_SIN_TOKEN = "GITHUB_TOKEN no está configurado en el servidor: no se puede verificar el repositorio";

/**
 * `https://github.com/dueno/repo`, `https://github.com/dueno/repo.git` o `dueno/repo` → `dueno/repo`.
 * Texto vacío: sin repositorio (null). Lanza ErrorModulo 400 si no se reconoce.
 */
export function normalizarRepo(texto: string | null | undefined): string | null {
  let t = (texto ?? "").trim();
  if (!t) return null;
  t = t.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(t) || t.endsWith("/.") || t.endsWith("/..")) {
    throw new ErrorModulo(400, "El repositorio debe ser https://github.com/dueno/repo o dueno/repo");
  }
  return t;
}

/** Por qué no se pudo verificar el repositorio (se muestra en línea en el editor de salas). */
export class ErrorRepo extends Error {}

/**
 * Comprueba con GitHub que el token es de la cuenta de DataSHEQ y que esta puede escribir en el repositorio y tiene
 * los Issues activados. Lanza ErrorRepo con la causa.
 */
export async function verificarRepo(cuenta: ConfigCuenta | null, repo: string, op: OpcionesPeticion = {}): Promise<void> {
  if (!cuenta) throw new ErrorRepo(MSG_SIN_TOKEN);
  try {
    await verificarCuenta(cuenta, op);
    const res = await peticion(paraRepo(cuenta, repo), "", {}, op);
    if (res.status === 404) throw new ErrorRepo(`${cuenta.cuenta} no es colaborador de este repositorio (o el repositorio no existe)`);
    if (res.status === 401) throw new ErrorRepo("El token de GitHub no es válido o expiró");
    if (!res.ok) throw new ErrorRepo(`GitHub respondió HTTP ${res.status} al consultar el repositorio`);
    const r = (await res.json()) as { permissions?: { push?: boolean }; has_issues?: boolean };
    if (r.permissions?.push !== true) throw new ErrorRepo(`${cuenta.cuenta} no tiene acceso de escritura en este repositorio`);
    if (r.has_issues !== true) throw new ErrorRepo("El repositorio tiene los Issues desactivados");
  } catch (e) {
    if (e instanceof ErrorRepo) throw e;
    if (e instanceof ErrorGithub) throw new ErrorRepo(e.message);
    throw e;
  }
}

export interface ResultadoGuardado {
  sala: Modulo;
  /** Causa por la que el repositorio no se verificó: la sala quedó guardada, gris. */
  error_repo?: string;
}

/**
 * Guarda una sala (nueva si `clave` es null) y su repositorio. Cambiar o quitar el repositorio se rechaza (409) con una
 * conversación abierta. Con repositorio se verifica; si falla, la sala se guarda sin verificar (gris) con el motivo.
 * `repo` undefined: no se toca.
 */
export async function guardarSala(
  db: DB,
  cuenta: ConfigCuenta | null,
  clave: string | null,
  datos: Partial<DatosModulo>,
  repoTexto: string | null | undefined,
  op: OpcionesPeticion = {},
): Promise<ResultadoGuardado> {
  const repo = repoTexto === undefined ? undefined : normalizarRepo(repoTexto);
  const previo = clave ? moduloPorClave(db, clave) : undefined;
  if (clave && !previo) throw new ErrorModulo(404, "Sala no encontrada");
  if (previo && repo !== undefined && repo !== previo.repo) exigirSinConversacion(db, previo.clave);
  const sala = clave ? editarModulo(db, clave, datos) : crearModulo(db, datos);
  if (repo === undefined) {
    if (!sala.repo) return { sala };
  } else if (repo === null) {
    return { sala: fijarRepo(db, sala.clave, null, null) };
  }
  const objetivo = (repo ?? sala.repo) as string;
  try {
    await verificarRepo(cuenta, objetivo, op);
  } catch (e) {
    if (!(e instanceof ErrorRepo)) throw e;
    return { sala: fijarRepo(db, sala.clave, objetivo, null), error_repo: e.message };
  }
  return { sala: fijarRepo(db, sala.clave, objetivo, new Date().toISOString()) };
}

export interface ResultadoActivacion {
  sala: Modulo;
  /** Causa por la que el repositorio no se verificó: la sala sigue propuesta. */
  error_repo?: string;
  /** Una por especificación guardada, de la más antigua a la más nueva (vacío si no se activó). */
  envios: { id: string; ticket: string; titulo: string; ok: boolean; error?: string; issue_url: string | null; issue_estado: "open" | "closed" | null }[];
}

export const MSG_REPO_EN_USO = "Ese repositorio ya es el de otra sala";
export const MSG_NO_PROPUESTA = "La sala no es un módulo propuesto";

/**
 * Activa un módulo propuesto con el repositorio que el administrador creó a mano: lo normaliza y verifica (como en el
 * editor de salas), lo guarda, pasa la sala a «activo» y envía por el envío normal cada especificación guardada, la
 * más antigua primero. Sin repositorio verificado la sala sigue propuesta (`error_repo`). 409 con una conversación
 * abierta con mensajes o con un repositorio que ya es de otra sala. Lo que no se pudo enviar queda con su error para
 * «Reintentar» (o el reintento automático).
 */
export async function activarModulo(
  db: DB,
  cuenta: ConfigCuenta | null,
  clave: string,
  repoTexto: string | null | undefined,
  op: OpcionesPeticion & { ahora?: () => Date } = {},
): Promise<ResultadoActivacion> {
  const previo = moduloPorClave(db, clave);
  if (!previo) throw new ErrorModulo(404, "Sala no encontrada");
  if (previo.estado_modulo !== "propuesto") throw new ErrorModulo(409, MSG_NO_PROPUESTA);
  const repo = normalizarRepo(repoTexto);
  if (!repo) throw new ErrorModulo(400, "Pega el repositorio: https://github.com/dueno/repo o dueno/repo");
  exigirSinConversacion(db, clave);
  const enUso = db.prepare("SELECT 1 FROM chat_modulos WHERE repo = ? COLLATE NOCASE AND clave <> ?").get(repo, clave);
  if (enUso) throw new ErrorModulo(409, MSG_REPO_EN_USO);
  try {
    await verificarRepo(cuenta, repo, op);
  } catch (e) {
    if (!(e instanceof ErrorRepo)) throw e;
    return { sala: previo, error_repo: e.message, envios: [] };
  }
  // durante la verificación pudo cambiar todo: se vuelve a comprobar y se activa de una vez
  const sala = db.transaction(() => {
    const m = moduloPorClave(db, clave);
    if (!m || m.estado_modulo !== "propuesto") throw new ErrorModulo(409, MSG_NO_PROPUESTA);
    exigirSinConversacion(db, clave);
    if (db.prepare("SELECT 1 FROM chat_modulos WHERE repo = ? COLLATE NOCASE AND clave <> ?").get(repo, clave)) throw new ErrorModulo(409, MSG_REPO_EN_USO);
    db.prepare("UPDATE chat_modulos SET repo = ?, repo_verificado_en = ?, estado_modulo = 'activo', actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE clave = ?").run(
      repo,
      (op.ahora?.() ?? new Date()).toISOString(),
      clave,
    );
    db.prepare("UPDATE chat_solicitudes SET modulo_nuevo = 1, issue_error = NULL WHERE sala = ? AND estado = 'terminada' AND spec IS NOT NULL AND issue_numero IS NULL").run(clave);
    return moduloPorClave(db, clave) as Modulo;
  })();
  const pendientes = db
    .prepare("SELECT id FROM chat_solicitudes WHERE sala = ? AND estado = 'terminada' AND spec IS NOT NULL AND issue_numero IS NULL ORDER BY ticket")
    .all(clave) as { id: string }[];
  const envios: ResultadoActivacion["envios"] = [];
  for (const { id } of pendientes) {
    const r = await enviarIssue(db, id, cuenta, op);
    const s = solicitud(db, id) as Solicitud;
    envios.push({ id, ticket: codigoTicket(s.ticket), titulo: s.titulo ?? "", ok: r.ok, ...(r.error ? { error: r.error } : {}), issue_url: s.issue_url, issue_estado: s.issue_estado });
  }
  return { sala, envios };
}
