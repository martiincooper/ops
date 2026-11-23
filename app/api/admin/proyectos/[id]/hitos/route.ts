import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaHito } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { errorDeHito, leerHitos } from "@/lib/hitos";
import { hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id } = await params;
  if (!db.prepare("SELECT 1 FROM proyectos WHERE id = ?").get(id)) throw new HttpError(404, "Proyecto no encontrado");
  return NextResponse.json({ hitos: leerHitos(db, id).get(id) ?? [] });
});

export const POST = manejar<Ctx>(async (req, { params }) => {
  const { db, u } = await contexto(req, ["admin"]);
  const { id } = await params;
  const p = db.prepare("SELECT fecha_inicio FROM proyectos WHERE id = ?").get(id) as { fecha_inicio: string } | undefined;
  if (!p) throw new HttpError(404, "Proyecto no encontrado");
  const h = await leerJson(req, esquemaHito);
  const msg = errorDeHito(h, p.fecha_inicio, hoyLocal());
  if (msg) throw new HttpError(400, msg);
  const r = db
    .prepare("INSERT INTO proyecto_hitos (proyecto_id, etapa, titulo, detalle, fecha, creado_por_nombre) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, h.etapa, h.titulo, h.detalle, h.fecha, u.nombre);
  return NextResponse.json({ id: Number(r.lastInsertRowid) }, { status: 201 });
});
