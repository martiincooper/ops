// Tareas asignadas: pendientes que no son objetivos del día (p. ej. «pedirle a X la información»). Quedan en el
// tablero de la persona hasta marcarlas hechas; no cuentan para el Say-Do. Sin "server-only" para probarlo con tsx.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

type DB = Database.Database;

export class ErrorTarea extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TareaAsignada {
  id: string;
  descripcion: string;
  creado_por_nombre: string;
  /** La agregó otra persona (la jefatura), no quien la tiene asignada. */
  asignada: boolean;
  creado_en: string;
  completada_en: string | null;
  completada_por_nombre: string | null;
}

/** Tope de tareas abiertas por persona: evita listas desbordadas por error. */
export const MAX_TAREAS_ABIERTAS = 100;

/**
 * Tareas abiertas de la persona, más las completadas en las últimas `horasHechas` horas (para que se vean tachadas
 * un rato antes de desaparecer).
 */
export function tareasAbiertas(db: DB, usuarioId: string, ahora: string, horasHechas = 12): TareaAsignada[] {
  const desde = new Date(Date.parse(ahora) - horasHechas * 3_600_000).toISOString();
  return (
    db
      .prepare(
        `SELECT t.id, t.descripcion, t.creado_por_nombre, t.creado_por <> t.usuario_id AS asignada, t.creado_en,
                t.completada_en, t.completada_por_nombre
           FROM tareas_asignadas t
          WHERE t.usuario_id = ? AND (t.completada_en IS NULL OR t.completada_en >= ?)
          ORDER BY t.completada_en IS NOT NULL, t.creado_en`,
      )
      .all(usuarioId, desde) as (Omit<TareaAsignada, "asignada"> & { asignada: number })[]
  ).map((t) => ({ ...t, asignada: Boolean(t.asignada) }));
}

export function crearTarea(db: DB, usuarioId: string, descripcion: string, creadoPor: { id: string; nombre: string }, ahora: string): string {
  const abiertas = (
    db.prepare("SELECT COUNT(*) AS n FROM tareas_asignadas WHERE usuario_id = ? AND completada_en IS NULL").get(usuarioId) as { n: number }
  ).n;
  if (abiertas >= MAX_TAREAS_ABIERTAS) throw new ErrorTarea(400, `Máximo ${MAX_TAREAS_ABIERTAS} tareas abiertas`);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO tareas_asignadas (id, usuario_id, descripcion, creado_por, creado_por_nombre, creado_en) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, usuarioId, descripcion, creadoPor.id, creadoPor.nombre, ahora);
  return id;
}

/** Tarea de una persona; `usuarioId` null = cualquiera de la empresa (jefatura). */
function exigirTarea(db: DB, tareaId: string, usuarioId: string | null) {
  const t = db.prepare("SELECT id, usuario_id FROM tareas_asignadas WHERE id = ?").get(tareaId) as { id: string; usuario_id: string } | undefined;
  if (!t || (usuarioId && t.usuario_id !== usuarioId)) throw new ErrorTarea(404, "Tarea no encontrada");
  return t;
}

export function marcarTarea(db: DB, tareaId: string, completada: boolean, quien: string, ahora: string, usuarioId: string | null): void {
  const t = exigirTarea(db, tareaId, usuarioId);
  db.prepare("UPDATE tareas_asignadas SET completada_en = ?, completada_por_nombre = ? WHERE id = ?").run(
    completada ? ahora : null,
    completada ? quien : null,
    t.id,
  );
}

export function borrarTarea(db: DB, tareaId: string, usuarioId: string | null): void {
  const t = exigirTarea(db, tareaId, usuarioId);
  db.prepare("DELETE FROM tareas_asignadas WHERE id = ?").run(t.id);
}
