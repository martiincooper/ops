import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { ausenciasDesde, estadoDia } from "@/lib/dominio";
import { esquemaNoDisponible } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { hoyLocal, sumarDias } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, db } = await contexto(req, ["team"]);
  return NextResponse.json({ no_disponible: ausenciasDesde(db, u.id, hoyLocal()) });
});

/** Marca un día completo como no disponible (para la planificación de la jefatura). */
export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  const a = await leerJson(req, esquemaNoDisponible);
  const hoy = hoyLocal();
  if (a.fecha < hoy) throw new HttpError(400, "La fecha no puede ser pasada");
  if (a.fecha > sumarDias(hoy, 365)) throw new HttpError(400, "Máximo un año hacia adelante");

  if (db.prepare("SELECT 1 FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? AND dia_completo = 1").get(u.id, a.fecha)) {
    throw new HttpError(409, "Ese día ya está marcado como no disponible");
  }
  if (db.prepare("SELECT 1 FROM bitacoras WHERE usuario_id = ? AND fecha = ?").get(u.id, a.fecha)) {
    throw new HttpError(409, "Ya tienes una jornada ese día");
  }

  const id = randomUUID();
  db.transaction(() => {
    // Ausencias parciales de versiones anteriores ese día: las reemplaza el día completo.
    db.prepare("DELETE FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? AND dia_completo = 0").run(u.id, a.fecha);
    db.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo, motivo) VALUES (?, ?, ?, 1, ?)").run(
      id,
      u.id,
      a.fecha,
      a.motivo || null,
    );
  })();

  return NextResponse.json({ id, ...estadoDia(db, u, empresa) }, { status: 201 });
});
