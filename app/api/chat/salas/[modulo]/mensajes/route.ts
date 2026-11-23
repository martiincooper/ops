import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { enSala, requireGerencia } from "@/lib/chat/servicio";
import { TEXTO_MAX, enviarMensaje } from "@/lib/chat/salas";
import { MENSAJE_CUPO, consumirCupo } from "@/lib/chat/uso";

type Ctx = { params: Promise<{ modulo: string }> };

const esquema = z.object({ texto: z.string().trim().min(1, "Escribe un mensaje").max(TEXTO_MAX, `Máximo ${TEXTO_MAX} caracteres`) });

/** Guarda el mensaje y responde de inmediato; si la sala no tiene una solicitud abierta, abre una. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { modulo } = await params;
  const { texto } = await leerJson(req, esquema);
  if (!consumirCupo(p.email, "mensaje")) throw new HttpError(429, MENSAJE_CUPO);
  const { mensaje, solicitud, nueva } = enSala(() => enviarMensaje(db, modulo, p, texto));
  return NextResponse.json({ mensaje, solicitud: { id: solicitud.id, ticket: solicitud.ticket, estado: solicitud.estado }, nueva });
});
