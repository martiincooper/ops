"use client";

import { Check } from "lucide-react";
import type { ProyectoActivo } from "@/lib/dominio";
import { cx } from "@/lib/cliente";

/** Selección de uno o más proyectos con chips. Nunca deja la selección vacía. */
export default function SelectorProyectos({
  proyectos,
  valor,
  onCambio,
  etiqueta,
}: {
  proyectos: ProyectoActivo[];
  valor: string[];
  onCambio: (ids: string[]) => void;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {proyectos.map((p) => {
        const on = valor.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            title={p.nombre}
            onClick={() => {
              if (on && valor.length === 1) return; // al menos uno
              onCambio(on ? valor.filter((x) => x !== p.id) : [...valor, p.id]);
            }}
            className={cx(
              "flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-xs font-semibold transition",
              on ? "bg-indigo text-white shadow-sm" : "bg-superficie text-tinta-2 ring-1 ring-linea hover:ring-indigo/40",
            )}
          >
            {on && <Check size={12} />}
            {p.codigo}
          </button>
        );
      })}
    </div>
  );
}

/** Códigos de proyecto como etiquetas pequeñas. */
export function CodigosProyecto({ codigos, className }: { codigos: string[]; className?: string }) {
  return (
    <span className={cx("inline-flex flex-wrap gap-1", className)}>
      {codigos.map((c) => (
        <span key={c} className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-tinta ring-1 ring-indigo/15">
          {c}
        </span>
      ))}
    </span>
  );
}
