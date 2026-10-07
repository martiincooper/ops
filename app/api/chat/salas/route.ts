import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { requireGerencia } from "@/lib/chat/servicio";
import { INACTIVIDAD_MIN, estadoSalas } from "@/lib/chat/salas";

/** Estado de las 7 salas para el portal (libre, en uso por otra persona o propia). */
export const GET = manejar(async (req) => {
  const { p, db } = await requireGerencia(req);
  return NextResponse.json({ salas: estadoSalas(db, p), inactividad_min: INACTIVIDAD_MIN });
});
