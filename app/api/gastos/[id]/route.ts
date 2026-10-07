import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { gastosRecientes } from "@/lib/dominio";
import { esquemaGastoCambio } from "@/lib/esquemas";
import { ErrorGasto, editarGasto, eliminarGasto, necesitaTipoCambio } from "@/lib/gastos";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso } from "@/lib/tiempo";
import { tipoCambioHoy } from "@/lib/tipoCambio";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edita una compra propia en cualquier estado: precios finales, envío, impuesto (p. ej. aduana que llega después de
 * aprobada), proyectos, tipo de costo. El estado de validación se conserva.
 */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db } = await contexto(req, ["team"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaGastoCambio);
  const tipoCambio = necesitaTipoCambio(db, id, c) ? await tipoCambioHoy() : null;
  try {
    editarGasto(db, id, c, { nombre: u.nombre, ahora: ahoraIso(), usuarioId: u.id }, tipoCambio);
  } catch (e) {
    if (e instanceof ErrorGasto) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json({ gastos: gastosRecientes(db, u.id) });
});

/** Elimina una compra propia en cualquier estado. */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { u, db } = await contexto(req, ["team"]);
  const { id } = await params;
  try {
    eliminarGasto(db, id, u.id);
  } catch (e) {
    if (e instanceof ErrorGasto) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json({ gastos: gastosRecientes(db, u.id) });
});
