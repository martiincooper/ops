import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { manejar } from "@/lib/http";
import { metricasExec } from "@/lib/tableros";
import { hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

// Gerencia: siempre su empresa (se ignora ?empresa=). Administradores: la empresa elegida.
export const GET = manejar(async (req: NextRequest) => {
  const { empresa, db } = await contexto(req, ["executive", "admin"]);
  return NextResponse.json({ empresa: { clave: empresa.clave, nombre: empresa.nombre }, hoy: hoyLocal(), ...metricasExec(db, hoyLocal()) });
});
