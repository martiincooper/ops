import fs from "node:fs";
import { NextResponse } from "next/server";
import { HttpError, manejar } from "@/lib/http";
import { requireGerencia } from "@/lib/chat/servicio";
import { adjuntoGuardado } from "@/lib/chat/salas";

type Ctx = { params: Promise<{ id: string }> };

/** Sirve una foto o PDF adjunto solo a administradores y usuarios del portal (401 sin sesión, 403 sin acceso). */
export const GET = manejar<Ctx>(async (req, { params }) => {
  const { db } = await requireGerencia(req);
  const id = Number((await params).id);
  const f = Number.isInteger(id) ? adjuntoGuardado(db, id) : null;
  if (!f) throw new HttpError(404, "Archivo no encontrado");
  return new NextResponse(new Uint8Array(fs.readFileSync(f.archivo)), {
    headers: {
      "content-type": f.tipo,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.nombre)}`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
