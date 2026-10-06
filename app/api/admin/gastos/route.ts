import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaGasto } from "@/lib/esquemas";
import { ErrorGasto, crearGasto } from "@/lib/gastos";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { cuentaDeRegistros, idsHeredados } from "@/lib/registros";
import { supervisadosDe } from "@/lib/supervision";
import { gastosEmpresa } from "@/lib/tableros";
import { ahoraIso } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

// ?empresa=clave&alcance=mios|todos&estado=pendiente|todos
export const GET = manejar(async (req: NextRequest) => {
  const { u, empresa, db } = await contexto(req, ["admin"]);
  const q = req.nextUrl.searchParams;
  const mios = q.get("alcance") !== "todos";
  const gastos = gastosEmpresa(db, {
    estado: q.get("estado") === "todos" ? "todos" : "pendiente",
    // Mis supervisados + los registros que heredé al eliminar cuentas
    ids: mios ? new Set([...supervisadosDe(u.id, empresa.clave), ...idsHeredados(db, u.id)]) : null,
  });
  return NextResponse.json({ empresa, alcance: mios ? "mios" : "todos", gastos });
});

/**
 * Costo registrado por la jefatura para uno o más proyectos: queda a nombre de su fila de registros en la empresa
 * (la misma de los registros heredados) y aprobado de inmediato.
 */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["admin"]);
  const g = await leerJson(req, esquemaGasto);
  try {
    const id = db.transaction(() =>
      crearGasto(db, {
        usuarioId: cuentaDeRegistros(db, { id: u.id, nombre: u.nombre }),
        bitacoraId: null,
        datos: g,
        aprobadaPor: { id: u.id, nombre: u.nombre },
        ahora: ahoraIso(),
      }),
    )();
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorGasto) throw new HttpError(e.status, e.message);
    throw e;
  }
});
