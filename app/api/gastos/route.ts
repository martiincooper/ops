import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { gastosRecientes, jornadaDelDia, jornadaEnCurso, proyectosActivos } from "@/lib/dominio";
import { esquemaGasto } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { repartirMonto } from "@/lib/reparto";
import { hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["team"]);
  return NextResponse.json({ gastos: gastosRecientes(db, u.id) });
});

/**
 * Compra: nombre, descripción (opcional), monto total pagado y uno o más proyectos.
 * Con varios proyectos el monto se reparte en partes iguales (la suma siempre cuadra con el total).
 */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["team"]);
  const g = await leerJson(req, esquemaGasto);
  const activos = new Set(proyectosActivos(db).map((p) => p.id));
  if (g.proyecto_ids.some((id) => !activos.has(id))) throw new HttpError(400, "Proyecto inexistente o no activo");

  const id = randomUUID();
  const partes = repartirMonto(g.monto_clp, g.proyecto_ids.length);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO gastos (id, usuario_id, bitacora_id, item, descripcion, monto_clp)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, u.id, (jornadaEnCurso(db, u.id) ?? jornadaDelDia(db, u.id, hoyLocal()))?.id ?? null, g.item, g.descripcion || null, g.monto_clp);
    const ins = db.prepare("INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_clp) VALUES (?, ?, ?)");
    g.proyecto_ids.forEach((p, i) => ins.run(id, p, partes[i]));
  })();
  return NextResponse.json({ id, gastos: gastosRecientes(db, u.id) }, { status: 201 });
});
