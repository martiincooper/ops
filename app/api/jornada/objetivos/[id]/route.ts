import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { esquemaObjetivoCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorObjetivo, cambiarObjetivo, quitarObjetivo } from "@/lib/objetivos";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

function traducir(e: unknown): never {
  if (e instanceof ErrorObjetivo) throw new HttpError(e.status, e.message);
  throw e;
}

/**
 * Edita un objetivo de la jornada editable: logrado / pendiente, descripción, proyectos y motivo pendiente.
 * Vale durante la jornada y después de terminarla, hasta comenzar la próxima.
 */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaObjetivoCambio);
  try {
    cambiarObjetivo(db, u.id, id, c, ahoraIso());
  } catch (e) {
    traducir(e);
  }
  return NextResponse.json(estadoDia(db, u, empresa));
});

/** Quita un objetivo de la jornada editable (una jornada terminada conserva al menos uno). */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  try {
    quitarObjetivo(db, u.id, id);
  } catch (e) {
    traducir(e);
  }
  return NextResponse.json(estadoDia(db, u, empresa));
});
