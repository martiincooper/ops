import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { leerJson, manejar } from "@/lib/http";
import { METAS_DEFECTO, esquemaMetas, guardarMetas, leerMetas } from "@/lib/metas";

export const dynamic = "force-dynamic";

// ?empresa=clave — metas de los indicadores de gerencia de esa empresa (solo administradores).
export const GET = manejar(async (req: NextRequest) => {
  const { db } = await contexto(req, ["admin"]);
  return NextResponse.json({ metas: leerMetas(db), defecto: METAS_DEFECTO });
});

export const PUT = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["admin"]);
  const metas = await leerJson(req, esquemaMetas);
  guardarMetas(db, metas, u.nombre);
  return NextResponse.json({ metas: leerMetas(db) });
});
