import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { esquemaComienzo } from "@/lib/esquemas";
import { HttpError, manejar } from "@/lib/http";
import { ErrorObjetivo, comenzarJornada } from "@/lib/objetivos";
import { ahoraIso, hoyLocal } from "@/lib/tiempo";

/**
 * Comenzar jornada: es el evento de comienzo (un toque). Los objetivos se agregan y editan después en el tablero;
 * por compatibilidad también se aceptan en el mismo envío. Sin horario: a cualquier hora, una jornada por día.
 * Idempotente: si la jornada de hoy ya está en curso, la devuelve (200). Al comenzar, la jornada anterior deja de
 * ser editable.
 */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const texto = await req.text();
  let cuerpo: unknown = {};
  if (texto.trim()) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      throw new HttpError(400, "JSON inválido");
    }
  }
  const { tareas } = esquemaComienzo.parse(cuerpo);
  let r: "creada" | "ya_existia";
  try {
    r = comenzarJornada(db, u.id, hoyLocal(), tareas, ahoraIso());
  } catch (e) {
    if (e instanceof ErrorObjetivo) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json({ ya_existia: r === "ya_existia", ...estadoDia(db, u, empresa) }, { status: r === "creada" ? 201 : 200 });
});
