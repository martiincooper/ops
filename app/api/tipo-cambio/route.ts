import { NextRequest, NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { HttpError, manejar } from "@/lib/http";
import { tipoCambioHoy } from "@/lib/tipoCambio";

export const dynamic = "force-dynamic";

/** Dólar del día (pesos por 1 USD) para la vista previa del formulario de compra; al guardar se vuelve a pedir. */
export const GET = manejar(async (req: NextRequest) => {
  await requireUsuario(req, ["team", "admin"]);
  const tc = await tipoCambioHoy();
  if (!tc) throw new HttpError(503, "No se pudo obtener el dólar del día");
  return NextResponse.json(tc);
});
