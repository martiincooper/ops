import { NextRequest, NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { estadoDia } from "@/lib/dominio";
import { manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const u = await requireUsuario(req, ["team", "admin"]);
  return NextResponse.json(estadoDia(getDb(), u));
});
