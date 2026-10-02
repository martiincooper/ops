import "server-only";
import type { DB } from "./db";

export const FALLOS_POR_BLOQUEO = 5;
const BLOQUEO_BASE_MIN = 15;
const BLOQUEO_MAX_MIN = 24 * 60;

/** Registra un intento fallido; cada 5 fallos consecutivos bloquea la cuenta 15 min, duplicando hasta 24 h. */
export function registrarFallo(db: DB, usuarioId: string): { intentos: number; bloqueado_hasta: string | null } {
  const { intentos_fallidos: intentos } = db
    .prepare(
      "UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ? RETURNING intentos_fallidos",
    )
    .get(usuarioId) as { intentos_fallidos: number };

  if (intentos % FALLOS_POR_BLOQUEO !== 0) return { intentos, bloqueado_hasta: null };

  const ronda = intentos / FALLOS_POR_BLOQUEO;
  const minutos = Math.min(BLOQUEO_BASE_MIN * 2 ** (ronda - 1), BLOQUEO_MAX_MIN);
  const hasta = new Date(Date.now() + minutos * 60_000).toISOString();
  db.prepare("UPDATE usuarios SET bloqueado_hasta = ? WHERE id = ?").run(hasta, usuarioId);
  return { intentos, bloqueado_hasta: hasta };
}

export function minutosRestantes(hastaIso: string | null): number {
  if (!hastaIso) return 0;
  const ms = new Date(hastaIso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

// Límite por IP en memoria (un solo contenedor). 30 intentos de login cada 15 min.
const VENTANA_MS = 15 * 60_000;
const MAX_POR_IP = 30;
const porIp = new Map<string, { n: number; desde: number }>();

export function consumirIntentoIp(ip: string): boolean {
  const ahora = Date.now();
  if (porIp.size > 10_000) {
    for (const [k, v] of porIp) if (ahora - v.desde > VENTANA_MS) porIp.delete(k);
  }
  const e = porIp.get(ip);
  if (!e || ahora - e.desde > VENTANA_MS) {
    porIp.set(ip, { n: 1, desde: ahora });
    return true;
  }
  e.n++;
  return e.n <= MAX_POR_IP;
}
