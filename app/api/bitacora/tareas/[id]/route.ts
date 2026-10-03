import { NextResponse } from "next/server";
import { z } from "zod";
import { contexto } from "@/lib/auth";
import { bitacoraDe, estadoDia } from "@/lib/dominio";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso, hoyLocal } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

const esquema = z.object({ completada: z.boolean() });

/** Marca un objetivo de hoy como logrado (o lo desmarca) durante el día, antes del cierre de la tarde. */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  const { completada } = await leerJson(req, esquema);
  const b = bitacoraDe(db, u.id, hoyLocal());
  if (!b) throw new HttpError(404, "No hay bitácora de hoy");
  if (b.checkout_tarde) throw new HttpError(409, "La jornada de hoy ya fue cerrada");
  const r = db
    .prepare(
      `UPDATE tareas_diarias SET estado = ?, motivo_pendiente = NULL, actualizado_en = ?
        WHERE id = ? AND bitacora_id = ? AND estado <> 'postergado_ooo'`,
    )
    .run(completada ? "completado" : "pendiente", ahoraIso(), id, b.id);
  if (r.changes !== 1) throw new HttpError(404, "Objetivo no encontrado en tu bitácora de hoy");
  return NextResponse.json(estadoDia(db, u, empresa));
});
