// Salas del portal gerencial: una persona por módulo, liberación al finalizar o por inactividad.
// Todo vive en control.db (las cuentas de gerencia y los administradores de @datasheq.com comparten el portal).
// Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { MENSAJE_SALA_OCUPADA, MODULOS, type ClaveModulo, type Modulo, moduloPorClave } from "./modulos";

type DB = Database.Database;

const minutos = Number(process.env.CHAT_INACTIVIDAD_MIN);
/** Minutos sin actividad tras los cuales la sala se libera sola. */
export const INACTIVIDAD_MIN = Number.isFinite(minutos) && minutos >= 1 ? minutos : 15;

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

export type EstadoConversacion = "activa" | "generada" | "finalizada" | "expirada";
export type Autor = "robot" | "usuario" | "sistema";

export interface Conversacion {
  id: string;
  modulo: ClaveModulo;
  usuario_id: string;
  usuario_rol: string;
  usuario_email: string;
  usuario_nombre: string;
  estado: EstadoConversacion;
  completitud: number;
  iniciada_en: string;
  ultima_actividad: string;
  terminada_en: string | null;
  ticket: number | null;
  titulo: string | null;
  prioridad: string | null;
  clasificacion: string | null;
  requerimiento_json: string | null;
  issue_numero: number | null;
  issue_url: string | null;
  issue_error: string | null;
}

export interface Mensaje {
  id: number;
  autor: Autor;
  texto: string;
  meta: Record<string, unknown> | null;
  creado_en: string;
}

const iso = (d: Date) => d.toISOString();
const limite = (ahora: Date) => iso(new Date(ahora.getTime() - INACTIVIDAD_MIN * 60_000));
/** Instante en que la sala se libera si no hay más actividad. */
export const expiraEn = (ultimaActividad: string) =>
  iso(new Date(new Date(ultimaActividad).getTime() + INACTIVIDAD_MIN * 60_000));

export function saludo(m: Modulo, nombre: string): string {
  const primerNombre = nombre.trim().split(/\s+/)[0] || nombre;
  return (
    `Hola, ${primerNombre}. Bienvenido al portal gerencial de DataSheq. Es un gusto saludarte. ` +
    `Estás en la sala ${m.nombre} (${m.area}): ${m.descripcion.charAt(0).toLowerCase()}${m.descripcion.slice(1)} ` +
    "¿En qué te puedo colaborar hoy?"
  );
}

export function conversacion(db: DB, id: string): Conversacion | undefined {
  return db.prepare("SELECT * FROM chat_conversaciones WHERE id = ?").get(id) as Conversacion | undefined;
}

export function mensajes(db: DB, conversacionId: string): Mensaje[] {
  const filas = db
    .prepare("SELECT id, autor, texto, meta_json, creado_en FROM chat_mensajes WHERE conversacion_id = ? ORDER BY id")
    .all(conversacionId) as (Omit<Mensaje, "meta"> & { meta_json: string | null })[];
  return filas.map(({ meta_json, ...m }) => ({ ...m, meta: meta_json ? JSON.parse(meta_json) : null }));
}

export function agregarMensaje(db: DB, conversacionId: string, autor: Autor, texto: string, meta?: Record<string, unknown>, ahora = new Date()) {
  db.prepare("INSERT INTO chat_mensajes (conversacion_id, autor, texto, meta_json, creado_en) VALUES (?, ?, ?, ?, ?)").run(
    conversacionId,
    autor,
    texto,
    meta ? JSON.stringify(meta) : null,
    iso(ahora),
  );
}

/** Marca actividad: la sala sigue ocupada otros INACTIVIDAD_MIN minutos. */
export function tocar(db: DB, conversacionId: string, ahora = new Date()) {
  db.prepare("UPDATE chat_conversaciones SET ultima_actividad = ? WHERE id = ? AND estado = 'activa'").run(iso(ahora), conversacionId);
}

/** Termina la conversación y libera su sala. Sin mensajes de la persona, no queda en el historial. */
export function cerrarConversacion(db: DB, id: string, estado: Exclude<EstadoConversacion, "activa">, ahora = new Date()) {
  db.transaction(() => {
    db.prepare("DELETE FROM chat_salas WHERE conversacion_id = ?").run(id);
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM chat_mensajes WHERE conversacion_id = ? AND autor = 'usuario'")
      .get(id) as { n: number };
    if (n === 0 && estado !== "generada") {
      db.prepare("DELETE FROM chat_conversaciones WHERE id = ?").run(id);
      return;
    }
    db.prepare("UPDATE chat_conversaciones SET estado = ?, terminada_en = ? WHERE id = ? AND estado = 'activa'").run(estado, iso(ahora), id);
  })();
}

/** Libera las salas sin actividad en los últimos INACTIVIDAD_MIN minutos. Devuelve cuántas liberó. */
export function expirarInactivas(db: DB, ahora = new Date()): number {
  const vencidas = db
    .prepare(
      `SELECT c.id FROM chat_conversaciones c
        WHERE c.estado = 'activa' AND c.ultima_actividad < ?`,
    )
    .all(limite(ahora)) as { id: string }[];
  for (const { id } of vencidas) cerrarConversacion(db, id, "expirada", ahora);
  return vencidas.length;
}

/**
 * Entra a una sala. Si está libre, la bloquea para la persona y abre una conversación con el saludo; si ya es
 * suya, retoma la conversación; si la ocupa otra persona, lanza 409. Al entrar a una sala se liberan las otras
 * salas que la persona tuviera ocupadas (una sala a la vez).
 */
export function entrarSala(db: DB, clave: string, p: Persona, ahora = new Date()): { conversacion: Conversacion; nueva: boolean } {
  const m = moduloPorClave(clave);
  if (!m) throw new ErrorSala(404, "Módulo desconocido");
  return db.transaction(() => {
    expirarInactivas(db, ahora);
    const ocupada = db.prepare("SELECT conversacion_id, usuario_email FROM chat_salas WHERE modulo = ?").get(m.clave) as
      | { conversacion_id: string; usuario_email: string }
      | undefined;
    if (ocupada) {
      if (ocupada.usuario_email.toLowerCase() !== p.email.toLowerCase()) throw new ErrorSala(409, MENSAJE_SALA_OCUPADA);
      tocar(db, ocupada.conversacion_id, ahora);
      return { conversacion: conversacion(db, ocupada.conversacion_id) as Conversacion, nueva: false };
    }

    const otras = db.prepare("SELECT conversacion_id FROM chat_salas WHERE usuario_email = ? COLLATE NOCASE").all(p.email) as {
      conversacion_id: string;
    }[];
    for (const o of otras) cerrarConversacion(db, o.conversacion_id, "finalizada", ahora);

    const id = randomUUID();
    db.prepare(
      `INSERT INTO chat_conversaciones (id, modulo, usuario_id, usuario_rol, usuario_email, usuario_nombre, iniciada_en, ultima_actividad)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, m.clave, p.id, p.rol, p.email.toLowerCase(), p.nombre, iso(ahora), iso(ahora));
    db.prepare("INSERT INTO chat_salas (modulo, conversacion_id, usuario_email, desde) VALUES (?, ?, ?, ?)").run(
      m.clave,
      id,
      p.email.toLowerCase(),
      iso(ahora),
    );
    agregarMensaje(db, id, "robot", saludo(m, p.nombre), { tema: 0, completitud: 0 }, ahora);
    return { conversacion: conversacion(db, id) as Conversacion, nueva: true };
  })();
}

/** Conversación activa de la persona (y con su sala aún bloqueada), o error 403/410. */
export function exigirActiva(db: DB, id: string, p: Persona, ahora = new Date()): Conversacion {
  expirarInactivas(db, ahora);
  const c = conversacion(db, id);
  if (!c || c.usuario_email.toLowerCase() !== p.email.toLowerCase()) throw new ErrorSala(404, "Conversación no encontrada");
  if (c.estado === "expirada") {
    throw new ErrorSala(410, "La sesión se cerró por inactividad y la sala quedó liberada. Puedes volver a entrar para comenzar de nuevo.");
  }
  if (c.estado !== "activa") throw new ErrorSala(410, "Esta conversación ya terminó.");
  return c;
}

/** Asigna el siguiente número de ticket (si aún no tiene) y lo devuelve. */
export function asignarTicket(db: DB, id: string): number {
  db.prepare(
    "UPDATE chat_conversaciones SET ticket = (SELECT COALESCE(MAX(ticket), 0) + 1 FROM chat_conversaciones) WHERE id = ? AND ticket IS NULL",
  ).run(id);
  return (db.prepare("SELECT ticket FROM chat_conversaciones WHERE id = ?").get(id) as { ticket: number }).ticket;
}

export interface EstadoSala {
  clave: ClaveModulo;
  ocupada: boolean;
  propia: boolean;
  desde: string | null;
  ultima_actividad: string | null;
  expira_en: string | null;
  /** Solo para administradores (el resto solo ve «en uso»). */
  usuario_nombre?: string;
  usuario_email?: string;
  conversacion_id?: string;
}

export function estadoSalas(db: DB, p: Persona | null, conDetalle = false, ahora = new Date()): EstadoSala[] {
  expirarInactivas(db, ahora);
  const filas = db
    .prepare(
      `SELECT s.modulo, s.desde, s.usuario_email, c.id AS conversacion_id, c.usuario_nombre, c.ultima_actividad
         FROM chat_salas s JOIN chat_conversaciones c ON c.id = s.conversacion_id`,
    )
    .all() as { modulo: string; desde: string; usuario_email: string; conversacion_id: string; usuario_nombre: string; ultima_actividad: string }[];
  return MODULOS.map((m) => {
    const f = filas.find((x) => x.modulo === m.clave);
    const propia = !!f && !!p && f.usuario_email.toLowerCase() === p.email.toLowerCase();
    return {
      clave: m.clave,
      ocupada: !!f,
      propia,
      desde: f?.desde ?? null,
      ultima_actividad: f && (conDetalle || propia) ? f.ultima_actividad : null,
      expira_en: f && (conDetalle || propia) ? expiraEn(f.ultima_actividad) : null,
      ...(conDetalle && f
        ? { usuario_nombre: f.usuario_nombre, usuario_email: f.usuario_email, conversacion_id: f.conversacion_id }
        : {}),
    };
  });
}

/** Liberación forzada por un administrador. */
export function liberarSala(db: DB, clave: string, ahora = new Date()): boolean {
  const f = db.prepare("SELECT conversacion_id FROM chat_salas WHERE modulo = ?").get(clave) as { conversacion_id: string } | undefined;
  if (!f) return false;
  cerrarConversacion(db, f.conversacion_id, "finalizada", ahora);
  return true;
}
