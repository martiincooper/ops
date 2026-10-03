import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { leerEtapas } from "@/lib/etapas";
import { esquemaEtapas } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { hoyLocal } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Corrige las fechas del historial de etapas (por ejemplo, para registrar cuándo se entregó un proyecto antiguo).
 * Se envían todas las etapas del proyecto con su fecha; el orden y los estados no cambian.
 * Reglas: fechas en orden (cada una ≥ la anterior), ninguna después de hoy salvo la primera, y la primera
 * (= fecha de inicio del proyecto) no posterior a la entrega estimada.
 */
export const PUT = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const p = db.prepare("SELECT id, fecha_entrega_objetivo FROM proyectos WHERE id = ?").get(id) as
    | { id: string; fecha_entrega_objetivo: string }
    | undefined;
  if (!p) throw new HttpError(404, "Proyecto no encontrado");
  const { etapas } = await leerJson(req, esquemaEtapas);
  const actuales = leerEtapas(db, id).get(id) ?? [];
  if (etapas.length !== actuales.length || etapas.some((e, i) => e.id !== actuales[i].id)) {
    throw new HttpError(409, "El historial cambió; recarga la página");
  }
  const hoy = hoyLocal();
  for (let i = 1; i < etapas.length; i++) {
    if (etapas[i].desde < etapas[i - 1].desde) throw new HttpError(400, "Las fechas deben ir en orden: cada etapa empieza el mismo día o después de la anterior");
    if (etapas[i].desde > hoy) throw new HttpError(400, "Una etapa no puede empezar después de hoy");
  }
  if (etapas[0].desde > p.fecha_entrega_objetivo) {
    throw new HttpError(400, "El inicio no puede ser posterior a la entrega estimada");
  }
  db.transaction(() => {
    const fijar = db.prepare("UPDATE proyecto_etapas SET desde = ? WHERE id = ? AND proyecto_id = ?");
    for (const e of etapas) fijar.run(e.desde, e.id, id);
    db.prepare("UPDATE proyectos SET fecha_inicio = ? WHERE id = ?").run(etapas[0].desde, id);
  })();
  return NextResponse.json({ ok: true, etapas: (leerEtapas(db, id).get(id) ?? []).map(({ id: i, estado, desde }) => ({ id: i, estado, desde })) });
});
