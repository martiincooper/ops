"use client";

import {
  Building2,
  CalendarRange,
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
import { cx } from "@/lib/cliente";
import Administradores from "./Administradores";
import Capacidad from "./Capacidad";
import Compras from "./Compras";
import Equipo from "./Equipo";
import Proyectos from "./Proyectos";
import Standup from "./Standup";
import type { Alcance, EmpresaPublica, Yo } from "./comun";

export type Vista = "standup" | "capacidad" | "compras" | "equipo" | "proyectos" | "admins";

const VISTAS: { clave: Vista; titulo: string; icono: typeof Users; conAlcance?: boolean }[] = [
  { clave: "standup", titulo: "Standup", icono: LayoutList, conAlcance: true },
  { clave: "capacidad", titulo: "Capacidad 14 días", icono: CalendarRange, conAlcance: true },
  { clave: "compras", titulo: "Compras", icono: Receipt, conAlcance: true },
  { clave: "equipo", titulo: "Equipo", icono: Users },
  { clave: "proyectos", titulo: "Proyectos", icono: FolderKanban },
  { clave: "admins", titulo: "Administradores", icono: ShieldCheck },
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
      <header className="border-b border-aether-border bg-aether-card/60">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aether-muted">Aether Ops · Jefatura</p>
            <p className="text-base font-bold text-white">Centro de control</p>
          </div>

          <div role="tablist" aria-label="Empresa" className="flex items-center gap-1 rounded-xl border border-aether-border bg-aether-bg p-1">
            <Building2 size={14} className="mx-1.5 text-slate-500" />
            {empresas.map((e) => (
              <button
                key={e.clave}
                role="tab"
                aria-selected={e.clave === empresa}
                onClick={() => setEmpresa(e.clave)}
                className={cx(
                  "rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors",
                  e.clave === empresa ? "bg-aether-accent text-white" : "text-slate-400 hover:text-white",
                )}
              >
                {e.nombre}
              </button>
            ))}
          </div>

          <nav className="ml-auto flex items-center gap-5 text-xs">
            <Link href={`/exec?empresa=${empresa}`} className="flex items-center gap-1 text-slate-400 hover:text-white">
              <TrendingUp size={13} /> Vista gerencia
            </Link>
            <Link href="/cambiar-pin" className="flex items-center gap-1 text-slate-400 hover:text-white">
              <KeyRound size={13} /> Mi código
            </Link>
            <span className="text-slate-500">{yo.nombre}</span>
            <BotonSalir />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-5 flex items-center gap-1 border-b border-aether-border">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              onClick={() => setVista(v.clave)}
              className={cx(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold",
                vista === v.clave ? "border-aether-accent-soft text-white" : "border-transparent text-slate-400 hover:text-slate-200",
              )}
            >
              <v.icono size={14} /> {v.titulo}
            </button>
          ))}
          {actual.conAlcance && (
            <div className="ml-auto mb-1.5 flex items-center gap-1 rounded-lg border border-aether-border p-0.5 text-[11px]">
              {(["mios", "todos"] as Alcance[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAlcance(a)}
                  className={cx("rounded-md px-2.5 py-1 font-semibold", alcance === a ? "bg-white/10 text-white" : "text-slate-400")}
                >
                  {a === "mios" ? "Mis supervisados" : "Todo el equipo"}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mb-4 text-[11px] uppercase tracking-wider text-slate-500">
          {vista === "admins" ? "Todas las empresas" : `${emp.nombre} · ${emp.dominios.map((d) => "@" + d).join(", ")}`}
        </p>

        {vista === "standup" && <Standup key={empresa} empresa={empresa} alcance={alcance} />}
        {vista === "capacidad" && <Capacidad key={empresa} empresa={empresa} alcance={alcance} />}
        {vista === "compras" && <Compras key={empresa} empresa={empresa} alcance={alcance} />}
        {vista === "equipo" && <Equipo key={empresa} empresa={emp} yo={yo} />}
        {vista === "proyectos" && <Proyectos key={empresa} empresa={emp} hoy={hoy} />}
        {vista === "admins" && <Administradores yo={yo} />}
      </main>
    </div>
  );
}
