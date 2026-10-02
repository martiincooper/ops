import "server-only";
import { getDbControl } from "./db";
import { HttpError } from "./http";

export interface AdminBreve {
  id: string;
  nombre: string;
  email: string;
  activo: number;
}

export function listarAdmins(): AdminBreve[] {
  return getDbControl()
    .prepare("SELECT id, nombre, email, activo FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE")
    .all() as AdminBreve[];
}

/** Ids de integrantes que supervisa un administrador en una empresa. */
export function supervisadosDe(adminId: string, empresa: string): Set<string> {
  const filas = getDbControl()
    .prepare("SELECT usuario_id FROM supervision WHERE admin_id = ? AND empresa = ?")
    .all(adminId, empresa) as { usuario_id: string }[];
  return new Set(filas.map((f) => f.usuario_id));
}

/** usuario_id → administradores que lo supervisan (en una empresa). */
export function supervisoresPorUsuario(empresa: string): Map<string, { id: string; nombre: string }[]> {
  const filas = getDbControl()
    .prepare(
      `SELECT s.usuario_id, a.id, a.nombre FROM supervision s JOIN usuarios a ON a.id = s.admin_id
        WHERE s.empresa = ? ORDER BY a.nombre COLLATE NOCASE`,
    )
    .all(empresa) as { usuario_id: string; id: string; nombre: string }[];
  const mapa = new Map<string, { id: string; nombre: string }[]>();
  for (const f of filas) {
    const l = mapa.get(f.usuario_id) ?? [];
    l.push({ id: f.id, nombre: f.nombre });
    mapa.set(f.usuario_id, l);
  }
  return mapa;
}

/** Reemplaza el conjunto de supervisores de un integrante. Valida que sean administradores existentes. */
export function fijarSupervisores(empresa: string, usuarioId: string, adminIds: string[]) {
  const db = getDbControl();
  const unicos = [...new Set(adminIds)];
  const existe = db.prepare("SELECT 1 FROM usuarios WHERE id = ?");
  for (const id of unicos) if (!existe.get(id)) throw new HttpError(400, "Supervisor inexistente");
  db.transaction(() => {
    db.prepare("DELETE FROM supervision WHERE empresa = ? AND usuario_id = ?").run(empresa, usuarioId);
    const ins = db.prepare("INSERT INTO supervision (admin_id, empresa, usuario_id) VALUES (?, ?, ?)");
    for (const id of unicos) ins.run(id, empresa, usuarioId);
  })();
}

export function borrarSupervisionDe(empresa: string, usuarioId: string) {
  getDbControl().prepare("DELETE FROM supervision WHERE empresa = ? AND usuario_id = ?").run(empresa, usuarioId);
}
