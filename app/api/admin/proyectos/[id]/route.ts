import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaProyectoCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";

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
