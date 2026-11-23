import { NextResponse } from "next/server";
import { configGithub } from "@/lib/chat/github";
import { guardarSala } from "@/lib/chat/repos";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { leerJson, manejar } from "@/lib/http";
import { enModuloAsync, esquemaDatosSala } from "../comun";

type Ctx = { params: Promise<{ modulo: string }> };

// .strict(): un cuerpo con `clave` (u otro campo ajeno) se rechaza; la clave no se edita
const esquema = esquemaDatosSala.strict();

/**
 * Edita una sala. Con `repo` lo vincula (URL o dueño/repo) y lo verifica con GitHub; cambiarlo o quitarlo con una
 * conversación abierta responde 409. Si la verificación falla, la sala se guarda gris y la respuesta trae `error_repo`.
 */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { modulo } = await params;
  const { repo, ...d } = await leerJson(req, esquema);
  return NextResponse.json(await enModuloAsync(() => guardarSala(getDbControl(), configGithub(), modulo, d, repo)));
});
