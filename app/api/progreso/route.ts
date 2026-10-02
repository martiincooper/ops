import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { ausenciasDesde, gastosRecientes } from "@/lib/dominio";
import { manejar } from "@/lib/http";
import { calcularProgreso } from "@/lib/metricas";
import { fechaLocal, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const hoy = hoyLocal();
  return NextResponse.json({
    ...calcularProgreso(db, u.id, hoy, fechaLocal(u.creado_en)),
    gastos: gastosRecientes(db, u.id),
    ausencias: ausenciasDesde(db, u.id, hoy),
  });
});
