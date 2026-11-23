import { NextResponse } from "next/server";
import { listarPropuestos } from "@/lib/chat/propuestos";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { manejar } from "@/lib/http";

/** «Módulos propuestos»: salas propuestas no archivadas con sus especificaciones guardadas y su última actividad. */
export const GET = manejar(async (req) => {
  await requireAdminPortal(req);
  return NextResponse.json({ propuestos: listarPropuestos(getDbControl()) });
});
