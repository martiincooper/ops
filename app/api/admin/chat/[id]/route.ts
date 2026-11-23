import { NextResponse } from "next/server";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";
import { mensajes, solicitud } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ id: string }> };

/** Transcripción de una solicitud (auditoría). */
export const GET = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { id } = await params;
  const db = getDbControl();
  const s = solicitud(db, id);
  if (!s) throw new HttpError(404, "Solicitud no encontrada");
  return NextResponse.json({ resumen: s.resumen, mensajes: mensajes(db, id) });
});
