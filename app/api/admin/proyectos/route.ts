import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { leerEtapas } from "@/lib/etapas";
import { esquemaProyectoNuevo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { db } = await contexto(req, ["admin"]);
  const etapas = leerEtapas(db);
  const proyectos = (
    db
      .prepare(
        `SELECT id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado
           FROM proyectos ORDER BY estado IN ('entregado', 'pausado'), codigo`,
      )
      .all() as { id: string }[]
  ).map((p) => ({ ...p, etapas: (etapas.get(p.id) ?? []).map(({ id, estado, desde }) => ({ id, estado, desde })) }));
  return NextResponse.json({ proyectos });
});

export const POST = manejar(async (req: NextRequest) => {
  const { db } = await contexto(req, ["admin"]);
  const p = await leerJson(req, esquemaProyectoNuevo);
  if (db.prepare("SELECT 1 FROM proyectos WHERE codigo = ?").get(p.codigo)) {
    throw new HttpError(409, `El código ${p.codigo} ya existe`);
  }
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, p.codigo, p.nombre, p.presupuesto_clp, p.fecha_inicio, p.fecha_entrega_objetivo, p.estado);
    // El proyecto entra a su primera etapa en su fecha de inicio
    db.prepare("INSERT INTO proyecto_etapas (proyecto_id, estado, desde) VALUES (?, ?, ?)").run(id, p.estado, p.fecha_inicio);
  })();
  return NextResponse.json({ id }, { status: 201 });
});
