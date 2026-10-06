import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaTareaAdmin } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { equipoActivo } from "@/lib/tableros";
import { ErrorTarea, crearTarea } from "@/lib/tareas";
import { ahoraIso } from "@/lib/tiempo";

/** La jefatura asigna una tarea a una persona activa del equipo (desde el standup). */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["admin"]);
  const t = await leerJson(req, esquemaTareaAdmin);
  if (!equipoActivo(db, new Set([t.usuario_id])).length) throw new HttpError(404, "Persona no encontrada o inactiva");
  try {
    const id = crearTarea(db, t.usuario_id, t.descripcion, { id: u.id, nombre: u.nombre }, ahoraIso());
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorTarea) throw new HttpError(e.status, e.message);
    throw e;
  }
});
