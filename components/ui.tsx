// Piezas visuales compartidas (sin estado): avatar con iniciales, insignias de estado, tonos pastel.
import { AlertTriangle, CircleCheck, CircleX, Minus } from "lucide-react";
import { cx } from "@/lib/cliente";

const AVATAR = [
  "bg-pastel-azul text-[#1d5f99]",
  "bg-pastel-lila text-indigo-tinta",
  "bg-pastel-durazno text-[#8a4b0b]",
  "bg-pastel-rosa text-[#9b2550]",
  "bg-pastel-menta text-[#14684a]",
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/** Avatar con iniciales y un tono pastel estable por nombre. */
export function Avatar({ nombre, tamano = 40, className }: { nombre: string; tamano?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white", AVATAR[hash(nombre) % AVATAR.length], className)}
      style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.36) }}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Fondo pastel para tarjetas de una lista (rota por posición, como las tarjetas de tareas). */
export const PASTELES = ["bg-pastel-azul", "bg-pastel-lila", "bg-pastel-durazno", "bg-pastel-rosa", "bg-pastel-menta"];

export type Tono = "ok" | "alerta" | "error" | "neutro" | "indigo";

const TONO: Record<Tono, string> = {
  ok: "bg-ok-fondo text-ok-tinta",
  alerta: "bg-alerta-fondo text-alerta-tinta",
  error: "bg-error-fondo text-error-tinta",
  neutro: "bg-suave text-tinta-2",
  indigo: "bg-indigo-suave text-indigo-tinta",
};

/** Insignia de texto; con `icono` muestra el ícono del estado (nunca solo color). */
export function Insignia({ tono, children, icono, className }: { tono: Tono; children: React.ReactNode; icono?: boolean; className?: string }) {
  const Icono = tono === "ok" ? CircleCheck : tono === "alerta" ? AlertTriangle : tono === "error" ? CircleX : Minus;
  return (
    <span className={cx("chip", TONO[tono], className)}>
      {icono && <Icono size={13} aria-hidden />}
      {children}
    </span>
  );
}
