import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaValidacionGasto } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

/** Aprobar / rechazar (con motivo) / volver a pendiente. En facturas se puede corregir el IVA por redondeo. */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const v = await leerJson(req, esquemaValidacionGasto);
  const g = db.prepare("SELECT tipo_documento FROM gastos WHERE id = ?").get(id) as { tipo_documento: string } | undefined;
  if (!g) throw new HttpError(404, "Compra no encontrada");
  if (v.iva_clp !== undefined && g.tipo_documento !== "factura") {
    throw new HttpError(400, "Solo las facturas tienen IVA recuperable");
  }
  const pendiente = v.estado === "pendiente";
  db.prepare(
    `UPDATE gastos SET estado = ?, observacion = ?, iva_clp = COALESCE(?, iva_clp),
            validado_por = ?, validado_por_nombre = ?, validado_en = ?
      WHERE id = ?`,
  ).run(
    v.estado,
    v.observacion || null,
    v.iva_clp ?? null,
    pendiente ? null : u.id,
    pendiente ? null : u.nombre,
    pendiente ? null : ahoraIso(),
    id,
  );
  return NextResponse.json({ ok: true });
});
