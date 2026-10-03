import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { HttpError, manejar } from "@/lib/http";
import { hoyLocal } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  const a = db.prepare("SELECT fecha FROM ausencias_ooo WHERE id = ? AND usuario_id = ?").get(id, u.id) as
    | { fecha: string }
    | undefined;
  if (!a) throw new HttpError(404, "No encontrado");
  if (a.fecha < hoyLocal()) throw new HttpError(400, "No se pueden quitar días pasados");
  db.prepare("DELETE FROM ausencias_ooo WHERE id = ?").run(id);
  return NextResponse.json(estadoDia(db, u, empresa));
});
