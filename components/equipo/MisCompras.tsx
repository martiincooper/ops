"use client";

import { useRouter } from "next/navigation";
import type { GastoResumen, ProyectoActivo } from "@/lib/dominio";
import ListaCompras from "./ListaCompras";

/** «Mis compras» de Mi progreso (página de servidor): al editar una, recarga la página. */
export default function MisCompras({ gastos, proyectos }: { gastos: GastoResumen[]; proyectos: ProyectoActivo[] }) {
  const router = useRouter();
  return <ListaCompras gastos={gastos} proyectos={proyectos} conFecha onCambio={() => router.refresh()} />;
}
