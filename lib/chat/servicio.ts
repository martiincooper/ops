// Casos de uso del portal gerencial para los route handlers: acceso por dominio, turnos y cierre con Issue.
import "server-only";
import type { NextRequest } from "next/server";
import { type Usuario, requireUsuario } from "../auth";
import { type DB, getDbControl } from "../db";
import { HttpError } from "../http";
import { crearIssue, ErrorGithub } from "./github";
import type { Linea, Requerimiento } from "./guion";
import { redactar } from "./ia";
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
import { TURNOS_MAX, sumarConsumo, turnosDelAsistente } from "./uso";

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
    mensajes: mensajes(db, id),
  };
}

/** Intenta crear el Issue de una conversación ya generada y guarda el resultado (número/URL o error). */
export async function publicarIssue(db: DB, id: string): Promise<{ ok: boolean; error?: string }> {
  const c = conversacion(db, id);
  if (!c || c.estado !== "generada" || !c.ticket || !c.requerimiento_json) throw new HttpError(409, "La conversación no tiene un requerimiento generado");
  if (c.issue_numero) return { ok: true };
  const transcripcion = lineas(db, id)
    .filter((l) => l.autor !== "sistema")
    .map((l) => ({ autor: l.autor === "robot" ? "Asistente" : c.usuario_nombre, texto: l.texto }));
  try {
    const issue = await crearIssue({
      ticket: c.ticket,
      modulo: moduloDe(c),
      requerimiento: JSON.parse(c.requerimiento_json) as Requerimiento,
      solicitante: { nombre: c.usuario_nombre, email: c.usuario_email },
      conversacionId: c.id,
      fecha: c.terminada_en ?? c.iniciada_en,
      transcripcion,
    });
    db.prepare("UPDATE chat_conversaciones SET issue_numero = ?, issue_url = ?, issue_error = NULL WHERE id = ?").run(issue.numero, issue.url, id);
    return { ok: true };
  } catch (e) {
    const error = e instanceof ErrorGithub ? e.message : "Error inesperado al crear el Issue";
    if (!(e instanceof ErrorGithub)) console.error("[chat-github]", e);
    db.prepare("UPDATE chat_conversaciones SET issue_error = ? WHERE id = ?").run(error, id);
    return { ok: false, error };
  }
}

/**
 * Cierra la entrevista: la IA clasifica y redacta, se asigna el ticket, se libera la sala y se crea el Issue.
 * Si GitHub falla, el requerimiento queda guardado con el error y se reintenta desde /admin.
 */
export async function generarRequerimiento(db: DB, c: Conversacion, p: Persona) {
  const m = moduloDe(c);
  const l = lineas(db, c.id);
  if (!l.some((x) => x.autor === "usuario")) throw new HttpError(400, "Cuéntame primero qué necesitas para poder generar el requerimiento.");
  const { requerimiento: r, consumo } = await redactar(m, p, l);
  sumarConsumo(db, c.id, consumo); // lo gastado cuenta aunque el requerimiento ya se hubiera generado en otra pestaña

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
    ? `Muchas gracias, ${p.nombre.split(/\s+/)[0]}. Generé el requerimiento ${t} y lo envié al equipo de desarrollo. Fue un gusto colaborarte; la sala ya quedó liberada.`
    : `Muchas gracias, ${p.nombre.split(/\s+/)[0]}. Generé el requerimiento ${t} y quedó registrado; el envío a GitHub quedó pendiente y el administrador lo completará. La sala ya quedó liberada.`;
  db.prepare("INSERT INTO chat_mensajes (conversacion_id, autor, texto) VALUES (?, 'robot', ?)").run(c.id, despedida);
  return { ticket: t, requerimiento: r, issue };
}
