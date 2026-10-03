/** Anillo de progreso (% de objetivos logrados). Arco índigo sobre pista lavanda; sin juicio de color. */
export default function Anillo({
  valor,
  tamano = 120,
  grosor = 14,
  etiqueta,
}: {
  valor: number | null;
  tamano?: number;
  grosor?: number;
  etiqueta?: string;
}) {
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(valor ?? 0, 100));
  return (
    <div
      className="relative shrink-0"
      style={{ width: tamano, height: tamano }}
      role="img"
      aria-label={valor === null ? "Sin datos" : `${valor}% logrado`}
    >
      <svg width={tamano} height={tamano} className="-rotate-90" aria-hidden>
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="var(--color-indigo-suave)" strokeWidth={grosor} />
        {valor !== null && v > 0 && (
          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={r}
            fill="none"
            stroke="var(--color-indigo)"
            strokeWidth={grosor}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v / 100)}
            style={{ transition: "stroke-dashoffset 500ms cubic-bezier(.2,.8,.2,1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={tamano >= 100 ? "text-2xl font-bold text-tinta" : "text-sm font-bold text-tinta"}>
          {valor === null ? "—" : `${valor}%`}
        </span>
        {etiqueta && <span className="text-xs text-tinta-3">{etiqueta}</span>}
      </div>
    </div>
  );
}
