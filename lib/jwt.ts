// Compatible con Edge (middleware) y Node. Sin acceso a la base de datos.
import { SignJWT, jwtVerify } from "jose";

export const COOKIE_SESION = "aether_sesion";
export const DURACION_SESION_S = 60 * 60 * 24 * 30; // 30 días
export const RENOVAR_TRAS_S = 60 * 60 * 24; // renovación deslizante una vez al día

export type Rol = "team" | "admin" | "executive";

export interface ClaimsSesion {
  sub: string;
  rol: Rol;
  ver: number; // version_sesion del usuario al emitir
  cp: boolean; // debe cambiar código
  emp: string | null; // empresa de la cuenta (null para administradores: operan sobre todas)
  iat?: number;
  exp?: number;
}

let secretoCache: Uint8Array | null = null;

function secreto(): Uint8Array {
  if (secretoCache) return secretoCache;
  let s = process.env.JWT_SECRET ?? "";
  if (s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET no definido o con menos de 32 caracteres");
    }
    s = "desarrollo-local-no-usar-en-produccion-0123456789";
  }
  secretoCache = new TextEncoder().encode(s);
  return secretoCache;
}

export async function firmarSesion(c: Omit<ClaimsSesion, "iat" | "exp">): Promise<string> {
  return new SignJWT({ rol: c.rol, ver: c.ver, cp: c.cp, emp: c.emp })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION_S}s`)
    .sign(secreto());
}

export async function verificarSesion(token: string | undefined): Promise<ClaimsSesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const rol = payload.rol;
    if (rol !== "team" && rol !== "admin" && rol !== "executive") return null;
    return {
      sub: payload.sub,
      rol,
      ver: Number(payload.ver ?? -1),
      cp: payload.cp === true,
      emp: typeof payload.emp === "string" ? payload.emp : null,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function opcionesCookie() {
  const seguro =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: seguro,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURACION_SESION_S,
  };
}

/** Página de inicio según rol. */
export function inicioPorRol(rol: Rol): string {
  if (rol === "admin") return "/admin";
  if (rol === "executive") return "/exec";
  return "/checkin";
}
