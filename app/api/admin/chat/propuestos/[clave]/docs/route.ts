import { NextResponse } from "next/server";
import { ErrorModulo, moduloPorClave } from "@/lib/chat/catalogo";
import { estadoDocs, publicarDocs } from "@/lib/chat/docs";
import { configGithub } from "@/lib/chat/github";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { manejar } from "@/lib/http";
import { enModuloAsync } from "../../../salas/comun";

type Ctx = { params: Promise<{ clave: string }> };

/**
 * «Reintentar» los documentos iniciales de un módulo ya activado, ahora mismo. Solo si su último intento falló
 * (si ya se escribieron o nunca se intentaron, devuelve el estado sin tocar GitHub). Siempre 200 con el estado.
 */
export const POST = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { clave } = await params;
  const db = getDbControl();
  return NextResponse.json(
    await enModuloAsync(async () => {
      const m = moduloPorClave(db, clave);
      if (!m || m.estado_modulo !== "activo") throw new ErrorModulo(404, "Módulo activo no encontrado");
      const antes = estadoDocs(db, clave);
      if (antes.error && !antes.url) await publicarDocs(db, configGithub(), clave);
      return { docs: estadoDocs(db, clave) };
    }),
  );
});
