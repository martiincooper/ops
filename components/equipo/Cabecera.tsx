"use client";

import { CalendarOff, ChartNoAxesColumn } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import type { EstadoDia } from "@/lib/dominio";

export default function Cabecera({ estado, nombre, onNoDisponible }: { estado: EstadoDia; nombre: string; onNoDisponible: () => void }) {
  return (
    <header className="tarjeta mb-4 flex items-center gap-3 px-4 py-3">
      <Avatar nombre={nombre} tamano={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-tinta">Hola, {nombre.split(" ")[0]}</p>
        <p className="truncate text-xs text-tinta-3">{estado.empresa.nombre}</p>
      </div>
      <button type="button" onClick={onNoDisponible} aria-label="Días no disponibles" title="Días no disponibles" className="boton-icono">
        <CalendarOff size={20} />
      </button>
      <Link href="/mi-progreso" aria-label="Mi progreso" title="Mi progreso" className="boton-icono">
        <ChartNoAxesColumn size={20} />
      </Link>
    </header>
  );
}
