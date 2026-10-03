import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { NOMBRE_ESTADO, leerEtapas, registrarCambioEtapa } from "@/lib/etapas";
import { esquemaProyectoCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { repartirMonto } from "@/lib/reparto";
import { hoyLocal } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edita un proyecto: código, nombre, estimación BOM, fechas de inicio y de entrega estimada, y estado.
 * Solo cambian los campos enviados. El inicio es también el comienzo de su primera etapa (se mueven juntos) y no
 * puede quedar después de la etapa siguiente ni de la entrega estimada. Un cambio de estado queda en el historial.
 */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaProyectoCambio);
  const p = db.prepare("SELECT id, codigo, estado, fecha_inicio, fecha_entrega_objetivo FROM proyectos WHERE id = ?").get(id) as
    | { id: string; codigo: string; estado: string; fecha_inicio: string; fecha_entrega_objetivo: string }
    | undefined;
  if (!p) throw new HttpError(404, "Proyecto no encontrado");

  const inicio = c.fecha_inicio ?? p.fecha_inicio;
  const entrega = c.fecha_entrega_objetivo ?? p.fecha_entrega_objetivo;
  if (entrega < inicio) throw new HttpError(400, "La entrega estimada no puede ser anterior al inicio");
  if (c.codigo && c.codigo !== p.codigo && db.prepare("SELECT 1 FROM proyectos WHERE codigo = ? AND id <> ?").get(c.codigo, id)) {
    throw new HttpError(409, `El código ${c.codigo} ya existe`);
  }
  const etapas = leerEtapas(db, id).get(id) ?? [];
  const cambiaInicio = c.fecha_inicio !== undefined && c.fecha_inicio !== p.fecha_inicio;
  if (cambiaInicio && etapas[1] && inicio > etapas[1].desde) {
    throw new HttpError(400, `El inicio no puede ser posterior al comienzo de ${NOMBRE_ESTADO[etapas[1].estado]} (${etapas[1].desde})`);
  }

  db.transaction(() => {
    if (cambiaInicio && etapas[0]) db.prepare("UPDATE proyecto_etapas SET desde = ? WHERE id = ?").run(inicio, etapas[0].id);
    // Cada cambio de estado queda en el historial de etapas con la fecha de hoy
    if (c.estado) registrarCambioEtapa(db, { ...p, fecha_inicio: inicio }, c.estado, hoyLocal());
    db.prepare(
      `UPDATE proyectos SET
          codigo = COALESCE(?, codigo),
          nombre = COALESCE(?, nombre),
          presupuesto_clp = COALESCE(?, presupuesto_clp),
          fecha_inicio = ?,
          fecha_entrega_objetivo = ?,
          estado = COALESCE(?, estado)
        WHERE id = ?`,
    ).run(c.codigo ?? null, c.nombre ?? null, c.presupuesto_clp ?? null, inicio, entrega, c.estado ?? null, id);
  })();
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
