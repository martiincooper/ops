import { NextResponse } from "next/server";
import { z } from "zod";
import { archivarModulo } from "@/lib/chat/catalogo";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { leerJson, manejar } from "@/lib/http";
import { enModulo } from "../../comun";

type Ctx = { params: Promise<{ modulo: string }> };

const esquema = z.object({ archivar: z.boolean() });

/** Archiva (`archivar: true`) o restaura una sala; su historial se conserva. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { modulo } = await params;
  const { archivar } = await leerJson(req, esquema);
  return NextResponse.json({ sala: enModulo(() => archivarModulo(getDbControl(), modulo, archivar)) });
});
