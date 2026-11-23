// Casos de uso del portal gerencial para los route handlers: acceso por dominio y envío del Issue.
import "server-only";
import type { NextRequest } from "next/server";
import { type Usuario, requireUsuario } from "../auth";
import { type DB, getDbControl } from "../db";
import { HttpError } from "../http";
import { type ResultadoEnvio, enviarIssue } from "./envio";
import { configGithub } from "./github";
import { MENSAJE_ACCESO_DENEGADO, puedeUsarPortal } from "./modulos";
import { ErrorSala, type Persona, solicitud } from "./salas";

/** Gerentes de Datasheq y administradores (cualquier dominio); el resto, acceso denegado. */
export async function requireGerencia(req: NextRequest): Promise<{ u: Usuario; p: Persona; db: DB }> {
  const u = await requireUsuario(req);
  if (!puedeUsarPortal(u)) throw new HttpError(403, MENSAJE_ACCESO_DENEGADO);
  return { u, p: personaDe(u), db: getDbControl() };
}

/** Panel del portal en /admin: cualquier administrador, sea cual sea su dominio. */
export async function requireAdminPortal(req: NextRequest): Promise<Usuario> {
  return requireUsuario(req, ["admin"]);
}

export const personaDe = (u: Usuario): Persona => ({ id: u.id, rol: u.rol, email: u.email, nombre: u.nombre });

/** Convierte los errores de las salas en errores HTTP. */
export function enSala<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ErrorSala) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/** Crea el Issue de una solicitud terminada (con reintentos; ver ./envio) y guarda el resultado. */
export async function publicarIssue(db: DB, id: string): Promise<ResultadoEnvio> {
  const s = solicitud(db, id);
  if (!s || s.estado !== "terminada" || !s.titulo || !s.resumen) throw new HttpError(409, "La solicitud no está terminada");
  return enviarIssue(db, id, configGithub());
}
