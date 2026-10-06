// Objetivos de la jornada editable (la más reciente de la persona). Sin "server-only" para probarlo con tsx.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { fechaCorta } from "./tiempo";

type DB = Database.Database;

export class ErrorObjetivo extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Bitacora {
  id: string;
  checkout_tarde: string | null;
}

/** Jornada editable: la más reciente de la persona (en curso o terminada), hasta que comience la siguiente. */
export function bitacoraEditable(db: DB, usuarioId: string): Bitacora | null {
  return (
    (db.prepare("SELECT id, checkout_tarde FROM bitacoras WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1").get(usuarioId) as
      | Bitacora
      | undefined) ?? null
  );
}

function exigirEditable(db: DB, usuarioId: string): Bitacora {
  const b = bitacoraEditable(db, usuarioId);
  if (!b) throw new ErrorObjetivo(409, "Comienza tu jornada para agregar objetivos");
  return b;
}

function exigirProyectosActivos(db: DB, ids: string[]) {
  const activo = db.prepare("SELECT 1 FROM proyectos WHERE id = ? AND estado IN ('concepto', 'prototipado', 'pruebas')");
  if (ids.some((id) => !activo.get(id))) throw new ErrorObjetivo(400, "Proyecto inexistente o no activo");
}

/** Objetivo de la jornada editable de la persona; si es de una jornada anterior, ya no se puede cambiar. */
function exigirObjetivo(db: DB, usuarioId: string, tareaId: string) {
  const b = exigirEditable(db, usuarioId);
  const t = db
    .prepare(
      `SELECT t.id, t.bitacora_id, t.estado FROM tareas_diarias t JOIN bitacoras j ON j.id = t.bitacora_id
        WHERE t.id = ? AND j.usuario_id = ?`,
    )
    .get(tareaId, usuarioId) as { id: string; bitacora_id: string; estado: string } | undefined;
  if (!t) throw new ErrorObjetivo(404, "Objetivo no encontrado");
  if (t.bitacora_id !== b.id) throw new ErrorObjetivo(409, "Ese objetivo es de una jornada anterior: ya no se puede cambiar");
  return { b, t };
}

type ObjetivoNuevo = { descripcion: string; proyecto_ids: string[] };

/**
 * Comenzar la jornada de hoy, con objetivos opcionales. Sin horario: a cualquier hora, una jornada por día.
 * Idempotente: si la de hoy ya está en curso, devuelve "ya_existia". Al comenzar, la jornada anterior deja de ser
 * editable.
 */
export function comenzarJornada(db: DB, usuarioId: string, hoy: string, tareas: ObjetivoNuevo[], ahora: string): "creada" | "ya_existia" {
  const ultima = db.prepare("SELECT fecha, checkout_tarde FROM bitacoras WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1").get(usuarioId) as
    | { fecha: string; checkout_tarde: string | null }
    | undefined;
  if (ultima && !ultima.checkout_tarde) {
    if (ultima.fecha === hoy) return "ya_existia";
    throw new ErrorObjetivo(409, `Tienes una jornada sin terminar del ${fechaCorta(ultima.fecha)}. Termínala antes de comenzar otra.`);
  }
  if (ultima?.fecha === hoy) throw new ErrorObjetivo(409, "Ya terminaste tu jornada de hoy. Mañana puedes comenzar otra.");
  if (db.prepare("SELECT 1 FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? AND dia_completo = 1").get(usuarioId, hoy)) {
    throw new ErrorObjetivo(409, "Marcaste hoy como no disponible. Quita esa marca para comenzar tu jornada.");
  }
  exigirProyectosActivos(db, tareas.flatMap((t) => t.proyecto_ids));

  const jornadaId = randomUUID();
  try {
    db.transaction(() => {
      db.prepare("INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana) VALUES (?, ?, ?, ?)").run(jornadaId, usuarioId, hoy, ahora);
      const ins = db.prepare(
        `INSERT INTO tareas_diarias (id, bitacora_id, orden, descripcion, estado, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?)`,
      );
      const insProyecto = db.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) VALUES (?, ?)");
      tareas.forEach((t, i) => {
        const id = randomUUID();
        ins.run(id, jornadaId, i, t.descripcion, ahora, ahora);
        for (const p of t.proyecto_ids) insProyecto.run(id, p);
      });
    })();
  } catch (e) {
    // Doble envío simultáneo: la otra petición ganó la carrera (UNIQUE usuario + fecha).
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return "ya_existia";
    throw e;
  }
  return "creada";
}

/**
 * Objetivo agregado por la jefatura desde el standup. Va a la jornada de hoy (en curso o terminada) o a la que la
 * persona dejó abierta; si no tiene ninguna, se le comienza la de hoy con ese objetivo (luego la persona la edita).
 */
export function agregarObjetivoJefatura(db: DB, usuarioId: string, o: ObjetivoNuevo, max: number, hoy: string, ahora: string): "agregado" | "jornada_creada" {
  const b = db.prepare("SELECT fecha, checkout_tarde FROM bitacoras WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1").get(usuarioId) as
    | { fecha: string; checkout_tarde: string | null }
    | undefined;
  if (b && (b.fecha === hoy || !b.checkout_tarde)) {
    agregarObjetivo(db, usuarioId, o, max, ahora);
    return "agregado";
  }
  if (db.prepare("SELECT 1 FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? AND dia_completo = 1").get(usuarioId, hoy)) {
    throw new ErrorObjetivo(409, "Esta persona marcó hoy como no disponible");
  }
  if (comenzarJornada(db, usuarioId, hoy, [o], ahora) === "ya_existia") {
    agregarObjetivo(db, usuarioId, o, max, ahora); // otra petición la comenzó al mismo tiempo
    return "agregado";
  }
  return "jornada_creada";
}

export function agregarObjetivo(db: DB, usuarioId: string, o: ObjetivoNuevo, max: number, ahora: string): string {
  const b = exigirEditable(db, usuarioId);
  exigirProyectosActivos(db, o.proyecto_ids);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM tareas_diarias WHERE bitacora_id = ?").get(b.id) as { n: number }).n;
  if (n >= max) throw new ErrorObjetivo(400, `Máximo ${max} objetivos por jornada`);
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO tareas_diarias (id, bitacora_id, orden, descripcion, estado, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, 'pendiente', ?, ?)`,
    ).run(id, b.id, n, o.descripcion, ahora, ahora);
    const ins = db.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) VALUES (?, ?)");
    for (const p of o.proyecto_ids) ins.run(id, p);
  })();
  return id;
}

export function cambiarObjetivo(
  db: DB,
  usuarioId: string,
  tareaId: string,
  c: { completada?: boolean; descripcion?: string; proyecto_ids?: string[]; motivo_pendiente?: string | null },
  ahora: string,
): void {
  const { t } = exigirObjetivo(db, usuarioId, tareaId);
  if (c.completada !== undefined && t.estado === "postergado_ooo") throw new ErrorObjetivo(400, "Ese objetivo quedó postergado");
  if (c.proyecto_ids) exigirProyectosActivos(db, c.proyecto_ids);
  db.transaction(() => {
    if (c.descripcion !== undefined) db.prepare("UPDATE tareas_diarias SET descripcion = ? WHERE id = ?").run(c.descripcion, t.id);
    if (c.completada !== undefined) {
      // Logrado borra el motivo; pendiente conserva el que tenía (se puede editar).
      if (c.completada) db.prepare("UPDATE tareas_diarias SET estado = 'completado', motivo_pendiente = NULL WHERE id = ?").run(t.id);
      else db.prepare("UPDATE tareas_diarias SET estado = 'pendiente' WHERE id = ?").run(t.id);
    }
    if (c.motivo_pendiente !== undefined) {
      db.prepare("UPDATE tareas_diarias SET motivo_pendiente = ? WHERE id = ? AND estado <> 'completado'").run(c.motivo_pendiente || null, t.id);
    }
    if (c.proyecto_ids) {
      db.prepare("DELETE FROM tarea_proyectos WHERE tarea_id = ?").run(t.id);
      const ins = db.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) VALUES (?, ?)");
      for (const p of c.proyecto_ids) ins.run(t.id, p);
    }
    db.prepare("UPDATE tareas_diarias SET actualizado_en = ? WHERE id = ?").run(ahora, t.id);
  })();
}

export function quitarObjetivo(db: DB, usuarioId: string, tareaId: string): void {
  const { b, t } = exigirObjetivo(db, usuarioId, tareaId);
  if (b.checkout_tarde) {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM tareas_diarias WHERE bitacora_id = ?").get(b.id) as { n: number }).n;
    if (n <= 1) throw new ErrorObjetivo(400, "Una jornada terminada necesita al menos un objetivo");
  }
  db.prepare("DELETE FROM tareas_diarias WHERE id = ?").run(t.id); // tarea_proyectos: ON DELETE CASCADE
}

/** Bloqueo de la última jornada, solo si ya terminó. Si cambia el texto, vuelve a estar sin resolver. */
export function cambiarBloqueo(db: DB, usuarioId: string, bloqueo: string | null): void {
  const b = exigirEditable(db, usuarioId);
  if (!b.checkout_tarde) throw new ErrorObjetivo(409, "El bloqueo se informa al terminar la jornada");
  db.prepare(
    `UPDATE bitacoras SET bloqueos = ?,
        bloqueo_resuelto_en = CASE WHEN COALESCE(bloqueos, '') = COALESCE(?, '') THEN bloqueo_resuelto_en END,
        bloqueo_resuelto_por = CASE WHEN COALESCE(bloqueos, '') = COALESCE(?, '') THEN bloqueo_resuelto_por END,
        bloqueo_resuelto_por_nombre = CASE WHEN COALESCE(bloqueos, '') = COALESCE(?, '') THEN bloqueo_resuelto_por_nombre END
      WHERE id = ?`,
  ).run(bloqueo || null, bloqueo || null, bloqueo || null, bloqueo || null, b.id);
}
