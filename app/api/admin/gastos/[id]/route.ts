import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaValidacionGasto } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

/** Aprobar / rechazar (con motivo) / volver a pendiente. */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const v = await leerJson(req, esquemaValidacionGasto);
  if (!db.prepare("SELECT 1 FROM gastos WHERE id = ?").get(id)) throw new HttpError(404, "Compra no encontrada");
  const pendiente = v.estado === "pendiente";
  db.prepare(
    `UPDATE gastos SET estado = ?, observacion = ?, validado_por = ?, validado_por_nombre = ?, validado_en = ?
      WHERE id = ?`,
  ).run(
    v.estado,
    v.observacion || null,
    pendiente ? null : u.id,
    pendiente ? null : u.nombre,
    pendiente ? null : ahoraIso(),
    id,
  );
  return NextResponse.json({ ok: true });
});
