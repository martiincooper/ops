import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { requireGerencia } from "@/lib/chat/servicio";
import { cerrarConversacion, conversacion } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ id: string }> };

/** «Finalizar conversación» sin generar requerimiento: libera la sala. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { id } = await params;
  const c = conversacion(db, id);
  if (c && c.usuario_email.toLowerCase() === p.email.toLowerCase() && c.estado === "activa") cerrarConversacion(db, id, "finalizada");
  return NextResponse.json({ ok: true });
});
