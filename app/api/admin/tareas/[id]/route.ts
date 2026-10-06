import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaTareaCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorTarea, borrarTarea, marcarTarea } from "@/lib/tareas";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

function traducir(e: unknown): never {
  if (e instanceof ErrorTarea) throw new HttpError(e.status, e.message);
  throw e;
}

/** Marca (o desmarca) como hecha la tarea de cualquier persona de la empresa. */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaTareaCambio);
  try {
    marcarTarea(db, id, c.completada, u.nombre, ahoraIso(), null);
  } catch (e) {
    traducir(e);
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id } = await params;
  try {
    borrarTarea(db, id, null);
  } catch (e) {
    traducir(e);
  }
  return NextResponse.json({ ok: true });
});
