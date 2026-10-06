// Estado de pago de una compra (aparte de la validación): nombre, color e ícono. Sin "use client": la vista de
// gerencia (servidor) también usa el chip.
import { BadgeCheck, Hourglass, Send } from "lucide-react";
import { ESTADOS_PAGO, type EstadoPago } from "@/lib/esquemas";
import { cx } from "@/lib/cliente";

export const ESTADO_PAGO: Record<EstadoPago, { nombre: string; corto: string; ayuda: string; clase: string; Icono: typeof Send }> = {
  por_enviar: {
    nombre: "Por enviar a pago",
    corto: "Por enviar",
    ayuda: "Se enviará a procesar el pago más adelante",
    clase: "bg-pastel-lila text-indigo-tinta",
    Icono: Send,
  },
  esperando_pago: {
    nombre: "Esperando pago",
    corto: "Esperando pago",
    ayuda: "Ya se envió a pago; falta que se pague",
    clase: "bg-pastel-durazno text-alerta-tinta",
    Icono: Hourglass,
  },
  comprada: {
    nombre: "Comprada",
    corto: "Comprada",
    ayuda: "Ya está pagada",
    clase: "bg-pastel-menta text-ok-tinta",
    Icono: BadgeCheck,
  },
};

/** Chip del estado de pago (color + ícono + texto). */
export function ChipPago({ estado, corto = false, className }: { estado: EstadoPago; corto?: boolean; className?: string }) {
  const { nombre, clase, Icono } = ESTADO_PAGO[estado];
  return (
    <span className={cx("chip whitespace-nowrap", clase, className)} title={nombre}>
      <Icono size={12} aria-hidden /> {corto ? ESTADO_PAGO[estado].corto : nombre}
    </span>
  );
}

/** Selector del estado de pago (formulario de compra). */
export function SelectorPago({ id, valor, onCambio }: { id: string; valor: EstadoPago; onCambio: (e: EstadoPago) => void }) {
  return (
    <div>
      <span className="etiqueta" id={id}>Estado del pago</span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {ESTADOS_PAGO.map((e) => {
          const { nombre, ayuda, Icono } = ESTADO_PAGO[e];
          return (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={valor === e}
              title={ayuda}
              onClick={() => onCambio(e)}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                valor === e ? "bg-indigo text-white shadow-sm" : "bg-superficie text-tinta-2 ring-1 ring-linea hover:ring-indigo/40",
              )}
            >
              <Icono size={13} aria-hidden /> {nombre}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-tinta-3">{ESTADO_PAGO[valor].ayuda}.</p>
    </div>
  );
}
