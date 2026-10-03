// Cálculos de los tableros de jefatura (/admin) y gerencia (/exec). Reciben la base de UNA empresa.
// Sin "server-only" para poder probarlos con tsx.
import type Database from "better-sqlite3";
import { calcularProgreso, porcentaje } from "./metricas";
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

export interface MetricasExec {
  proyectos: {
    id: string;
    codigo: string;
    nombre: string;
    estado: string;
    presupuesto_clp: number;
    total_clp: number; // compras aprobadas + por validar (sin rechazadas)
    por_validar_clp: number;
    compras: number;
    pct_presupuesto: number | null;
    fecha_inicio: string;
    fecha_entrega_objetivo: string;
    dias_transcurridos: number;
    dias_comprometidos: number;
    dias_restantes: number;
    pct_plazo: number;
  }[];
  totales: { total_clp: number; aprobado_clp: number; por_validar_clp: number; presupuesto_clp: number };
  saydo: { pct: number | null; completadas: number; comprometidas: number; personas: number };
  personas_activas: number;
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Gasto real por proyecto (excluye compras rechazadas), lead time y Say-Do global de la empresa. */
export function metricasExec(db: DB, hoy: string): MetricasExec {
  const proyectos = (
    db
      .prepare(
        `SELECT p.id, p.codigo, p.nombre, p.estado, p.presupuesto_clp, p.fecha_inicio, p.fecha_entrega_objetivo,
                COALESCE(SUM(CASE WHEN g.estado <> 'rechazado' THEN gp.monto_clp END), 0) AS total_clp,
                COALESCE(SUM(CASE WHEN g.estado = 'pendiente' THEN gp.monto_clp END), 0) AS por_validar_clp,
                COUNT(CASE WHEN g.estado <> 'rechazado' THEN 1 END) AS compras
           FROM proyectos p
           LEFT JOIN gasto_proyectos gp ON gp.proyecto_id = p.id
           LEFT JOIN gastos g ON g.id = gp.gasto_id
          GROUP BY p.id
          ORDER BY p.estado IN ('entregado', 'pausado'), p.fecha_entrega_objetivo`,
      )
      .all() as Omit<
      MetricasExec["proyectos"][number],
      "pct_presupuesto" | "dias_transcurridos" | "dias_comprometidos" | "dias_restantes" | "pct_plazo"
    >[]
  ).map((p) => {
    const comprometidos = Math.max(1, diasEntre(p.fecha_inicio, p.fecha_entrega_objetivo));
    const transcurridos = Math.max(0, diasEntre(p.fecha_inicio, hoy));
    return {
      ...p,
      pct_presupuesto: p.presupuesto_clp > 0 ? Math.round((p.total_clp / p.presupuesto_clp) * 100) : null,
      dias_transcurridos: transcurridos,
      dias_comprometidos: comprometidos,
      dias_restantes: diasEntre(hoy, p.fecha_entrega_objetivo),
      pct_plazo: Math.round((transcurridos / comprometidos) * 100),
    };
  });

  const equipo = equipoActivo(db);
  let completadas = 0;
  let comprometidas = 0;
  for (const p of equipo) {
    const prog = calcularProgreso(db, p.id, hoy, fechaLocal(p.creado_en));
    completadas += prog.completadas_14d;
    comprometidas += prog.comprometidas_14d;
  }

  const total = proyectos.reduce((s, p) => s + p.total_clp, 0);
  const porValidar = proyectos.reduce((s, p) => s + p.por_validar_clp, 0);
  return {
    proyectos,
    totales: {
      total_clp: total,
      aprobado_clp: total - porValidar,
      por_validar_clp: porValidar,
      presupuesto_clp: proyectos.reduce((s, p) => s + p.presupuesto_clp, 0),
    },
    saydo: {
      pct: comprometidas > 0 ? Math.round((completadas / comprometidas) * 100) : null,
      completadas,
      comprometidas,
      personas: equipo.length,
    },
    personas_activas: equipo.length,
  };
}
