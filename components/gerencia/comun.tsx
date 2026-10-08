// Piezas compartidas del portal gerencial (portal, sala y panel del administrador).
import { FileCheck, Footprints, GraduationCap, IdCard, Scale, ShieldAlert, Siren } from "lucide-react";
import Link from "next/link";
import BotonSalir from "@/components/BotonSalir";
import Marca from "@/components/Marca";
import { Avatar } from "@/components/ui";
import type { ClaveModulo } from "@/lib/chat/modulos";
import { cx } from "@/lib/cliente";
import BotonAccesoAdmin from "./BotonAccesoAdmin";

export const ICONO_MODULO: Record<ClaveModulo, typeof Scale> = {
  "c-legal": Scale,
  "c-controla": FileCheck,
  "c-previene": ShieldAlert,
  "c-lidera": Footprints,
  "c-acredita": IdCard,
  "c-capacita": GraduationCap,
  "c-investiga": Siren,
};

export function IconoModulo({ clave, color, tamano = 22, className }: { clave: ClaveModulo; color: string; tamano?: number; className?: string }) {
  const Icono = ICONO_MODULO[clave];
  return (
    <span
      aria-hidden
      className={cx("flex shrink-0 items-center justify-center rounded-2xl", className)}
      style={{ background: `#${color}1a`, color: `#${color}`, width: tamano * 2, height: tamano * 2 }}
    >
      <Icono size={tamano} />
    </span>
  );
}

/** Cabecera del portal gerencial, con «Acceso Administrador». */
export function CabeceraPortal({
  nombre,
  subtitulo,
  esAdmin,
  enSala = false,
  volver,
}: {
  nombre: string;
  subtitulo: string;
  esAdmin: boolean;
  /** Hay una conversación activa en esta página (para confirmar antes de cerrar sesión). */
  enSala?: boolean;
  volver?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-linea/70 bg-fondo/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 lg:px-8">
        {volver ?? (
          <Link href="/gerencia" aria-label="Portal gerencial">
            <Marca conTexto={false} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-tinta">Portal gerencial DataSheq</p>
          <p className="truncate text-xs text-tinta-3">{subtitulo}</p>
        </div>
        <BotonAccesoAdmin esAdmin={esAdmin} enSala={enSala} />
        <BotonSalir conTexto={false} className="bg-superficie" />
        <span className="hidden sm:block">
          <Avatar nombre={nombre} tamano={40} />
        </span>
      </div>
    </header>
  );
}
