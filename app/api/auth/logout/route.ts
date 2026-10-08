import { NextResponse } from "next/server";
import { borrarSesion, requireUsuario } from "@/lib/auth";
import { liberarSalasDe } from "@/lib/chat/salas";
import { getDbControl } from "@/lib/db";
import { manejar } from "@/lib/http";

export const POST = manejar(async (req) => {
  // Al salir, las salas del portal gerencial que ocupaba la cuenta quedan libres de inmediato
  // (si no, seguirían reservadas hasta vencer por inactividad). Sin sesión válida no hay nada que liberar.
  const u = await requireUsuario(req, undefined, { permitirCambioPendiente: true }).catch(() => null);
  if (u) liberarSalasDe(getDbControl(), u.email);
  return borrarSesion(NextResponse.json({ ok: true }));
});
