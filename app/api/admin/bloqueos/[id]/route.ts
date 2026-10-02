import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { HttpError, manejar } from "@/lib/http";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

/** Marca resuelto el bloqueo de una bitácora (id = bitácora). */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { u, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const r = db
    .prepare(
      `UPDATE bitacoras SET bloqueo_resuelto_en = ?, bloqueo_resuelto_por = ?, bloqueo_resuelto_por_nombre = ?
        WHERE id = ? AND bloqueos IS NOT NULL AND bloqueo_resuelto_en IS NULL`,
    )
    .run(ahoraIso(), u.id, u.nombre, id);
  if (r.changes !== 1) throw new HttpError(404, "Bloqueo no encontrado o ya resuelto");
  return NextResponse.json({ ok: true });
});
