// Límites de uso del asistente (cada turno es una llamada a Claude) y consumo de tokens por conversación.
// Los cupos por minuto viven en memoria, como el límite de login (lib/limites.ts): hay un solo contenedor.
// Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import type Database from "better-sqlite3";
import { fechaLocal } from "../tiempo";
import { type ClaveModulo, MODULOS } from "./modulos";

type DB = Database.Database;

const tope = Number(process.env.CHAT_TURNOS_MAX);
/** Turnos del asistente por conversación (sin contar el saludo). */
export const TURNOS_MAX = Number.isInteger(tope) && tope >= 1 ? tope : 40;

/** Turnos por cuenta y por minuto. */
export const CUPO_POR_MINUTO = { mensaje: 10, generar: 3 } as const;
export type TipoCupo = keyof typeof CUPO_POR_MINUTO;

export const MENSAJE_CUPO = "Vas muy rápido. Espera unos segundos y vuelve a intentar.";
export const MENSAJE_TOPE = `Esta conversación llegó al máximo de ${TURNOS_MAX} respuestas del asistente. Presiona «Finalizar y generar requerimiento» para enviar lo conversado.`;
export const AVISO_TOPE =
  "Con esto llegamos al máximo de respuestas de esta conversación. Por favor, presiona «Finalizar y generar requerimiento» para enviar lo conversado al equipo de desarrollo.";

const VENTANA_MS = 60_000;
const cupos = new Map<string, { n: number; desde: number }>();

/** Descuenta un turno del cupo de la cuenta; false si ya lo agotó en este minuto. */
export function consumirCupo(email: string, tipo: TipoCupo, ahora = Date.now()): boolean {
  if (cupos.size > 10_000) {
    for (const [k, v] of cupos) if (ahora - v.desde > VENTANA_MS) cupos.delete(k);
  }
  const clave = `${tipo}:${email.toLowerCase()}`;
  const e = cupos.get(clave);
  if (!e || ahora - e.desde > VENTANA_MS) {
    cupos.set(clave, { n: 1, desde: ahora });
    return true;
  }
  e.n++;
  return e.n <= CUPO_POR_MINUTO[tipo];
}

/** Solo para pruebas. */
export function reiniciarCupos() {
  cupos.clear();
}

/** Respuestas del asistente en la conversación, sin el saludo. */
export function turnosDelAsistente(db: DB, conversacionId: string): number {
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM chat_mensajes WHERE conversacion_id = ? AND autor = 'robot'")
    .get(conversacionId) as { n: number };
  return Math.max(0, n - 1);
}

export interface Consumo {
  entrada: number;
  salida: number;
}
export const SIN_CONSUMO: Consumo = { entrada: 0, salida: 0 };

export function sumarConsumo(db: DB, conversacionId: string, c: Consumo) {
  if (!c.entrada && !c.salida) return;
  db.prepare("UPDATE chat_conversaciones SET tokens_entrada = tokens_entrada + ?, tokens_salida = tokens_salida + ? WHERE id = ?").run(
    c.entrada,
    c.salida,
    conversacionId,
  );
}

export interface ConsumoMes {
  mes: string; // YYYY-MM (zona horaria de negocio)
  total: Consumo & { conversaciones: number };
  por_modulo: (Consumo & { modulo: ClaveModulo; conversaciones: number })[];
}

/** Tokens del mes en curso (por fecha de inicio de la conversación), en total y por módulo. */
export function consumoDelMes(db: DB, ahora = new Date()): ConsumoMes {
  const mes = fechaLocal(ahora).slice(0, 7);
  // Margen de un día antes del 1 en UTC: el filtro exacto se hace con la fecha local.
  const desde = new Date(`${mes}-01T00:00:00Z`).getTime() - 86_400_000;
  const filas = db
    .prepare("SELECT modulo, iniciada_en, tokens_entrada, tokens_salida FROM chat_conversaciones WHERE iniciada_en >= ?")
    .all(new Date(desde).toISOString()) as { modulo: string; iniciada_en: string; tokens_entrada: number; tokens_salida: number }[];
  const delMes = filas.filter((f) => fechaLocal(f.iniciada_en).startsWith(mes));
  const sumar = (xs: typeof delMes) => ({
    entrada: xs.reduce((s, f) => s + f.tokens_entrada, 0),
    salida: xs.reduce((s, f) => s + f.tokens_salida, 0),
    conversaciones: xs.length,
  });
  return {
    mes,
    total: sumar(delMes),
    por_modulo: MODULOS.map((m) => ({ modulo: m.clave, ...sumar(delMes.filter((f) => f.modulo === m.clave)) })).filter(
      (x) => x.conversaciones > 0,
    ),
  };
}
