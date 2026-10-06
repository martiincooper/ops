// Alta y edición de compras (gastos). Sin "server-only" para probarlo con tsx.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { TipoCosto } from "./esquemas";
import { repartirMonto } from "./reparto";

type DB = Database.Database;

export class ErrorGasto extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DatosGasto {
  proyecto_ids: string[];
  item: string;
  descripcion?: string | null;
  /** Monto de la compra, sin envío ni impuesto. */
  monto_clp: number;
  envio_clp?: number | null;
  impuesto_clp?: number | null;
  tipo_costo?: TipoCosto;
}

/** Proyectos que pueden recibir costo: activos, o (al editar) los que la compra ya tenía aunque ya no estén activos. */
function exigirProyectos(db: DB, ids: string[], yaVinculados: Set<string> = new Set()) {
  const activo = db.prepare("SELECT 1 FROM proyectos WHERE id = ? AND estado IN ('concepto', 'prototipado', 'pruebas')");
  if (ids.some((id) => !yaVinculados.has(id) && !activo.get(id))) throw new ErrorGasto(400, "Proyecto inexistente o no activo");
}

/** Reparte el total en partes iguales entre los proyectos (la suma siempre cuadra con el total). */
function repartir(db: DB, gastoId: string, total: number, proyectoIds: string[]) {
  db.prepare("DELETE FROM gasto_proyectos WHERE gasto_id = ?").run(gastoId);
  const partes = repartirMonto(total, proyectoIds.length);
  const ins = db.prepare("INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_clp) VALUES (?, ?, ?)");
  proyectoIds.forEach((p, i) => ins.run(gastoId, p, partes[i]));
}

/**
 * Registra una compra. Se guarda monto_clp = compra + envío + impuesto (total pagado) y el envío y el impuesto
 * aparte. `aprobadaPor`: la registra la jefatura y queda aprobada de inmediato.
 */
export function crearGasto(
  db: DB,
  op: { usuarioId: string; bitacoraId: string | null; datos: DatosGasto; aprobadaPor?: { id: string; nombre: string }; ahora: string },
): string {
  const g = op.datos;
  exigirProyectos(db, g.proyecto_ids);
  const id = randomUUID();
  const envio = g.envio_clp ?? 0;
  const impuesto = g.impuesto_clp ?? 0;
  const total = g.monto_clp + envio + impuesto;
  const a = op.aprobadaPor;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO gastos (id, usuario_id, bitacora_id, item, descripcion, monto_clp, envio_clp, impuesto_clp, tipo_costo,
                           estado, validado_por, validado_por_nombre, validado_en, de_jefatura)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      op.usuarioId,
      op.bitacoraId,
      g.item,
      g.descripcion || null,
      total,
      envio,
      impuesto,
      g.tipo_costo ?? "unico",
      a ? "aprobado" : "pendiente",
      a?.id ?? null,
      a?.nombre ?? null,
      a ? op.ahora : null,
      a ? 1 : 0,
    );
    repartir(db, id, total, g.proyecto_ids);
  })();
  return id;
}

/**
 * Edita una compra en cualquier estado (el impuesto de aduana o el precio final pueden llegar después de aprobada).
 * Solo cambian los campos enviados; el estado y la validación se conservan. Si cambia el total o los proyectos, se
 * vuelve a repartir.
 */
export function editarGasto(
  db: DB,
  gastoId: string,
  c: Partial<DatosGasto>,
  editor: { nombre: string; ahora: string; usuarioId?: string },
): void {
  const actual = db
    .prepare("SELECT usuario_id, item, descripcion, monto_clp, envio_clp, impuesto_clp, tipo_costo FROM gastos WHERE id = ?")
    .get(gastoId) as
    | { usuario_id: string; item: string; descripcion: string | null; monto_clp: number; envio_clp: number; impuesto_clp: number; tipo_costo: TipoCosto }
    | undefined;
  // Equipo: solo sus propias compras (404 para no revelar las de otros).
  if (!actual || (editor.usuarioId && actual.usuario_id !== editor.usuarioId)) throw new ErrorGasto(404, "Compra no encontrada");

  const vinculados = (db.prepare("SELECT proyecto_id FROM gasto_proyectos WHERE gasto_id = ?").all(gastoId) as { proyecto_id: string }[]).map(
    (r) => r.proyecto_id,
  );
  if (c.proyecto_ids) exigirProyectos(db, c.proyecto_ids, new Set(vinculados));

  const compra = c.monto_clp ?? actual.monto_clp - actual.envio_clp - actual.impuesto_clp;
  const envio = c.envio_clp === undefined ? actual.envio_clp : (c.envio_clp ?? 0);
  const impuesto = c.impuesto_clp === undefined ? actual.impuesto_clp : (c.impuesto_clp ?? 0);
  if (compra <= 0) throw new ErrorGasto(400, "El monto debe ser mayor a 0");
  const total = compra + envio + impuesto;
  if (total > 1_000_000_000) throw new ErrorGasto(400, "Monto fuera de rango");
  const proyectos = c.proyecto_ids ?? vinculados;

  db.transaction(() => {
    db.prepare(
      `UPDATE gastos SET item = ?, descripcion = ?, monto_clp = ?, envio_clp = ?, impuesto_clp = ?, tipo_costo = ?,
              editado_en = ?, editado_por_nombre = ?
        WHERE id = ?`,
    ).run(
      c.item ?? actual.item,
      c.descripcion === undefined ? actual.descripcion : c.descripcion || null,
      total,
      envio,
      impuesto,
      c.tipo_costo ?? actual.tipo_costo,
      editor.ahora,
      editor.nombre,
      gastoId,
    );
    if (proyectos.length) repartir(db, gastoId, total, proyectos);
  })();
}
