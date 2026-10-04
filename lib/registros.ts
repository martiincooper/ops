// Eliminación definitiva de una cuenta de empresa (equipo o gerencia).
// Sin "server-only" para poder probarlo con tsx. La supervisión (control.db) la ajusta la ruta.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

type DB = Database.Database;

export interface Resumen {
  jornadas: number;
  compras: number;
}

export function registrosDe(db: DB, usuarioId: string): Resumen {
  return db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM bitacoras WHERE usuario_id = ?) AS jornadas,
              (SELECT COUNT(*) FROM gastos WHERE usuario_id = ?) AS compras`,
    )
    .get(usuarioId, usuarioId) as Resumen;
}

/**
 * Fila de esta empresa que guarda los registros heredados por un administrador. Se crea la primera vez; no puede
 * ingresar (inactiva, email interno) y no aparece en Equipo, standup, disponibilidad ni gerencia.
 */
export function cuentaDeRegistros(db: DB, admin: { id: string; nombre: string }): string {
  const fila = db.prepare("SELECT id FROM usuarios WHERE admin_id = ?").get(admin.id) as { id: string } | undefined;
  if (fila) {
    db.prepare("UPDATE usuarios SET nombre = ? WHERE id = ?").run(admin.nombre, fila.id);
    return fila.id;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO usuarios (id, nombre, email, rol, activo, debe_cambiar_pin, admin_id)
     VALUES (?, ?, ?, 'team', 0, 0, ?)`,
  ).run(id, admin.nombre, `registros-${admin.id}@aether-ops.interno`, admin.id);
  return id;
}

/** Ids de las filas de registros heredados de un administrador (para el alcance «Mis supervisados»). */
export function idsHeredados(db: DB, adminId: string): string[] {
  return (db.prepare("SELECT id FROM usuarios WHERE admin_id = ?").all(adminId) as { id: string }[]).map((f) => f.id);
}

/**
 * Elimina la cuenta. Si tiene jornadas o compras, primero pasan al administrador indicado (los proyectos conservan su
 * costo). Una jornada del mismo día que otra ya heredada por ese administrador se fusiona con ella (objetivos y
 * compras se juntan; los bloqueos se concatenan). Los días no disponibles de la persona se borran con ella.
 */
export function eliminarCuenta(db: DB, usuarioId: string, admin: { id: string; nombre: string } | null): Resumen {
  return db.transaction(() => {
    const r = registrosDe(db, usuarioId);
    if (r.jornadas + r.compras > 0) {
      if (!admin) throw new Error("Falta el administrador que recibe los registros");
      const destino = cuentaDeRegistros(db, admin);
      const propias = db.prepare("SELECT id, fecha FROM bitacoras WHERE usuario_id = ?").all(usuarioId) as { id: string; fecha: string }[];
      const existente = db.prepare("SELECT id FROM bitacoras WHERE usuario_id = ? AND fecha = ?");
      for (const b of propias) {
        const e = existente.get(destino, b.fecha) as { id: string } | undefined;
        if (!e) {
          db.prepare("UPDATE bitacoras SET usuario_id = ? WHERE id = ?").run(destino, b.id);
          continue;
        }
        db.prepare("UPDATE tareas_diarias SET bitacora_id = ? WHERE bitacora_id = ?").run(e.id, b.id);
        db.prepare("UPDATE gastos SET bitacora_id = ? WHERE bitacora_id = ?").run(e.id, b.id);
        db.prepare(
          `UPDATE bitacoras SET
              bloqueos = CASE
                WHEN bloqueos IS NULL THEN (SELECT bloqueos FROM bitacoras WHERE id = @de)
                WHEN (SELECT bloqueos FROM bitacoras WHERE id = @de) IS NULL THEN bloqueos
                ELSE bloqueos || ' / ' || (SELECT bloqueos FROM bitacoras WHERE id = @de) END,
              checkout_tarde = MAX(COALESCE(checkout_tarde, ''), COALESCE((SELECT checkout_tarde FROM bitacoras WHERE id = @de), ''))
            WHERE id = @a`,
        ).run({ de: b.id, a: e.id });
        db.prepare("UPDATE bitacoras SET checkout_tarde = NULL WHERE id = ? AND checkout_tarde = ''").run(e.id);
        db.prepare("DELETE FROM bitacoras WHERE id = ?").run(b.id);
      }
      db.prepare("UPDATE gastos SET usuario_id = ? WHERE usuario_id = ?").run(destino, usuarioId);
    }
    db.prepare("DELETE FROM usuarios WHERE id = ?").run(usuarioId); // días no disponibles: ON DELETE CASCADE
    return r;
  })();
}
