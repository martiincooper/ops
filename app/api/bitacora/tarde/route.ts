import { NextRequest, NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bitacoraDe, estadoDia, tareasDe } from "@/lib/dominio";
import { esquemaTarde } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso, hoyLocal } from "@/lib/tiempo";

// La bitácora se deriva de (usuario de la sesión, hoy): nunca de un id enviado por el cliente.
export const POST = manejar(async (req: NextRequest) => {
  const u = await requireUsuario(req, ["team", "admin"]);
  const { tareas, bloqueo } = await leerJson(req, esquemaTarde);
  const db = getDb();
  const hoy = hoyLocal();

  const b = bitacoraDe(db, u.id, hoy);
  if (!b) throw new HttpError(404, "No hay bitácora de hoy. Registra primero tus objetivos.");
  if (b.checkout_tarde) throw new HttpError(409, "La jornada de hoy ya fue cerrada");

  const ooo = db
    .prepare("SELECT dia_completo FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ?")
    .all(u.id, hoy) as { dia_completo: number }[];
  if (ooo.some((a) => a.dia_completo === 1)) {
    throw new HttpError(409, "Hoy está marcado como ausencia de día completo");
  }

  const propias = new Map(tareasDe(db, b.id).map((t) => [t.id, t]));
  const enviadas = new Set(tareas.map((t) => t.id));
  if (enviadas.size !== tareas.length) throw new HttpError(400, "Tareas duplicadas");
  for (const t of tareas) {
    if (!propias.has(t.id)) throw new HttpError(400, "Tarea no pertenece a tu bitácora de hoy");
    if (t.estado === "pendiente" && !t.motivo_pendiente) {
      throw new HttpError(400, `Indica el motivo de "${propias.get(t.id)!.descripcion}"`);
    }
    if (t.estado === "postergado_ooo" && ooo.length === 0) {
      throw new HttpError(400, "Solo puedes postergar por ausencia si registraste una ausencia hoy");
    }
  }
  const faltante = [...propias.values()].find((t) => !enviadas.has(t.id));
  if (faltante) throw new HttpError(400, `Falta el estado de "${faltante.descripcion}"`);

  const ahora = ahoraIso();
  db.transaction(() => {
    const cierre = db
      .prepare("UPDATE bitacoras SET checkout_tarde = ?, bloqueos = ? WHERE id = ? AND checkout_tarde IS NULL")
      .run(ahora, bloqueo || null, b.id);
    if (cierre.changes !== 1) throw new HttpError(409, "La jornada de hoy ya fue cerrada");
    const upd = db.prepare(
      `UPDATE tareas_diarias SET estado = ?, motivo_pendiente = ?, actualizado_en = ?
        WHERE id = ? AND bitacora_id = ?`,
    );
    for (const t of tareas) {
      upd.run(t.estado, t.estado === "completado" ? null : t.motivo_pendiente || null, ahora, t.id, b.id);
    }
  })();

  return NextResponse.json(estadoDia(db, u));
});
