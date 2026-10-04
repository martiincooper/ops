import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { MAX_OBJETIVOS, esquemaObjetivoNuevo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorObjetivo, agregarObjetivo } from "@/lib/objetivos";
import { ahoraIso } from "@/lib/tiempo";

/** Agrega un objetivo a la jornada editable (en curso o la última terminada, hasta comenzar la próxima). */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const o = await leerJson(req, esquemaObjetivoNuevo);
  try {
    agregarObjetivo(db, u.id, o, MAX_OBJETIVOS, ahoraIso());
  } catch (e) {
    if (e instanceof ErrorObjetivo) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json(estadoDia(db, u, empresa), { status: 201 });
});
