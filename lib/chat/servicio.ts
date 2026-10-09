// Casos de uso del portal gerencial para los route handlers: acceso por dominio, turnos y cierre con Issue.
import "server-only";
import type { NextRequest } from "next/server";
import { type Usuario, requireUsuario } from "../auth";
import { type DB, getDbControl } from "../db";
import { HttpError } from "../http";
import { type ResultadoEnvio, enviarIssue } from "./envio";
import { configGithub } from "./github";
import { type Arbol, arbolDe } from "./arboles";
import { type Linea, type Requerimiento, preguntaActual, requerimientoDesdeFlujo } from "./flujo";
import { MENSAJE_ACCESO_DENEGADO, codigoTicket, esDominioGerencia, moduloPorClave, type Modulo } from "./modulos";
import {
  type Conversacion,
  ErrorSala,
  type Persona,
  asignarTicket,
  conversacion,
  expiraEn,
  mensajes,
} from "./salas";
import { TURNOS_MAX, turnosDelAsistente } from "./uso";

/** Cualquier cuenta @datasheq.com (equipo, gerencia o administración); el resto, acceso denegado. */
export async function requireGerencia(req: NextRequest): Promise<{ u: Usuario; p: Persona; db: DB }> {
  const u = await requireUsuario(req);
  if (!esDominioGerencia(u.email)) throw new HttpError(403, MENSAJE_ACCESO_DENEGADO);
  return { u, p: personaDe(u), db: getDbControl() };
}

/** Panel del portal en /admin: administradores con email @datasheq.com. */
export async function requireAdminPortal(req: NextRequest): Promise<Usuario> {
  const u = await requireUsuario(req, ["admin"]);
  if (!esDominioGerencia(u.email)) throw new HttpError(403, MENSAJE_ACCESO_DENEGADO);
  return u;
}

export const personaDe = (u: Usuario): Persona => ({ id: u.id, rol: u.rol, email: u.email, nombre: u.nombre });

/** Convierte los errores de las salas en errores HTTP. */
export function enSala<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ErrorSala) throw new HttpError(e.status, e.message);
    throw e;
  }
}

export function moduloDe(c: Conversacion): Modulo {
  return moduloPorClave(c.modulo) as Modulo;
}

export function lineas(db: DB, id: string): Linea[] {
  return mensajes(db, id).map((m) => ({ autor: m.autor, texto: m.texto, meta: m.meta }));
}

/** Vista de la conversación para el cliente. */
export function vistaConversacion(db: DB, id: string) {
  const c = conversacion(db, id) as Conversacion;
  return {
    id: c.id,
    modulo: c.modulo,
    estado: c.estado,
    completitud: c.completitud,
    expira_en: c.estado === "activa" ? expiraEn(c.ultima_actividad) : null,
    ticket: c.ticket ? codigoTicket(c.ticket) : null,
    issue_url: c.issue_url,
    issue_error: c.issue_error,
    turnos: turnosDelAsistente(db, id),
    turnos_max: TURNOS_MAX,
    // Pregunta en curso del árbol (botones de respuesta), solo mientras la conversación está abierta
    pregunta: c.estado === "activa" ? preguntaActual(arbolDe(c.modulo) as Arbol, lineas(db, id)) : null,
    mensajes: mensajes(db, id),
  };
}

export function arbolDeConversacion(c: Conversacion): Arbol {
  const a = arbolDe(c.modulo);
  if (!a) throw new HttpError(500, `La sala ${c.modulo} no tiene árbol de preguntas`);
  return a;
}

/**
 * Crea el Issue de una conversación ya generada (con reintentos ante errores transitorios y, si sigue fallando,
 * reintentos automáticos programados; ver ./envio) y guarda el resultado.
 */
export async function publicarIssue(db: DB, id: string): Promise<ResultadoEnvio> {
  const c = conversacion(db, id);
  if (!c || c.estado !== "generada" || !c.ticket || !c.requerimiento_json) throw new HttpError(409, "La conversación no tiene un requerimiento generado");
  return enviarIssue(db, id, configGithub());
}

/**
 * Cierra la entrevista: el requerimiento se arma con las respuestas del árbol (reglas fijas, sin IA), se asigna el
 * ticket, se libera la sala y se crea el Issue. Si GitHub falla, queda guardado con el error y se reintenta desde /admin.
 */
export async function generarRequerimiento(db: DB, c: Conversacion, p: Persona) {
  const m = moduloDe(c);
  const l = lineas(db, c.id);
  if (!l.some((x) => x.autor === "usuario")) throw new HttpError(400, "Cuéntame primero qué necesitas para poder generar el requerimiento.");
  const r = requerimientoDesdeFlujo(arbolDeConversacion(c), m, l);

  const ahora = new Date().toISOString();
  const ticket = db.transaction(() => {
    const cambio = db
      .prepare(
        `UPDATE chat_conversaciones
            SET estado = 'generada', terminada_en = ?, titulo = ?, prioridad = ?, clasificacion = ?, requerimiento_json = ?, completitud = 100
          WHERE id = ? AND estado IN ('activa', 'expirada')`,
      )
      .run(ahora, r.titulo, r.prioridad, r.clasificacion, JSON.stringify(r), c.id);
    if (cambio.changes === 0) throw new HttpError(409, "Este requerimiento ya fue generado.");
    db.prepare("DELETE FROM chat_salas WHERE conversacion_id = ?").run(c.id);
    const n = asignarTicket(db, c.id);
    db.prepare("INSERT INTO chat_mensajes (conversacion_id, autor, texto, creado_en) VALUES (?, 'sistema', ?, ?)").run(
      c.id,
      `Requerimiento ${codigoTicket(n)} generado: ${r.titulo}`,
      ahora,
    );
    return n;
  })();

  const issue = await publicarIssue(db, c.id);
  const t = codigoTicket(ticket);
  const despedida = issue.ok
    ? `Muchas gracias, ${p.nombre.split(/\s+/)[0]}. Generé el requerimiento ${t} y lo envié al equipo de desarrollo. Fue un gusto colaborar contigo; la sala ya está libre.`
    : `Muchas gracias, ${p.nombre.split(/\s+/)[0]}. Generé el requerimiento ${t} y quedó registrado. El envío a GitHub está pendiente y el administrador lo completará. La sala ya está libre.`;
  db.prepare("INSERT INTO chat_mensajes (conversacion_id, autor, texto) VALUES (?, 'robot', ?)").run(c.id, despedida);
  return { ticket: t, requerimiento: r, issue };
}
