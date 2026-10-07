import { NextResponse } from "next/server";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";
import { liberarSala } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ modulo: string }> };

/** Libera una sala ocupada (la conversación queda en el historial como finalizada). */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { modulo } = await params;
  if (!liberarSala(getDbControl(), modulo)) throw new HttpError(404, "La sala ya estaba libre");
  return NextResponse.json({ ok: true });
});
