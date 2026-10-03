// Cálculos de los tableros de jefatura (/admin) y gerencia (/exec). Reciben la base de UNA empresa.
// Sin "server-only" para poder probarlos con tsx.
import type Database from "better-sqlite3";
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
  racha: number;
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
      racha: prog.racha,
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
  monto_clp: number;
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
        `SELECT g.id, g.usuario_id, u.nombre AS persona, g.item, g.descripcion, g.monto_clp, g.estado,
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
// Cuatro indicadores SMART, en el orden en que le importan a la gerencia: plazo, costo, ejecución del
// equipo y bloqueos. Cada uno con meta (definida por la jefatura, ver lib/metas.ts), periodo y estado.

export type EstadoKpi = "en_meta" | "en_riesgo" | "fuera" | "sin_datos";

export interface ProyectoPlazo {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_entrega_objetivo: string;
  dias_transcurridos: number;
  dias_comprometidos: number;
  dias_restantes: number;
  pct_plazo: number;
  situacion: "atrasado" | "por_vencer" | "en_plazo" | "pausado" | "entregado";
}

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
  situacion: "dentro" | "en_riesgo" | "fuera" | "sin_estimacion";
}

export interface MetricasExec {
  corte: string;
  periodo: { desde: string; hasta: string; anterior_desde: string; anterior_hasta: string };
  metas: Metas;
  plazo: { estado: EstadoKpi; activos: number; en_plazo: number; atrasados: number; por_vencer: number; proyectos: ProyectoPlazo[] };
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
  equipo: {
    estado: EstadoKpi;
    pct: number | null;
    pct_anterior: number | null;
    completadas: number;
    comprometidas: number;
    jornadas: number;
    personas_con_jornadas: number;
    personas: number;
  };
  bloqueos: {
    estado: EstadoKpi;
    abiertos: number;
    vencidos: number;
    nuevos_periodo: number;
    nuevos_periodo_anterior: number;
    lista: { bitacora_id: string; persona: string; fecha: string; dias: number; texto: string; proyectos: string[] }[];
  };
  personas_activas: number;
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

const ACTIVOS = new Set(["concepto", "prototipado", "pruebas"]);
export const DIAS_POR_VENCER = 14;

export function metricasExec(db: DB, hoy: string, metas: Metas = leerMetas(db)): MetricasExec {
  const desde = sumarDias(hoy, -13);
  const antDesde = sumarDias(hoy, -27);
  const antHasta = sumarDias(hoy, -14);

  // ── Plazo y costo por proyecto
  const filas = db
    .prepare(
      `SELECT p.id, p.codigo, p.nombre, p.estado, p.presupuesto_clp AS estimado_clp, p.fecha_inicio, p.fecha_entrega_objetivo,
              COALESCE(SUM(CASE WHEN g.estado <> 'rechazado' THEN gp.monto_clp END), 0) AS total_clp,
              COALESCE(SUM(CASE WHEN g.estado = 'pendiente' THEN gp.monto_clp END), 0) AS por_validar_clp,
              COUNT(CASE WHEN g.estado <> 'rechazado' THEN 1 END) AS compras
         FROM proyectos p
         LEFT JOIN gasto_proyectos gp ON gp.proyecto_id = p.id
         LEFT JOIN gastos g ON g.id = gp.gasto_id
        GROUP BY p.id`,
    )
    .all() as {
    id: string;
    codigo: string;
    nombre: string;
    estado: string;
    estimado_clp: number;
    fecha_inicio: string;
    fecha_entrega_objetivo: string;
    total_clp: number;
    por_validar_clp: number;
    compras: number;
  }[];

  const ordenPlazo = { atrasado: 0, por_vencer: 1, en_plazo: 2, pausado: 3, entregado: 4 } as const;
  const plazoProyectos: ProyectoPlazo[] = filas
    .map((p) => {
      const comprometidos = Math.max(1, diasEntre(p.fecha_inicio, p.fecha_entrega_objetivo));
      const transcurridos = Math.max(0, diasEntre(p.fecha_inicio, hoy));
      const restantes = diasEntre(hoy, p.fecha_entrega_objetivo);
      const situacion: ProyectoPlazo["situacion"] =
        p.estado === "entregado"
          ? "entregado"
          : p.estado === "pausado"
            ? "pausado"
            : restantes < 0
              ? "atrasado"
              : restantes <= DIAS_POR_VENCER
                ? "por_vencer"
                : "en_plazo";
      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        estado: p.estado,
        fecha_inicio: p.fecha_inicio,
        fecha_entrega_objetivo: p.fecha_entrega_objetivo,
        dias_transcurridos: transcurridos,
        dias_comprometidos: comprometidos,
        dias_restantes: restantes,
        pct_plazo: Math.round((transcurridos / comprometidos) * 100),
        situacion,
      };
    })
    .sort((a, b) => ordenPlazo[a.situacion] - ordenPlazo[b.situacion] || a.dias_restantes - b.dias_restantes);
  const activos = plazoProyectos.filter((p) => ACTIVOS.has(p.estado));
  const atrasados = activos.filter((p) => p.situacion === "atrasado").length;

  const ordenCosto = { fuera: 0, en_riesgo: 1, dentro: 2, sin_estimacion: 3 } as const;
  const costoProyectos: ProyectoCosto[] = filas
    .filter((p) => p.estado !== "pausado" || p.total_clp > 0)
    .map((p) => {
      const pct = p.estimado_clp > 0 ? Math.round((p.total_clp / p.estimado_clp) * 100) : null;
      const situacion: ProyectoCosto["situacion"] =
        pct === null ? "sin_estimacion" : pct <= 100 ? "dentro" : pct <= 100 + metas.tolerancia_costo_pct ? "en_riesgo" : "fuera";
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
        situacion,
      };
    })
    .sort((a, b) => ordenCosto[a.situacion] - ordenCosto[b.situacion] || (b.pct ?? -1) - (a.pct ?? -1));
  const cuenta = (s: ProyectoCosto["situacion"]) => costoProyectos.filter((p) => p.situacion === s).length;
  const conEstimacion = costoProyectos.filter((p) => p.situacion !== "sin_estimacion").length;

  // Costo agregado en el periodo y en el anterior (fecha local de registro de la compra)
  const costoEntre = (a: string, b: string) => {
    let total = 0;
    const qs = db
      .prepare("SELECT monto_clp, creado_en FROM gastos WHERE estado <> 'rechazado' AND creado_en >= ?")
      .all(`${sumarDias(a, -1)}T00:00:00.000Z`) as { monto_clp: number; creado_en: string }[];
    for (const g of qs) {
      const f = fechaLocal(g.creado_en);
      if (f >= a && f <= b) total += g.monto_clp;
    }
    return total;
  };

  // ── Objetivos diarios del equipo (últimos 14 días vs 14 anteriores, sin jornadas en curso)
  const equipo = equipoActivo(db);
  let completadas = 0;
  let comprometidas = 0;
  let jornadasN = 0;
  let conJornadas = 0;
  let completadasAnt = 0;
  let comprometidasAnt = 0;
  for (const p of equipo) {
    const inicio = fechaLocal(p.creado_en);
    const prog = calcularProgreso(db, p.id, hoy, inicio);
    completadas += prog.completadas_14d;
    comprometidas += prog.comprometidas_14d;
    jornadasN += prog.jornadas_14d;
    if (prog.jornadas_14d > 0) conJornadas++;
    if (inicio <= antHasta) {
      const ant = calcularProgreso(db, p.id, antHasta, inicio);
      completadasAnt += ant.completadas_14d;
      comprometidasAnt += ant.comprometidas_14d;
    }
  }
  const pctEquipo = porcentaje(completadas, comprometidas);
  const metaEq = metas.objetivos_diarios_pct;

  // ── Bloqueos sin resolver
  const abiertos = (
    db
      .prepare(
        `SELECT b.id AS bitacora_id, u.nombre AS persona, b.fecha, b.checkout_tarde, b.bloqueos AS texto,
                (SELECT group_concat(codigo, ',') FROM (
                   SELECT DISTINCT p.codigo FROM tareas_diarias t
                     JOIN tarea_proyectos tp ON tp.tarea_id = t.id JOIN proyectos p ON p.id = tp.proyecto_id
                    WHERE t.bitacora_id = b.id ORDER BY p.codigo)) AS codigos
           FROM bitacoras b JOIN usuarios u ON u.id = b.usuario_id
          WHERE b.bloqueos IS NOT NULL AND b.bloqueo_resuelto_en IS NULL`,
      )
      .all() as { bitacora_id: string; persona: string; fecha: string; checkout_tarde: string | null; texto: string; codigos: string | null }[]
  )
    .map((b) => {
      const reportado = b.checkout_tarde ? fechaLocal(b.checkout_tarde) : b.fecha;
      return {
        bitacora_id: b.bitacora_id,
        persona: b.persona,
        fecha: reportado,
        dias: Math.max(0, diasEntre(reportado, hoy)),
        texto: b.texto,
        proyectos: b.codigos ? b.codigos.split(",") : [],
      };
    })
    .sort((a, b) => b.dias - a.dias);
  const vencidos = abiertos.filter((b) => b.dias > metas.bloqueo_max_dias).length;
  const reportadosEntre = (a: string, b: string) =>
    (
      db
        .prepare("SELECT checkout_tarde, fecha FROM bitacoras WHERE bloqueos IS NOT NULL AND fecha >= ?")
        .all(sumarDias(a, -1)) as { checkout_tarde: string | null; fecha: string }[]
    ).filter((x) => {
      const f = x.checkout_tarde ? fechaLocal(x.checkout_tarde) : x.fecha;
      return f >= a && f <= b;
    }).length;

  return {
    corte: hoy,
    periodo: { desde, hasta: hoy, anterior_desde: antDesde, anterior_hasta: antHasta },
    metas,
    plazo: {
      estado: activos.length === 0 ? "sin_datos" : atrasados === 0 ? "en_meta" : "fuera",
      activos: activos.length,
      en_plazo: activos.length - atrasados,
      atrasados,
      por_vencer: activos.filter((p) => p.situacion === "por_vencer").length,
      proyectos: plazoProyectos,
    },
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
    equipo: {
      estado: pctEquipo === null ? "sin_datos" : pctEquipo >= metaEq ? "en_meta" : pctEquipo >= metaEq - 10 ? "en_riesgo" : "fuera",
      pct: pctEquipo,
      pct_anterior: porcentaje(completadasAnt, comprometidasAnt),
      completadas,
      comprometidas,
      jornadas: jornadasN,
      personas_con_jornadas: conJornadas,
      personas: equipo.length,
    },
    bloqueos: {
      estado: abiertos.length === 0 ? "en_meta" : vencidos ? "fuera" : "en_riesgo",
      abiertos: abiertos.length,
      vencidos,
      nuevos_periodo: reportadosEntre(desde, hoy),
      nuevos_periodo_anterior: reportadosEntre(antDesde, antHasta),
      lista: abiertos.slice(0, 5),
    },
    personas_activas: equipo.length,
  };
}
