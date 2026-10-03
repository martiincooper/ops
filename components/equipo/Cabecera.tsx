"use client";

import { Flame, Plane, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { EstadoDia } from "@/lib/dominio";
import { cx } from "@/lib/cliente";

export default function Cabecera({
  estado,
  nombre,
  onOoo,
  compacta,
}: {
  estado: EstadoDia;
  nombre: string;
  onOoo: () => void;
  compacta?: boolean;
}) {
  return (
    <header className={cx("flex items-center justify-between border-b border-aether-border", compacta ? "mb-4 py-3" : "mb-5 py-4")}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aether-muted">{estado.empresa.nombre}</p>
        <p className="text-base font-bold text-white">Hola, {nombre.split(" ")[0]}</p>
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-label={`Racha activa: ${estado.racha} días`}
          className={cx(
            "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
            estado.racha > 0 ? "border-aether-success/30 bg-aether-success/10 text-aether-success" : "border-aether-border text-slate-400",
          )}
        >
          <Flame size={14} className={estado.racha > 0 ? "fill-aether-success" : ""} />
          {estado.racha}
        </span>
        <button
          type="button"
          onClick={onOoo}
          className="flex items-center gap-1 rounded-full border border-aether-accent/30 bg-aether-accent/10 px-2.5 py-1 text-xs font-semibold text-aether-accent-soft active:scale-95"
        >
          <Plane size={14} /> OOO
        </button>
        <Link href="/mi-progreso" aria-label="Historial completo" className="rounded-full p-1.5 text-slate-400 hover:bg-white/5">
          <TrendingUp size={18} />
        </Link>
      </div>
    </header>
  );
}
