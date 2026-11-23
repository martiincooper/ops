import { NextResponse } from "next/server";
import { detallePropuesto, documentosPropuesto, zipPropuesto } from "@/lib/chat/propuestos";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";

type Ctx = { params: Promise<{ clave: string }> };

const cabeceras = (tipo: string, nombre: string) => ({
  "content-type": tipo,
  "content-disposition": `attachment; filename="${nombre.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
});

/**
 * Descarga solo para administradores. Sin parámetros: .zip con todo, como irá en el repositorio; ?doc=<ruta> (p. ej.
 * CONTEXT.md, specs/GER-0001.md, docs/adr/0001-x.md): ese documento como .md.
 */
export const GET = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { clave } = await params;
  const d = detallePropuesto(getDbControl(), clave);
  if (!d) throw new HttpError(404, "Módulo propuesto no encontrado");
  const ruta = req.nextUrl.searchParams.get("doc");
  if (!ruta) return new NextResponse(new Uint8Array(zipPropuesto(d)), { headers: cabeceras("application/zip", `${clave}.zip`) });
  const doc = documentosPropuesto(d).find((x) => x.ruta === ruta);
  if (!doc) throw new HttpError(404, "Documento no encontrado");
  return new NextResponse(doc.contenido, { headers: cabeceras("text/markdown; charset=utf-8", doc.ruta.split("/").pop() as string) });
});
