import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { esquemaBloqueo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorObjetivo, cambiarBloqueo } from "@/lib/objetivos";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  return NextResponse.json(estadoDia(db, u, empresa));
});

/** Edita el bloqueo de la última jornada terminada (hasta comenzar la próxima). Un texto nuevo queda sin resolver. */
export const PATCH = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { bloqueo } = await leerJson(req, esquemaBloqueo);
  try {
    cambiarBloqueo(db, u.id, bloqueo);
  } catch (e) {
    if (e instanceof ErrorObjetivo) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json(estadoDia(db, u, empresa));
});
