import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { enSala, requireGerencia, vistaConversacion } from "@/lib/chat/servicio";
import { entrarSala } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ modulo: string }> };

/** Entra a la sala: la bloquea para la persona (o retoma su conversación). 409 si la ocupa otra persona. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { modulo } = await params;
  const { conversacion } = enSala(() => entrarSala(db, modulo, p));
  return NextResponse.json(vistaConversacion(db, conversacion.id));
});
