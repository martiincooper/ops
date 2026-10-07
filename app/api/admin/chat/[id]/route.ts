import { NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";
import { conversacion, mensajes } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ id: string }> };

/** Transcripción y requerimiento de una conversación (auditoría). */
export const GET = manejar<Ctx>(async (req, { params }) => {
  await requireUsuario(req, ["admin"]);
  const { id } = await params;
  const db = getDbControl();
  const c = conversacion(db, id);
  if (!c) throw new HttpError(404, "Conversación no encontrada");
  return NextResponse.json({
    requerimiento: c.requerimiento_json ? JSON.parse(c.requerimiento_json) : null,
    mensajes: mensajes(db, id),
  });
});
