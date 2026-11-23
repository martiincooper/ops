import { NextResponse } from "next/server";
import { z } from "zod";
import { configGithub } from "@/lib/chat/github";
import { activarModulo } from "@/lib/chat/repos";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { leerJson, manejar } from "@/lib/http";
import { enModuloAsync } from "../../../salas/comun";

type Ctx = { params: Promise<{ clave: string }> };

const esquema = z.object({ repo: z.string() }).strict();

/**
 * Activa un módulo propuesto con el repositorio pegado (URL o dueño/repo): lo verifica, activa la sala y publica sus
 * especificaciones guardadas como Issues. Verificación fallida: 200 con `error_repo` y la sala sigue propuesta; con una
 * conversación abierta con mensajes o un repositorio de otra sala, 409.
 */
export const POST = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { clave } = await params;
  const { repo } = await leerJson(req, esquema);
  return NextResponse.json(await enModuloAsync(() => activarModulo(getDbControl(), configGithub(), clave, repo)));
});
