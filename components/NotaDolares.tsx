// Nota de una compra con montos ingresados en dólares: los valores en US$ y el dólar con que se convirtieron a pesos.
// Los montos que se muestran siempre son en pesos; esta nota solo explica de dónde salieron.
import { DollarSign } from "lucide-react";
import { cx, dia, tasa, usd } from "@/lib/cliente";

interface ConDolares {
  monto_usd: number | null;
  envio_usd: number | null;
  impuesto_usd: number | null;
  tipo_cambio: number | null;
  tipo_cambio_fecha: string | null;
}

export default function NotaDolares({ g, className }: { g: ConDolares; className?: string }) {
  const partes = [
    g.monto_usd !== null && `compra ${usd(g.monto_usd)}`,
    g.envio_usd !== null && `envío ${usd(g.envio_usd)}`,
    g.impuesto_usd !== null && `impuesto ${usd(g.impuesto_usd)}`,
  ].filter(Boolean);
  if (!partes.length || !g.tipo_cambio) return null;
  return (
    <span className={cx("flex items-start gap-1 text-[11px] leading-snug text-tinta-3", className)}>
      <DollarSign size={11} className="mt-px shrink-0" aria-hidden />
      <span>
        En dólares: {partes.join(" · ")}. Dólar {tasa(g.tipo_cambio)}
        {g.tipo_cambio_fecha && ` (${dia(g.tipo_cambio_fecha)})`}
      </span>
    </span>
  );
}
