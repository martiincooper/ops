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
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
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
              "flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors",
              on
                ? "border-aether-accent bg-aether-accent/20 text-aether-accent-soft"
                : "border-aether-border text-slate-400 hover:text-slate-200",
            )}
          >
            {on && <Check size={11} />}
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
        <span key={c} className="rounded bg-aether-border px-1.5 py-0.5 font-mono text-[10px] font-semibold text-aether-accent-soft">
          {c}
        </span>
      ))}
    </span>
  );
}
