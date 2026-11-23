import { NextResponse } from "next/server";
import { editarModulo } from "@/lib/chat/catalogo";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { leerJson, manejar } from "@/lib/http";
import { enModulo, esquemaDatosSala } from "../comun";

type Ctx = { params: Promise<{ modulo: string }> };

// .strict(): un cuerpo con `clave` (u otro campo ajeno) se rechaza; la clave no se edita
const esquema = esquemaDatosSala.strict();

/** Edita nombre, área, descripción, color, orden y autonomía de una sala. */
export const PATCH = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { modulo } = await params;
  const d = await leerJson(req, esquema);
  return NextResponse.json({ sala: enModulo(() => editarModulo(getDbControl(), modulo, d)) });
});
