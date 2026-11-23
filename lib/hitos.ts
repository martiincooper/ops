// Hitos de un proyecto: lo ya logrado en una etapa de desarrollo (tabla proyecto_hitos, esquema v11).
// Sin "server-only" para poder probarlo con tsx.
import type Database from "better-sqlite3";
import type { EtapaDesarrollo } from "./etapas";

type DB = Database.Database;

export interface Hito {
  id: number;
  proyecto_id: string;
  etapa: EtapaDesarrollo;
  titulo: string;
  detalle: string | null;
  fecha: string;
  creado_por_nombre: string;
  creado_en: string;
  editado_en: string | null;
}

const COLUMNAS = "id, proyecto_id, etapa, titulo, detalle, fecha, creado_por_nombre, creado_en, editado_en";

/** Hitos de varios proyectos (o de uno), en orden cronológico (fecha, id). */
export function leerHitos(db: DB, proyectoId?: string): Map<string, Hito[]> {
  const filas = (
    proyectoId
      ? db.prepare(`SELECT ${COLUMNAS} FROM proyecto_hitos WHERE proyecto_id = ? ORDER BY fecha, id`).all(proyectoId)
      : db.prepare(`SELECT ${COLUMNAS} FROM proyecto_hitos ORDER BY proyecto_id, fecha, id`).all()
  ) as Hito[];
  const m = new Map<string, Hito[]>();
  for (const f of filas) {
    const l = m.get(f.proyecto_id);
    if (l) l.push(f);
    else m.set(f.proyecto_id, [f]);
  }
  return m;
}

/** Reglas de fecha de un hito: no después de hoy ni antes del inicio del proyecto. Devuelve el mensaje, o null si es válido. */
export function errorDeHito(h: { titulo: string; fecha: string }, fechaInicio: string, hoy: string): string | null {
  if (!h.titulo.trim()) return "El título es obligatorio";
  if (h.fecha > hoy) return "Un hito ya logrado no puede tener fecha futura";
  if (h.fecha < fechaInicio) return `La fecha no puede ser anterior al inicio del proyecto (${fechaInicio})`;
  return null;
}
