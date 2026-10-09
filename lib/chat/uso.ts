// Límites de uso del asistente: cupo por minuto por cuenta (protege el servidor) y tope de respuestas por conversación.
// Los cupos por minuto viven en memoria, como el límite de login (lib/limites.ts): hay un solo contenedor.
// Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import type Database from "better-sqlite3";

type DB = Database.Database;

const tope = Number(process.env.CHAT_TURNOS_MAX);
/** Turnos del asistente por conversación (sin contar el saludo). */
export const TURNOS_MAX = Number.isInteger(tope) && tope >= 1 ? tope : 40;

/** Turnos por cuenta y por minuto. */
// Con botones de respuesta (#17) una persona puede contestar varias preguntas por minuto: 30 turnos
export const CUPO_POR_MINUTO = { mensaje: 30, generar: 3 } as const;
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
