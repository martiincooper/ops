import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "./db";
import { HttpError } from "./http";
import {
  COOKIE_SESION,
  firmarSesion,
  inicioPorRol,
  opcionesCookie,
  verificarSesion,
  type Rol,
} from "./jwt";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  avatar_url: string | null;
  activo: number;
  debe_cambiar_pin: number;
  version_sesion: number;
  creado_en: string;
}

const COLUMNAS = "id, nombre, email, rol, avatar_url, activo, debe_cambiar_pin, version_sesion, creado_en";

async function usuarioDesdeToken(token: string | undefined): Promise<Usuario | null> {
  const claims = await verificarSesion(token);
  if (!claims) return null;
  const u = getDb()
    .prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`)
    .get(claims.sub) as Usuario | undefined;
  // La sesión se invalida si el usuario fue desactivado o si se incrementó version_sesion
  // (cambio/reseteo de código, cambio de rol).
  if (!u || u.activo !== 1 || u.version_sesion !== claims.ver || u.rol !== claims.rol) return null;
  return u;
}

interface Opciones {
  /** Permitir el acceso aunque el usuario aún deba cambiar el código inicial. */
  permitirCambioPendiente?: boolean;
}

/** Para route handlers. Lanza 401/403. */
export async function requireUsuario(req: NextRequest, roles?: Rol[], op: Opciones = {}): Promise<Usuario> {
  const u = await usuarioDesdeToken(req.cookies.get(COOKIE_SESION)?.value);
  if (!u) throw new HttpError(401, "Sesión no válida");
  if (u.debe_cambiar_pin === 1 && !op.permitirCambioPendiente) {
    throw new HttpError(403, "Debes cambiar tu código antes de continuar", { debe_cambiar_pin: true });
  }
  if (roles && !roles.includes(u.rol)) throw new HttpError(403, "Sin permiso");
  return u;
}

/** Para server components (páginas). Redirige en vez de lanzar. */
export async function requirePagina(roles: Rol[], op: Opciones = {}): Promise<Usuario> {
  const jar = await cookies();
  const u = await usuarioDesdeToken(jar.get(COOKIE_SESION)?.value);
  if (!u) redirect("/login");
  if (u.debe_cambiar_pin === 1 && !op.permitirCambioPendiente) redirect("/cambiar-pin");
  if (!roles.includes(u.rol)) redirect(inicioPorRol(u.rol));
  return u;
}

export async function usuarioPagina(): Promise<Usuario | null> {
  const jar = await cookies();
  return usuarioDesdeToken(jar.get(COOKIE_SESION)?.value);
}

export async function adjuntarSesion(res: NextResponse, u: Pick<Usuario, "id" | "rol" | "version_sesion" | "debe_cambiar_pin">) {
  const token = await firmarSesion({ sub: u.id, rol: u.rol, ver: u.version_sesion, cp: u.debe_cambiar_pin === 1 });
  res.cookies.set(COOKIE_SESION, token, opcionesCookie());
  return res;
}

export function borrarSesion(res: NextResponse) {
  res.cookies.set(COOKIE_SESION, "", { ...opcionesCookie(), maxAge: 0 });
  return res;
}
