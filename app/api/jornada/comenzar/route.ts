import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia, jornadaDelDia, jornadaEnCurso, proyectosActivos } from "@/lib/dominio";
import { esquemaComienzo } from "@/lib/esquemas";
import { HttpError, manejar } from "@/lib/http";
import { ahoraIso, fechaCorta, hoyLocal } from "@/lib/tiempo";

/**
 * Comenzar jornada: es el evento de comienzo (un toque). Los objetivos se agregan y editan después en el tablero;
 * por compatibilidad se aceptan hasta 4 en el mismo envío. Sin horario: a cualquier hora, una jornada por día.
 * Idempotente: si la jornada de hoy ya está en curso, la devuelve (200). Al comenzar, la jornada anterior deja de
 * ser editable.
 */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const texto = await req.text();
  let cuerpo: unknown = {};
  if (texto.trim()) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      throw new HttpError(400, "JSON inválido");
    }
  }
  const { tareas } = esquemaComienzo.parse(cuerpo);
  const hoy = hoyLocal();

  const enCurso = jornadaEnCurso(db, u.id);
  if (enCurso?.fecha === hoy) return NextResponse.json({ ya_existia: true, ...estadoDia(db, u, empresa) });
  if (enCurso) {
    throw new HttpError(409, `Tienes una jornada sin terminar del ${fechaCorta(enCurso.fecha)}. Termínala antes de comenzar otra.`);
  }
  if (jornadaDelDia(db, u.id, hoy)) throw new HttpError(409, "Ya terminaste tu jornada de hoy. Mañana puedes comenzar otra.");

  const noDisponible = db
    .prepare("SELECT 1 FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? AND dia_completo = 1")
    .get(u.id, hoy);
  if (noDisponible) throw new HttpError(409, "Marcaste hoy como no disponible. Quita esa marca para comenzar tu jornada.");

  const activos = new Set(proyectosActivos(db).map((p) => p.id));
  if (tareas.some((t) => t.proyecto_ids.some((id) => !activos.has(id)))) {
    throw new HttpError(400, "Proyecto inexistente o no activo");
  }

  const jornadaId = randomUUID();
  const ahora = ahoraIso();
  try {
    db.transaction(() => {
      db.prepare("INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana) VALUES (?, ?, ?, ?)").run(
        jornadaId,
        u.id,
        hoy,
        ahora,
      );
      const ins = db.prepare(
        `INSERT INTO tareas_diarias (id, bitacora_id, orden, descripcion, estado, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?)`,
      );
      const insProyecto = db.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) VALUES (?, ?)");
      tareas.forEach((t, i) => {
        const id = randomUUID();
        ins.run(id, jornadaId, i, t.descripcion, ahora, ahora);
        for (const p of t.proyecto_ids) insProyecto.run(id, p);
      });
    })();
  } catch (e) {
    // Doble envío simultáneo: la otra petición ganó la carrera (UNIQUE usuario + fecha).
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ ya_existia: true, ...estadoDia(db, u, empresa) });
    }
    throw e;
  }

  return NextResponse.json({ ya_existia: false, ...estadoDia(db, u, empresa) }, { status: 201 });
});
