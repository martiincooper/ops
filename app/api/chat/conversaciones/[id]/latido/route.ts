import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { enSala, requireGerencia } from "@/lib/chat/servicio";
import { exigirActiva, expiraEn, tocar } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ id: string }> };

/** La persona sigue escribiendo: mantiene la sala bloqueada otros minutos. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { id } = await params;
  enSala(() => exigirActiva(db, id, p));
  const ahora = new Date();
  tocar(db, id, ahora);
  return NextResponse.json({ expira_en: expiraEn(ahora.toISOString()) });
});
