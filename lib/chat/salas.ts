// Salas del portal gerencial: cada sala es un chat grupal. Una sala tiene muchas solicitudes (a lo más una abierta);
// los mensajes pertenecen a una solicitud. Cualquier cantidad de gerentes puede estar en una sala a la vez: no hay
// bloqueo ni expiración por inactividad. Todo vive en control.db.
// Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { moduloPorClave, MODULOS } from "./modulos";
import { type Entorno, reposDeModulos } from "./repos";

type DB = Database.Database;

export class ErrorSala extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Persona {
  id: string;
  rol: string;
  email: string;
  nombre: string;
}

/** abierta: recibe mensajes; terminada: el asistente la cerró y se envía a GitHub; cerrada: cerrada sin enviar. */
export type EstadoSolicitud = "abierta" | "terminada" | "cerrada";
export type Rol = "gerente" | "asistente" | "sistema";
export type EstadoAsistente = "idle" | "pensando" | "esperando_reintento";

export interface Solicitud {
  id: string;
  sala: string;
  estado: EstadoSolicitud;
  ticket: number;
  iniciada_en: string;
  terminada_en: string | null;
  titulo: string | null;
  asistente_sesion: string | null;
  asistente_estado: EstadoAsistente;
  asistente_proximo_intento: string | null;
  terminado: 0 | 1;
  resumen: string | null;
  issue_numero: number | null;
  issue_url: string | null;
  issue_repo: string | null;
  issue_error: string | null;
  issue_estado: "open" | "closed" | null;
  issue_motivo: string | null;
  issue_asignado: string | null;
  issue_actualizado_en: string | null;
  issue_intentos: number;
  issue_proximo_intento: string | null;
}

export interface Mensaje {
  id: number;
  solicitud_id: string;
  autor_email: string;
  autor_nombre: string;
  rol: Rol;
  texto: string;
  creado_en: string;
}

export interface Participante {
  email: string;
  nombre: string;
}

export const SALA_NO_DISPONIBLE = "Esta sala no está disponible";
export const TEXTO_MAX = 4000;

const iso = (d: Date) => d.toISOString();

export function solicitud(db: DB, id: string): Solicitud | undefined {
  return db.prepare("SELECT * FROM chat_solicitudes WHERE id = ?").get(id) as Solicitud | undefined;
}

/** Solicitud abierta de la sala, si hay. */
export function solicitudAbierta(db: DB, sala: string): Solicitud | undefined {
  return db.prepare("SELECT * FROM chat_solicitudes WHERE sala = ? AND estado = 'abierta'").get(sala) as Solicitud | undefined;
}

export function participantes(db: DB, solicitudId: string): Participante[] {
  return db
    .prepare("SELECT email, nombre FROM chat_participantes WHERE solicitud_id = ? ORDER BY desde, email")
    .all(solicitudId) as Participante[];
}

/** Mensajes de una solicitud, en orden. */
export function mensajes(db: DB, solicitudId: string): Mensaje[] {
  return db.prepare("SELECT * FROM chat_mensajes WHERE solicitud_id = ? ORDER BY id").all(solicitudId) as Mensaje[];
}

/** Asigna el siguiente número de ticket (GER-0001 tras la migración v7). */
function siguienteTicket(db: DB): number {
  return (db.prepare("SELECT COALESCE(MAX(ticket), 0) + 1 AS n FROM chat_solicitudes").get() as { n: number }).n;
}

/** La sala existe y está disponible (su módulo tiene repositorio de GitHub); si no, 404. */
export function exigirSala(clave: string, env: Entorno = process.env): string {
  const m = moduloPorClave(clave);
  if (!m) throw new ErrorSala(404, "Módulo desconocido");
  if (!reposDeModulos(env)[m.clave]) throw new ErrorSala(404, SALA_NO_DISPONIBLE);
  return m.clave;
}

/**
 * Guarda un mensaje de una persona en la sala y vuelve de inmediato. Si la sala no tiene una solicitud abierta, el
 * mensaje abre una; quien escribe queda como participante de la solicitud.
 */
export function enviarMensaje(
  db: DB,
  sala: string,
  p: Persona,
  texto: string,
  ahora = new Date(),
  env: Entorno = process.env,
): { mensaje: Mensaje; solicitud: Solicitud; nueva: boolean } {
  const clave = exigirSala(sala, env);
  const t = texto.trim();
  if (!t) throw new ErrorSala(400, "Escribe un mensaje");
  if (t.length > TEXTO_MAX) throw new ErrorSala(400, `Máximo ${TEXTO_MAX} caracteres`);
  return db.transaction(() => {
    let s = solicitudAbierta(db, clave);
    const nueva = !s;
    if (!s) {
      const id = randomUUID();
      db.prepare("INSERT INTO chat_solicitudes (id, sala, ticket, iniciada_en) VALUES (?, ?, ?, ?)").run(id, clave, siguienteTicket(db), iso(ahora));
      s = solicitud(db, id) as Solicitud;
    }
    const email = p.email.toLowerCase();
    db.prepare("INSERT OR IGNORE INTO chat_participantes (solicitud_id, email, nombre, desde) VALUES (?, ?, ?, ?)").run(s.id, email, p.nombre, iso(ahora));
    const { lastInsertRowid } = db
      .prepare("INSERT INTO chat_mensajes (solicitud_id, autor_email, autor_nombre, rol, texto, creado_en) VALUES (?, ?, ?, 'gerente', ?, ?)")
      .run(s.id, email, p.nombre, t, iso(ahora));
    const mensaje = db.prepare("SELECT * FROM chat_mensajes WHERE id = ?").get(lastInsertRowid) as Mensaje;
    return { mensaje, solicitud: s, nueva };
  })();
}

export interface SolicitudVista {
  id: string;
  ticket: number;
  estado: EstadoSolicitud;
  iniciada_en: string;
  terminada_en: string | null;
  issue_url: string | null;
}

export interface VistaSala {
  /** Todas las solicitudes de la sala, de la más antigua a la más nueva. */
  solicitudes: SolicitudVista[];
  /** Mensajes de la sala en orden (con `desde`, solo los de id mayor). */
  mensajes: Mensaje[];
  /** Id del último mensaje de la sala (0 si no hay): desde ahí consulta el cliente. */
  ultimo_id: number;
}

/**
 * Historial completo de la sala (todas sus solicitudes con sus mensajes) o, con `desde`, solo los mensajes con id
 * mayor (para consultar cada 2 a 3 segundos).
 */
export function vistaSala(db: DB, sala: string, desde = 0): VistaSala {
  const solicitudes = db
    .prepare("SELECT id, ticket, estado, iniciada_en, terminada_en, issue_url FROM chat_solicitudes WHERE sala = ? ORDER BY ticket")
    .all(sala) as SolicitudVista[];
  const msgs = db
    .prepare(
      `SELECT m.* FROM chat_mensajes m JOIN chat_solicitudes s ON s.id = m.solicitud_id
        WHERE s.sala = ? AND m.id > ? ORDER BY m.id`,
    )
    .all(sala, desde) as Mensaje[];
  const { ultimo } = db
    .prepare("SELECT COALESCE(MAX(m.id), 0) AS ultimo FROM chat_mensajes m JOIN chat_solicitudes s ON s.id = m.solicitud_id WHERE s.sala = ?")
    .get(sala) as { ultimo: number };
  return { solicitudes, mensajes: msgs, ultimo_id: ultimo };
}

export interface EstadoSala {
  clave: string;
  /** Hay una solicitud abierta en la sala. */
  abierta: boolean;
  /** Mensajes de la solicitud abierta. */
  mensajes: number;
  /** Solo para administradores: repositorio de GitHub del módulo (null: sala oculta en el portal). */
  repo?: string | null;
}

/**
 * Estado de las salas. Sin detalle (portal) solo devuelve las activas, es decir, las de módulos con repositorio
 * asignado; con detalle (panel de administración) devuelve todas, con su repositorio.
 */
export function estadoSalas(db: DB, conDetalle = false, env: Entorno = process.env): EstadoSala[] {
  const repos = reposDeModulos(env);
  const filas = db
    .prepare(
      `SELECT s.sala, (SELECT COUNT(*) FROM chat_mensajes m WHERE m.solicitud_id = s.id) AS n
         FROM chat_solicitudes s WHERE s.estado = 'abierta'`,
    )
    .all() as { sala: string; n: number }[];
  return MODULOS.filter((m) => conDetalle || repos[m.clave]).map((m) => {
    const f = filas.find((x) => x.sala === m.clave);
    return { clave: m.clave, abierta: !!f, mensajes: f?.n ?? 0, ...(conDetalle ? { repo: repos[m.clave] } : {}) };
  });
}
