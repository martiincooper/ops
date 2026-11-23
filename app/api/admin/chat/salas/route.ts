import { NextResponse } from "next/server";
import { configGithub } from "@/lib/chat/github";
import { guardarSala } from "@/lib/chat/repos";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { leerJson, manejar } from "@/lib/http";
import { enModuloAsync, esquemaDatosSala } from "./comun";

const esquema = esquemaDatosSala.strict();

/** Crea una sala. Su clave es el slug del nombre; con repositorio, se verifica al guardar. */
export const POST = manejar(async (req) => {
  await requireAdminPortal(req);
  const { repo, ...d } = await leerJson(req, esquema);
  const r = await enModuloAsync(() => guardarSala(getDbControl(), configGithub(), null, d, repo));
  return NextResponse.json(r, { status: 201 });
});
