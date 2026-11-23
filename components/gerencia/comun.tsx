// Piezas compartidas del portal gerencial (portal, sala y panel del administrador).
import { MessagesSquare, CircleCheck, CircleDot, CircleSlash, Clock, LayoutDashboard, Wrench } from "lucide-react";
import Link from "next/link";
import BotonSalir from "@/components/BotonSalir";
import Marca from "@/components/Marca";
import { Avatar } from "@/components/ui";
import { type EstadoVisible, NOMBRE_ESTADO } from "@/lib/chat/seguimiento";
import { cx } from "@/lib/cliente";
import BotonAccesoAdmin from "./BotonAccesoAdmin";

export function IconoModulo({ color, tamano = 22, className }: { clave?: string; color: string; tamano?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("flex shrink-0 items-center justify-center rounded-2xl", className)}
      style={{ background: `#${color}1a`, color: `#${color}`, width: tamano * 2, height: tamano * 2 }}
    >
      <MessagesSquare size={tamano} />
    </span>
  );
}

const ESTADO_ISSUE: Record<EstadoVisible, { clase: string; Icono: typeof Clock }> = {
  pendiente: { clase: "bg-alerta-fondo text-alerta-tinta", Icono: Clock },
  abierto: { clase: "bg-indigo-suave text-indigo-tinta", Icono: CircleDot },
  en_curso: { clase: "bg-pastel-azul text-[#1d5f99]", Icono: Wrench },
  cerrado: { clase: "bg-ok-fondo text-ok-tinta", Icono: CircleCheck },
  descartado: { clase: "bg-suave text-tinta-2", Icono: CircleSlash },
};

/** Estado del requerimiento en GitHub (ícono y texto, nunca solo color). */
export function ChipEstadoIssue({ estado }: { estado: EstadoVisible }) {
  const { clase, Icono } = ESTADO_ISSUE[estado];
  return (
    <span className={cx("chip whitespace-nowrap", clase)}>
      <Icono size={12} aria-hidden /> {NOMBRE_ESTADO[estado]}
    </span>
  );
}

/**
 * Panel de inicio de quien usa el portal: la gerencia vuelve a su tablero (/exec);
 * un administrador vuelve a la jefatura (/admin). Igual que inicioPorRol en lib/jwt.
 */
export function panelDeInicio(esAdmin: boolean): string {
  return esAdmin ? "/admin" : "/exec";
}

/** Botón visible «Mi panel»: vuelve al tablero principal desde el portal o una sala. */
export function BotonMiPanel({ esAdmin, className }: { esAdmin: boolean; className?: string }) {
  return (
    <Link href={panelDeInicio(esAdmin)} title="Volver a mi panel" aria-label="Volver a mi panel" className={cx("boton-suave bg-superficie", className)}>
      <LayoutDashboard size={16} aria-hidden /> <span>Mi panel</span>
    </Link>
  );
}

/** Cabecera del portal gerencial, con «Mi panel» y «Acceso Administrador». */
export function CabeceraPortal({
  nombre,
  subtitulo,
  esAdmin,
  volver,
}: {
  nombre: string;
  subtitulo: string;
  esAdmin: boolean;
  volver?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-linea/70 bg-fondo/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-8">
        {volver ?? (
          <Link href={panelDeInicio(esAdmin)} aria-label="Volver a mi panel" title="Volver a mi panel">
            <Marca conTexto={false} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-tinta">Portal gerencial DataSheq</p>
          <p className="truncate text-xs text-tinta-3">{subtitulo}</p>
        </div>
        <BotonMiPanel esAdmin={esAdmin} />
        <BotonAccesoAdmin esAdmin={esAdmin} />
        <BotonSalir conTexto={false} className="bg-superficie" />
        <span className="hidden sm:block">
          <Avatar nombre={nombre} tamano={40} />
        </span>
      </div>
    </header>
  );
}
