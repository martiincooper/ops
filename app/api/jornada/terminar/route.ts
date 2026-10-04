import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia, jornadaEnCurso, tareasDe } from "@/lib/dominio";
import { esquemaTermino } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso } from "@/lib/tiempo";

/**
 * Terminar jornada: balance de cada objetivo (logrado / pendiente con motivo) y bloqueo opcional.
 * Actúa sobre la jornada en curso de la sesión, aunque sea de un día anterior; nunca sobre un id del cliente.
 * Después sigue editable en el tablero hasta comenzar la próxima jornada.
 */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { tareas, bloqueo } = await leerJson(req, esquemaTermino);

  const j = jornadaEnCurso(db, u.id);
  if (!j) throw new HttpError(404, "No tienes una jornada en curso");

  const propias = new Map(tareasDe(db, j.id).map((t) => [t.id, t]));
  if (propias.size === 0) throw new HttpError(400, "Agrega al menos un objetivo antes de terminar la jornada");
  const enviadas = new Set(tareas.map((t) => t.id));
  if (enviadas.size !== tareas.length) throw new HttpError(400, "Objetivos duplicados");
  for (const t of tareas) {
    const propia = propias.get(t.id);
    if (!propia) throw new HttpError(400, "El objetivo no pertenece a tu jornada en curso");
    if (t.estado === "pendiente" && !t.motivo_pendiente) {
      throw new HttpError(400, `Indica el motivo de "${propia.descripcion}"`);
    }
    // "postergado_ooo" solo existe en datos de versiones anteriores: se conserva, no se asigna.
    if (t.estado === "postergado_ooo" && propia.estado !== "postergado_ooo") {
      throw new HttpError(400, "Marca el objetivo como logrado o pendiente");
    }
  }
  const faltante = [...propias.values()].find((t) => !enviadas.has(t.id));
  if (faltante) throw new HttpError(400, `Falta el estado de "${faltante.descripcion}"`);

  const ahora = ahoraIso();
  db.transaction(() => {
    const cierre = db
      .prepare("UPDATE bitacoras SET checkout_tarde = ?, bloqueos = ? WHERE id = ? AND checkout_tarde IS NULL")
      .run(ahora, bloqueo || null, j.id);
    if (cierre.changes !== 1) throw new HttpError(409, "Esta jornada ya fue terminada");
    const upd = db.prepare(
      `UPDATE tareas_diarias SET estado = ?, motivo_pendiente = ?, actualizado_en = ?
        WHERE id = ? AND bitacora_id = ?`,
    );
    for (const t of tareas) {
      upd.run(t.estado, t.estado === "completado" ? null : t.motivo_pendiente || null, ahora, t.id, j.id);
    }
  })();

  return NextResponse.json(estadoDia(db, u, empresa));
});
