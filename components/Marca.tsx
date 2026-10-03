import { cx } from "@/lib/cliente";

/** Marca de la aplicación: isotipo + nombre. */
export default function Marca({ className, conTexto = true }: { className?: string; conTexto?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo text-white shadow-boton">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l7.5 17h-3.2L12 10.2 7.7 20H4.5L12 3z" fill="currentColor" />
          <circle cx="12" cy="16.5" r="1.8" fill="currentColor" />
        </svg>
      </span>
      {conTexto && (
        <span className="leading-tight">
          <span className="block text-base font-bold text-tinta">Aether Ops</span>
          <span className="block text-xs text-tinta-3">Operaciones</span>
        </span>
      )}
    </span>
  );
}
