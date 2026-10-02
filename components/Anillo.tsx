import { cx } from "@/lib/cliente";

/** Anillo de progreso Say-Do: ámbar bajo el umbral, esmeralda desde el umbral. */
export default function Anillo({
  valor,
  umbral = 75,
  tamano = 76,
  grosor = 7,
  etiqueta,
}: {
  valor: number | null;
  umbral?: number;
  tamano?: number;
  grosor?: number;
  etiqueta?: string;
}) {
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const v = valor ?? 0;
  const ok = valor !== null && valor >= umbral;
  const color = valor === null ? "#334155" : ok ? "var(--color-aether-success)" : "var(--color-aether-warning)";
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90" aria-hidden>
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="var(--color-aether-border)" strokeWidth={grosor} />
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(v, 100) / 100)}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(.2,.8,.2,1), stroke 300ms" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cx(
            "font-bold tabular-nums",
            tamano >= 70 ? "text-lg" : "text-sm",
            valor === null ? "text-slate-500" : ok ? "text-aether-success" : "text-aether-warning",
          )}
        >
          {valor === null ? "—" : `${valor}%`}
        </span>
        {etiqueta && <span className="text-[9px] uppercase tracking-wide text-slate-500">{etiqueta}</span>}
      </div>
    </div>
  );
}
