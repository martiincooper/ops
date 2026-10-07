import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { enSala, generarRequerimiento, requireGerencia, vistaConversacion } from "@/lib/chat/servicio";
import { exigirActiva, tocar } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ id: string }> };

/** «Finalizar y generar requerimiento»: redacta, asigna ticket, libera la sala y crea el Issue en GitHub. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { id } = await params;
  const c = enSala(() => exigirActiva(db, id, p));
  tocar(db, id);
  const r = await generarRequerimiento(db, c, p);
  return NextResponse.json({
    ...vistaConversacion(db, id),
    resultado: { ticket: r.ticket, titulo: r.requerimiento.titulo, prioridad: r.requerimiento.prioridad, issue: r.issue },
  });
});
