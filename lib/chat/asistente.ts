// Turnos del asistente de entrevista: cada solicitud tiene una cola de turnos contra el «asiento de entrevista» (flota
// implement-all-cloud, por HTTP). Tras un mensaje, si el asistente está `idle` empieza un turno (`pensando`); los
// mensajes que llegan durante un turno viajan juntos en el siguiente, así la conversación nunca se bifurca. Un turno
// fallido deja la solicitud en `esperando_reintento` y lo reintenta el mismo programador de ./envio. Siempre se envía
// la transcripción completa, de modo que una sesión perdida se reconstruye sola. Sin "server-only" para probarlo con
// scripts/test-logica.ts con un cliente del asiento inyectado.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { dirAdjuntos } from "./adjuntos";
import { listarModulos, moduloPorClave, repoDe } from "./catalogo";
import { SIN_REPO, enviarIssue } from "./envio";
import type { OpcionesPeticion } from "./githubApi";
import { ErrorSala, type Mensaje, type Solicitud, mensajes, solicitud } from "./salas";
import type { Modulo } from "./modulos";
import type { ConfigCuenta } from "./seguimiento";

type DB = Database.Database;

/** Minutos antes de cada reintento de un turno; después, cada 30 minutos. */
export const ESPERAS_TURNO_MIN = [1, 2, 5, 15, 30];
export const ESPERA_TURNO_FINAL_MIN = 30;
export const AVISO_OCUPADO = "El asistente está ocupado y responderá apenas pueda. Tu mensaje está guardado.";
export const SIN_ASIENTO = "INTERVIEW_URL e INTERVIEW_TOKEN no están configurados en el servidor";

export interface FotoTurno {
  name: string;
  type: string;
  base64: string;
}
export interface MensajeTurno {
  /** Texto: el asiento rechaza (400) los ids numéricos. */
  id: string;
  author: string;
  role: "gerente" | "asistente";
  text: string;
  at: string;
  photos: FotoTurno[];
}
export interface DocumentoModulo {
  file: string;
  title: string;
  content: string;
}
/** Lo que el asiento sabe de un módulo propuesto: sus documentos vivos y las especificaciones ya guardadas. */
export interface ModuloPropuesto {
  context: string;
  adrs: DocumentoModulo[];
  /** Número entero del ticket (el asiento arma «GER-0001»); con texto responde 400. */
  specs: { ticket: number; title: string; spec: string }[];
}
/** Repositorio de la guía de interfaz de la casa: el asiento lo lee en las salas propuestas. */
export const REPO_GUIA_UI = "martiincooper/ui-guidelines";
export interface PeticionTurno {
  requestId: string;
  /** Ausente en una sala propuesta (`kind: "propuesta"`); ahí viaja `contextRepos`. */
  repo?: string;
  /** Solo en salas propuestas; las activas no lo envían (el asiento asume «modulo»). */
  kind?: "propuesta";
  contextRepos?: string[];
  module?: ModuloPropuesto;
  session: string | null;
  room: { nombre: string; descripcion: string };
  messages: MensajeTurno[];
}
export interface RespuestaTurno {
  session: string;
  message: string;
  done: boolean;
  summary: string | null;
}

export interface RespuestaCierre {
  session: string | null;
  title: string;
  spec: string;
  /** Solo en salas propuestas: `CONTEXT.md` y ADRs completos y actualizados. */
  context?: string;
  adrs?: DocumentoModulo[];
}

/** Lo que ops necesita del asiento; en las pruebas se inyecta uno falso. */
export interface ClienteAsiento {
  salud(): Promise<{ ok: boolean }>;
  turno(p: PeticionTurno): Promise<RespuestaTurno>;
  /** «Terminar»: el asiento redacta la especificación (mismo cuerpo que un turno). */
  cierre(p: PeticionTurno): Promise<RespuestaCierre>;
}

export class ErrorAsiento extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const MOTIVO_HTTP: Record<number, string> = {
  401: "El token del asiento de entrevista no es válido",
  409: "El asiento de entrevista no pudo clonar el repositorio de la sala",
  503: "El asiento de entrevista está ocupado o sin cupo de uso",
  504: "El asiento de entrevista tardó demasiado en responder",
};

const TIMEOUT_TURNO_MS = Number(process.env.INTERVIEW_TIMEOUT_MS) || 6 * 60_000;

/** Cliente HTTP del asiento según INTERVIEW_URL e INTERVIEW_TOKEN (null si falta alguno). */
export function asientoDesdeEntorno(): ClienteAsiento | null {
  const base = (process.env.INTERVIEW_URL ?? "").replace(/\/+$/, "");
  const token = process.env.INTERVIEW_TOKEN ?? "";
  if (!base || !token) return null;
  const pedir = async (ruta: string, init: RequestInit, ms: number) => {
    let res: Response;
    try {
      res = await fetch(base + ruta, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(ms) });
    } catch (e) {
      const vencio = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new ErrorAsiento(vencio ? MOTIVO_HTTP[504] : "No se pudo conectar con el asiento de entrevista");
    }
    if (!res.ok) throw new ErrorAsiento(MOTIVO_HTTP[res.status] ?? `El asiento de entrevista respondió ${res.status}`, res.status);
    return res.json() as Promise<unknown>;
  };
  return {
    async salud() {
      const r = (await pedir("/api/interview/health", { method: "GET" }, 5_000)) as { ok?: boolean };
      return { ok: r.ok === true };
    },
    async turno(p) {
      const r = (await pedir("/api/interview/turn", { method: "POST", body: JSON.stringify(p) }, TIMEOUT_TURNO_MS)) as Partial<RespuestaTurno>;
      if (typeof r.session !== "string" || typeof r.message !== "string") throw new ErrorAsiento("Respuesta inválida del asiento de entrevista");
      return { session: r.session, message: r.message, done: r.done === true, summary: r.done && r.summary ? r.summary : null };
    },
    async cierre(p) {
      const r = (await pedir("/api/interview/close", { method: "POST", body: JSON.stringify(p) }, TIMEOUT_TURNO_MS)) as Partial<RespuestaCierre>;
      if (typeof r.title !== "string" || !r.title.trim() || typeof r.spec !== "string" || !r.spec.trim()) throw new ErrorAsiento("Respuesta inválida del asiento de entrevista");
      const base = { session: typeof r.session === "string" ? r.session : null, title: r.title.trim(), spec: r.spec };
      if (p.kind !== "propuesta") return base;
      const ok = (a: unknown): a is DocumentoModulo => !!a && typeof a === "object" && ["file", "title", "content"].every((k) => typeof (a as Record<string, unknown>)[k] === "string");
      if (typeof r.context !== "string" || !Array.isArray(r.adrs) || !r.adrs.every(ok)) throw new ErrorAsiento("Respuesta inválida del asiento de entrevista");
      return { ...base, context: r.context, adrs: r.adrs.map(({ file, title, content }) => ({ file, title, content })) };
    },
  };
}

// ── Salud del asiento (en memoria): desde cuándo no responde
const salud = globalThis as unknown as { __aetherAsiento?: { desde: string | null; motivo: string | null } };
const estadoSalud = () => (salud.__aetherAsiento ??= { desde: null, motivo: null });

function anotarSalud(ok: boolean, motivo: string | null, ahora: Date) {
  const e = estadoSalud();
  if (ok) Object.assign(e, { desde: null, motivo: null });
  else if (!e.desde) Object.assign(e, { desde: ahora.toISOString(), motivo });
  else e.motivo = motivo;
}

export interface SaludAsiento {
  configurado: boolean;
  ok: boolean;
  /** Desde cuándo no responde (ISO), si no responde. */
  desde: string | null;
  motivo: string | null;
}

/** Consulta el asiento y recuerda desde cuándo no responde (la consulta de salud y los turnos alimentan lo mismo). */
export async function saludAsiento(cliente: ClienteAsiento | null, ahora = new Date()): Promise<SaludAsiento> {
  if (!cliente) return { configurado: false, ok: false, desde: null, motivo: SIN_ASIENTO };
  try {
    const r = await cliente.salud();
    anotarSalud(r.ok, r.ok ? null : "El asiento de entrevista respondió que no está disponible", ahora);
  } catch (e) {
    anotarSalud(false, e instanceof Error ? e.message : "Error desconocido", ahora);
  }
  const e = estadoSalud();
  return { configurado: true, ok: !e.desde, desde: e.desde, motivo: e.motivo };
}

/** Solo para pruebas. */
export function reiniciarSalud() {
  salud.__aetherAsiento = { desde: null, motivo: null };
}

/** Minutos de espera antes del reintento n.º `intentos` (1 = el primero tras el primer fallo). */
export const esperaTurnoMin = (intentos: number) => ESPERAS_TURNO_MIN[intentos - 1] ?? ESPERA_TURNO_FINAL_MIN;

const enCurso = new Set<string>();
const iso = (d: Date) => d.toISOString();

function fotosDe(db: DB, m: Mensaje, dataDir?: string): FotoTurno[] {
  const raiz = dirAdjuntos(dataDir);
  return m.adjuntos.flatMap((a) => {
    const f = db.prepare("SELECT ruta FROM chat_adjuntos WHERE id = ?").get(a.id) as { ruta: string } | undefined;
    const archivo = f && path.resolve(raiz, f.ruta);
    return archivo && archivo.startsWith(raiz + path.sep) && fs.existsSync(archivo)
      ? [{ name: a.nombre, type: a.tipo, base64: fs.readFileSync(archivo).toString("base64") }]
      : [];
  });
}

/** Transcripción completa de la solicitud para el asiento (sin los avisos del sistema), con las fotos en base64. */
export function peticionTurno(db: DB, s: Solicitud, dataDir?: string): { peticion: PeticionTurno; hasta: number } {
  const m = moduloPorClave(db, s.sala);
  const propuesta = m?.estado_modulo === "propuesto";
  const repo = repoDe(db, s.sala);
  if (!m || (!propuesta && !repo)) throw new ErrorAsiento("La sala no tiene un repositorio de GitHub verificado");
  const msgs = mensajes(db, s.id).filter((x) => x.rol !== "sistema");
  return {
    hasta: msgs.length ? msgs[msgs.length - 1].id : 0,
    peticion: {
      requestId: s.id,
      ...(propuesta ? { kind: "propuesta" as const, contextRepos: reposDeContexto(db), module: moduloDe(db, m) } : { repo: repo! }),
      session: s.asistente_sesion,
      room: { nombre: m.nombre, descripcion: m.descripcion },
      messages: msgs.map((x) => ({
        id: String(x.id),
        author: x.rol === "asistente" ? "Asistente" : x.autor_nombre,
        role: x.rol as "gerente" | "asistente",
        text: x.texto,
        at: x.creado_en,
        photos: fotosDe(db, x, dataDir),
      })),
    },
  };
}

/** Repos que el asiento lee en una sala propuesta: toda sala activa verificada y no archivada, más la guía de interfaz. */
export function reposDeContexto(db: DB): string[] {
  const repos = listarModulos(db).filter((x) => x.estado_modulo === "activo" && x.repo && x.repo_verificado_en).map((x) => x.repo as string);
  return [...new Set([...repos, REPO_GUIA_UI])];
}

/** Documentos vivos de la sala y especificaciones de sus solicitudes ya terminadas, de la más antigua a la más nueva. */
function moduloDe(db: DB, m: Modulo): ModuloPropuesto {
  const fila = db.prepare("SELECT contexto, adrs FROM chat_modulos WHERE clave = ?").get(m.clave) as { contexto: string; adrs: string };
  const adrs = (JSON.parse(fila.adrs) as { archivo: string; titulo: string; contenido: string }[]).map((a) => ({ file: a.archivo, title: a.titulo, content: a.contenido }));
  const specs = (db.prepare("SELECT ticket, titulo, spec FROM chat_solicitudes WHERE sala = ? AND estado = 'terminada' AND spec IS NOT NULL ORDER BY ticket").all(m.clave) as { ticket: number; titulo: string; spec: string }[]).map((x) => ({
    ticket: x.ticket,
    title: x.titulo,
    spec: x.spec,
  }));
  return { context: fila.contexto, adrs, specs };
}

export interface OpcionesTurno {
  ahora?: () => Date;
  dataDir?: string;
  /** Ejecuta aunque el reintento aún no venza («Reintentar» del panel). */
  forzar?: boolean;
}

/** Hay mensajes de gerentes que el asistente aún no recibió. */
function hayPendientes(db: DB, s: Solicitud): boolean {
  return !!db.prepare("SELECT 1 FROM chat_mensajes WHERE solicitud_id = ? AND rol = 'gerente' AND id > ?").get(s.id, s.asistente_hasta);
}

/**
 * Corre los turnos de la solicitud: pasa a `pensando`, llama al asiento con la transcripción completa y guarda la
 * respuesta; si entretanto llegaron mensajes, encadena otro turno con todos juntos. Con el asistente ocupado (otro turno
 * en curso) no hace nada. Devuelve cuántos turnos terminaron bien. La toma del turno es síncrona: quien llama puede no
 * esperar la promesa.
 */
export async function correrTurnos(db: DB, id: string, asiento: ClienteAsiento | null, op: OpcionesTurno = {}): Promise<number> {
  const ahora = op.ahora ?? (() => new Date());
  let hechos = 0;
  for (;;) {
    const s = solicitud(db, id);
    if (!s || s.estado !== "abierta" || enCurso.has(id)) return hechos;
    if (s.asistente_estado === "esperando_reintento" && !op.forzar && (s.asistente_proximo_intento ?? "") > iso(ahora())) return hechos;
    if (s.asistente_estado === "idle" && !hayPendientes(db, s)) return hechos;
    enCurso.add(id);
    db.prepare("UPDATE chat_solicitudes SET asistente_estado = 'pensando', asistente_proximo_intento = NULL WHERE id = ?").run(id);
    op = { ...op, forzar: false };
    try {
      const { peticion, hasta } = peticionTurno(db, s, op.dataDir);
      if (!asiento) throw new ErrorAsiento(SIN_ASIENTO);
      const r = await asiento.turno(peticion);
      anotarSalud(true, null, ahora());
      db.transaction(() => {
        db.prepare(
          `UPDATE chat_solicitudes
              SET asistente_sesion = ?, asistente_hasta = ?, asistente_estado = 'idle', asistente_intentos = 0, asistente_error = NULL,
                  asistente_proximo_intento = NULL, terminado = ?, resumen = ?
            WHERE id = ?`,
        ).run(r.session, hasta, r.done ? 1 : 0, r.done ? r.summary : null, id);
        db.prepare("INSERT INTO chat_mensajes (solicitud_id, autor_email, autor_nombre, rol, texto, creado_en) VALUES (?, 'asistente', 'Asistente', 'asistente', ?, ?)").run(
          id, r.message, iso(ahora()),
        );
      })();
      hechos++;
    } catch (e) {
      const motivo = e instanceof ErrorAsiento ? e.message : "Error inesperado en el turno del asistente";
      if (!(e instanceof ErrorAsiento)) console.error("[chat-asistente]", e);
      anotarSalud(false, motivo, ahora());
      fallarTurno(db, id, motivo, ahora());
      return hechos;
    } finally {
      enCurso.delete(id);
    }
  }
}

/** Deja el turno en `esperando_reintento` con su próxima hora, y avisa en el chat la primera vez de una racha. */
function fallarTurno(db: DB, id: string, motivo: string, ahora: Date) {
  const s = solicitud(db, id)!;
  const intentos = s.asistente_intentos + 1;
  const proximo = new Date(ahora.getTime() + esperaTurnoMin(intentos) * 60_000);
  db.transaction(() => {
    db.prepare("UPDATE chat_solicitudes SET asistente_estado = 'esperando_reintento', asistente_intentos = ?, asistente_error = ?, asistente_proximo_intento = ? WHERE id = ?").run(
      intentos, motivo, iso(proximo), id,
    );
    if (s.asistente_intentos === 0) {
      db.prepare("INSERT INTO chat_mensajes (solicitud_id, autor_email, autor_nombre, rol, texto, creado_en) VALUES (?, 'sistema', 'Sistema', 'sistema', ?, ?)").run(id, AVISO_OCUPADO, iso(ahora));
    }
  })();
  console.warn(`[chat-asistente] ${motivo}; reintento a las ${iso(proximo)}`);
}

/** Tras un mensaje guardado: si el asistente está libre, empieza un turno (sin esperar). */
export function dispararTurno(db: DB, id: string, asiento: ClienteAsiento | null, op: OpcionesTurno = {}): Promise<number> {
  return correrTurnos(db, id, asiento, op).catch((e) => {
    console.error("[chat-asistente]", e);
    return 0;
  });
}

/** Solicitudes con un turno por reintentar ya vencido, o `pensando` sin turno en curso (el proceso se reinició). */
export function turnosPendientes(db: DB, ahora = new Date()): string[] {
  const filas = db
    .prepare(
      `SELECT id, asistente_estado AS e FROM chat_solicitudes
        WHERE estado = 'abierta' AND (asistente_estado = 'pensando' OR (asistente_estado = 'esperando_reintento' AND asistente_proximo_intento <= ?))
        ORDER BY asistente_proximo_intento`,
    )
    .all(iso(ahora)) as { id: string; e: string }[];
  return filas.filter((f) => f.e !== "pensando" || !enCurso.has(f.id)).map((f) => f.id);
}

/** Reintenta los turnos vencidos. Devuelve cuántos terminaron bien. */
export async function procesarTurnos(db: DB, asiento: ClienteAsiento | null, op: OpcionesTurno = {}): Promise<number> {
  let n = 0;
  for (const id of turnosPendientes(db, (op.ahora ?? (() => new Date()))())) {
    // un `pensando` huérfano (reinicio del proceso) se retoma de inmediato
    if (solicitud(db, id)?.asistente_estado === "pensando") db.prepare("UPDATE chat_solicitudes SET asistente_estado = 'esperando_reintento', asistente_proximo_intento = ? WHERE id = ?").run(iso((op.ahora ?? (() => new Date()))()), id);
    n += await correrTurnos(db, id, asiento, op);
  }
  return n;
}

/** «Reintentar» del panel: corre ahora el turno trabado de la sala. false si no hay solicitud abierta o no está trabada. */
export function reintentarTurnoDeSala(db: DB, sala: string, asiento: ClienteAsiento | null, op: OpcionesTurno = {}): { iniciado: boolean; promesa?: Promise<number> } {
  const s = db.prepare("SELECT * FROM chat_solicitudes WHERE sala = ? AND estado = 'abierta'").get(sala) as Solicitud | undefined;
  if (!s || enCurso.has(s.id) || s.asistente_estado === "idle") return { iniciado: false };
  return { iniciado: true, promesa: dispararTurno(db, s.id, asiento, { ...op, forzar: true }) };
}

// ── «Terminar» y «Se me olvidó algo»

/** La solicitud abierta de la sala, si el asistente ya informó que entendió todo y está libre (los botones se aceptan solo así). */
const UPDATE_SI_TERMINADO = `WHERE id = ? AND estado = 'abierta' AND terminado = 1 AND asistente_estado = 'idle'`;

function conflictoBotones(db: DB, id: string): ErrorSala {
  const s = solicitud(db, id);
  const estado = !s ? "no existe" : s.estado === "terminada" ? (s.issue_numero ? "enviada" : "enviando") : s.estado === "cerrada" ? "cerrada" : s.terminado ? "ocupada" : "abierta";
  const texto: Record<string, string> = {
    enviada: "Esta solicitud ya se guardó y se envió a revisión",
    enviando: "Esta solicitud ya se está enviando",
    cerrada: "Esta solicitud ya se cerró",
    ocupada: "El asistente está trabajando; espera su respuesta",
    abierta: "El asistente aún no termina de entender la solicitud",
    "no existe": "La solicitud no existe",
  };
  return new ErrorSala(409, texto[estado]);
}

/** Id de la solicitud abierta de la sala; si no hay (otra persona ya pulsó «Terminar»), 409 con el estado de la última. */
function abiertaDe(db: DB, sala: string): string {
  const s = db.prepare("SELECT id FROM chat_solicitudes WHERE sala = ? AND estado = 'abierta'").get(sala) as { id: string } | undefined;
  if (s) return s.id;
  const ultima = db.prepare("SELECT id FROM chat_solicitudes WHERE sala = ? ORDER BY ticket DESC LIMIT 1").get(sala) as { id: string } | undefined;
  throw ultima ? conflictoBotones(db, ultima.id) : new ErrorSala(409, "No hay una solicitud abierta en esta sala");
}

/**
 * «Terminar»: el primero que llega gana, de forma atómica (un UPDATE condicionado al estado); la solicitud pasa a
 * `terminada`, sin especificación aún (se muestra «enviando…»), y la siguiente persona que escriba abre una solicitud
 * nueva. Quien llega segundo recibe 409. El cierre en sí lo hace `correrCierre`.
 */
export function terminarSolicitud(db: DB, sala: string, ahora = new Date()): string {
  const id = abiertaDe(db, sala);
  const r = db.prepare(`UPDATE chat_solicitudes SET estado = 'terminada', terminada_en = ?, cierre_intentos = 0, cierre_error = NULL, cierre_proximo_intento = NULL ${UPDATE_SI_TERMINADO}`).run(iso(ahora), id);
  if (!r.changes) throw conflictoBotones(db, id);
  return id;
}

/** «Se me olvidó algo»: borra la marca de terminado (la solicitud sigue abierta; el próximo mensaje retoma la entrevista). */
export function reabrirEntrevista(db: DB, sala: string): string {
  const id = abiertaDe(db, sala);
  const r = db.prepare(`UPDATE chat_solicitudes SET terminado = 0, resumen = NULL ${UPDATE_SI_TERMINADO}`).run(id);
  if (!r.changes) throw conflictoBotones(db, id);
  return id;
}

const cerrando = new Set<string>();

/**
 * Pide la especificación al asiento y la publica como Issue (con los reintentos del envío). Si el asiento falla, el
 * cierre se reintenta como un turno (1, 2, 5, 15, 30 min y luego cada 30). Devuelve true si el Issue quedó creado.
 */
export async function correrCierre(db: DB, id: string, asiento: ClienteAsiento | null, cuenta: ConfigCuenta | null, op: OpcionesTurno & OpcionesPeticion = {}): Promise<boolean> {
  const ahora = op.ahora ?? (() => new Date());
  const s = solicitud(db, id);
  if (!s || s.estado !== "terminada" || cerrando.has(id)) return false;
  cerrando.add(id);
  const propuesta = moduloPorClave(db, s.sala)?.estado_modulo === "propuesto";
  try {
    if (!s.spec) {
      try {
        if (!propuesta && !repoDe(db, s.sala)) throw new ErrorAsiento(SIN_REPO);
        const { peticion } = peticionTurno(db, s, op.dataDir);
        if (!asiento) throw new ErrorAsiento(SIN_ASIENTO);
        const r = await asiento.cierre(peticion);
        anotarSalud(true, null, ahora());
        db.transaction(() => {
          db.prepare("UPDATE chat_solicitudes SET titulo = ?, spec = ?, asistente_sesion = COALESCE(?, asistente_sesion), cierre_error = NULL, cierre_proximo_intento = NULL WHERE id = ?").run(r.title, r.spec, r.session, id);
          if (propuesta) {
            const adrs = (r.adrs ?? []).map((a) => ({ archivo: a.file, titulo: a.title, contenido: a.content }));
            db.prepare("UPDATE chat_modulos SET contexto = ?, adrs = ? WHERE clave = ?").run(r.context ?? "", JSON.stringify(adrs), s.sala);
          }
        })();
      } catch (e) {
        const motivo = e instanceof ErrorAsiento ? e.message : "Error inesperado al cerrar la solicitud";
        if (!(e instanceof ErrorAsiento)) console.error("[chat-cierre]", e);
        const intentos = s.cierre_intentos + 1;
        const proximo = new Date(ahora().getTime() + esperaTurnoMin(intentos) * 60_000);
        db.prepare("UPDATE chat_solicitudes SET cierre_intentos = ?, cierre_error = ?, cierre_proximo_intento = ? WHERE id = ?").run(intentos, motivo, iso(proximo), id);
        console.warn(`[chat-cierre] ${motivo}; reintento a las ${iso(proximo)}`);
        return false;
      }
    }
  } finally {
    cerrando.delete(id);
  }
  // Sala propuesta: la especificación queda guardada en ops hasta que se active el módulo (sin llamar a GitHub ni reintentar)
  if (propuesta) {
    db.prepare("UPDATE chat_solicitudes SET issue_error = ?, issue_proximo_intento = NULL WHERE id = ? AND issue_numero IS NULL").run(SIN_REPO, id);
    return false;
  }
  return (await enviarIssue(db, id, cuenta, op)).ok;
}

/** «Terminar» completo sin esperar: quien llama puede no esperar la promesa. */
export function dispararCierre(db: DB, id: string, asiento: ClienteAsiento | null, cuenta: ConfigCuenta | null, op: OpcionesTurno & OpcionesPeticion = {}): Promise<boolean> {
  return correrCierre(db, id, asiento, cuenta, op).catch((e) => {
    console.error("[chat-cierre]", e);
    return false;
  });
}

/** Solicitudes terminadas sin especificación cuyo cierre toca (primer intento huérfano por un reinicio, o reintento vencido). */
export function cierresPendientes(db: DB, ahora = new Date()): string[] {
  return (
    db
      .prepare(
        `SELECT id FROM chat_solicitudes
          WHERE estado = 'terminada' AND spec IS NULL AND (cierre_proximo_intento IS NULL OR cierre_proximo_intento <= ?)
          ORDER BY ticket`,
      )
      .all(iso(ahora)) as { id: string }[]
  )
    .map((f) => f.id)
    .filter((id) => !cerrando.has(id));
}

/** Reintenta los cierres vencidos. Devuelve cuántos Issues quedaron creados. */
export async function procesarCierres(db: DB, asiento: ClienteAsiento | null, cuenta: ConfigCuenta | null, op: OpcionesTurno & OpcionesPeticion = {}): Promise<number> {
  let n = 0;
  for (const id of cierresPendientes(db, (op.ahora ?? (() => new Date()))())) if (await correrCierre(db, id, asiento, cuenta, op)) n++;
  return n;
}
