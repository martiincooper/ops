import { NextResponse } from "next/server";
import { requireUsuario } from "@/lib/auth";
import { getDbControl, type DB } from "@/lib/db";
import { esquemaAdminCambio } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

function otrosActivos(db: DB, id: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE activo = 1 AND id <> ?").get(id) as { n: number }).n;
}

export const PATCH = manejar<Ctx>(async (req, { params }) => {
  const yo = await requireUsuario(req, ["admin"]);
  const { id } = await params;
  const c = await leerJson(req, esquemaAdminCambio);
  const db = getDbControl();
  const a = db.prepare("SELECT activo FROM usuarios WHERE id = ?").get(id) as { activo: number } | undefined;
  if (!a) throw new HttpError(404, "Administrador no encontrado");
  if (id === yo.id && (c.activo === false || c.resetear_pin)) {
    throw new HttpError(400, "No puedes desactivarte ni resetear tu propio código desde aquí");
  }
  if (c.activo === false && otrosActivos(db, id) === 0) {
    throw new HttpError(400, "Debe quedar al menos un administrador activo");
  }

  db.transaction(() => {
    if (c.nombre) db.prepare("UPDATE usuarios SET nombre = ? WHERE id = ?").run(c.nombre, id);
    if (c.activo !== undefined && (c.activo ? 1 : 0) !== a.activo) {
      db.prepare("UPDATE usuarios SET activo = ?, version_sesion = version_sesion + 1 WHERE id = ?").run(c.activo ? 1 : 0, id);
    }
    if (c.resetear_pin) {
      db.prepare(
        `UPDATE usuarios SET pin_hash = NULL, debe_cambiar_pin = 1, version_sesion = version_sesion + 1,
                intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
      ).run(id);
    }
  })();
  return NextResponse.json({ ok: true });
});

/** Quita al administrador y sus supervisiones. Las validaciones que hizo conservan su nombre. */
export const DELETE = manejar<Ctx>(async (req, { params }) => {
  const yo = await requireUsuario(req, ["admin"]);
  const { id } = await params;
  if (id === yo.id) throw new HttpError(400, "No puedes eliminar tu propia cuenta");
  const db = getDbControl();
  if (!db.prepare("SELECT 1 FROM usuarios WHERE id = ?").get(id)) throw new HttpError(404, "Administrador no encontrado");
  if (otrosActivos(db, id) === 0) throw new HttpError(400, "Debe quedar al menos un administrador activo");
  db.prepare("DELETE FROM usuarios WHERE id = ?").run(id); // supervision: ON DELETE CASCADE
  return NextResponse.json({ accion: "eliminado" });
});
