import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contexto, emailEnUso } from "@/lib/auth";
import { empresaPorEmail } from "@/lib/empresas";
import { esquemaUsuarioNuevo } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { fijarSupervisores, supervisoresPorUsuario } from "@/lib/supervision";

export const dynamic = "force-dynamic";

// Cuentas de la empresa elegida (?empresa=): equipo y gerencia, con sus supervisores.
export const GET = manejar(async (req: NextRequest) => {
  const { empresa, db } = await contexto(req, ["admin"]);
  const sup = supervisoresPorUsuario(empresa.clave);
  const usuarios = (
    db
      .prepare(
        `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.debe_cambiar_pin, u.ultimo_acceso, u.bloqueado_hasta,
                EXISTS (SELECT 1 FROM bitacoras b WHERE b.usuario_id = u.id)
                  OR EXISTS (SELECT 1 FROM gastos g WHERE g.usuario_id = u.id) AS tiene_historial
           FROM usuarios u ORDER BY u.activo DESC, u.rol DESC, u.nombre COLLATE NOCASE`,
      )
      .all() as { id: string }[]
  ).map((u) => ({ ...u, supervisores: sup.get(u.id) ?? [] }));
  return NextResponse.json({ empresa, usuarios });
});

export const POST = manejar(async (req: NextRequest) => {
  const { u, empresa, db } = await contexto(req, ["admin"]);
  const datos = await leerJson(req, esquemaUsuarioNuevo);
  // El dominio del email decide la empresa al ingresar: debe coincidir con la empresa elegida.
  if (empresaPorEmail(datos.email)?.clave !== empresa.clave) {
    throw new HttpError(400, `El email debe ser de ${empresa.dominios.map((d) => "@" + d).join(" o ")}`);
  }
  const enUso = emailEnUso(datos.email);
  if (enUso) throw new HttpError(409, `Ese email ya existe (${enUso})`);

  const id = randomUUID();
  db.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES (?, ?, ?, ?)").run(
    id,
    datos.nombre,
    datos.email,
    datos.rol,
  );
  if (datos.rol === "team") fijarSupervisores(empresa.clave, id, datos.supervisores ?? [u.id]);
  return NextResponse.json({ id }, { status: 201 });
});
