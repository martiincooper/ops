import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { HttpError, manejar } from "@/lib/http";
import { ahoraIso, hoyLocal } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  const a = db
    .prepare("SELECT fecha, dia_completo FROM ausencias_ooo WHERE id = ? AND usuario_id = ?")
    .get(id, u.id) as { fecha: string; dia_completo: number } | undefined;
  if (!a) throw new HttpError(404, "Ausencia no encontrada");
  if (a.fecha < hoyLocal()) throw new HttpError(400, "No se pueden cancelar ausencias pasadas");

  db.transaction(() => {
    db.prepare("DELETE FROM ausencias_ooo WHERE id = ?").run(id);
    if (a.dia_completo === 1) {
      db.prepare(
        `UPDATE tareas_diarias SET estado = 'pendiente', actualizado_en = ?
          WHERE estado = 'postergado_ooo' AND bitacora_id = (
            SELECT id FROM bitacoras WHERE usuario_id = ? AND fecha = ? AND checkout_tarde IS NULL)`,
      ).run(ahoraIso(), u.id, a.fecha);
    }
  })();

  return NextResponse.json(estadoDia(db, u, empresa));
});
