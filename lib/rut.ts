/** Normaliza "76.123.456-k" → "76123456-K". Devuelve null si el dígito verificador no cuadra (módulo 11). */
export function normalizarRut(entrada: string): string | null {
  const limpio = entrada.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(limpio)) return null;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return dvRut(cuerpo) === dv ? `${cuerpo}-${dv}` : null;
}

export function dvRut(cuerpo: string): string {
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
