import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { MAX_OBJETIVOS, esquemaObjetivoNuevo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorObjetivo, agregarObjetivoJefatura } from "@/lib/objetivos";
import { equipoActivo } from "@/lib/tableros";
import { ahoraIso, hoyLocal } from "@/lib/tiempo";

type Ctx = { params: Promise<{ usuarioId: string }> };

/**
 * La jefatura agrega un objetivo del día a una persona desde el standup. Si la persona aún no comienza la jornada
 * de hoy, se le comienza con ese objetivo (luego ella la edita y la termina como siempre).
 */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { usuarioId } = await params;
  const o = await leerJson(req, esquemaObjetivoNuevo);
  if (!equipoActivo(db, new Set([usuarioId])).length) throw new HttpError(404, "Persona no encontrada o inactiva");
  try {
    const r = agregarObjetivoJefatura(db, usuarioId, o, MAX_OBJETIVOS, hoyLocal(), ahoraIso());
    return NextResponse.json({ resultado: r }, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorObjetivo) throw new HttpError(e.status, e.message);
    throw e;
  }
});
