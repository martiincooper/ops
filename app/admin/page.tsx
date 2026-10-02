import AdminPanel, { type FilaProyecto, type FilaUsuario } from "@/components/AdminPanel";
import { requirePagina } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const u = await requirePagina(["admin"]);
  const db = getDb();
  const usuarios = db
    .prepare(
      `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.debe_cambiar_pin, u.ultimo_acceso, u.bloqueado_hasta,
              EXISTS (SELECT 1 FROM bitacoras b WHERE b.usuario_id = u.id)
                OR EXISTS (SELECT 1 FROM gastos g WHERE g.usuario_id = u.id) AS tiene_historial
         FROM usuarios u ORDER BY u.activo DESC, u.nombre COLLATE NOCASE`,
    )
    .all() as FilaUsuario[];
  const proyectos = db
    .prepare(
      `SELECT id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado
         FROM proyectos ORDER BY estado IN ('entregado', 'pausado'), codigo`,
    )
    .all() as FilaProyecto[];
  return <AdminPanel yo={{ id: u.id, nombre: u.nombre }} usuariosIniciales={usuarios} proyectosIniciales={proyectos} hoy={hoyLocal()} />;
}
