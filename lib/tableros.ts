// Cálculos de los tableros de jefatura (/admin) y gerencia (/exec). Reciben la base de UNA empresa.
// Sin "server-only" para poder probarlos con tsx.
import type Database from "better-sqlite3";
import {
  AVISO_PROYECTOS_POR_ETAPA,
  type DiasPorEtapa,
  ETAPAS_DESARROLLO,
  type EstadoProyecto,
  type EtapaDesarrollo,
  NOMBRE_ESTADO,
  diasEntre,
  diasPorEtapa,
  leerEtapas,
  tramos,
} from "./etapas";
import { calcularProgreso, porcentaje } from "./metricas";
import { type Metas, leerMetas } from "./metas";
import { esFinDeSemana, fechaLocal, sumarDias } from "./tiempo";

type DB = Database.Database;

export interface Persona {
  id: string;
  nombre: string;
  email: string;
  creado_en: string;
}

/** Integrantes activos del equipo (rol team). Si se pasa `ids`, solo esos. */
export function equipoActivo(db: DB, ids?: Set<string> | null): Persona[] {
  const todos = db
    .prepare(
      "SELECT id, nombre, email, creado_en FROM usuarios WHERE rol = 'team' AND activo = 1 ORDER BY nombre COLLATE NOCASE",
    )
    .all() as Persona[];
  return ids ? todos.filter((p) => ids.has(p.id)) : todos;
}

// ───────────────────────────── Standup ─────────────────────────────

/** Última jornada de la persona (en curso o terminada), de cualquier fecha. Sin horas: se trabaja por objetivos. */
export interface UltimaJornada {
  fecha: string;
  estado: "en_curso" | "terminada";
  comprometidas: number;
  completadas: number;
  saydo: number | null;
  tareas: { descripcion: string; estado: string; motivo_pendiente: string | null; proyectos: string[] }[];
}

export interface FilaStandup {
  id: string;
  nombre: string;
  email: string;
  prioridad: 1 | 2 | 3 | 4;
  motivo: string;
  ultima: UltimaJornada | null;
  no_disponible_hoy: { motivo: string | null } | null;
  bloqueos: { bitacora_id: string; fecha: string; texto: string }[];
  saydo_14d: number | null;
}

export const UMBRAL_SAYDO_ALERTA = 70;

/**
 * Prioridad de intervención: 1) bloqueos sin resolver (últimos 14 días), 2) Say-Do 14 días < 70 %,
 * 3) no disponible hoy, 4) resto. No se alerta por días sin jornada: el equipo no tiene horario.
 */
export function standup(db: DB, hoy: string, personas: Persona[]): FilaStandup[] {
  const desde = sumarDias(hoy, -14);
  const qUltima = db.prepare(
    `SELECT id, fecha, checkout_tarde FROM bitacoras WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1`,
  );
  const qTareas = db.prepare(
    `SELECT t.descripcion, t.estado, t.motivo_pendiente,
            (SELECT group_concat(codigo, ',') FROM (
               SELECT p.codigo FROM tarea_proyectos tp JOIN proyectos p ON p.id = tp.proyecto_id
                WHERE tp.tarea_id = t.id ORDER BY p.codigo)) AS codigos
       FROM tareas_diarias t WHERE t.bitacora_id = ? ORDER BY t.orden`,
  );
  const qNoDisponible = db.prepare(
    "SELECT motivo FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? AND dia_completo = 1",
  );
  const qBloqueos = db.prepare(
    `SELECT id AS bitacora_id, fecha, bloqueos AS texto FROM bitacoras
      WHERE usuario_id = ? AND bloqueos IS NOT NULL AND bloqueo_resuelto_en IS NULL AND fecha >= ?
      ORDER BY fecha DESC`,
  );

  const filas = personas.map((p): FilaStandup => {
    const prog = calcularProgreso(db, p.id, hoy, fechaLocal(p.creado_en));
    const bloqueos = qBloqueos.all(p.id, desde) as FilaStandup["bloqueos"];
    const no_disponible_hoy = (qNoDisponible.get(p.id, hoy) as { motivo: string | null } | undefined) ?? null;

    const b = qUltima.get(p.id) as { id: string; fecha: string; checkout_tarde: string | null } | undefined;
    let ultima: UltimaJornada | null = null;
    if (b) {
      const tareas = (qTareas.all(b.id) as (Omit<UltimaJornada["tareas"][number], "proyectos"> & { codigos: string | null })[]).map(
        ({ codigos, ...t }) => ({ ...t, proyectos: codigos ? codigos.split(",") : [] }),
      );
      const comprometidas = tareas.filter((t) => t.estado !== "postergado_ooo").length;
      const completadas = tareas.filter((t) => t.estado === "completado").length;
      ultima = {
        fecha: b.fecha,
        estado: b.checkout_tarde ? "terminada" : "en_curso",
        comprometidas,
        completadas,
        saydo: porcentaje(completadas, comprometidas),
        tareas,
      };
    }

    let prioridad: FilaStandup["prioridad"] = 4;
    let motivo = "Sin alertas";
    if (bloqueos.length) {
      prioridad = 1;
      motivo = bloqueos.length === 1 ? "Bloqueo sin resolver" : `${bloqueos.length} bloqueos sin resolver`;
    } else if (prog.saydo_14d !== null && prog.saydo_14d < UMBRAL_SAYDO_ALERTA) {
      prioridad = 2;
      motivo = `Say-Do 14 días ${prog.saydo_14d}%`;
    } else if (no_disponible_hoy) {
      prioridad = 3;
      motivo = "No disponible hoy";
    }
    return {
      id: p.id,
      nombre: p.nombre,
      email: p.email,
      prioridad,
      motivo,
      ultima,
      no_disponible_hoy,
      bloqueos,
      saydo_14d: prog.saydo_14d,
    };
  });
  return filas.sort((a, b) => a.prioridad - b.prioridad || a.nombre.localeCompare(b.nombre, "es"));
}

// ──────────────────────── Disponibilidad 14 días ────────────────────────

export type EstadoCelda = "disponible" | "no_disponible" | "fin_de_semana" | "feriado";

export interface Capacidad {
  dias: { fecha: string; laboral: boolean; disponibles: number; personas: number }[];
  filas: {
    id: string;
    nombre: string;
    celdas: { fecha: string; estado: EstadoCelda; detalle: string | null }[];
    dias_disponibles: number; // días hábiles sin marca de no disponible
  }[];
}

/** Quién está disponible cada día de las próximas dos semanas (días completos; sin horario). */
export function capacidad(db: DB, hoy: string, personas: Persona[], dias = 14): Capacidad {
  const hasta = sumarDias(hoy, dias - 1);
  const feriados = new Map(
    (db.prepare("SELECT fecha, nombre FROM feriados WHERE fecha BETWEEN ? AND ?").all(hoy, hasta) as {
      fecha: string;
      nombre: string;
    }[]).map((f) => [f.fecha, f.nombre]),
  );
  const qNoDisponible = db.prepare(
    `SELECT fecha, motivo FROM ausencias_ooo WHERE usuario_id = ? AND dia_completo = 1 AND fecha BETWEEN ? AND ?`,
  );
  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(hoy, i));
  const habil = (f: string) => !esFinDeSemana(f) && !feriados.has(f);

  const filas = personas.map((p) => {
    const marcas = new Map(
      (qNoDisponible.all(p.id, hoy, hasta) as { fecha: string; motivo: string | null }[]).map((a) => [a.fecha, a.motivo]),
    );
    const celdas = fechas.map((fecha) => {
      if (marcas.has(fecha)) return { fecha, estado: "no_disponible" as const, detalle: marcas.get(fecha) ?? null };
      if (esFinDeSemana(fecha)) return { fecha, estado: "fin_de_semana" as const, detalle: null };
      if (feriados.has(fecha)) return { fecha, estado: "feriado" as const, detalle: feriados.get(fecha)! };
      return { fecha, estado: "disponible" as const, detalle: null };
    });
    return { id: p.id, nombre: p.nombre, celdas, dias_disponibles: celdas.filter((c) => c.estado === "disponible").length };
  });

  return {
    dias: fechas.map((fecha, i) => ({
      fecha,
      laboral: habil(fecha),
      disponibles: filas.filter((f) => f.celdas[i].estado === "disponible").length,
      personas: filas.length,
    })),
    filas,
  };
}

// ───────────────────────── Compras ─────────────────────────

export interface FilaGasto {
  id: string;
  usuario_id: string;
  persona: string;
  proyectos: { codigo: string; nombre: string; monto_clp: number }[];
  item: string;
  descripcion: string | null;
  /** Total pagado (compra + envío). */
  monto_clp: number;
  /** Parte del total que fue envío (0 = sin envío). */
  envio_clp: number;
  estado: "pendiente" | "aprobado" | "rechazado";
  validado_por_nombre: string | null;
  validado_en: string | null;
  observacion: string | null;
  creado_en: string;
}

export function gastosEmpresa(
  db: DB,
  op: { estado?: "pendiente" | "todos"; ids?: Set<string> | null; limite?: number } = {},
): FilaGasto[] {
  const filas = (
    db
      .prepare(
        `SELECT g.id, g.usuario_id, u.nombre AS persona, g.item, g.descripcion, g.monto_clp, g.envio_clp, g.estado,
                g.validado_por_nombre, g.validado_en, g.observacion, g.creado_en
           FROM gastos g JOIN usuarios u ON u.id = g.usuario_id
          WHERE (? = 'todos' OR g.estado = 'pendiente')
          ORDER BY g.estado = 'pendiente' DESC, g.creado_en DESC
          LIMIT ?`,
      )
      .all(op.estado ?? "pendiente", op.limite ?? 500) as Omit<FilaGasto, "proyectos">[]
  ).filter((f) => !op.ids || op.ids.has(f.usuario_id));
  const qProyectos = db.prepare(
    `SELECT p.codigo, p.nombre, gp.monto_clp FROM gasto_proyectos gp JOIN proyectos p ON p.id = gp.proyecto_id
      WHERE gp.gasto_id = ? ORDER BY p.codigo`,
  );
  return filas.map((f) => ({ ...f, proyectos: qProyectos.all(f.id) as FilaGasto["proyectos"] }));
}

// ───────────────────────── Gerencia ─────────────────────────
//
// Tres focos: costo (vs la estimación BOM), tiempo de concepto a cliente (vs la fecha estimada de entrega que
// registra la jefatura al crear el proyecto) y el pipeline de desarrollo por etapa, con un aviso cuando una etapa
// acumula demasiados proyectos. Los proyectos entregados no entran en los indicadores: se listan aparte, cada uno
// con sus propios indicadores (tiempo real de concepto a cliente, entrega vs fecha estimada, costo final vs BOM).

export type EstadoKpi = "en_meta" | "en_riesgo" | "fuera" | "sin_datos";
export type SituacionCosto = "dentro" | "en_riesgo" | "fuera" | "sin_estimacion";

export interface ProyectoCosto {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  estimado_clp: number; // estimación BOM previa al proyecto
  total_clp: number; // costo acumulado: compras aprobadas + por validar (sin rechazadas)
  por_validar_clp: number;
  compras: number;
  pct: number | null; // costo acumulado / estimación
  situacion: SituacionCosto;
}

/** Proyecto no entregado (en desarrollo o en pausa). */
export interface ProyectoEnCurso {
  id: string;
  codigo: string;
  nombre: string;
  estado: EtapaDesarrollo | "pausado";
  fecha_inicio: string;
  fecha_entrega_estimada: string;
  dias_transcurridos: number; // inicio → hoy
  dias_estimados: number; // inicio → entrega estimada
  dias_restantes: number; // hoy → entrega estimada (negativo = atraso)
  pct_plazo: number;
  situacion: "atrasado" | "por_vencer" | "en_plazo" | "pausado";
  etapa_desde: string;
  dias_en_etapa: number;
  dias_por_etapa: DiasPorEtapa;
  estimado_clp: number;
  costo_clp: number;
  pct_costo: number | null;
  situacion_costo: SituacionCosto;
}

export interface ProyectoEntregado {
  id: string;
  codigo: string;
  nombre: string;
  fecha_inicio: string;
  fecha_entrega_estimada: string;
  /** null = no hay fecha de entrega en el historial (datos anteriores al historial de etapas). */
  fecha_entregado: string | null;
  dias_concepto_cliente: number | null; // inicio → entrega real
  dias_estimados: number; // inicio → entrega estimada
  desvio_dias: number | null; // entrega real − estimada: > 0 atraso, ≤ 0 a tiempo
  plazo: EstadoKpi;
  dias_por_etapa: DiasPorEtapa;
  estimado_clp: number;
  costo_clp: number;
  compras: number;
  pct_costo: number | null;
  situacion_costo: SituacionCosto;
  costo: EstadoKpi;
}

export interface EtapaPipeline {
  estado: EtapaDesarrollo;
  nombre: string;
  proyectos: ProyectoEnCurso[];
  /** Más proyectos que AVISO_PROYECTOS_POR_ETAPA: gerencia ve un aviso (no es un tope). */
  saturada: boolean;
}

export interface MetricasExec {
  corte: string;
  periodo: { desde: string; hasta: string; anterior_desde: string; anterior_hasta: string };
  metas: Metas;
  costo: {
    estado: EstadoKpi;
    con_estimacion: number;
    dentro: number;
    en_riesgo: number;
    fuera: number;
    total_clp: number;
    estimado_clp: number;
    por_validar_clp: number;
    periodo_clp: number;
    periodo_anterior_clp: number;
    proyectos: ProyectoCosto[];
  };
  tiempo: {
    estado: EstadoKpi;
    en_desarrollo: number;
    en_plazo: number;
    atrasados: number;
    por_vencer: number;
    proyectos: ProyectoEnCurso[];
  };
  pipeline: {
    en_desarrollo: number;
    aviso_por_etapa: number;
    etapas: EtapaPipeline[];
    saturadas: EtapaDesarrollo[];
    pausados: ProyectoEnCurso[];
  };
  entregados: ProyectoEntregado[];
  personas_activas: number;
}

export const DIAS_POR_VENCER = 14;

function situacionCosto(pct: number | null, tolerancia: number): SituacionCosto {
  return pct === null ? "sin_estimacion" : pct <= 100 ? "dentro" : pct <= 100 + tolerancia ? "en_riesgo" : "fuera";
}

const KPI_COSTO: Record<SituacionCosto, EstadoKpi> = { dentro: "en_meta", en_riesgo: "en_riesgo", fuera: "fuera", sin_estimacion: "sin_datos" };

export function metricasExec(db: DB, hoy: string, metas: Metas = leerMetas(db)): MetricasExec {
  const desde = sumarDias(hoy, -13);
  const antDesde = sumarDias(hoy, -27);
  const antHasta = sumarDias(hoy, -14);

  const filas = db
    .prepare(
      `SELECT p.id, p.codigo, p.nombre, p.estado, p.presupuesto_clp AS estimado_clp, p.fecha_inicio, p.fecha_entrega_objetivo,
              COALESCE(SUM(CASE WHEN g.estado <> 'rechazado' THEN gp.monto_clp END), 0) AS total_clp,
              COALESCE(SUM(CASE WHEN g.estado = 'pendiente' THEN gp.monto_clp END), 0) AS por_validar_clp,
              COUNT(CASE WHEN g.estado <> 'rechazado' THEN 1 END) AS compras
         FROM proyectos p
         LEFT JOIN gasto_proyectos gp ON gp.proyecto_id = p.id
         LEFT JOIN gastos g ON g.id = gp.gasto_id
        GROUP BY p.id
        ORDER BY p.codigo`,
    )
    .all() as {
    id: string;
    codigo: string;
    nombre: string;
    estado: EstadoProyecto;
    estimado_clp: number;
    fecha_inicio: string;
    fecha_entrega_objetivo: string;
    total_clp: number;
    por_validar_clp: number;
    compras: number;
  }[];
  const historial = leerEtapas(db);
  const pctCosto = (p: { estimado_clp: number; total_clp: number }) =>
    p.estimado_clp > 0 ? Math.round((p.total_clp / p.estimado_clp) * 100) : null;

  // ── Proyectos no entregados: tiempo, etapa y costo
  const ordenPlazo = { atrasado: 0, por_vencer: 1, en_plazo: 2, pausado: 3 } as const;
  const enCurso: ProyectoEnCurso[] = filas
    .filter((p) => p.estado !== "entregado")
    .map((p) => {
      const t = tramos(historial.get(p.id), p, hoy);
      const actual = t[t.length - 1];
      const estimados = Math.max(1, diasEntre(p.fecha_inicio, p.fecha_entrega_objetivo));
      const transcurridos = Math.max(0, diasEntre(p.fecha_inicio, hoy));
      const restantes = diasEntre(hoy, p.fecha_entrega_objetivo);
      const pct = pctCosto(p);
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        estado: p.estado as ProyectoEnCurso["estado"],
        fecha_inicio: p.fecha_inicio,
        fecha_entrega_estimada: p.fecha_entrega_objetivo,
        dias_transcurridos: transcurridos,
        dias_estimados: estimados,
        dias_restantes: restantes,
        pct_plazo: Math.round((transcurridos / estimados) * 100),
        situacion: p.estado === "pausado" ? "pausado" : restantes < 0 ? "atrasado" : restantes <= DIAS_POR_VENCER ? "por_vencer" : "en_plazo",
        etapa_desde: actual.desde,
        dias_en_etapa: actual.dias,
        dias_por_etapa: diasPorEtapa(t),
        estimado_clp: p.estimado_clp,
        costo_clp: p.total_clp,
        pct_costo: pct,
        situacion_costo: situacionCosto(pct, metas.tolerancia_costo_pct),
      } satisfies ProyectoEnCurso;
    });
  const desarrollo = enCurso
    .filter((p) => p.estado !== "pausado")
    .sort((a, b) => ordenPlazo[a.situacion] - ordenPlazo[b.situacion] || a.dias_restantes - b.dias_restantes);
  const atrasados = desarrollo.filter((p) => p.situacion === "atrasado").length;

  // ── Pipeline por etapa (sin entregados ni pausados)
  const etapas: EtapaPipeline[] = ETAPAS_DESARROLLO.map((e) => {
    const proyectos = desarrollo.filter((p) => p.estado === e).sort((a, b) => b.dias_en_etapa - a.dias_en_etapa);
    return { estado: e, nombre: NOMBRE_ESTADO[e], proyectos, saturada: proyectos.length > AVISO_PROYECTOS_POR_ETAPA };
  });

  // ── Costo: proyectos no entregados (los pausados, si ya gastaron)
  const ordenCosto = { fuera: 0, en_riesgo: 1, dentro: 2, sin_estimacion: 3 } as const;
  const costoProyectos: ProyectoCosto[] = filas
    .filter((p) => p.estado !== "entregado" && (p.estado !== "pausado" || p.total_clp > 0))
    .map((p) => {
      const pct = pctCosto(p);
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        estado: p.estado,
        estimado_clp: p.estimado_clp,
        total_clp: p.total_clp,
        por_validar_clp: p.por_validar_clp,
        compras: p.compras,
        pct,
        situacion: situacionCosto(pct, metas.tolerancia_costo_pct),
      };
    })
    .sort((a, b) => ordenCosto[a.situacion] - ordenCosto[b.situacion] || (b.pct ?? -1) - (a.pct ?? -1));
  const cuenta = (s: SituacionCosto) => costoProyectos.filter((p) => p.situacion === s).length;
  const conEstimacion = costoProyectos.filter((p) => p.situacion !== "sin_estimacion").length;
  const idsCosto = new Set(costoProyectos.map((p) => p.id));

  // Costo agregado en el periodo y en el anterior a esos proyectos (fecha local de registro de la compra)
  const partes = db
    .prepare(
      `SELECT gp.proyecto_id, gp.monto_clp, g.creado_en FROM gasto_proyectos gp JOIN gastos g ON g.id = gp.gasto_id
        WHERE g.estado <> 'rechazado' AND g.creado_en >= ?`,
    )
    .all(`${sumarDias(antDesde, -1)}T00:00:00.000Z`) as { proyecto_id: string; monto_clp: number; creado_en: string }[];
  const costoEntre = (a: string, b: string) =>
    partes
      .filter((x) => idsCosto.has(x.proyecto_id))
      .reduce((s, x) => {
        const f = fechaLocal(x.creado_en);
        return f >= a && f <= b ? s + x.monto_clp : s;
      }, 0);

  // ── Entregados: indicadores propios de cada proyecto
  const entregados: ProyectoEntregado[] = filas
    .filter((p) => p.estado === "entregado")
    .map((p) => {
      const h = historial.get(p.id);
      const t = tramos(h, p, hoy);
      const entrega = h ? [...h].reverse().find((f) => f.estado === "entregado")?.desde ?? null : null;
      const estimados = Math.max(1, diasEntre(p.fecha_inicio, p.fecha_entrega_objetivo));
      const desvio = entrega ? diasEntre(p.fecha_entrega_objetivo, entrega) : null;
      const pct = pctCosto(p);
      const sc = situacionCosto(pct, metas.tolerancia_costo_pct);
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        fecha_inicio: p.fecha_inicio,
        fecha_entrega_estimada: p.fecha_entrega_objetivo,
        fecha_entregado: entrega,
        dias_concepto_cliente: entrega ? Math.max(0, diasEntre(p.fecha_inicio, entrega)) : null,
        dias_estimados: estimados,
        desvio_dias: desvio,
        plazo: desvio === null ? "sin_datos" : desvio <= 0 ? "en_meta" : "fuera",
        dias_por_etapa: diasPorEtapa(t),
        estimado_clp: p.estimado_clp,
        costo_clp: p.total_clp,
        compras: p.compras,
        pct_costo: pct,
        situacion_costo: sc,
        costo: KPI_COSTO[sc],
      } satisfies ProyectoEntregado;
    })
    .sort((a, b) => (b.fecha_entregado ?? "").localeCompare(a.fecha_entregado ?? "") || a.codigo.localeCompare(b.codigo));

  return {
    corte: hoy,
    periodo: { desde, hasta: hoy, anterior_desde: antDesde, anterior_hasta: antHasta },
    metas,
    costo: {
      estado: conEstimacion === 0 ? "sin_datos" : cuenta("fuera") ? "fuera" : cuenta("en_riesgo") ? "en_riesgo" : "en_meta",
      con_estimacion: conEstimacion,
      dentro: cuenta("dentro"),
      en_riesgo: cuenta("en_riesgo"),
      fuera: cuenta("fuera"),
      total_clp: costoProyectos.reduce((s, p) => s + p.total_clp, 0),
      estimado_clp: costoProyectos.reduce((s, p) => s + p.estimado_clp, 0),
      por_validar_clp: costoProyectos.reduce((s, p) => s + p.por_validar_clp, 0),
      periodo_clp: costoEntre(desde, hoy),
      periodo_anterior_clp: costoEntre(antDesde, antHasta),
      proyectos: costoProyectos,
    },
    tiempo: {
      estado: desarrollo.length === 0 ? "sin_datos" : atrasados === 0 ? "en_meta" : "fuera",
      en_desarrollo: desarrollo.length,
      en_plazo: desarrollo.length - atrasados,
      atrasados,
      por_vencer: desarrollo.filter((p) => p.situacion === "por_vencer").length,
      proyectos: desarrollo,
    },
    pipeline: {
      en_desarrollo: desarrollo.length,
      aviso_por_etapa: AVISO_PROYECTOS_POR_ETAPA,
      etapas,
      saturadas: etapas.filter((e) => e.saturada).map((e) => e.estado),
      pausados: enCurso.filter((p) => p.estado === "pausado"),
    },
    entregados,
    personas_activas: equipoActivo(db).length,
  };
}
