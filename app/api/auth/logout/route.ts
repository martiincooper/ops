import { NextResponse } from "next/server";
import { borrarSesion } from "@/lib/auth";
import { manejar } from "@/lib/http";

export const POST = manejar(async () => borrarSesion(NextResponse.json({ ok: true })));
