import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Envuelve un route handler: errores conocidos → JSON con su status; el resto → 500 sin filtrar detalles. */
export function manejar<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) verificarOrigen(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
      }
      if (e instanceof z.ZodError) {
        const primero = e.issues[0];
        const campo = primero?.path.join(".");
        return NextResponse.json(
          { error: primero ? `${campo ? campo + ": " : ""}${primero.message}` : "Datos inválidos" },
          { status: 400 },
        );
      }
      console.error("[aether-ops]", req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  };
}

/** Defensa CSRF adicional a SameSite=Lax: si el navegador envía Origin, debe coincidir con el host. */
function verificarOrigen(req: NextRequest) {
  const origen = req.headers.get("origin");
  if (!origen) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let hostOrigen: string;
  try {
    hostOrigen = new URL(origen).host;
  } catch {
    throw new HttpError(403, "Origen inválido");
  }
  if (!host || hostOrigen !== host) throw new HttpError(403, "Origen no permitido");
}

export async function leerJson<T>(req: NextRequest, esquema: z.ZodType<T>): Promise<T> {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
  return esquema.parse(cuerpo);
}

/**
 * IP del cliente. El contenedor solo escucha en 127.0.0.1, así que el único que llega es el proxy;
 * el proxy agrega la IP real al final de X-Forwarded-For (las entradas anteriores las controla el cliente).
 */
export function ipCliente(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const partes = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1];
  }
  return req.headers.get("x-real-ip") ?? "local";
}
