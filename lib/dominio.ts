import "server-only";
import type { DB } from "./db";
import type { Usuario } from "./auth";
import type { Empresa } from "./empresas";
import { calcularProgreso } from "./metricas";
import { fechaLarga, fechaLocal, hoyLocal } from "./tiempo";

export interface ProyectoActivo {
  id: string;
  codigo: string;
  nombre: string;
}

export interface TareaDia {
  id: string;
  descripcion: string;
  estado: "pendiente" | "completado" | "postergado_ooo";
  motivo_pendiente: string | null;
  proyecto_id: string;
  proyecto_codigo: string;
  proyecto_nombre: string;
}

export interface Ausencia {
  id: string;
  fecha: string;
  dia_completo: number;
  hora_inicio: string | null;
  hora_fin: string | null;
  motivo: string | null;
}

export interface GastoResumen {
  id: string;
  item: string;
  proyecto_codigo: string;
  monto_item_clp: number;
  monto_envio_clp: number;
  iva_clp: number;
  tipo_documento: "factura" | "boleta" | "extranjero";
  folio_documento: string;
  estado: "pendiente" | "aprobado" | "rechazado";
  creado_en: string;
}

export type Fase = "ooo_completo" | "pendiente_manana" | "pendiente_tarde" | "cerrado";

export interface EstadoDia {
  empresa: { clave: string; nombre: string };
  hoy: string;
  hoy_texto: string;
  fase: Fase;
  bitacora: { id: string; checkin_manana: string; checkout_tarde: string | null; bloqueos: string | null } | null;
  tareas: TareaDia[];
  ooo_hoy: Ausencia[];
  ooo_proximas: Ausencia[];
  proyectos: ProyectoActivo[];
  /** Proyecto activo usado más recientemente: preselección en los formularios. */
  ultimo_proyecto_id: string | null;
  gastos_hoy: GastoResumen[];
  racha: number;
  saydo_14d: number | null;
}

export function proyectosActivos(db: DB): ProyectoActivo[] {
  return db
    .prepare(
      `SELECT id, codigo, nombre FROM proyectos
        WHERE estado IN ('concepto', 'prototipado', 'pruebas')
        ORDER BY codigo`,
    )
    .all() as ProyectoActivo[];
}

export function bitacoraDe(db: DB, usuarioId: string, fecha: string) {
  return db
    .prepare(
      "SELECT id, checkin_manana, checkout_tarde, bloqueos FROM bitacoras WHERE usuario_id = ? AND fecha = ?",
    )
    .get(usuarioId, fecha) as EstadoDia["bitacora"] | undefined;
}

export function tareasDe(db: DB, bitacoraId: string): TareaDia[] {
  return db
    .prepare(
      `SELECT t.id, t.descripcion, t.estado, t.motivo_pendiente,
              p.id AS proyecto_id, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre
         FROM tareas_diarias t JOIN proyectos p ON p.id = t.proyecto_id
        WHERE t.bitacora_id = ?
        ORDER BY t.orden, t.creado_en`,
    )
    .all(bitacoraId) as TareaDia[];
}

export function ausenciasDesde(db: DB, usuarioId: string, desde: string): Ausencia[] {
  return db
    .prepare(
      `SELECT id, fecha, dia_completo, hora_inicio, hora_fin, motivo FROM ausencias_ooo
        WHERE usuario_id = ? AND fecha >= ?
        ORDER BY fecha, hora_inicio`,
    )
    .all(usuarioId, desde) as Ausencia[];
}

export function gastosRecientes(db: DB, usuarioId: string, limite = 30): GastoResumen[] {
  return db
    .prepare(
      `SELECT g.id, g.item, p.codigo AS proyecto_codigo, g.monto_item_clp, g.monto_envio_clp, g.iva_clp,
              g.tipo_documento, g.folio_documento, g.estado, g.creado_en
         FROM gastos g JOIN proyectos p ON p.id = g.proyecto_id
        WHERE g.usuario_id = ?
        ORDER BY g.creado_en DESC
        LIMIT ?`,
    )
    .all(usuarioId, limite) as GastoResumen[];
}

export function estadoDia(db: DB, u: Usuario, empresa: Empresa): EstadoDia {
  const hoy = hoyLocal();
  const bitacora = bitacoraDe(db, u.id, hoy) ?? null;
  const tareas = bitacora ? tareasDe(db, bitacora.id) : [];
  const ausencias = ausenciasDesde(db, u.id, hoy);
  const ooo_hoy = ausencias.filter((a) => a.fecha === hoy);
  const progreso = calcularProgreso(db, u.id, hoy, fechaLocal(u.creado_en));

  let fase: Fase;
  if (bitacora?.checkout_tarde) fase = "cerrado";
  else if (ooo_hoy.some((a) => a.dia_completo === 1)) fase = "ooo_completo";
  else if (bitacora) fase = "pendiente_tarde";
  else fase = "pendiente_manana";

  const proyectos = proyectosActivos(db);
  const activos = new Set(proyectos.map((p) => p.id));
  const recientes = db
    .prepare(
      `SELECT t.proyecto_id FROM tareas_diarias t JOIN bitacoras b ON b.id = t.bitacora_id
        WHERE b.usuario_id = ? ORDER BY b.fecha DESC, t.orden LIMIT 20`,
    )
    .all(u.id) as { proyecto_id: string }[];

  return {
    empresa: { clave: empresa.clave, nombre: empresa.nombre },
    hoy,
    hoy_texto: fechaLarga(hoy),
    fase,
    bitacora,
    tareas,
    ooo_hoy,
    ooo_proximas: ausencias,
    proyectos,
    ultimo_proyecto_id: recientes.find((r) => activos.has(r.proyecto_id))?.proyecto_id ?? null,
    gastos_hoy: gastosRecientes(db, u.id, 20).filter((g) => fechaLocal(g.creado_en) === hoy),
    racha: progreso.racha,
    saydo_14d: progreso.saydo_14d,
  };
}

/** IVA crédito fiscal: solo factura, 19 % sobre el neto (ítem + envío). */
export function ivaRecuperable(tipo: string, netoItem: number, netoEnvio: number): number {
  return tipo === "factura" ? Math.round((netoItem + netoEnvio) * 0.19) : 0;
}
