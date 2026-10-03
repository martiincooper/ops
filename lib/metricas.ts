// Cumplimiento (Say-Do) por objetivos (ver docs/REVISION.md §9). Sin "server-only" para probarlo con tsx.
//
// El equipo trabaja por objetivos, sin horario: cada jornada se comienza y se termina cuando la persona quiere
// (una por día). Nada de lo que se mide depende de la hora:
//  - Say-Do: objetivos logrados ÷ comprometidos (sin los postergados) de las jornadas de los últimos 14 días,
//    sin la jornada en curso.
import type Database from "better-sqlite3";
import { esFinDeSemana, horaLocal, sumarDias } from "./tiempo";

type DB = Database.Database;

/** "ooo" = día marcado como no disponible. */
export type TipoDia = "laboral" | "fin_de_semana" | "feriado" | "ooo";

export interface DiaResumen {
  fecha: string;
  tipo: TipoDia;
  /** cerrado = jornada terminada; abierto = en curso (o sin terminar, en datos antiguos). */
  registro: "cerrado" | "abierto" | "sin_registro";
  comprometidas: number; // total − postergadas
  completadas: number;
  postergadas: number;
  saydo: number | null; // %
  inicio_local: string | null; // HH:MM (solo para la propia persona)
  cierre_local: string | null; // HH:MM
}

export interface FilaJornada {
  id: string;
  fecha: string;
  checkin_manana: string;
  checkout_tarde: string | null;
  total: number;
  completadas: number;
  postergadas: number;
}

export function porcentaje(completadas: number, comprometidas: number): number | null {
  return comprometidas > 0 ? Math.round((completadas / comprometidas) * 100) : null;
}

/** Jornadas de la persona entre dos fechas, de la más antigua a la más reciente. */
export function jornadas(db: DB, usuarioId: string, desde: string, hasta: string): FilaJornada[] {
  return db
    .prepare(
      `SELECT b.id, b.fecha, b.checkin_manana, b.checkout_tarde,
              COUNT(t.id) AS total,
              COALESCE(SUM(t.estado = 'completado'), 0) AS completadas,
              COALESCE(SUM(t.estado = 'postergado_ooo'), 0) AS postergadas
         FROM bitacoras b
         LEFT JOIN tareas_diarias t ON t.bitacora_id = b.id
        WHERE b.usuario_id = ? AND b.fecha BETWEEN ? AND ?
        GROUP BY b.id
        ORDER BY b.fecha`,
    )
    .all(usuarioId, desde, hasta) as FilaJornada[];
}

/** Id de la jornada en curso: la más reciente de la persona, si no está terminada. */
export function idJornadaEnCurso(db: DB, usuarioId: string): string | null {
  const b = db
    .prepare("SELECT id, checkout_tarde FROM bitacoras WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 1")
    .get(usuarioId) as { id: string; checkout_tarde: string | null } | undefined;
  return b && !b.checkout_tarde ? b.id : null;
}

const comprometidasDe = (j: FilaJornada) => j.total - j.postergadas;

function resumir(fecha: string, j: FilaJornada | undefined, ooo: Set<string>, feriados: Set<string>): DiaResumen {
  const tipo: TipoDia = ooo.has(fecha)
    ? "ooo"
    : esFinDeSemana(fecha)
      ? "fin_de_semana"
      : feriados.has(fecha)
        ? "feriado"
        : "laboral";
  if (!j) {
    return {
      fecha, tipo, registro: "sin_registro",
      comprometidas: 0, completadas: 0, postergadas: 0,
      saydo: null, inicio_local: null, cierre_local: null,
    };
  }
  const comprometidas = comprometidasDe(j);
  return {
    fecha,
    tipo,
    registro: j.checkout_tarde ? "cerrado" : "abierto",
    comprometidas,
    completadas: j.completadas,
    postergadas: j.postergadas,
    saydo: porcentaje(j.completadas, comprometidas),
    inicio_local: horaLocal(j.checkin_manana),
    cierre_local: j.checkout_tarde ? horaLocal(j.checkout_tarde) : null,
  };
}

export interface Progreso {
  hoy: DiaResumen;
  saydo_14d: number | null;
  comprometidas_14d: number;
  completadas_14d: number;
  jornadas_14d: number;
  historial: DiaResumen[]; // últimos 14 días, más reciente primero
}

/** @param inicioCuenta fecha local de creación de la cuenta: no se mira antes. */
export function calcularProgreso(db: DB, usuarioId: string, hoy: string, inicioCuenta: string): Progreso {
  const desde = [sumarDias(hoy, -13), inicioCuenta].sort()[1];
  const lista = jornadas(db, usuarioId, desde, hoy);
  const enCurso = idJornadaEnCurso(db, usuarioId);

  const desde14 = sumarDias(hoy, -13);
  let comprometidas = 0;
  let completadas = 0;
  let cuantas = 0;
  for (const j of lista) {
    if (j.fecha < desde14 || j.id === enCurso) continue;
    comprometidas += comprometidasDe(j);
    completadas += j.completadas;
    cuantas++;
  }

  const ooo = new Set(
    (
      db
        .prepare("SELECT fecha FROM ausencias_ooo WHERE usuario_id = ? AND dia_completo = 1 AND fecha BETWEEN ? AND ?")
        .all(usuarioId, desde14, hoy) as { fecha: string }[]
    ).map((r) => r.fecha),
  );
  const feriados = new Set(
    (db.prepare("SELECT fecha FROM feriados WHERE fecha BETWEEN ? AND ?").all(desde14, hoy) as { fecha: string }[]).map(
      (r) => r.fecha,
    ),
  );
  const porFecha = new Map(lista.map((j) => [j.fecha, j]));
  const historial: DiaResumen[] = [];
  for (let i = 0; i < 14; i++) {
    const f = sumarDias(hoy, -i);
    if (f < inicioCuenta) break;
    historial.push(resumir(f, porFecha.get(f), ooo, feriados));
  }

  return {
    hoy: historial[0] ?? resumir(hoy, porFecha.get(hoy), ooo, feriados),
    saydo_14d: porcentaje(completadas, comprometidas),
    comprometidas_14d: comprometidas,
    completadas_14d: completadas,
    jornadas_14d: cuantas,
    historial,
  };
}
