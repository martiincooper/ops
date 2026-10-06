import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { esquemaTareaCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorTarea, borrarTarea, marcarTarea } from "@/lib/tareas";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

function traducir(e: unknown): never {
  if (e instanceof ErrorTarea) throw new HttpError(e.status, e.message);
  throw e;
}

/** Marca (o desmarca) como hecha una tarea propia. */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaTareaCambio);
  try {
    marcarTarea(db, id, c.completada, u.nombre, ahoraIso(), u.id);
  } catch (e) {
    traducir(e);
  }
  return NextResponse.json(estadoDia(db, u, empresa));
});

export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  try {
    borrarTarea(db, id, u.id);
  } catch (e) {
    traducir(e);
  }
  return NextResponse.json(estadoDia(db, u, empresa));
});
