import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaHito } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { errorDeHito } from "@/lib/hitos";
import { hoyLocal } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string; hitoId: string }> };

export const PUT = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id, hitoId } = await params;
  const p = db.prepare("SELECT fecha_inicio FROM proyectos WHERE id = ?").get(id) as { fecha_inicio: string } | undefined;
  if (!p) throw new HttpError(404, "Proyecto no encontrado");
  if (!db.prepare("SELECT 1 FROM proyecto_hitos WHERE id = ? AND proyecto_id = ?").get(hitoId, id)) throw new HttpError(404, "Hito no encontrado");
  const h = await leerJson(req, esquemaHito);
  const msg = errorDeHito(h, p.fecha_inicio, hoyLocal());
  if (msg) throw new HttpError(400, msg);
  db.prepare(
    "UPDATE proyecto_hitos SET etapa = ?, titulo = ?, detalle = ?, fecha = ?, editado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND proyecto_id = ?",
  ).run(h.etapa, h.titulo, h.detalle, h.fecha, hitoId, id);
  return NextResponse.json({ ok: true });
});

export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { db } = await contexto(req, ["admin"]);
  const { id, hitoId } = await params;
  const r = db.prepare("DELETE FROM proyecto_hitos WHERE id = ? AND proyecto_id = ?").run(hitoId, id);
  if (r.changes === 0) throw new HttpError(404, "Hito no encontrado");
  return NextResponse.json({ ok: true });
});
