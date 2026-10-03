// Reglas de Say-Do y racha (ver docs/REVISION.md §4). Sin "server-only" para poder probarlas con tsx.
import type Database from "better-sqlite3";
import {
  HORA_LIMITE_RACHA,
  UMBRAL_RACHA,
  esFinDeSemana,
  fechaLocal,
  horaLocal,
  sumarDias,
} from "./tiempo";

type DB = Database.Database;

export type TipoDia = "laboral" | "fin_de_semana" | "feriado" | "ooo";

export interface DiaResumen {
  fecha: string;
  tipo: TipoDia;
  registro: "cerrado" | "abierto" | "sin_registro";
  comprometidas: number; // total − postergadas por OOO
  completadas: number;
  postergadas: number;
  saydo: number | null; // %
  cierre_local: string | null; // HH:MM
  cuenta_racha: boolean;
}

interface FilaBitacora {
  fecha: string;
  checkout_tarde: string | null;
  total: number;
  completadas: number;
  postergadas: number;
}

export function porcentaje(completadas: number, comprometidas: number): number | null {
  return comprometidas > 0 ? Math.round((completadas / comprometidas) * 100) : null;
}

function cargar(db: DB, usuarioId: string, desde: string, hasta: string) {
  const filas = db
    .prepare(
      `SELECT b.fecha, b.checkout_tarde,
              COUNT(t.id) AS total,
              COALESCE(SUM(t.estado = 'completado'), 0) AS completadas,
              COALESCE(SUM(t.estado = 'postergado_ooo'), 0) AS postergadas
         FROM bitacoras b
         LEFT JOIN tareas_diarias t ON t.bitacora_id = b.id
        WHERE b.usuario_id = ? AND b.fecha BETWEEN ? AND ?
        GROUP BY b.id`,
    )
    .all(usuarioId, desde, hasta) as FilaBitacora[];
  const bitacoras = new Map(filas.map((f) => [f.fecha, f]));

  const ooo = new Set(
    (
      db
        .prepare(
          `SELECT fecha FROM ausencias_ooo
            WHERE usuario_id = ? AND dia_completo = 1 AND fecha BETWEEN ? AND ?`,
        )
        .all(usuarioId, desde, hasta) as { fecha: string }[]
    ).map((r) => r.fecha),
  );

  const feriados = new Set(
    (
      db.prepare("SELECT fecha FROM feriados WHERE fecha BETWEEN ? AND ?").all(desde, hasta) as {
        fecha: string;
      }[]
    ).map((r) => r.fecha),
  );

  return { bitacoras, ooo, feriados };
}

function resumir(
  fecha: string,
  datos: ReturnType<typeof cargar>,
): DiaResumen {
  const tipo: TipoDia = esFinDeSemana(fecha)
    ? "fin_de_semana"
    : datos.feriados.has(fecha)
      ? "feriado"
      : datos.ooo.has(fecha)
        ? "ooo"
        : "laboral";

  const b = datos.bitacoras.get(fecha);
  if (!b) {
    return {
      fecha, tipo, registro: "sin_registro",
      comprometidas: 0, completadas: 0, postergadas: 0,
      saydo: null, cierre_local: null, cuenta_racha: false,
    };
  }

  const comprometidas = b.total - b.postergadas;
  const saydo = porcentaje(b.completadas, comprometidas);
  const cierre_local = b.checkout_tarde ? horaLocal(b.checkout_tarde) : null;
  const cerradoAtiempo =
    b.checkout_tarde !== null &&
    fechaLocal(b.checkout_tarde) === fecha &&
    (cierre_local as string) <= HORA_LIMITE_RACHA;

  return {
    fecha,
    tipo,
    registro: b.checkout_tarde ? "cerrado" : "abierto",
    comprometidas,
    completadas: b.completadas,
    postergadas: b.postergadas,
    saydo,
    cierre_local,
    cuenta_racha: tipo === "laboral" && cerradoAtiempo && saydo !== null && saydo >= UMBRAL_RACHA,
  };
}

/** Evalúa un día para la racha: suma, se omite (no laboral / todo postergado) o la rompe. */
function evaluarRacha(d: DiaResumen): "suma" | "omite" | "rompe" {
  if (d.tipo !== "laboral") return "omite";
  if (d.cuenta_racha) return "suma";
  if (d.registro === "cerrado" && d.comprometidas === 0) return "omite"; // todo postergado por ausencia parcial
  return "rompe";
}

export interface Progreso {
  hoy: DiaResumen;
  racha: number;
  saydo_14d: number | null;
  comprometidas_14d: number;
  completadas_14d: number;
  dias_sin_registro_14d: number;
  historial: DiaResumen[]; // últimos 14 días, más reciente primero
}

/**
 * @param inicioCuenta fecha local desde la que se evalúa (creación del usuario): días anteriores no rompen la racha.
 */
export function calcularProgreso(db: DB, usuarioId: string, hoy: string, inicioCuenta: string): Progreso {
  const LIMITE = 400;
  const desdeRacha = [sumarDias(hoy, -LIMITE), inicioCuenta].sort()[1];
  const datos = cargar(db, usuarioId, desdeRacha, hoy);

  const resumenHoy = resumir(hoy, datos);

  // Racha
  let racha = evaluarRacha(resumenHoy) === "suma" ? 1 : 0;
  for (let f = sumarDias(hoy, -1); f >= desdeRacha; f = sumarDias(f, -1)) {
    const r = evaluarRacha(resumir(f, datos));
    if (r === "rompe") break;
    if (r === "suma") racha++;
  }

  // Say-Do 14 días (hoy solo cuenta si ya está cerrado)
  const historial: DiaResumen[] = [];
  let comprometidas = 0;
  let completadas = 0;
  let sinRegistro = 0;
  for (let i = 0; i < 14; i++) {
    const f = sumarDias(hoy, -i);
    if (f < inicioCuenta) break;
    const d = i === 0 ? resumenHoy : resumir(f, datos);
    historial.push(d);
    if (i === 0 && d.registro !== "cerrado") continue;
    comprometidas += d.comprometidas;
    completadas += d.completadas;
    if (i > 0 && d.tipo === "laboral" && d.registro === "sin_registro") sinRegistro++;
  }

  return {
    hoy: resumenHoy,
    racha,
    saydo_14d: porcentaje(completadas, comprometidas),
    comprometidas_14d: comprometidas,
    completadas_14d: completadas,
    dias_sin_registro_14d: sinRegistro,
    historial,
  };
}

/** Mejor racha histórica (mismas reglas que la racha actual; hasta 2 años atrás). */
export function mejorRacha(db: DB, usuarioId: string, hoy: string, inicioCuenta: string): number {
  const desde = [sumarDias(hoy, -730), inicioCuenta].sort()[1];
  const datos = cargar(db, usuarioId, desde, hoy);
  let mejor = 0;
  let actual = 0;
  for (let f = desde; f <= hoy; f = sumarDias(f, 1)) {
    const r = evaluarRacha(resumir(f, datos));
    if (r === "suma") mejor = Math.max(mejor, ++actual);
    else if (r === "rompe" && f !== hoy) actual = 0; // hoy en curso no corta
  }
  return mejor;
}
