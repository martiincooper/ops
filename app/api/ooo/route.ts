import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ausenciasDesde, estadoDia } from "@/lib/dominio";
import { esquemaOoo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso, hoyLocal, sumarDias } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const u = await requireUsuario(req, ["team", "admin"]);
  return NextResponse.json({ ausencias: ausenciasDesde(getDb(), u.id, hoyLocal()) });
});

export const POST = manejar(async (req: NextRequest) => {
  const u = await requireUsuario(req, ["team", "admin"]);
  const a = await leerJson(req, esquemaOoo);
  const db = getDb();
  const hoy = hoyLocal();
  if (a.fecha < hoy) throw new HttpError(400, "La fecha no puede ser pasada");
  if (a.fecha > sumarDias(hoy, 365)) throw new HttpError(400, "Máximo un año hacia adelante");

  const existentes = db
    .prepare("SELECT dia_completo, hora_inicio, hora_fin FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ?")
    .all(u.id, a.fecha) as { dia_completo: number; hora_inicio: string; hora_fin: string }[];

  if (existentes.some((e) => e.dia_completo === 1)) {
    throw new HttpError(409, "Ya tienes una ausencia de día completo en esa fecha");
  }
  if (a.dia_completo && existentes.length) {
    throw new HttpError(409, "Ya tienes ausencias parciales ese día: cancélalas antes de marcar el día completo");
  }
  if (!a.dia_completo) {
    const choque = existentes.find((e) => e.hora_inicio < a.hora_fin! && a.hora_inicio! < e.hora_fin);
    if (choque) throw new HttpError(409, `Se superpone con tu ausencia de ${choque.hora_inicio} a ${choque.hora_fin}`);
  }

  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo, hora_inicio, hora_fin, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      u.id,
      a.fecha,
      a.dia_completo ? 1 : 0,
      a.dia_completo ? null : a.hora_inicio,
      a.dia_completo ? null : a.hora_fin,
      a.motivo || null,
    );
    // Día completo sobre una bitácora abierta: los objetivos pendientes quedan postergados (no cuentan en Say-Do).
    if (a.dia_completo) {
      db.prepare(
        `UPDATE tareas_diarias SET estado = 'postergado_ooo', actualizado_en = ?
          WHERE estado = 'pendiente' AND bitacora_id = (
            SELECT id FROM bitacoras WHERE usuario_id = ? AND fecha = ? AND checkout_tarde IS NULL)`,
      ).run(ahoraIso(), u.id, a.fecha);
    }
  })();

  return NextResponse.json({ id, ...estadoDia(db, u) }, { status: 201 });
});
