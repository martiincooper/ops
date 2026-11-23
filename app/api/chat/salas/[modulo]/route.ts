import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { enSala, requireGerencia } from "@/lib/chat/servicio";
import { exigirSala, vistaSala } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ modulo: string }> };

/**
 * Historial de la sala: todas sus solicitudes con sus mensajes. Con `?desde=<id>` solo los mensajes más nuevos que
 * ese id (el cliente consulta cada 2 a 3 segundos).
 */
export const GET = manejar<Ctx>(async (req, { params }) => {
  const { db } = await requireGerencia(req);
  const { modulo } = await params;
  const sala = enSala(() => exigirSala(db, modulo));
  const desde = Number(req.nextUrl.searchParams.get("desde"));
  return NextResponse.json(vistaSala(db, sala, Number.isInteger(desde) && desde > 0 ? desde : 0));
});
