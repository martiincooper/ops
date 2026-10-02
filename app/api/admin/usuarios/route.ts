import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { esquemaUsuarioNuevo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  await requireUsuario(req, ["admin"]);
  const usuarios = getDb()
    .prepare(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.debe_cambiar_pin, u.ultimo_acceso,
              u.bloqueado_hasta, u.creado_en,
              EXISTS (SELECT 1 FROM bitacoras b WHERE b.usuario_id = u.id)
                OR EXISTS (SELECT 1 FROM gastos g WHERE g.usuario_id = u.id) AS tiene_historial
         FROM usuarios u
        ORDER BY u.activo DESC, u.nombre COLLATE NOCASE`,
    )
    .all();
  return NextResponse.json({ usuarios });
});

export const POST = manejar(async (req: NextRequest) => {
  await requireUsuario(req, ["admin"]);
  const datos = await leerJson(req, esquemaUsuarioNuevo);
  const db = getDb();
  const existe = db.prepare("SELECT id, activo FROM usuarios WHERE email = ?").get(datos.email) as
    | { id: string; activo: number }
    | undefined;
  if (existe) {
    throw new HttpError(
      409,
      existe.activo ? "Ese email ya tiene acceso" : "Ese email existe desactivado: reactívalo desde la lista",
    );
  }
  const id = randomUUID();
  db.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES (?, ?, ?, ?)").run(
    id,
    datos.nombre,
    datos.email,
    datos.rol,
  );
  return NextResponse.json({ id }, { status: 201 });
});
