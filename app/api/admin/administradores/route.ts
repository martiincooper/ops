import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { emailEnUso, requireUsuario } from "@/lib/auth";
import { getDbControl } from "@/lib/db";
import { esquemaAdminNuevo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

// Administradores (jefatura intermedia). Ven todas las empresas con el selector. Email de cualquier dominio.
export const GET = manejar(async (req: NextRequest) => {
  await requireUsuario(req, ["admin"]);
  const admins = getDbControl()
    .prepare(
      `SELECT a.id, a.nombre, a.email, a.activo, a.debe_cambiar_pin, a.ultimo_acceso, a.bloqueado_hasta,
              (SELECT COUNT(*) FROM supervision s WHERE s.admin_id = a.id) AS supervisados
         FROM usuarios a ORDER BY a.activo DESC, a.nombre COLLATE NOCASE`,
    )
    .all();
  return NextResponse.json({ admins });
});

export const POST = manejar(async (req: NextRequest) => {
  await requireUsuario(req, ["admin"]);
  const datos = await leerJson(req, esquemaAdminNuevo);
  const enUso = emailEnUso(datos.email);
  if (enUso) throw new HttpError(409, `Ese email ya existe (${enUso})`);
  const id = randomUUID();
  getDbControl().prepare("INSERT INTO usuarios (id, nombre, email) VALUES (?, ?, ?)").run(id, datos.nombre, datos.email);
  return NextResponse.json({ id }, { status: 201 });
});
