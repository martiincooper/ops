import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { requireGerencia } from "@/lib/chat/servicio";
import { estadoSalas } from "@/lib/chat/salas";

/** Salas activas (no archivadas, en orden) para el portal; las sin repositorio verificado, «Próximamente». */
export const GET = manejar(async (req) => {
  const { db } = await requireGerencia(req);
  return NextResponse.json({ salas: estadoSalas(db) });
});
