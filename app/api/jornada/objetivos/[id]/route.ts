import { NextResponse } from "next/server";
import { z } from "zod";
import { contexto } from "@/lib/auth";
import { estadoDia, jornadaEnCurso } from "@/lib/dominio";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso } from "@/lib/tiempo";

type Ctx = { params: Promise<{ id: string }> };

const esquema = z.object({ completada: z.boolean() });

/** Marca un objetivo de la jornada en curso como logrado (o lo desmarca) antes de terminarla. */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { id } = await params;
  const { completada } = await leerJson(req, esquema);
  const j = jornadaEnCurso(db, u.id);
  if (!j) throw new HttpError(409, "No tienes una jornada en curso");
  const r = db
    .prepare(
      `UPDATE tareas_diarias SET estado = ?, motivo_pendiente = NULL, actualizado_en = ?
        WHERE id = ? AND bitacora_id = ? AND estado <> 'postergado_ooo'`,
    )
    .run(completada ? "completado" : "pendiente", ahoraIso(), id, j.id);
  if (r.changes !== 1) throw new HttpError(404, "Objetivo no encontrado en tu jornada en curso");
  return NextResponse.json(estadoDia(db, u, empresa));
});
