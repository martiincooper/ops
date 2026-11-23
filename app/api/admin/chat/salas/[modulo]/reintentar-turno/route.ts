import { NextResponse } from "next/server";
import { asientoDesdeEntorno, reintentarTurnoDeSala } from "@/lib/chat/asistente";
import { moduloPorClave } from "@/lib/chat/catalogo";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";

type Ctx = { params: Promise<{ modulo: string }> };

/** «Reintentar» del asistente: corre ahora el turno trabado de la sala, sin esperar la hora del reintento. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { modulo } = await params;
  const db = getDbControl();
  if (!moduloPorClave(db, modulo)) throw new HttpError(404, "Sala no encontrada");
  const r = reintentarTurnoDeSala(db, modulo, asientoDesdeEntorno());
  if (!r.iniciado) throw new HttpError(409, "La sala no tiene un turno del asistente por reintentar");
  return NextResponse.json({ iniciado: true }, { status: 202 });
});
