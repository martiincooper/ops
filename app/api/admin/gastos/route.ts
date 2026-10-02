import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { manejar } from "@/lib/http";
import { supervisadosDe } from "@/lib/supervision";
import { gastosEmpresa } from "@/lib/tableros";

export const dynamic = "force-dynamic";

// ?empresa=clave&alcance=mios|todos&estado=pendiente|todos
export const GET = manejar(async (req: NextRequest) => {
  const { u, empresa, db } = await contexto(req, ["admin"]);
  const q = req.nextUrl.searchParams;
  const mios = q.get("alcance") !== "todos";
  const gastos = gastosEmpresa(db, {
    estado: q.get("estado") === "todos" ? "todos" : "pendiente",
    ids: mios ? supervisadosDe(u.id, empresa.clave) : null,
  });
  return NextResponse.json({ empresa, alcance: mios ? "mios" : "todos", gastos });
});
