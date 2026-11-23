import { NextResponse } from "next/server";
import { z } from "zod";
import { crearModulo } from "@/lib/chat/catalogo";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { leerJson, manejar } from "@/lib/http";
import { enModulo, esquemaDatosSala } from "./comun";

const esquema = esquemaDatosSala.strict();

/** Crea una sala. Su clave es el slug del nombre. */
export const POST = manejar(async (req) => {
  await requireAdminPortal(req);
  const d = await leerJson(req, esquema);
  const sala = enModulo(() => crearModulo(getDbControl(), d));
  return NextResponse.json({ sala }, { status: 201 });
});
