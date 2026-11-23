import { NextResponse } from "next/server";
import { moduloPorClave } from "@/lib/chat/catalogo";
import { cerrarConversacion } from "@/lib/chat/salas";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";

type Ctx = { params: Promise<{ modulo: string }> };

/** «Cerrar conversación»: cierra la solicitud abierta de la sala sin enviarla, para poder cambiar el repositorio o archivar. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { modulo } = await params;
  const db = getDbControl();
  if (!moduloPorClave(db, modulo)) throw new HttpError(404, "Sala no encontrada");
  return NextResponse.json({ cerrada: cerrarConversacion(db, modulo) });
});
