/**
 * Reparte un monto en CLP en partes iguales entre n proyectos (sin decimales).
 * El resto se asigna de a $1 a los primeros, así la suma es siempre exactamente el monto.
 */
export function repartirMonto(monto: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(monto / n);
  const resto = monto - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}
