import { NextResponse } from "next/server";
import { z } from "zod";
import { proponerModulo } from "@/lib/chat/catalogo";
import { requireGerencia } from "@/lib/chat/servicio";
import { estadoSalas } from "@/lib/chat/salas";
import { MENSAJE_CUPO, consumirCupo } from "@/lib/chat/uso";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { enModulo } from "../../admin/chat/salas/comun";

const esquema = z.object({ nombre: z.string(), descripcion: z.string() }).strict();

/** Salas activas (no archivadas, en orden) para el portal; las sin repositorio verificado, «Próximamente». */
export const GET = manejar(async (req) => {
  const { db } = await requireGerencia(req);
  return NextResponse.json({ salas: estadoSalas(db) });
});

/** Un gerente propone un módulo nuevo: crea su sala (abierta sin repositorio, «Propuesto»). */
export const POST = manejar(async (req) => {
  const { p, db } = await requireGerencia(req);
  const d = await leerJson(req, esquema);
  if (!consumirCupo(p.email, "mensaje")) throw new HttpError(429, MENSAJE_CUPO);
  const sala = enModulo(() => proponerModulo(db, d, p.email));
  return NextResponse.json({ sala: estadoSalas(db).find((s) => s.clave === sala.clave) }, { status: 201 });
});
