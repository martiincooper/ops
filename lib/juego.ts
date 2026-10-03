// Gamificación del integrante: experiencia (XP), nivel y logros, calculados desde su historial.
// Sin "server-only" para poder probarlo con tsx.
import type Database from "better-sqlite3";
import { mejorRacha } from "./metricas";

type DB = Database.Database;

// Todo se gana por objetivos, nunca por la hora (el equipo trabaja sin horario).
export const XP = {
  objetivo: 10, // cada objetivo logrado
  jornadaTerminada: 5, // cada jornada terminada (con su balance)
  jornadaPerfecta: 15, // 100 % de los objetivos de una jornada
};

/** XP acumulada necesaria para alcanzar el nivel n (1 → 0, 2 → 100, 3 → 300, 4 → 600, 5 → 1000…). */
export function xpParaNivel(n: number): number {
  return 50 * n * (n - 1);
}

export function nivelDe(xp: number): number {
  let n = 1;
  while (xpParaNivel(n + 1) <= xp) n++;
  return n;
}

export interface Logro {
  clave: string;
  titulo: string;
  descripcion: string;
  progreso: number;
  meta: number;
  logrado: boolean;
}

export interface Juego {
  xp: number;
  nivel: number;
  xp_nivel: number; // XP desde el inicio del nivel actual
  xp_siguiente: number; // XP que separa el nivel actual del siguiente
  mejor_racha: number;
  objetivos_completados: number;
  jornadas_perfectas: number;
  logros: Logro[];
}

export function calcularJuego(db: DB, usuarioId: string, hoy: string, inicioCuenta: string): Juego {
  const jornadas = db
    .prepare(
      `SELECT b.checkout_tarde,
              COUNT(t.id) AS total,
              COALESCE(SUM(t.estado = 'completado'), 0) AS completadas,
              COALESCE(SUM(t.estado = 'postergado_ooo'), 0) AS postergadas
         FROM bitacoras b LEFT JOIN tareas_diarias t ON t.bitacora_id = b.id
        WHERE b.usuario_id = ?
        GROUP BY b.id`,
    )
    .all(usuarioId) as { checkout_tarde: string | null; total: number; completadas: number; postergadas: number }[];

  let completadas = 0;
  let terminadas = 0;
  let perfectas = 0;
  for (const j of jornadas) {
    completadas += j.completadas;
    if (!j.checkout_tarde) continue;
    terminadas++;
    const comprometidas = j.total - j.postergadas;
    if (comprometidas > 0 && j.completadas === comprometidas) perfectas++;
  }
  const proyectos = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT tp.proyecto_id) AS n
           FROM tarea_proyectos tp JOIN tareas_diarias t ON t.id = tp.tarea_id JOIN bitacoras b ON b.id = t.bitacora_id
          WHERE b.usuario_id = ? AND t.estado = 'completado'`,
      )
      .get(usuarioId) as { n: number }
  ).n;

  const xp = completadas * XP.objetivo + terminadas * XP.jornadaTerminada + perfectas * XP.jornadaPerfecta;
  const nivel = nivelDe(xp);
  const mejor = mejorRacha(db, usuarioId, hoy, inicioCuenta);

  const logro = (clave: string, titulo: string, descripcion: string, progreso: number, meta: number): Logro => ({
    clave,
    titulo,
    descripcion,
    progreso: Math.min(progreso, meta),
    meta,
    logrado: progreso >= meta,
  });

  return {
    xp,
    nivel,
    xp_nivel: xp - xpParaNivel(nivel),
    xp_siguiente: xpParaNivel(nivel + 1) - xpParaNivel(nivel),
    mejor_racha: mejor,
    objetivos_completados: completadas,
    jornadas_perfectas: perfectas,
    logros: [
      logro("primera", "Primera jornada", "Termina tu primera jornada", terminadas, 1),
      logro("perfecto", "Jornada perfecta", "Logra el 100 % de los objetivos de una jornada", perfectas, 1),
      logro("racha5", "En racha", "5 jornadas seguidas con al menos 75 % logrado", mejor, 5),
      logro("constante", "Constante", "Termina 10 jornadas", terminadas, 10),
      logro("todoterreno", "Todoterreno", "Logra objetivos en 3 proyectos distintos", proyectos, 3),
      logro("racha10", "Imparable", "10 jornadas seguidas con al menos 75 % logrado", mejor, 10),
      logro("perfecto5", "Perfeccionista", "5 jornadas perfectas", perfectas, 5),
      logro("centenario", "Centenario", "100 objetivos logrados", completadas, 100),
    ],
  };
}
