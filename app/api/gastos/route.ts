import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { gastosRecientes, jornadaDelDia, jornadaEnCurso } from "@/lib/dominio";
import { esquemaGasto } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ErrorGasto, crearGasto } from "@/lib/gastos";
import { ahoraIso, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["team"]);
  return NextResponse.json({ gastos: gastosRecientes(db, u.id) });
});

/**
 * Compra: nombre, descripción (opcional), monto de la compra, envío e impuesto opcionales, tipo de costo y uno o más
 * proyectos (montos en CLP). Se guarda monto_clp = compra + envío + impuesto (total pagado) y el envío y el impuesto
 * aparte. Con varios proyectos el total se reparte en partes iguales (la suma siempre cuadra con el total).
 */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["team"]);
  const g = await leerJson(req, esquemaGasto);
  let id: string;
  try {
    id = crearGasto(db, {
      usuarioId: u.id,
      bitacoraId: (jornadaEnCurso(db, u.id) ?? jornadaDelDia(db, u.id, hoyLocal()))?.id ?? null,
      datos: g,
      ahora: ahoraIso(),
    });
  } catch (e) {
    if (e instanceof ErrorGasto) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json({ id, gastos: gastosRecientes(db, u.id) }, { status: 201 });
});
