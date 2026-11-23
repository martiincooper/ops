// Casos de uso del portal gerencial para los route handlers: acceso por dominio y envío del Issue.
import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { type Usuario, requireUsuario } from "../auth";
import { type DB, getDbControl } from "../db";
import { HttpError } from "../http";
import { type ResultadoEnvio, enviarIssue } from "./envio";
import { configGithub } from "./github";
import { MENSAJE_ACCESO_DENEGADO, puedeUsarPortal } from "./modulos";
import { ErrorSala, type Persona, exigirSala, solicitud, vistaSala } from "./salas";

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
  if (!s || s.estado !== "terminada" || !s.titulo || !s.spec) throw new HttpError(409, "La solicitud aún no tiene especificación");
  return enviarIssue(db, id, configGithub());
}

/**
 * Botones de la tarjeta de resumen («Terminar», «Se me olvidó algo»): corre la acción y devuelve la vista de la sala.
 * Si otra persona ya pulsó, responde 409 con el mensaje y la vista actual, para que la pantalla muestre lo ocurrido.
 */
export async function accionBoton(req: NextRequest, modulo: string, accion: (db: DB, sala: string) => void): Promise<NextResponse> {
  const { db } = await requireGerencia(req);
  const sala = enSala(() => exigirSala(db, modulo));
  try {
    accion(db, sala);
  } catch (e) {
    if (e instanceof ErrorSala && e.status === 409) return NextResponse.json({ error: e.message, vista: vistaSala(db, sala) }, { status: 409 });
    if (e instanceof ErrorSala) throw new HttpError(e.status, e.message);
    throw e;
  }
  return NextResponse.json({ vista: vistaSala(db, sala) });
}
