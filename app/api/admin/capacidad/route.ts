import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { manejar } from "@/lib/http";
import { supervisadosDe } from "@/lib/supervision";
import { capacidad, equipoActivo } from "@/lib/tableros";
import { hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, empresa, db } = await contexto(req, ["admin"]);
  const mios = req.nextUrl.searchParams.get("alcance") !== "todos";
  const personas = equipoActivo(db, mios ? supervisadosDe(u.id, empresa.clave) : null);
  return NextResponse.json({ empresa, alcance: mios ? "mios" : "todos", ...capacidad(db, hoyLocal(), personas) });
});
