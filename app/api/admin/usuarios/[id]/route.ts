import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaUsuarioCambio } from "@/lib/esquemas";
import { getDbControl } from "@/lib/db";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { eliminarCuenta, registrosDe } from "@/lib/registros";
import { borrarSupervisionDe, fijarSupervisores } from "@/lib/supervision";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { empresa, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaUsuarioCambio);
  const u = db.prepare("SELECT id, rol, activo FROM usuarios WHERE id = ? AND admin_id IS NULL").get(id) as
    | { id: string; rol: string; activo: number }
    | undefined;
  if (!u) throw new HttpError(404, "Cuenta no encontrada");

  db.transaction(() => {
    if (c.nombre) db.prepare("UPDATE usuarios SET nombre = ? WHERE id = ?").run(c.nombre, id);
    // Cambiar rol o desactivar invalida las sesiones abiertas.
    if (c.rol && c.rol !== u.rol) {
      db.prepare("UPDATE usuarios SET rol = ?, version_sesion = version_sesion + 1 WHERE id = ?").run(c.rol, id);
    }
    if (c.activo !== undefined && (c.activo ? 1 : 0) !== u.activo) {
      db.prepare("UPDATE usuarios SET activo = ?, version_sesion = version_sesion + 1 WHERE id = ?").run(c.activo ? 1 : 0, id);
    }
    if (c.resetear_pin) {
      db.prepare(
        `UPDATE usuarios SET pin_hash = NULL, debe_cambiar_pin = 1, version_sesion = version_sesion + 1,
                intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
      ).run(id);
    }
  })();

  const rolFinal = c.rol ?? u.rol;
  if (rolFinal !== "team") borrarSupervisionDe(empresa.clave, id);
  else if (c.supervisores) fijarSupervisores(empresa.clave, id, c.supervisores);

  return NextResponse.json({ ok: true });
});

/**
 * Elimina la cuenta definitivamente (equipo o gerencia). Si tiene jornadas o compras, pasan al administrador
 * indicado en ?asignar_a= (por defecto, en la interfaz, quien la supervisa), así los proyectos conservan su costo.
 * Para conservar la cuenta sin acceso, se usa PATCH { activo: false } (desactivar).
 */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { empresa, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const u = db.prepare("SELECT id FROM usuarios WHERE id = ? AND admin_id IS NULL").get(id);
  if (!u) throw new HttpError(404, "Cuenta no encontrada");
  const r = registrosDe(db, id);
  type Admin = { id: string; nombre: string };
  let admin: Admin | null = null;
  if (r.jornadas + r.compras > 0) {
    const asignarA = req.nextUrl.searchParams.get("asignar_a");
    if (!asignarA) throw new HttpError(400, "Elige a qué administrador pasan sus registros");
    const fila = getDbControl().prepare("SELECT id, nombre FROM usuarios WHERE id = ? AND activo = 1").get(asignarA) as Admin | undefined;
    if (!fila) throw new HttpError(400, "Administrador inexistente o desactivado");
    admin = fila;
  }
  const resumen = eliminarCuenta(db, id, admin);
  borrarSupervisionDe(empresa.clave, id);
  return NextResponse.json({ accion: "eliminado", ...resumen, asignado_a: admin?.nombre ?? null });
});
