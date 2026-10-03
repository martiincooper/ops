import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaProyectoCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { repartirMonto } from "@/lib/reparto";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaProyectoCambio);
  const p = db.prepare("SELECT fecha_inicio FROM proyectos WHERE id = ?").get(id) as
    | { fecha_inicio: string }
    | undefined;
  if (!p) throw new HttpError(404, "Proyecto no encontrado");
  if (c.fecha_entrega_objetivo && c.fecha_entrega_objetivo < p.fecha_inicio) {
    throw new HttpError(400, "La entrega objetivo no puede ser anterior al inicio");
  }
  db.prepare(
    `UPDATE proyectos SET
        nombre = COALESCE(?, nombre),
        presupuesto_clp = COALESCE(?, presupuesto_clp),
        fecha_entrega_objetivo = COALESCE(?, fecha_entrega_objetivo),
        estado = COALESCE(?, estado)
      WHERE id = ?`,
  ).run(c.nombre ?? null, c.presupuesto_clp ?? null, c.fecha_entrega_objetivo ?? null, c.estado ?? null, id);
  return NextResponse.json({ ok: true });
});

/**
 * Elimina el proyecto y lo que se registró solo para él. Irreversible.
 *  - Objetivos y compras exclusivos del proyecto se borran.
 *  - Los compartidos con otros proyectos solo lo pierden; el monto de la compra se reparte de nuevo
 *    en partes iguales entre los proyectos que quedan.
 *  - Una bitácora abierta que queda sin objetivos se borra, para que la persona pueda registrar de nuevo.
 */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const p = db.prepare("SELECT codigo FROM proyectos WHERE id = ?").get(id) as { codigo: string } | undefined;
  if (!p) throw new HttpError(404, "Proyecto no encontrado");

  const resumen = db.transaction(() => {
    const objetivos = db
      .prepare(
        `DELETE FROM tareas_diarias WHERE id IN (
           SELECT tarea_id FROM tarea_proyectos GROUP BY tarea_id
           HAVING COUNT(*) = 1 AND MAX(proyecto_id = ?) = 1)`,
      )
      .run(id).changes;
    db.prepare("DELETE FROM tarea_proyectos WHERE proyecto_id = ?").run(id);

    const compras = db
      .prepare(
        `DELETE FROM gastos WHERE id IN (
           SELECT gasto_id FROM gasto_proyectos GROUP BY gasto_id
           HAVING COUNT(*) = 1 AND MAX(proyecto_id = ?) = 1)`,
      )
      .run(id).changes;
    const compartidas = db
      .prepare("SELECT g.id, g.monto_clp FROM gastos g JOIN gasto_proyectos gp ON gp.gasto_id = g.id WHERE gp.proyecto_id = ?")
      .all(id) as { id: string; monto_clp: number }[];
    db.prepare("DELETE FROM gasto_proyectos WHERE proyecto_id = ?").run(id);
    const restantes = db.prepare("SELECT proyecto_id FROM gasto_proyectos WHERE gasto_id = ? ORDER BY monto_clp DESC, proyecto_id");
    const fijar = db.prepare("UPDATE gasto_proyectos SET monto_clp = ? WHERE gasto_id = ? AND proyecto_id = ?");
    for (const g of compartidas) {
      const filas = restantes.all(g.id) as { proyecto_id: string }[];
      repartirMonto(g.monto_clp, filas.length).forEach((m, i) => fijar.run(m, g.id, filas[i].proyecto_id));
    }

    db.prepare(
      `DELETE FROM bitacoras WHERE checkout_tarde IS NULL
         AND NOT EXISTS (SELECT 1 FROM tareas_diarias t WHERE t.bitacora_id = bitacoras.id)`,
    ).run();
    db.prepare("DELETE FROM proyectos WHERE id = ?").run(id);
    return { objetivos, compras, compras_reasignadas: compartidas.length };
  })();

  return NextResponse.json({ ok: true, ...resumen });
});
