import { NextRequest, NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { estadoDia } from "@/lib/dominio";
import { manejar } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  return NextResponse.json(estadoDia(db, u, empresa));
});
