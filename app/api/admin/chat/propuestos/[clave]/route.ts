import { NextResponse } from "next/server";
import { detallePropuesto, nombreArchivo } from "@/lib/chat/propuestos";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";
import { markdownAHtml } from "@/lib/markdown";

type Ctx = { params: Promise<{ clave: string }> };

/** Detalle de una sala propuesta: especificaciones, CONTEXT.md y ADRs (con su HTML ya saneado) y transcripciones. */
export const GET = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const d = detallePropuesto(getDbControl(), (await params).clave);
  if (!d) throw new HttpError(404, "Módulo propuesto no encontrado");
  return NextResponse.json({
    ...d,
    specs: d.specs.map((s) => ({ ...s, html: markdownAHtml(s.spec) })),
    context_html: markdownAHtml(d.context),
    adrs: d.adrs.map((a) => ({ ...a, ruta: `docs/adr/${nombreArchivo(a.archivo)}`, html: markdownAHtml(a.contenido) })),
  });
});
