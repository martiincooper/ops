import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaGastoCambio } from "@/lib/esquemas";
import { ErrorGasto, editarGasto } from "@/lib/gastos";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

/** Edita los datos de cualquier compra de la empresa (en cualquier estado; la validación se conserva). */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaGastoCambio);
  try {
    editarGasto(db, id, c, { nombre: u.nombre, ahora: ahoraIso() });
  } catch (e) {
    if (e instanceof ErrorGasto) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json({ ok: true });
});
