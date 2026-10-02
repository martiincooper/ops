// Cálculos de los tableros de jefatura (/admin) y gerencia (/exec). Reciben la base de UNA empresa.
// Sin "server-only" para poder probarlos con tsx.
import type Database from "better-sqlite3";
import { calcularProgreso, type DiaResumen } from "./metricas";
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

export interface FilaStandup {
  id: string;
  nombre: string;
  email: string;
  prioridad: 1 | 2 | 3 | 4;
  motivo: string;
  hoy: DiaResumen;
  tareas_hoy: { descripcion: string; estado: string; motivo_pendiente: string | null; proyecto_codigo: string }[];
  ooo_hoy: { dia_completo: number; hora_inicio: string | null; hora_fin: string | null; motivo: string | null }[];
  bloqueos: { bitacora_id: string; fecha: string; texto: string }[];
  saydo_14d: number | null;
  racha: number;
  dias_sin_registro_14d: number;
}

export const UMBRAL_SAYDO_ALERTA = 70;

/**
 * Prioridad de intervención: 1) bloqueos sin resolver (últimos 14 días), 2) Say-Do 14 días < 70 %,
 * 3) ausente hoy, 4) resto.
 */
export function standup(db: DB, hoy: string, personas: Persona[]): FilaStandup[] {
  const desde = sumarDias(hoy, -14);
  const qTareas = db.prepare(
    `SELECT t.descripcion, t.estado, t.motivo_pendiente, p.codigo AS proyecto_codigo
       FROM tareas_diarias t JOIN bitacoras b ON b.id = t.bitacora_id JOIN proyectos p ON p.id = t.proyecto_id
      WHERE b.usuario_id = ? AND b.fecha = ? ORDER BY t.orden`,
  );
  const qOoo = db.prepare(
    "SELECT dia_completo, hora_inicio, hora_fin, motivo FROM ausencias_ooo WHERE usuario_id = ? AND fecha = ? ORDER BY hora_inicio",
  );
  const qBloqueos = db.prepare(
    `SELECT id AS bitacora_id, fecha, bloqueos AS texto FROM bitacoras
      WHERE usuario_id = ? AND bloqueos IS NOT NULL AND bloqueo_resuelto_en IS NULL AND fecha >= ?
      ORDER BY fecha DESC`,
  );

  const filas = personas.map((p): FilaStandup => {
    const prog = calcularProgreso(db, p.id, hoy, fechaLocal(p.creado_en));
    const bloqueos = qBloqueos.all(p.id, desde) as FilaStandup["bloqueos"];
    const ooo_hoy = qOoo.all(p.id, hoy) as FilaStandup["ooo_hoy"];
    let prioridad: FilaStandup["prioridad"] = 4;
    let motivo = "Sin alertas";
    if (bloqueos.length) {
      prioridad = 1;
      motivo = bloqueos.length === 1 ? "Bloqueo sin resolver" : `${bloqueos.length} bloqueos sin resolver`;
    } else if (prog.saydo_14d !== null && prog.saydo_14d < UMBRAL_SAYDO_ALERTA) {
      prioridad = 2;
      motivo = `Say-Do 14 días ${prog.saydo_14d}%`;
    } else if (ooo_hoy.length) {
      prioridad = 3;
      motivo = ooo_hoy.some((a) => a.dia_completo) ? "Fuera de oficina hoy" : "Ausencia parcial hoy";
    }
    return {
      id: p.id,
      nombre: p.nombre,
      email: p.email,
      prioridad,
      motivo,
      hoy: prog.hoy,
      tareas_hoy: qTareas.all(p.id, hoy) as FilaStandup["tareas_hoy"],
      ooo_hoy,
      bloqueos,
      saydo_14d: prog.saydo_14d,
      racha: prog.racha,
      dias_sin_registro_14d: prog.dias_sin_registro_14d,
    };
  });
  return filas.sort((a, b) => a.prioridad - b.prioridad || a.nombre.localeCompare(b.nombre, "es"));
}

// ──────────────────────── Capacidad 14 días ────────────────────────

/** Jornada base para descontar ausencias parciales. Configurable con JORNADA="08:30-18:00". */
export function jornada(): { inicio: string; fin: string; minutos: number } {
  const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(process.env.JORNADA ?? "");
  const [inicio, fin] = m ? [m[1], m[2]] : ["08:30", "18:00"];
  return { inicio, fin, minutos: aMin(fin) - aMin(inicio) };
}

function aMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

export type EstadoCelda = "disponible" | "parcial" | "ooo" | "fin_de_semana" | "feriado";

export interface Capacidad {
  jornada: { inicio: string; fin: string };
  dias: { fecha: string; laboral: boolean; disponibles: number; personas: number }[];
  filas: {
    id: string;
    nombre: string;
    celdas: { fecha: string; estado: EstadoCelda; fraccion: number; detalle: string | null }[];
    dias_disponibles: number;
  }[];
}

export function capacidad(db: DB, hoy: string, personas: Persona[], dias = 14): Capacidad {
  const j = jornada();
  const hasta = sumarDias(hoy, dias - 1);
  const feriados = new Map(
    (db.prepare("SELECT fecha, nombre FROM feriados WHERE fecha BETWEEN ? AND ?").all(hoy, hasta) as {
      fecha: string;
      nombre: string;
    }[]).map((f) => [f.fecha, f.nombre]),
  );
  const qOoo = db.prepare(
    `SELECT fecha, dia_completo, hora_inicio, hora_fin, motivo FROM ausencias_ooo
      WHERE usuario_id = ? AND fecha BETWEEN ? AND ?`,
  );
  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(hoy, i));

  const filas = personas.map((p) => {
    const ausencias = qOoo.all(p.id, hoy, hasta) as {
      fecha: string;
      dia_completo: number;
      hora_inicio: string | null;
      hora_fin: string | null;
      motivo: string | null;
    }[];
    const celdas = fechas.map((fecha) => {
      if (esFinDeSemana(fecha)) return { fecha, estado: "fin_de_semana" as const, fraccion: 0, detalle: null };
      if (feriados.has(fecha)) return { fecha, estado: "feriado" as const, fraccion: 0, detalle: feriados.get(fecha)! };
      const delDia = ausencias.filter((a) => a.fecha === fecha);
      if (delDia.some((a) => a.dia_completo)) {
        return { fecha, estado: "ooo" as const, fraccion: 0, detalle: delDia.find((a) => a.dia_completo)?.motivo ?? null };
      }
      if (delDia.length) {
        const fuera = delDia.reduce((s, a) => {
          const ini = Math.max(aMin(a.hora_inicio!), aMin(j.inicio));
          const fin = Math.min(aMin(a.hora_fin!), aMin(j.fin));
          return s + Math.max(0, fin - ini);
        }, 0);
        const fraccion = Math.max(0, Math.round((1 - fuera / j.minutos) * 100) / 100);
        const detalle = delDia.map((a) => `${a.hora_inicio}–${a.hora_fin}`).join(", ");
        return { fecha, estado: (fraccion < 1 ? "parcial" : "disponible") as EstadoCelda, fraccion, detalle };
      }
      return { fecha, estado: "disponible" as const, fraccion: 1, detalle: null };
    });
    return {
      id: p.id,
      nombre: p.nombre,
      celdas,
      dias_disponibles: Math.round(celdas.reduce((s, c) => s + c.fraccion, 0) * 10) / 10,
    };
  });

  return {
    jornada: { inicio: j.inicio, fin: j.fin },
    dias: fechas.map((fecha, i) => ({
      fecha,
      laboral: !esFinDeSemana(fecha) && !feriados.has(fecha),
      disponibles: Math.round(filas.reduce((s, f) => s + f.celdas[i].fraccion, 0) * 10) / 10,
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
  proyecto_codigo: string;
  proyecto_nombre: string;
  item: string;
  fecha_documento: string;
  tipo_documento: "factura" | "boleta" | "extranjero";
  rut_emisor: string | null;
  folio_documento: string;
  monto_item_clp: number;
  monto_envio_clp: number;
  iva_clp: number;
  comprobante_mime: string;
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
  const filas = db
    .prepare(
      `SELECT g.id, g.usuario_id, u.nombre AS persona, p.codigo AS proyecto_codigo, p.nombre AS proyecto_nombre,
              g.item, g.fecha_documento, g.tipo_documento, g.rut_emisor, g.folio_documento,
              g.monto_item_clp, g.monto_envio_clp, g.iva_clp, g.comprobante_mime, g.estado,
              g.validado_por_nombre, g.validado_en, g.observacion, g.creado_en
         FROM gastos g JOIN usuarios u ON u.id = g.usuario_id JOIN proyectos p ON p.id = g.proyecto_id
        WHERE (? = 'todos' OR g.estado = 'pendiente')
        ORDER BY g.estado = 'pendiente' DESC, g.creado_en DESC
        LIMIT ?`,
    )
    .all(op.estado ?? "pendiente", op.limite ?? 500) as FilaGasto[];
  return op.ids ? filas.filter((f) => op.ids!.has(f.usuario_id)) : filas;
}

// ───────────────────────── Gerencia ─────────────────────────

export interface MetricasExec {
  proyectos: {
    id: string;
    codigo: string;
    nombre: string;
    estado: string;
    presupuesto_clp: number;
    componentes_clp: number;
    flete_clp: number;
    total_clp: number;
    por_validar_clp: number;
    pct_presupuesto: number | null;
    fecha_inicio: string;
    fecha_entrega_objetivo: string;
    dias_transcurridos: number;
    dias_comprometidos: number;
    dias_restantes: number;
    pct_plazo: number;
  }[];
  totales: { componentes_clp: number; flete_clp: number; total_clp: number; por_validar_clp: number };
  iva: {
    neto_factura_clp: number;
    iva_recuperable_clp: number;
    total_boleta_clp: number;
    iva_absorbido_boleta_clp: number;
    total_extranjero_clp: number;
    pct_con_factura: number | null;
  };
  saydo: { pct: number | null; completadas: number; comprometidas: number; personas: number };
  personas_activas: number;
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Gasto real (excluye compras rechazadas): costo prototipo = componentes + flete. */
export function metricasExec(db: DB, hoy: string): MetricasExec {
  const proyectos = (
    db
      .prepare(
        `SELECT p.id, p.codigo, p.nombre, p.estado, p.presupuesto_clp, p.fecha_inicio, p.fecha_entrega_objetivo,
                COALESCE(SUM(CASE WHEN g.estado <> 'rechazado' THEN g.monto_item_clp END), 0) AS componentes_clp,
                COALESCE(SUM(CASE WHEN g.estado <> 'rechazado' THEN g.monto_envio_clp END), 0) AS flete_clp,
                COALESCE(SUM(CASE WHEN g.estado = 'pendiente' THEN g.monto_item_clp + g.monto_envio_clp END), 0) AS por_validar_clp
           FROM proyectos p LEFT JOIN gastos g ON g.proyecto_id = p.id
          GROUP BY p.id
          ORDER BY p.estado IN ('entregado', 'pausado'), p.fecha_entrega_objetivo`,
      )
      .all() as Omit<
      MetricasExec["proyectos"][number],
      "total_clp" | "pct_presupuesto" | "dias_transcurridos" | "dias_comprometidos" | "dias_restantes" | "pct_plazo"
    >[]
  ).map((p) => {
    const total = p.componentes_clp + p.flete_clp;
    const comprometidos = Math.max(1, diasEntre(p.fecha_inicio, p.fecha_entrega_objetivo));
    const transcurridos = Math.max(0, diasEntre(p.fecha_inicio, hoy));
    return {
      ...p,
      total_clp: total,
      pct_presupuesto: p.presupuesto_clp > 0 ? Math.round((total / p.presupuesto_clp) * 100) : null,
      dias_transcurridos: transcurridos,
      dias_comprometidos: comprometidos,
      dias_restantes: diasEntre(hoy, p.fecha_entrega_objetivo),
      pct_plazo: Math.round((transcurridos / comprometidos) * 100),
    };
  });

  const iva = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo_documento = 'factura' THEN monto_item_clp + monto_envio_clp END), 0) AS neto_factura_clp,
         COALESCE(SUM(CASE WHEN tipo_documento = 'factura' THEN iva_clp END), 0) AS iva_recuperable_clp,
         COALESCE(SUM(CASE WHEN tipo_documento = 'boleta' THEN monto_item_clp + monto_envio_clp END), 0) AS total_boleta_clp,
         COALESCE(SUM(CASE WHEN tipo_documento = 'extranjero' THEN monto_item_clp + monto_envio_clp END), 0) AS total_extranjero_clp
       FROM gastos WHERE estado <> 'rechazado'`,
    )
    .get() as {
    neto_factura_clp: number;
    iva_recuperable_clp: number;
    total_boleta_clp: number;
    total_extranjero_clp: number;
  };
  const totalNacional = iva.neto_factura_clp + iva.total_boleta_clp;

  const equipo = equipoActivo(db);
  let completadas = 0;
  let comprometidas = 0;
  for (const p of equipo) {
    const prog = calcularProgreso(db, p.id, hoy, fechaLocal(p.creado_en));
    completadas += prog.completadas_14d;
    comprometidas += prog.comprometidas_14d;
  }

  return {
    proyectos,
    totales: {
      componentes_clp: proyectos.reduce((s, p) => s + p.componentes_clp, 0),
      flete_clp: proyectos.reduce((s, p) => s + p.flete_clp, 0),
      total_clp: proyectos.reduce((s, p) => s + p.total_clp, 0),
      por_validar_clp: proyectos.reduce((s, p) => s + p.por_validar_clp, 0),
    },
    iva: {
      ...iva,
      // En una boleta el IVA va incluido en el precio y no se recupera: 19/119 del total.
      iva_absorbido_boleta_clp: Math.round((iva.total_boleta_clp * 19) / 119),
      pct_con_factura: totalNacional > 0 ? Math.round((iva.neto_factura_clp / totalNacional) * 100) : null,
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
