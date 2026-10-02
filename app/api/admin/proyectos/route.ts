import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { esquemaProyectoNuevo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  await requireUsuario(req, ["admin"]);
  const proyectos = getDb()
    .prepare(
      `SELECT id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado
         FROM proyectos ORDER BY estado IN ('entregado', 'pausado'), codigo`,
    )
    .all();
  return NextResponse.json({ proyectos });
});

export const POST = manejar(async (req: NextRequest) => {
  await requireUsuario(req, ["admin"]);
  const p = await leerJson(req, esquemaProyectoNuevo);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM proyectos WHERE codigo = ?").get(p.codigo)) {
    throw new HttpError(409, `El código ${p.codigo} ya existe`);
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, p.codigo, p.nombre, p.presupuesto_clp, p.fecha_inicio, p.fecha_entrega_objetivo, p.estado);
  return NextResponse.json({ id }, { status: 201 });
});
