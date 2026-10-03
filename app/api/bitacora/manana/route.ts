import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { bitacoraDe, estadoDia, proyectosActivos } from "@/lib/dominio";
import { esquemaManana } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { ahoraIso, hoyLocal } from "@/lib/tiempo";

// Idempotente: si la bitácora de hoy ya existe, devuelve la existente (200) en vez de fallar.
export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const { tareas } = await leerJson(req, esquemaManana);
  const hoy = hoyLocal();

  if (bitacoraDe(db, u.id, hoy)) {
    return NextResponse.json({ ya_existia: true, ...estadoDia(db, u, empresa) });
  }

  const oooCompleto = db
    .prepare("SELECT 1 FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? AND dia_completo = 1")
    .get(u.id, hoy);
  if (oooCompleto) {
    throw new HttpError(409, "Hoy tienes una ausencia de día completo. Cancélala para registrar tu bitácora.");
  }

  const activos = new Set(proyectosActivos(db).map((p) => p.id));
  if (tareas.some((t) => t.proyecto_ids.some((id) => !activos.has(id)))) {
    throw new HttpError(400, "Proyecto inexistente o no activo");
  }

  const bitacoraId = randomUUID();
  const ahora = ahoraIso();
  try {
    db.transaction(() => {
      db.prepare(
        "INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana) VALUES (?, ?, ?, ?)",
      ).run(bitacoraId, u.id, hoy, ahora);
      const ins = db.prepare(
        `INSERT INTO tareas_diarias (id, bitacora_id, orden, descripcion, estado, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?)`,
      );
      const insProyecto = db.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) VALUES (?, ?)");
      tareas.forEach((t, i) => {
        const id = randomUUID();
        ins.run(id, bitacoraId, i, t.descripcion, ahora, ahora);
        for (const p of t.proyecto_ids) insProyecto.run(id, p);
      });
    })();
  } catch (e) {
    // Doble envío simultáneo: la otra petición ganó la carrera.
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ ya_existia: true, ...estadoDia(db, u, empresa) });
    }
    throw e;
  }

  return NextResponse.json({ ya_existia: false, ...estadoDia(db, u, empresa) }, { status: 201 });
});
