import "server-only";
import type { DB } from "./db";
import type { Usuario } from "./auth";
import type { Empresa } from "./empresas";
import type { EstadoPago, TipoCosto } from "./esquemas";
import { calcularProgreso, type DiaResumen } from "./metricas";
import { type TareaAsignada, tareasAbiertas } from "./tareas";
import { TZ_NEGOCIO, ahoraIso, fechaLarga, fechaLocal, hoyLocal } from "./tiempo";

/**
 * Estado de la jornada del integrante (sin horario: se comienza y se termina cuando la persona quiere).
 *  - en_curso:       hay una jornada comenzada y sin terminar (puede ser de un día anterior).
 *  - terminada:      la jornada de hoy ya se terminó (una por día); sigue editable hasta comenzar la próxima.
 *  - no_disponible:  hoy está marcado como no disponible.
 *  - sin_iniciar:    puede comenzar la jornada de hoy.
 */
export type Fase = "sin_iniciar" | "en_curso" | "terminada" | "no_disponible";

export interface ProyectoActivo {
  id: string;
  codigo: string;
  nombre: string;
}

export interface ProyectoRef {
  id: string;
  codigo: string;
  nombre: string;
}

export interface TareaDia {
  id: string;
  descripcion: string;
  estado: "pendiente" | "completado" | "postergado_ooo";
  motivo_pendiente: string | null;
  proyectos: ProyectoRef[]; // uno o más
}

/** Día completo marcado como no disponible. */
export interface Ausencia {
  id: string;
  fecha: string;
  motivo: string | null;
}

export interface Jornada {
  id: string;
  fecha: string;
  fecha_texto: string;
  checkin_manana: string; // comienzo (ISO)
  checkout_tarde: string | null; // término (ISO)
  bloqueos: string | null;
}

export interface GastoResumen {
  id: string;
  item: string;
  descripcion: string | null;
  proyectos: string[]; // códigos
  /** Proyectos con id (para editar la compra). */
  proyecto_refs: ProyectoRef[];
  /** Total pagado (compra + envío + impuesto). */
  monto_clp: number;
  /** Parte del total que fue envío (0 = sin envío). */
  envio_clp: number;
  /** Parte del total que fue impuesto extra, p. ej. aduana (0 = sin impuesto). */
  impuesto_clp: number;
  /** Montos ingresados en dólares (null = ese monto se ingresó en pesos); los *_clp ya están convertidos. */
  monto_usd: number | null;
  envio_usd: number | null;
  impuesto_usd: number | null;
  /** Pesos por dólar con que se convirtió (null = todo en pesos) y la fecha de ese dólar. */
  tipo_cambio: number | null;
  tipo_cambio_fecha: string | null;
  tipo_costo: TipoCosto;
  /** Por enviar a pago, esperando pago o comprada (aparte de la validación). */
  estado_pago: EstadoPago;
  estado: "pendiente" | "aprobado" | "rechazado";
  creado_en: string;
  editado_en: string | null;
  editado_por_nombre: string | null;
}

export interface EstadoDia {
  empresa: { clave: string; nombre: string };
  hoy: string;
  hoy_texto: string;
  tz: string;
  fase: Fase;
  /**
   * Jornada editable: la en curso (de cualquier fecha) o, si no hay, la última terminada (de hoy o de antes).
   * Se puede editar hasta comenzar la siguiente.
   */
  jornada: Jornada | null;
  tareas: TareaDia[];
  no_disponible_hoy: Ausencia | null;
  /** Días no disponibles desde hoy. */
  no_disponible: Ausencia[];
  proyectos: ProyectoActivo[];
  /** Proyecto activo usado más recientemente: preselección en los formularios. */
  ultimo_proyecto_id: string | null;
  gastos_hoy: GastoResumen[];
  /** Tareas asignadas abiertas (no son objetivos del día; quedan hasta marcarlas hechas). */
  tareas_asignadas: TareaAsignada[];
  saydo_14d: number | null;
  /** Últimos 7 días, del más antiguo a hoy. */
  semana: DiaResumen[];
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

type FilaJornada = Omit<Jornada, "fecha_texto">;
const COLUMNAS = "id, fecha, checkin_manana, checkout_tarde, bloqueos";
const conTexto = (j: FilaJornada | undefined): Jornada | null => (j ? { ...j, fecha_texto: fechaLarga(j.fecha) } : null);

/** Jornada de una fecha (terminada o no). */
export function jornadaDelDia(db: DB, usuarioId: string, fecha: string): Jornada | null {
  return conTexto(
    db.prepare(`SELECT ${COLUMNAS} FROM bitacoras WHERE usuario_id = ? AND fecha = ?`).get(usuarioId, fecha) as
      | FilaJornada
      | undefined,
  );
}

/** Jornada en curso: la más reciente de la persona, si no está terminada (puede ser de un día anterior). */
export function jornadaEnCurso(db: DB, usuarioId: string): Jornada | null {
  const j = db
    .prepare(`SELECT ${COLUMNAS} FROM bitacoras WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1`)
    .get(usuarioId) as FilaJornada | undefined;
  return j && !j.checkout_tarde ? conTexto(j) : null;
}

/**
 * Jornada editable: la más reciente de la persona, terminada o no. Sus objetivos (y, si ya terminó, el balance y el
 * bloqueo) se pueden cambiar hasta que comience la siguiente, para que el standup vea la información final.
 */
export function jornadaEditable(db: DB, usuarioId: string): Jornada | null {
  return conTexto(
    db.prepare(`SELECT ${COLUMNAS} FROM bitacoras WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1`).get(usuarioId) as
      | FilaJornada
      | undefined,
  );
}

export function tareasDe(db: DB, bitacoraId: string): TareaDia[] {
  const tareas = db
    .prepare(
      `SELECT id, descripcion, estado, motivo_pendiente FROM tareas_diarias
        WHERE bitacora_id = ? ORDER BY orden, creado_en`,
    )
    .all(bitacoraId) as Omit<TareaDia, "proyectos">[];
  const refs = db
    .prepare(
      `SELECT tp.tarea_id, p.id, p.codigo, p.nombre
         FROM tarea_proyectos tp JOIN proyectos p ON p.id = tp.proyecto_id
         JOIN tareas_diarias t ON t.id = tp.tarea_id
        WHERE t.bitacora_id = ? ORDER BY p.codigo`,
    )
    .all(bitacoraId) as (ProyectoRef & { tarea_id: string })[];
  return tareas.map((t) => ({
    ...t,
    proyectos: refs.filter((r) => r.tarea_id === t.id).map(({ id, codigo, nombre }) => ({ id, codigo, nombre })),
  }));
}

/** Días no disponibles desde una fecha (las ausencias parciales de versiones anteriores se ignoran). */
export function ausenciasDesde(db: DB, usuarioId: string, desde: string): Ausencia[] {
  return db
    .prepare(
      `SELECT id, fecha, motivo FROM ausencias_ooo
        WHERE usuario_id = ? AND fecha >= ? AND dia_completo = 1
        ORDER BY fecha`,
    )
    .all(usuarioId, desde) as Ausencia[];
}

/** Compras de la persona, de la más reciente a la más antigua; con `pago`, solo las de ese estado de pago. */
export function gastosRecientes(db: DB, usuarioId: string, limite = 30, pago: EstadoPago | null = null): GastoResumen[] {
  const filas = db
    .prepare(
      `SELECT g.id, g.item, g.descripcion, g.monto_clp, g.envio_clp, g.impuesto_clp, g.monto_usd, g.envio_usd, g.impuesto_usd,
              g.tipo_cambio, g.tipo_cambio_fecha, g.tipo_costo, g.estado_pago, g.estado,
              g.creado_en, g.editado_en, g.editado_por_nombre
         FROM gastos g
        WHERE g.usuario_id = ? AND (? IS NULL OR g.estado_pago = ?)
        ORDER BY g.creado_en DESC
        LIMIT ?`,
    )
    .all(usuarioId, pago, pago, limite) as Omit<GastoResumen, "proyectos" | "proyecto_refs">[];
  const qProyectos = db.prepare(
    `SELECT p.id, p.codigo, p.nombre FROM gasto_proyectos gp JOIN proyectos p ON p.id = gp.proyecto_id
      WHERE gp.gasto_id = ? ORDER BY p.codigo`,
  );
  return filas.map((g) => {
    const refs = qProyectos.all(g.id) as ProyectoRef[];
    return { ...g, proyectos: refs.map((r) => r.codigo), proyecto_refs: refs };
  });
}

export function estadoDia(db: DB, u: Usuario, empresa: Empresa): EstadoDia {
  const hoy = hoyLocal();
  const enCurso = jornadaEnCurso(db, u.id);
  const ultima = enCurso ?? jornadaEditable(db, u.id);
  const deHoy = !enCurso && ultima?.fecha === hoy ? ultima : null;
  const jornada = ultima;
  const ausencias = ausenciasDesde(db, u.id, hoy);
  const no_disponible_hoy = ausencias.find((a) => a.fecha === hoy) ?? null;
  const inicio = fechaLocal(u.creado_en);
  const progreso = calcularProgreso(db, u.id, hoy, inicio);

  const fase: Fase = enCurso ? "en_curso" : deHoy ? "terminada" : no_disponible_hoy ? "no_disponible" : "sin_iniciar";

  const proyectos = proyectosActivos(db);
  const activos = new Set(proyectos.map((p) => p.id));
  const recientes = db
    .prepare(
      `SELECT tp.proyecto_id FROM tarea_proyectos tp
         JOIN tareas_diarias t ON t.id = tp.tarea_id JOIN bitacoras b ON b.id = t.bitacora_id
        WHERE b.usuario_id = ? ORDER BY b.fecha DESC, t.orden LIMIT 20`,
    )
    .all(u.id) as { proyecto_id: string }[];

  return {
    empresa: { clave: empresa.clave, nombre: empresa.nombre },
    hoy,
    hoy_texto: fechaLarga(hoy),
    tz: TZ_NEGOCIO,
    fase,
    jornada,
    tareas: jornada ? tareasDe(db, jornada.id) : [],
    no_disponible_hoy,
    no_disponible: ausencias,
    proyectos,
    ultimo_proyecto_id: recientes.find((r) => activos.has(r.proyecto_id))?.proyecto_id ?? null,
    gastos_hoy: gastosRecientes(db, u.id, 20).filter((g) => fechaLocal(g.creado_en) === hoy),
    tareas_asignadas: tareasAbiertas(db, u.id, ahoraIso()),
    saydo_14d: progreso.saydo_14d,
    semana: progreso.historial.slice(0, 7).reverse(),
  };
}
