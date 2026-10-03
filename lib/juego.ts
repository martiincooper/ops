// Gamificación del integrante: experiencia (XP), nivel y logros, calculados desde su historial.
// Sin "server-only" para poder probarlo con tsx.
import type Database from "better-sqlite3";
import { mejorRacha } from "./metricas";
import { HORA_LIMITE_RACHA, VENTANAS, fechaLocal, horaLocal } from "./tiempo";

type DB = Database.Database;

export const XP = {
  objetivo: 10, // cada objetivo completado
  cierreATiempo: 5, // jornada cerrada dentro de la ventana de la tarde
  diaPerfecto: 15, // 100 % de los objetivos
  inicioATiempo: 3, // objetivos registrados dentro de la ventana de la mañana
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
  dias_perfectos: number;
  logros: Logro[];
}

export function calcularJuego(db: DB, usuarioId: string, hoy: string, inicioCuenta: string): Juego {
  const dias = db
    .prepare(
      `SELECT b.fecha, b.checkin_manana, b.checkout_tarde,
              COUNT(t.id) AS total,
              COALESCE(SUM(t.estado = 'completado'), 0) AS completadas,
              COALESCE(SUM(t.estado = 'postergado_ooo'), 0) AS postergadas
         FROM bitacoras b LEFT JOIN tareas_diarias t ON t.bitacora_id = b.id
        WHERE b.usuario_id = ?
        GROUP BY b.id`,
    )
    .all(usuarioId) as {
    fecha: string;
    checkin_manana: string;
    checkout_tarde: string | null;
    total: number;
    completadas: number;
    postergadas: number;
  }[];

  let completadas = 0;
  let cerrados = 0;
  let aTiempo = 0;
  let perfectos = 0;
  let inicios = 0;
  let madrugador = 0;
  for (const d of dias) {
    completadas += d.completadas;
    const hIni = fechaLocal(d.checkin_manana) === d.fecha ? horaLocal(d.checkin_manana) : null;
    if (hIni && hIni <= VENTANAS.manana.fin) inicios++;
    if (hIni && hIni < "09:00") madrugador++;
    if (!d.checkout_tarde) continue;
    cerrados++;
    if (fechaLocal(d.checkout_tarde) === d.fecha && horaLocal(d.checkout_tarde) <= HORA_LIMITE_RACHA) aTiempo++;
    const comprometidas = d.total - d.postergadas;
    if (comprometidas > 0 && d.completadas === comprometidas) perfectos++;
  }

  const xp =
    completadas * XP.objetivo + aTiempo * XP.cierreATiempo + perfectos * XP.diaPerfecto + inicios * XP.inicioATiempo;
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
    dias_perfectos: perfectos,
    logros: [
      logro("primera", "Primera jornada", "Cierra tu primera bitácora", cerrados, 1),
      logro("perfecto", "Día perfecto", "Completa el 100 % de tus objetivos un día", perfectos, 1),
      logro("racha5", "En racha", "5 días hábiles seguidos en racha", mejor, 5),
      logro("madrugador", "Madrugador", "Registra tus objetivos antes de las 09:00 cinco veces", madrugador, 5),
      logro("puntual", "Puntual", `Cierra 10 jornadas antes de las ${HORA_LIMITE_RACHA}`, aTiempo, 10),
      logro("racha10", "Imparable", "10 días hábiles seguidos en racha", mejor, 10),
      logro("perfecto5", "Perfeccionista", "5 días perfectos", perfectos, 5),
      logro("centenario", "Centenario", "100 objetivos completados", completadas, 100),
    ],
  };
}
