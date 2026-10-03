// Etapas de un proyecto y su historial (tabla proyecto_etapas, esquema v5).
// Sin "server-only" para poder probarlo con tsx.
import type Database from "better-sqlite3";

type DB = Database.Database;

export type EstadoProyecto = "concepto" | "prototipado" | "pruebas" | "entregado" | "pausado";

/** Etapas del pipeline de desarrollo, en orden. Entregados y pausados no forman parte del pipeline. */
export const ETAPAS_DESARROLLO = ["concepto", "prototipado", "pruebas"] as const;
export type EtapaDesarrollo = (typeof ETAPAS_DESARROLLO)[number];

export const NOMBRE_ESTADO: Record<EstadoProyecto, string> = {
  concepto: "Concepto",
  prototipado: "Prototipado",
  pruebas: "Pruebas",
  entregado: "Entregado",
  pausado: "En pausa",
};

/**
 * Gerencia ve un aviso cuando una etapa tiene MÁS de este número de proyectos al mismo tiempo.
 * No es un tope (nada se bloquea): es una advertencia para no sumar carga sin darse cuenta.
 */
export const AVISO_PROYECTOS_POR_ETAPA = 2;

export interface FilaEtapa {
  id: number;
  proyecto_id: string;
  estado: EstadoProyecto;
  desde: string;
}

export interface Tramo {
  id: number | null;
  estado: EstadoProyecto;
  desde: string;
  /** Fecha en que pasó a la etapa siguiente; null = etapa actual. */
  hasta: string | null;
  dias: number;
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Historial de etapas de varios proyectos, en orden cronológico. */
export function leerEtapas(db: DB, proyectoId?: string): Map<string, FilaEtapa[]> {
  const filas = (
    proyectoId
      ? db.prepare("SELECT id, proyecto_id, estado, desde FROM proyecto_etapas WHERE proyecto_id = ? ORDER BY desde, id").all(proyectoId)
      : db.prepare("SELECT id, proyecto_id, estado, desde FROM proyecto_etapas ORDER BY proyecto_id, desde, id").all()
  ) as FilaEtapa[];
  const m = new Map<string, FilaEtapa[]>();
  for (const f of filas) {
    const l = m.get(f.proyecto_id);
    if (l) l.push(f);
    else m.set(f.proyecto_id, [f]);
  }
  return m;
}

/**
 * Tramos del historial con su duración en días. Sin historial (datos cargados a mano), el proyecto se considera
 * en su estado actual desde su fecha de inicio. La etapa actual dura hasta hoy; "entregado" no suma días.
 */
export function tramos(filas: FilaEtapa[] | undefined, p: { estado: string; fecha_inicio: string }, hoy: string): Tramo[] {
  const base: { id: number | null; estado: EstadoProyecto; desde: string }[] = filas?.length
    ? filas
    : [{ id: null, estado: p.estado as EstadoProyecto, desde: p.fecha_inicio }];
  return base.map((f, i) => {
    const hasta = base[i + 1]?.desde ?? null;
    const dias = f.estado === "entregado" ? 0 : Math.max(0, diasEntre(f.desde, hasta ?? hoy));
    return { id: f.id, estado: f.estado, desde: f.desde, hasta, dias };
  });
}

export type DiasPorEtapa = Record<EtapaDesarrollo | "pausado", number>;

export function diasPorEtapa(t: Tramo[]): DiasPorEtapa {
  const d: DiasPorEtapa = { concepto: 0, prototipado: 0, pruebas: 0, pausado: 0 };
  for (const x of t) if (x.estado !== "entregado") d[x.estado] += x.dias;
  return d;
}

/**
 * Registra un cambio de estado en el historial con la fecha local de hoy.
 * Un segundo cambio el mismo día corrige el anterior (no deja tramos de 0 días); si vuelve al estado previo, se
 * fusiona con él. Debe llamarse dentro de la misma transacción que actualiza proyectos.estado.
 */
export function registrarCambioEtapa(
  db: DB,
  p: { id: string; estado: string; fecha_inicio: string },
  nuevo: EstadoProyecto,
  hoy: string,
): void {
  if (nuevo === p.estado) return;
  const filas = leerEtapas(db, p.id).get(p.id) ?? [];
  if (filas.length === 0) {
    const r = db.prepare("INSERT INTO proyecto_etapas (proyecto_id, estado, desde) VALUES (?, ?, ?)").run(p.id, p.estado, p.fecha_inicio);
    filas.push({ id: Number(r.lastInsertRowid), proyecto_id: p.id, estado: p.estado as EstadoProyecto, desde: p.fecha_inicio });
  }
  const ultima = filas[filas.length - 1];
  if (ultima.desde >= hoy) {
    const previa = filas[filas.length - 2];
    if (previa && previa.estado === nuevo) db.prepare("DELETE FROM proyecto_etapas WHERE id = ?").run(ultima.id);
    else db.prepare("UPDATE proyecto_etapas SET estado = ? WHERE id = ?").run(nuevo, ultima.id);
    return;
  }
  db.prepare("INSERT INTO proyecto_etapas (proyecto_id, estado, desde) VALUES (?, ?, ?)").run(p.id, nuevo, hoy < ultima.desde ? ultima.desde : hoy);
}
