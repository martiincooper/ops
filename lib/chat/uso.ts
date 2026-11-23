// Límite de uso del chat: cupo de mensajes por minuto por cuenta (protege el servidor).
// Los cupos viven en memoria, como el límite de login (lib/limites.ts): hay un solo contenedor.
// Sin "server-only" para poder probarlo con scripts/test-logica.ts.

/** Mensajes por cuenta y por minuto. */
export const CUPO_POR_MINUTO = { mensaje: 30 } as const;
export type TipoCupo = keyof typeof CUPO_POR_MINUTO;

export const MENSAJE_CUPO = "Vas muy rápido. Espera unos segundos y vuelve a intentar.";

const VENTANA_MS = 60_000;
const cupos = new Map<string, { n: number; desde: number }>();

/** Descuenta un mensaje del cupo de la cuenta; false si ya lo agotó en este minuto. */
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
