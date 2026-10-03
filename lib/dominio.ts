import "server-only";
import type { DB } from "./db";
import type { Usuario } from "./auth";
import type { Empresa } from "./empresas";
import { calcularJuego, type Juego } from "./juego";
import { momentoDe, vistaPara, type Fase, type Ventanas, type Vista } from "./jornada";
import { calcularProgreso, type DiaResumen } from "./metricas";
import { TZ_NEGOCIO, VENTANAS, esFinDeSemana, fechaLarga, fechaLocal, horaLocal, hoyLocal } from "./tiempo";

export type { Fase, Vista } from "./jornada";

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
  descripcion: string | null;
  proyectos: string[]; // códigos
  monto_clp: number;
  estado: "pendiente" | "aprobado" | "rechazado";
  creado_en: string;
}

export interface EstadoDia {
  empresa: { clave: string; nombre: string };
  hoy: string;
  hoy_texto: string;
  /** Zona horaria y ventanas: el cliente recalcula la vista cada minuto con la hora de Chile. */
  tz: string;
  ventanas: Ventanas;
  /** Hora local del servidor al generar el estado (HH:MM) y la vista que corresponde a esa hora. */
  hora: string;
  vista: Vista;
  laborable: boolean;
  feriado: string | null;
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
  /** Últimos 7 días, del más antiguo a hoy. */
  semana: DiaResumen[];
  juego: Juego;
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
  return (
    db
      .prepare(
        `SELECT g.id, g.item, g.descripcion, g.monto_clp, g.estado, g.creado_en,
                (SELECT group_concat(codigo, ',') FROM (
                   SELECT p.codigo FROM gasto_proyectos gp JOIN proyectos p ON p.id = gp.proyecto_id
                    WHERE gp.gasto_id = g.id ORDER BY p.codigo)) AS codigos
           FROM gastos g
          WHERE g.usuario_id = ?
          ORDER BY g.creado_en DESC
          LIMIT ?`,
      )
      .all(usuarioId, limite) as (Omit<GastoResumen, "proyectos"> & { codigos: string | null })[]
  ).map(({ codigos, ...g }) => ({ ...g, proyectos: codigos ? codigos.split(",") : [] }));
}

export function estadoDia(db: DB, u: Usuario, empresa: Empresa): EstadoDia {
  const hoy = hoyLocal();
  const bitacora = bitacoraDe(db, u.id, hoy) ?? null;
  const tareas = bitacora ? tareasDe(db, bitacora.id) : [];
  const ausencias = ausenciasDesde(db, u.id, hoy);
  const ooo_hoy = ausencias.filter((a) => a.fecha === hoy);
  const inicio = fechaLocal(u.creado_en);
  const progreso = calcularProgreso(db, u.id, hoy, inicio);
  const feriado =
    (db.prepare("SELECT nombre FROM feriados WHERE fecha = ?").get(hoy) as { nombre: string } | undefined)?.nombre ?? null;
  const laborable = !esFinDeSemana(hoy) && !feriado;
  const hora = horaLocal(new Date());

  let fase: Fase;
  if (bitacora?.checkout_tarde) fase = "cerrado";
  else if (ooo_hoy.some((a) => a.dia_completo === 1)) fase = "ooo_completo";
  else if (bitacora) fase = "pendiente_tarde";
  else fase = "pendiente_manana";

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
    ventanas: VENTANAS,
    hora,
    vista: vistaPara(fase, momentoDe(hora, VENTANAS), laborable),
    laborable,
    feriado,
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
    semana: progreso.historial.slice(0, 7).reverse(),
    juego: calcularJuego(db, u.id, hoy, inicio),
  };
}
