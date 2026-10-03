// Metas de los indicadores de gerencia que no salen de cada proyecto. El plazo se mide contra la fecha estimada de
// entrega de cada proyecto y el costo contra su estimación BOM; aquí solo queda la tolerancia de costo.
// La define la jefatura por empresa; sin valor guardado se usa el de por defecto. Claves antiguas se ignoran.
// Sin "server-only" para poder probarlo con tsx.
import type Database from "better-sqlite3";
import { z } from "zod";

type DB = Database.Database;

export const METAS_DEFECTO = {
  /** Costo acumulado de un proyecto: hasta este % sobre su estimación BOM cuenta como "en riesgo"; más, "fuera de meta". */
  tolerancia_costo_pct: 10,
};

export type Metas = typeof METAS_DEFECTO;

export const esquemaMetas = z.object({
  tolerancia_costo_pct: z.number().int().min(0, "Mínimo 0%").max(100, "Máximo 100%"),
});

export function leerMetas(db: DB): Metas {
  const filas = db.prepare("SELECT clave, valor FROM metas").all() as { clave: string; valor: number }[];
  const metas = { ...METAS_DEFECTO };
  for (const f of filas) if (f.clave in metas) metas[f.clave as keyof Metas] = f.valor;
  return metas;
}

export function guardarMetas(db: DB, metas: Metas, autor: string): void {
  const up = db.prepare(
    `INSERT INTO metas (clave, valor, actualizado_en, actualizado_por) VALUES (?, ?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en,
                                     actualizado_por = excluded.actualizado_por`,
  );
  const ahora = new Date().toISOString();
  db.transaction(() => {
    for (const [k, v] of Object.entries(metas)) up.run(k, v, ahora, autor);
  })();
}
