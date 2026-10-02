import { NextResponse } from "next/server";
import { contexto } from "@/lib/auth";
import { esquemaUsuarioCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { borrarSupervisionDe, fijarSupervisores } from "@/lib/supervision";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const { empresa, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaUsuarioCambio);
  const u = db.prepare("SELECT id, rol, activo FROM usuarios WHERE id = ?").get(id) as
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

/** Sin historial → se elimina. Con bitácoras o compras → se desactiva (los registros financieros conservan su autor). */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const { empresa, db } = await contexto(req, ["admin"]);
  const { id } = await params;
  if (!db.prepare("SELECT 1 FROM usuarios WHERE id = ?").get(id)) throw new HttpError(404, "Cuenta no encontrada");
  const { historial } = db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM bitacoras WHERE usuario_id = ?)
           OR EXISTS (SELECT 1 FROM gastos WHERE usuario_id = ?) AS historial`,
    )
    .get(id, id) as { historial: number };

  if (historial) {
    db.prepare("UPDATE usuarios SET activo = 0, version_sesion = version_sesion + 1 WHERE id = ?").run(id);
    return NextResponse.json({ accion: "desactivado" });
  }
  db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
  borrarSupervisionDe(empresa.clave, id);
  return NextResponse.json({ accion: "eliminado" });
});
