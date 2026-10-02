import { NextResponse } from "next/server";
import { getDbControl, getDbEmpresa } from "@/lib/db";
import { EMPRESAS } from "@/lib/empresas";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDbControl().prepare("SELECT 1").get();
    for (const e of EMPRESAS) getDbEmpresa(e.clave).prepare("SELECT 1").get();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
