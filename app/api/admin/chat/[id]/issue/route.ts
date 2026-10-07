import { NextResponse } from "next/server";
import { publicarIssue, requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { HttpError, manejar } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Reintenta crear el Issue de un requerimiento cuyo envío a GitHub falló. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  await requireAdminPortal(req);
  const { id } = await params;
  const r = await publicarIssue(getDbControl(), id);
  if (!r.ok) throw new HttpError(502, r.error ?? "No se pudo crear el Issue");
  return NextResponse.json({ ok: true });
});
