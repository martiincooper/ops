import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { requireGerencia } from "@/lib/chat/servicio";
import { estadoSalas } from "@/lib/chat/salas";

/** Salas activas (con repositorio de GitHub) para el portal, con si tienen una solicitud abierta. */
export const GET = manejar(async (req) => {
  const { db } = await requireGerencia(req);
  return NextResponse.json({ salas: estadoSalas(db) });
});
