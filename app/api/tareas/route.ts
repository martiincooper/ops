import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { esquemaTareaNueva } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorTarea, crearTarea } from "@/lib/tareas";
import { ahoraIso } from "@/lib/tiempo";

/** Agrega una tarea propia (no es objetivo del día: queda hasta marcarla hecha). */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const t = await leerJson(req, esquemaTareaNueva);
  try {
    crearTarea(db, u.id, t.descripcion, { id: u.id, nombre: u.nombre }, ahoraIso());
  } catch (e) {
    if (e instanceof ErrorTarea) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json(estadoDia(db, u, empresa), { status: 201 });
});
