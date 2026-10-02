import { NextRequest, NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDb, type DB } from "@/lib/db";
import { esquemaUsuarioCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

function adminsActivos(db: DB, excluirId: string): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?")
      .get(excluirId) as { n: number }
  ).n;
}

export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const admin = await requireUsuario(req, ["admin"]);
  const { id } = await params;
  const cambios = await leerJson(req, esquemaUsuarioCambio);
  const db = getDb();
  const u = db.prepare("SELECT id, rol, activo FROM usuarios WHERE id = ?").get(id) as
    | { id: string; rol: string; activo: number }
    | undefined;
  if (!u) throw new HttpError(404, "Usuario no encontrado");

  const quitaAdmin =
    u.rol === "admin" && ((cambios.rol && cambios.rol !== "admin") || cambios.activo === false);
  if (quitaAdmin && adminsActivos(db, id) === 0) {
    throw new HttpError(400, "Debe quedar al menos un administrador activo");
  }
  if (id === admin.id && (cambios.activo === false || (cambios.rol && cambios.rol !== "admin"))) {
    throw new HttpError(400, "No puedes desactivarte ni quitarte el rol de administrador");
  }

  db.transaction(() => {
    if (cambios.nombre) db.prepare("UPDATE usuarios SET nombre = ? WHERE id = ?").run(cambios.nombre, id);
    // Cambiar rol o desactivar invalida las sesiones abiertas.
    if (cambios.rol && cambios.rol !== u.rol) {
      db.prepare("UPDATE usuarios SET rol = ?, version_sesion = version_sesion + 1 WHERE id = ?").run(cambios.rol, id);
    }
    if (cambios.activo !== undefined && (cambios.activo ? 1 : 0) !== u.activo) {
      db.prepare("UPDATE usuarios SET activo = ?, version_sesion = version_sesion + 1 WHERE id = ?").run(
        cambios.activo ? 1 : 0,
        id,
      );
    }
    if (cambios.resetear_pin) {
      db.prepare(
        `UPDATE usuarios SET pin_hash = NULL, debe_cambiar_pin = 1, version_sesion = version_sesion + 1,
                intentos_fallidos = 0, bloqueado_hasta = NULL
          WHERE id = ?`,
      ).run(id);
    }
  })();

  return NextResponse.json({ ok: true });
});

/** Sin historial → se elimina. Con bitácoras o gastos → se desactiva (los registros financieros conservan su autor). */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const admin = await requireUsuario(req, ["admin"]);
  const { id } = await params;
  if (id === admin.id) throw new HttpError(400, "No puedes eliminar tu propia cuenta");
  const db = getDb();
  const u = db.prepare("SELECT rol, activo FROM usuarios WHERE id = ?").get(id) as
    | { rol: string; activo: number }
    | undefined;
  if (!u) throw new HttpError(404, "Usuario no encontrado");
  if (u.rol === "admin" && u.activo === 1 && adminsActivos(db, id) === 0) {
    throw new HttpError(400, "Debe quedar al menos un administrador activo");
  }

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
  return NextResponse.json({ accion: "eliminado" });
});
