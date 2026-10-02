import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { getDbControl, getDbEmpresa, type DB } from "./db";
import { EMPRESAS, empresaPorClave, empresaPorEmail, type Empresa } from "./empresas";
import { HttpError } from "./http";
import {
  COOKIE_SESION,
  firmarSesion,
  inicioPorRol,
  opcionesCookie,
  verificarSesion,
  type Rol,
} from "./jwt";

/** Cuenta autenticada. Administradores: en control.db, empresa = null. Equipo y gerencia: en la base de su empresa. */
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: number;
  debe_cambiar_pin: number;
  version_sesion: number;
  creado_en: string;
  empresa: string | null;
}

const COLUMNAS = "id, nombre, email, rol, activo, debe_cambiar_pin, version_sesion, creado_en";

/** Base donde vive la cuenta (para código, intentos, sesión). */
export function dbDeCuenta(u: Pick<Usuario, "rol" | "empresa">): DB {
  return u.rol === "admin" ? getDbControl() : getDbEmpresa(u.empresa as string);
}

async function usuarioDesdeToken(token: string | undefined): Promise<Usuario | null> {
  const claims = await verificarSesion(token);
  if (!claims) return null;

  let u: Omit<Usuario, "empresa"> | undefined;
  let empresa: string | null = null;
  if (claims.rol === "admin") {
    u = getDbControl().prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`).get(claims.sub) as typeof u;
  } else {
    const emp = empresaPorClave(claims.emp);
    if (!emp) return null;
    u = getDbEmpresa(emp.clave).prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`).get(claims.sub) as typeof u;
    // La cuenta debe seguir perteneciendo (por dominio) a la empresa del token.
    if (u && empresaPorEmail(u.email)?.clave !== emp.clave) return null;
    empresa = emp.clave;
  }
  // Se invalida si fue desactivada o si se incrementó version_sesion (cambio/reseteo de código, cambio de rol).
  if (!u || u.activo !== 1 || u.version_sesion !== claims.ver || u.rol !== claims.rol) return null;
  return { ...u, empresa };
}

interface Opciones {
  /** Permitir el acceso aunque la cuenta aún deba cambiar el código inicial. */
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

/**
 * Empresa sobre la que opera la cuenta. Equipo y gerencia: siempre la propia (se ignora lo que pida el cliente).
 * Administradores: la elegida en el selector (?empresa=clave); por defecto la primera configurada.
 */
export function empresaDe(u: Usuario, solicitada?: string | null): Empresa {
  if (u.rol !== "admin") return empresaPorClave(u.empresa) as Empresa;
  if (solicitada) {
    const e = empresaPorClave(solicitada);
    if (!e) throw new HttpError(400, "Empresa desconocida");
    return e;
  }
  return EMPRESAS[0];
}

/** Atajo para route handlers: cuenta + empresa objetivo + su base. */
export async function contexto(req: NextRequest, roles?: Rol[]) {
  const u = await requireUsuario(req, roles);
  const empresa = empresaDe(u, req.nextUrl.searchParams.get("empresa"));
  return { u, empresa, db: getDbEmpresa(empresa.clave) };
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

export async function adjuntarSesion(
  res: NextResponse,
  u: Pick<Usuario, "id" | "rol" | "version_sesion" | "debe_cambiar_pin" | "empresa">,
) {
  const token = await firmarSesion({
    sub: u.id,
    rol: u.rol,
    ver: u.version_sesion,
    cp: u.debe_cambiar_pin === 1,
    emp: u.empresa,
  });
  res.cookies.set(COOKIE_SESION, token, opcionesCookie());
  return res;
}

export function borrarSesion(res: NextResponse) {
  res.cookies.set(COOKIE_SESION, "", { ...opcionesCookie(), maxAge: 0 });
  return res;
}

/** ¿Existe ya este email como administrador o como cuenta de alguna empresa? */
export function emailEnUso(email: string): string | null {
  if (getDbControl().prepare("SELECT 1 FROM usuarios WHERE email = ?").get(email)) return "administrador";
  const emp = empresaPorEmail(email);
  if (emp && getDbEmpresa(emp.clave).prepare("SELECT 1 FROM usuarios WHERE email = ?").get(email)) {
    return `cuenta de ${emp.nombre}`;
  }
  return null;
}
