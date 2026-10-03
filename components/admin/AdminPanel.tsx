"use client";

import {
  CalendarRange,
  ChevronRight,
  FolderKanban,
  KeyRound,
  LayoutList,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import BotonSalir from "@/components/BotonSalir";
import Marca from "@/components/Marca";
import { Avatar } from "@/components/ui";
import { cx } from "@/lib/cliente";
import Administradores from "./Administradores";
import Capacidad from "./Capacidad";
import Compras from "./Compras";
import Equipo from "./Equipo";
import Proyectos from "./Proyectos";
import Standup from "./Standup";
import type { Alcance, EmpresaPublica, Yo } from "./comun";

export type Vista = "standup" | "capacidad" | "compras" | "equipo" | "proyectos" | "admins";

const VISTAS: { clave: Vista; titulo: string; corto: string; icono: typeof Users; conAlcance?: boolean }[] = [
  { clave: "standup", titulo: "Standup", corto: "Standup", icono: LayoutList, conAlcance: true },
  { clave: "capacidad", titulo: "Disponibilidad 14 días", corto: "Agenda", icono: CalendarRange, conAlcance: true },
  { clave: "compras", titulo: "Compras", corto: "Compras", icono: Receipt, conAlcance: true },
  { clave: "equipo", titulo: "Equipo", corto: "Equipo", icono: Users },
  { clave: "proyectos", titulo: "Proyectos", corto: "Proyectos", icono: FolderKanban },
  { clave: "admins", titulo: "Administradores", corto: "Admins", icono: ShieldCheck },
];

export default function AdminPanel({
  yo,
  empresas,
  inicial,
  hoy,
}: {
  yo: Yo;
  empresas: EmpresaPublica[];
  inicial: { empresa: string; vista: Vista; alcance: Alcance };
  hoy: string;
}) {
  const [empresa, setEmpresa] = useState(inicial.empresa);
  const [vista, setVista] = useState<Vista>(inicial.vista);
  const [alcance, setAlcance] = useState<Alcance>(inicial.alcance);
  const emp = empresas.find((e) => e.clave === empresa) ?? empresas[0];
  const actual = VISTAS.find((v) => v.clave === vista)!;

  // Mantiene la selección en la URL (recargar o compartir el enlace conserva empresa, pestaña y alcance)
  useEffect(() => {
    const q = new URLSearchParams({ empresa, vista, alcance });
    window.history.replaceState(null, "", `/admin?${q.toString()}`);
  }, [empresa, vista, alcance]);

  return (
    <div className="min-h-dvh">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-24 flex-col items-center gap-1 bg-superficie py-5 shadow-tarjeta lg:flex">
        <Marca conTexto={false} className="mb-6" />
        <nav aria-label="Secciones" className="flex flex-col items-center gap-1">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              type="button"
              onClick={() => setVista(v.clave)}
              aria-current={vista === v.clave ? "page" : undefined}
              title={v.titulo}
              className={cx(
                "flex w-20 flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-semibold transition",
                vista === v.clave ? "bg-indigo-suave text-indigo-tinta" : "text-tinta-3 hover:bg-suave hover:text-tinta",
              )}
            >
              <v.icono size={20} /> {v.corto}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <Link href={`/exec?empresa=${empresa}`} title="Vista gerencia" aria-label="Vista gerencia" className="boton-icono">
            <TrendingUp size={18} />
          </Link>
          <Link href="/cambiar-pin" title="Mi código" aria-label="Mi código" className="boton-icono">
            <KeyRound size={18} />
          </Link>
          <BotonSalir conTexto={false} />
        </div>
      </aside>

      <div className="lg:pl-24">
        <header className="sticky top-0 z-30 border-b border-linea/70 bg-fondo/85 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
            <div className="lg:hidden">
              <Marca conTexto={false} />
            </div>
            <p className="hidden items-center gap-1.5 rounded-full bg-superficie px-4 py-2 text-sm shadow-tarjeta lg:flex">
              <span className="text-tinta-3">Jefatura</span>
              <ChevronRight size={14} className="text-tinta-3" />
              <span className="font-semibold text-tinta">{actual.titulo}</span>
            </p>

            <div role="tablist" aria-label="Empresa" className="segmentos order-last flex w-full bg-superficie shadow-tarjeta sm:order-none sm:inline-flex sm:w-auto">
              {empresas.map((e) => (
                <button
                  key={e.clave}
                  role="tab"
                  aria-selected={e.clave === empresa}
                  onClick={() => setEmpresa(e.clave)}
                  className={cx("segmento flex-1 sm:flex-none", e.clave === empresa && "bg-indigo text-white shadow-sm hover:text-white")}
                >
                  {e.nombre}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2 lg:hidden">
                <Link href={`/exec?empresa=${empresa}`} title="Vista gerencia" aria-label="Vista gerencia" className="boton-icono bg-superficie">
                  <TrendingUp size={18} />
                </Link>
                <Link href="/cambiar-pin" title="Mi código" aria-label="Mi código" className="boton-icono bg-superficie">
                  <KeyRound size={18} />
                </Link>
                <BotonSalir conTexto={false} className="bg-superficie" />
              </div>
              <span className="hidden items-center gap-2 rounded-full bg-superficie py-1 pl-1 pr-4 shadow-tarjeta sm:flex">
                <Avatar nombre={yo.nombre} tamano={34} />
                <span className="text-sm font-semibold text-tinta">{yo.nombre}</span>
              </span>
            </div>
          </div>

          {/* Secciones (móvil y tablet) */}
          <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto px-4 pb-3 lg:hidden">
            {VISTAS.map((v) => (
              <button
                key={v.clave}
                type="button"
                onClick={() => setVista(v.clave)}
                aria-current={vista === v.clave ? "page" : undefined}
                className={cx(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold",
                  vista === v.clave ? "bg-indigo text-white" : "bg-superficie text-tinta-2",
                )}
              >
                <v.icono size={16} /> {v.titulo}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-tinta">{actual.titulo}</h1>
              <p className="mt-0.5 text-sm text-tinta-3">
                {vista === "admins" ? "Todas las empresas" : `${emp.nombre} · ${emp.dominios.map((d) => "@" + d).join(", ")}`}
              </p>
            </div>
            {actual.conAlcance && (
              <div className="segmentos bg-superficie shadow-tarjeta" role="tablist" aria-label="Alcance">
                {(["mios", "todos"] as Alcance[]).map((a) => (
                  <button key={a} role="tab" aria-selected={alcance === a} onClick={() => setAlcance(a)} className={cx("segmento", alcance === a && "segmento-activo bg-indigo-suave text-indigo-tinta")}>
                    {a === "mios" ? "Mis supervisados" : "Todo el equipo"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {vista === "standup" && <Standup key={empresa} empresa={empresa} alcance={alcance} />}
          {vista === "capacidad" && <Capacidad key={empresa} empresa={empresa} alcance={alcance} />}
          {vista === "compras" && <Compras key={empresa} empresa={empresa} alcance={alcance} />}
          {vista === "equipo" && <Equipo key={empresa} empresa={emp} yo={yo} />}
          {vista === "proyectos" && <Proyectos key={empresa} empresa={emp} hoy={hoy} />}
          {vista === "admins" && <Administradores yo={yo} />}
        </main>
      </div>
    </div>
  );
}
