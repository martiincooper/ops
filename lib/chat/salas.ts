// Salas del portal gerencial: cada sala es un chat grupal. Una sala tiene muchas solicitudes (a lo más una abierta);
// los mensajes pertenecen a una solicitud. Cualquier cantidad de gerentes puede estar en una sala a la vez: no hay
// bloqueo ni expiración por inactividad. Todo vive en control.db.
// Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  type Adjunto,
  type FotoEntrada,
  FOTOS_MAX_POR_SOLICITUD,
  FOTO_MAX_BYTES,
  MSG_FOTOS_LIMITE,
  MSG_FOTO_GRANDE,
  MSG_FOTO_TIPO,
  detectarTipo,
  dirAdjuntos,
  extensionDe,
  nombreSeguro,
} from "./adjuntos";
import { listarModulos, moduloPorClave } from "./catalogo";
import { type Autonomia, type EstadoModulo, salaAbierta } from "./modulos";

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
  asistente_hasta: number;
  asistente_intentos: number;
  asistente_error: string | null;
  terminado: 0 | 1;
  resumen: string | null;
  spec: string | null;
  cierre_intentos: number;
  cierre_error: string | null;
  cierre_proximo_intento: string | null;
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
  /** Guardada mientras la sala era un módulo propuesto (el Issue lleva «modulo-nuevo»). */
  modulo_nuevo: 0 | 1;
}

export interface Mensaje {
  id: number;
  solicitud_id: string;
  autor_email: string;
  autor_nombre: string;
  rol: Rol;
  texto: string;
  creado_en: string;
  /** Fotos del mensaje (vacío si no tiene); se sirven por /api/chat/adjuntos/<id>. */
  adjuntos: AdjuntoVista[];
}

export type AdjuntoVista = Pick<Adjunto, "id" | "nombre" | "tipo" | "tamano">;

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

/** Cierra la solicitud abierta de la sala sin enviarla (desbloquea cambiar el repositorio o archivar). false: no había. */
export function cerrarConversacion(db: DB, sala: string, ahora = new Date()): boolean {
  return db.prepare("UPDATE chat_solicitudes SET estado = 'cerrada', terminada_en = ? WHERE sala = ? AND estado = 'abierta'").run(iso(ahora), sala).changes > 0;
}

export function participantes(db: DB, solicitudId: string): Participante[] {
  return db
    .prepare("SELECT email, nombre FROM chat_participantes WHERE solicitud_id = ? ORDER BY desde, email")
    .all(solicitudId) as Participante[];
}

/** Mensajes de una solicitud, en orden. */
export function mensajes(db: DB, solicitudId: string): Mensaje[] {
  return conAdjuntos(db, db.prepare("SELECT * FROM chat_mensajes WHERE solicitud_id = ? ORDER BY id").all(solicitudId) as Mensaje[]);
}

/** Completa cada mensaje con sus fotos. */
function conAdjuntos(db: DB, msgs: Mensaje[]): Mensaje[] {
  if (!msgs.length) return msgs;
  const filas = db
    .prepare(
      `SELECT id, mensaje_id, nombre, tipo, tamano FROM chat_adjuntos
        WHERE mensaje_id IN (${msgs.map(() => "?").join(",")}) ORDER BY n`,
    )
    .all(...msgs.map((m) => m.id)) as (AdjuntoVista & { mensaje_id: number })[];
  return msgs.map((m) => ({
    ...m,
    adjuntos: filas.filter((f) => f.mensaje_id === m.id).map(({ id, nombre, tipo, tamano }) => ({ id, nombre, tipo, tamano })),
  }));
}

/** Foto guardada: su metadato y el archivo en disco (null si no existe). Para la ruta que la sirve. */
export function adjuntoGuardado(db: DB, id: number, dataDir?: string): { tipo: string; nombre: string; archivo: string } | null {
  const f = db.prepare("SELECT tipo, nombre, ruta FROM chat_adjuntos WHERE id = ?").get(id) as { tipo: string; nombre: string; ruta: string } | undefined;
  if (!f) return null;
  const raiz = dirAdjuntos(dataDir);
  const archivo = path.resolve(raiz, f.ruta);
  return archivo.startsWith(raiz + path.sep) && fs.existsSync(archivo) ? { tipo: f.tipo, nombre: f.nombre, archivo } : null;
}

/** Asigna el siguiente número de ticket (GER-0001 tras la migración v7). */
function siguienteTicket(db: DB): number {
  return (db.prepare("SELECT COALESCE(MAX(ticket), 0) + 1 AS n FROM chat_solicitudes").get() as { n: number }).n;
}

/** La sala existe, no está archivada y tiene un repositorio verificado (si no, «Próximamente»); si no, 404. */
export function exigirSala(db: DB, clave: string): string {
  const m = moduloPorClave(db, clave);
  if (!m || m.archivado) throw new ErrorSala(404, "Módulo desconocido");
  if (!salaAbierta(m)) throw new ErrorSala(404, SALA_NO_DISPONIBLE);
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
  fotos: FotoEntrada[] = [],
  dataDir?: string,
): { mensaje: Mensaje; solicitud: Solicitud; nueva: boolean } {
  const clave = exigirSala(db, sala);
  const t = texto.trim();
  if (!t && !fotos.length) throw new ErrorSala(400, "Escribe un mensaje");
  if (t.length > TEXTO_MAX) throw new ErrorSala(400, `Máximo ${TEXTO_MAX} caracteres`);
  const tipos = fotos.map((f) => {
    if (f.datos.length > FOTO_MAX_BYTES) throw new ErrorSala(400, `${MSG_FOTO_GRANDE} («${nombreSeguro(f.nombre)}»)`);
    const tipo = detectarTipo(f.datos);
    if (!tipo) throw new ErrorSala(400, `${MSG_FOTO_TIPO} («${nombreSeguro(f.nombre)}»)`);
    return tipo;
  });
  const escritos: string[] = [];
  try {
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
    if (fotos.length) {
      const previas = (db.prepare("SELECT COALESCE(MAX(n), 0) AS n FROM chat_adjuntos WHERE solicitud_id = ?").get(s.id) as { n: number }).n;
      if (previas + fotos.length > FOTOS_MAX_POR_SOLICITUD) throw new ErrorSala(400, MSG_FOTOS_LIMITE);
      const carpeta = path.join(dirAdjuntos(dataDir), s.id);
      fs.mkdirSync(carpeta, { recursive: true });
      fotos.forEach((f, i) => {
        const n = previas + i + 1;
        const ruta = `${s.id}/${n}.${extensionDe(tipos[i])}`;
        const archivo = path.join(carpeta, `${n}.${extensionDe(tipos[i])}`);
        fs.writeFileSync(archivo, f.datos);
        escritos.push(archivo);
        db.prepare("INSERT INTO chat_adjuntos (mensaje_id, solicitud_id, n, nombre, tipo, tamano, ruta) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
          lastInsertRowid, s.id, n, nombreSeguro(f.nombre), tipos[i], f.datos.length, ruta,
        );
      });
    }
    const mensaje = conAdjuntos(db, [db.prepare("SELECT * FROM chat_mensajes WHERE id = ?").get(lastInsertRowid) as Mensaje])[0];
    return { mensaje, solicitud: s, nueva };
  })();
  } catch (e) {
    for (const a of escritos) fs.rmSync(a, { force: true });
    throw e;
  }
}

export interface SolicitudVista {
  id: string;
  ticket: number;
  estado: EstadoSolicitud;
  iniciada_en: string;
  terminada_en: string | null;
  issue_url: string | null;
  /** Solo en solicitudes terminadas: «enviando» (aún sin Issue) o «enviado» (el marcador «Guardado y enviado a revisión ✓»); «guardado»: sala propuesta, la especificación espera a que se active el módulo. */
  envio: "enviando" | "enviado" | "guardado" | null;
  /** Por qué sigue «enviando» (p. ej. «pendiente: sala sin repositorio»), si hay un error. */
  envio_error: string | null;
}

export interface VistaSala {
  /** Todas las solicitudes de la sala, de la más antigua a la más nueva. */
  solicitudes: SolicitudVista[];
  /** Mensajes de la sala en orden (con `desde`, solo los de id mayor). */
  mensajes: Mensaje[];
  /** Id del último mensaje de la sala (0 si no hay): desde ahí consulta el cliente. */
  ultimo_id: number;
  /** Estado del asistente en la solicitud abierta (null si no hay): «pensando» se muestra a todos. */
  asistente: EstadoAsistente | null;
  /** Resumen del asistente de la solicitud abierta, si ya entendió todo (tarjeta con los botones). */
  resumen: string | null;
  /** Se muestran «Terminar» y «Se me olvidó algo»: el asistente terminó y está libre. */
  botones: boolean;
}

/**
 * Historial completo de la sala (todas sus solicitudes con sus mensajes) o, con `desde`, solo los mensajes con id
 * mayor (para consultar cada 2 a 3 segundos).
 */
export function vistaSala(db: DB, sala: string, desde = 0): VistaSala {
  const propuesta = moduloPorClave(db, sala)?.estado_modulo === "propuesto";
  const solicitudes = (
    db
      .prepare("SELECT id, ticket, estado, iniciada_en, terminada_en, issue_url, issue_numero, cierre_error, issue_error, spec IS NOT NULL AS con_spec FROM chat_solicitudes WHERE sala = ? ORDER BY ticket")
      .all(sala) as (Omit<SolicitudVista, "envio" | "envio_error"> & { issue_numero: number | null; cierre_error: string | null; issue_error: string | null; con_spec: number })[]
  ).map(({ issue_numero, cierre_error, issue_error, con_spec, ...f }) => {
    // en una sala propuesta, «sin repositorio» es lo esperado: no es un error
    const guardado = f.estado === "terminada" && !issue_numero && !!con_spec && propuesta;
    return {
      ...f,
      envio: f.estado !== "terminada" ? null : issue_numero ? ("enviado" as const) : guardado ? ("guardado" as const) : ("enviando" as const),
      envio_error: f.estado === "terminada" && !issue_numero && !guardado ? (cierre_error ?? issue_error) : null,
    };
  });
  const msgs = conAdjuntos(
    db,
    db
      .prepare(
        `SELECT m.* FROM chat_mensajes m JOIN chat_solicitudes s ON s.id = m.solicitud_id
        WHERE s.sala = ? AND m.id > ? ORDER BY m.id`,
      )
      .all(sala, desde) as Mensaje[],
  );
  const { ultimo } = db
    .prepare("SELECT COALESCE(MAX(m.id), 0) AS ultimo FROM chat_mensajes m JOIN chat_solicitudes s ON s.id = m.solicitud_id WHERE s.sala = ?")
    .get(sala) as { ultimo: number };
  const abierta = solicitudAbierta(db, sala);
  const terminado = !!abierta?.terminado;
  return {
    solicitudes,
    mensajes: msgs,
    ultimo_id: ultimo,
    asistente: abierta?.asistente_estado ?? null,
    resumen: terminado ? (abierta?.resumen ?? "") : null,
    botones: terminado && abierta?.asistente_estado === "idle",
  };
}

export interface EstadoSala {
  clave: string;
  nombre: string;
  area: string;
  descripcion: string;
  color: string;
  orden: number;
  /** La sala se puede abrir (repositorio verificado); si no, el portal la muestra gris, «Próximamente». */
  disponible: boolean;
  /** propuesto: sala creada por gerentes, sin repositorio; activo: sala normal. */
  estado_modulo: EstadoModulo;
  /** Quién la creó (solo administradores; null: el administrador). */
  creado_por?: string | null;
  /** Hay una solicitud abierta en la sala. */
  abierta: boolean;
  /** Mensajes de la solicitud abierta. */
  mensajes: number;
  /** Estado del asistente en la solicitud abierta (null si no hay), con su error y próximo reintento: solo para administradores. */
  asistente?: { estado: EstadoAsistente; error: string | null; proximo_intento: string | null; intentos: number } | null;
  /** Solo para administradores. */
  repo?: string | null;
  autonomia?: Autonomia;
}

/**
 * Estado de las salas activas (no archivadas), en orden. El portal las muestra todas: las sin repositorio verificado,
 * como «Próximamente». Con detalle (panel de administración) añade repositorio y autonomía.
 */
export function estadoSalas(db: DB, conDetalle = false): EstadoSala[] {
  const filas = db
    .prepare(
      `SELECT s.sala, (SELECT COUNT(*) FROM chat_mensajes m WHERE m.solicitud_id = s.id) AS n
         FROM chat_solicitudes s WHERE s.estado = 'abierta'`,
    )
    .all() as { sala: string; n: number }[];
  return listarModulos(db).map((m) => {
    const f = filas.find((x) => x.sala === m.clave);
    return {
      clave: m.clave,
      nombre: m.nombre,
      area: m.area,
      descripcion: m.descripcion,
      color: m.color,
      orden: m.orden,
      disponible: salaAbierta(m),
      estado_modulo: m.estado_modulo,
      abierta: !!f,
      mensajes: f?.n ?? 0,
      ...(conDetalle
        ? {
            creado_por: m.creado_por,
            repo: m.repo,
            autonomia: m.autonomia,
            asistente: (() => {
              const a = solicitudAbierta(db, m.clave);
              return a ? { estado: a.asistente_estado, error: a.asistente_error, proximo_intento: a.asistente_proximo_intento, intentos: a.asistente_intentos } : null;
            })(),
          }
        : {}),
    };
  });
}
