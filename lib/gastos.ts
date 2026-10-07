// Alta y edición de compras (gastos). Sin "server-only" para probarlo con tsx.
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { EstadoPago, TipoCosto } from "./esquemas";
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

/** Dólar del día: pesos chilenos por 1 USD y la fecha local (YYYY-MM-DD) de ese valor. */
export interface TipoCambio {
  valor: number;
  fecha: string;
}

/**
 * Datos de una compra. Cada monto (compra, envío, impuesto) va en pesos (`*_clp`) o en dólares (`*_usd`). Un monto en
 * dólares se convierte a pesos con el dólar del día al guardar y se conserva el valor en dólares; si viene `*_usd`,
 * manda sobre `*_clp`. `*_usd: null` = ese monto va en pesos.
 */
export interface DatosGasto {
  proyecto_ids: string[];
  item: string;
  descripcion?: string | null;
  /** Monto de la compra, sin envío ni impuesto. */
  monto_clp?: number;
  monto_usd?: number | null;
  envio_clp?: number | null;
  envio_usd?: number | null;
  impuesto_clp?: number | null;
  impuesto_usd?: number | null;
  tipo_costo?: TipoCosto;
  estado_pago?: EstadoPago;
}

const CAMPOS_MONTO = ["monto", "envio", "impuesto"] as const;
type CampoMonto = (typeof CAMPOS_MONTO)[number];
type Monto = { clp: number; usd: number | null };
type Montos = Record<CampoMonto, Monto> & { tipo_cambio: number | null; tipo_cambio_fecha: string | null };

const tocaMontos = (c: Partial<DatosGasto>) => CAMPOS_MONTO.some((f) => c[`${f}_clp`] !== undefined || c[`${f}_usd`] !== undefined);

/** Montos guardados de una compra (la compra sin envío ni impuesto). */
function montosGuardados(db: DB, gastoId: string): Montos | null {
  const r = db
    .prepare(
      `SELECT monto_clp, envio_clp, impuesto_clp, monto_usd, envio_usd, impuesto_usd, tipo_cambio, tipo_cambio_fecha
         FROM gastos WHERE id = ?`,
    )
    .get(gastoId) as
    | {
        monto_clp: number;
        envio_clp: number;
        impuesto_clp: number;
        monto_usd: number | null;
        envio_usd: number | null;
        impuesto_usd: number | null;
        tipo_cambio: number | null;
        tipo_cambio_fecha: string | null;
      }
    | undefined;
  if (!r) return null;
  return {
    monto: { clp: r.monto_clp - r.envio_clp - r.impuesto_clp, usd: r.monto_usd },
    envio: { clp: r.envio_clp, usd: r.envio_usd },
    impuesto: { clp: r.impuesto_clp, usd: r.impuesto_usd },
    tipo_cambio: r.tipo_cambio,
    tipo_cambio_fecha: r.tipo_cambio_fecha,
  };
}

/**
 * ¿Hace falta el dólar del día para guardar estos cambios? Sí, si algún monto viene en dólares o si se tocan los
 * montos de una compra que ya tiene montos en dólares (todos se vuelven a convertir con el dólar del día).
 */
export function necesitaTipoCambio(db: DB, gastoId: string | null, c: Partial<DatosGasto>): boolean {
  if (CAMPOS_MONTO.some((f) => typeof c[`${f}_usd`] === "number")) return true;
  if (!gastoId || !tocaMontos(c)) return false;
  const m = montosGuardados(db, gastoId);
  return !!m && CAMPOS_MONTO.some((f) => m[f].usd !== null && c[`${f}_usd`] === undefined && c[`${f}_clp`] === undefined);
}

/**
 * Montos finales en pesos. Por cada monto: si viene en dólares, se convierte con `tc` (redondeado al peso); si viene en
 * pesos, queda en pesos; si no viene, se conserva, salvo que esté en dólares y se hayan tocado otros montos: entonces
 * se vuelve a convertir con `tc`, para que toda la compra use el mismo dólar. Sin montos en dólares no hay dólar.
 */
export function resolverMontos(actual: Montos | null, c: Partial<DatosGasto>, tc: TipoCambio | null): Montos {
  const toca = tocaMontos(c);
  let convirtio = false;
  const convertir = (usd: number) => {
    if (!tc) throw new ErrorGasto(503, "No se pudo obtener el dólar del día. Intenta de nuevo en unos minutos o ingresa el monto en pesos.");
    convirtio = true;
    return Math.round(usd * tc.valor);
  };
  const res = {} as Record<CampoMonto, Monto>;
  for (const f of CAMPOS_MONTO) {
    const usd = c[`${f}_usd`];
    const clp = c[`${f}_clp`];
    const antes = actual?.[f] ?? { clp: 0, usd: null };
    if (typeof usd === "number") res[f] = { clp: convertir(usd), usd };
    else if (usd === null || clp !== undefined) res[f] = { clp: clp === undefined ? antes.clp : (clp ?? 0), usd: null };
    else if (toca && antes.usd !== null) res[f] = { clp: convertir(antes.usd), usd: antes.usd };
    else res[f] = antes;
  }
  const conDolares = CAMPOS_MONTO.some((f) => res[f].usd !== null);
  return {
    ...res,
    tipo_cambio: !conDolares ? null : convirtio ? tc!.valor : (actual?.tipo_cambio ?? null),
    tipo_cambio_fecha: !conDolares ? null : convirtio ? tc!.fecha : (actual?.tipo_cambio_fecha ?? null),
  };
}

function exigirMontos(m: Montos) {
  if (m.monto.clp <= 0) throw new ErrorGasto(400, "El monto debe ser mayor a 0");
  if (m.monto.clp + m.envio.clp + m.impuesto.clp > 1_000_000_000) throw new ErrorGasto(400, "Monto fuera de rango");
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
 * Registra una compra. Se guarda monto_clp = compra + envío + impuesto (total pagado, en pesos) y el envío y el
 * impuesto aparte; los montos en dólares se convierten con `tipoCambio` (el dólar del día) y se guardan también en
 * dólares. Sin estado de pago, queda como comprada. `aprobadaPor`: la registra la jefatura y queda aprobada de inmediato.
 */
export function crearGasto(
  db: DB,
  op: {
    usuarioId: string;
    bitacoraId: string | null;
    datos: DatosGasto;
    aprobadaPor?: { id: string; nombre: string };
    ahora: string;
    tipoCambio?: TipoCambio | null;
  },
): string {
  const g = op.datos;
  exigirProyectos(db, g.proyecto_ids);
  const m = resolverMontos(null, g, op.tipoCambio ?? null);
  exigirMontos(m);
  const id = randomUUID();
  const total = m.monto.clp + m.envio.clp + m.impuesto.clp;
  const a = op.aprobadaPor;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO gastos (id, usuario_id, bitacora_id, item, descripcion, monto_clp, envio_clp, impuesto_clp,
                           monto_usd, envio_usd, impuesto_usd, tipo_cambio, tipo_cambio_fecha, tipo_costo,
                           estado_pago, estado, validado_por, validado_por_nombre, validado_en, de_jefatura)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      op.usuarioId,
      op.bitacoraId,
      g.item,
      g.descripcion || null,
      total,
      m.envio.clp,
      m.impuesto.clp,
      m.monto.usd,
      m.envio.usd,
      m.impuesto.usd,
      m.tipo_cambio,
      m.tipo_cambio_fecha,
      g.tipo_costo ?? "unico",
      g.estado_pago ?? "comprada",
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
 * Solo cambian los campos enviados (también el estado de pago); la validación se conserva. Si se tocan los montos y
 * alguno está en dólares, se convierten con `tipoCambio` (el dólar del día de la edición). Si cambia el total o los
 * proyectos, se vuelve a repartir.
 */
export function editarGasto(
  db: DB,
  gastoId: string,
  c: Partial<DatosGasto>,
  editor: { nombre: string; ahora: string; usuarioId?: string },
  tipoCambio: TipoCambio | null = null,
): void {
  const actual = db.prepare("SELECT usuario_id, item, descripcion, tipo_costo, estado_pago FROM gastos WHERE id = ?").get(gastoId) as
    | { usuario_id: string; item: string; descripcion: string | null; tipo_costo: TipoCosto; estado_pago: EstadoPago }
    | undefined;
  // Equipo: solo sus propias compras (404 para no revelar las de otros).
  if (!actual || (editor.usuarioId && actual.usuario_id !== editor.usuarioId)) throw new ErrorGasto(404, "Compra no encontrada");

  const vinculados = (db.prepare("SELECT proyecto_id FROM gasto_proyectos WHERE gasto_id = ?").all(gastoId) as { proyecto_id: string }[]).map(
    (r) => r.proyecto_id,
  );
  if (c.proyecto_ids) exigirProyectos(db, c.proyecto_ids, new Set(vinculados));

  const m = resolverMontos(montosGuardados(db, gastoId), c, tipoCambio);
  exigirMontos(m);
  const total = m.monto.clp + m.envio.clp + m.impuesto.clp;
  const proyectos = c.proyecto_ids ?? vinculados;

  db.transaction(() => {
    db.prepare(
      `UPDATE gastos SET item = ?, descripcion = ?, monto_clp = ?, envio_clp = ?, impuesto_clp = ?,
              monto_usd = ?, envio_usd = ?, impuesto_usd = ?, tipo_cambio = ?, tipo_cambio_fecha = ?, tipo_costo = ?,
              estado_pago = ?, editado_en = ?, editado_por_nombre = ?
        WHERE id = ?`,
    ).run(
      c.item ?? actual.item,
      c.descripcion === undefined ? actual.descripcion : c.descripcion || null,
      total,
      m.envio.clp,
      m.impuesto.clp,
      m.monto.usd,
      m.envio.usd,
      m.impuesto.usd,
      m.tipo_cambio,
      m.tipo_cambio_fecha,
      c.tipo_costo ?? actual.tipo_costo,
      c.estado_pago ?? actual.estado_pago,
      editor.ahora,
      editor.nombre,
      gastoId,
    );
    if (proyectos.length) repartir(db, gastoId, total, proyectos);
  })();
}

/**
 * Elimina una compra en cualquier estado, con su reparto entre proyectos (gasto_proyectos: ON DELETE CASCADE). Con
 * `usuarioId` (equipo) solo las propias; 404 si no existe o es de otra persona.
 */
export function eliminarGasto(db: DB, gastoId: string, usuarioId?: string): void {
  const r = usuarioId
    ? db.prepare("DELETE FROM gastos WHERE id = ? AND usuario_id = ?").run(gastoId, usuarioId)
    : db.prepare("DELETE FROM gastos WHERE id = ?").run(gastoId);
  if (r.changes === 0) throw new ErrorGasto(404, "Compra no encontrada");
}
