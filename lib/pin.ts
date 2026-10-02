import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  pwd: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LARGO = 32;

export const PIN_INICIAL = /^\d{6}$/.test(process.env.PIN_INICIAL ?? "")
  ? (process.env.PIN_INICIAL as string)
  : "000000";

export async function hashPin(pin: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scryptAsync(pin, sal, LARGO, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString("base64")}$${h.toString("base64")}`;
}

export async function verificarPin(pin: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, N, r, p, salB64, hB64] = partes;
  const esperado = Buffer.from(hB64, "base64");
  const h = await scryptAsync(pin, Buffer.from(salB64, "base64"), esperado.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}

/** Hash fijo para igualar el tiempo de respuesta cuando el email no existe. */
let hashSenuelo: Promise<string> | null = null;
export function senuelo(): Promise<string> {
  hashSenuelo ??= hashPin("999999");
  return hashSenuelo;
}

/** Devuelve el motivo de rechazo o null si el código es aceptable. */
export function motivoPinDebil(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "El código debe tener exactamente 6 dígitos";
  if (pin === PIN_INICIAL) return "No puedes usar el código inicial";
  if (/^(\d)\1{5}$/.test(pin)) return "No uses un mismo dígito repetido";
  const d = pin.split("").map(Number);
  const asc = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const desc = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  if (asc || desc) return "No uses secuencias consecutivas (ej. 123456)";
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return "No uses patrones repetidos (ej. 121212)";
  return null;
}
