import { AlertTriangle, Building2, KeyRound, TrendingUp } from "lucide-react";
import Link from "next/link";
import Anillo from "@/components/Anillo";
import BotonSalir from "@/components/BotonSalir";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { EMPRESAS } from "@/lib/empresas";
import { metricasExec } from "@/lib/tableros";
import { fechaLarga, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const clp = (n: number) => fmt.format(n);
const compacto = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : clp(n);

// Serie única (validada contra la superficie oscura). Rojo solo para "sobre presupuesto", con texto.
const C_GASTO = "#6366F1";

function Tarjeta({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="tarjeta mb-4 p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{titulo}</h2>
      {children}
      {nota && <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{nota}</p>}
    </section>
  );
}

export default async function Exec({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const u = await requirePagina(["executive", "admin"]);
  const q = await searchParams;
  let empresa;
  try {
    empresa = empresaDe(u, q.empresa); // gerencia: siempre la propia; admin: la elegida
  } catch {
    empresa = empresaDe(u);
  }
  const hoy = hoyLocal();
  const m = metricasExec(getDbEmpresa(empresa.clave), hoy);

  return (
    <main className="mx-auto min-h-dvh max-w-md border-x border-aether-border px-4 pb-16 pt-[env(safe-area-inset-top)]">
      <header className="mb-4 flex items-center justify-between border-b border-aether-border py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aether-muted">{empresa.nombre}</p>
          <p className="text-base font-bold text-white">Gerencia General</p>
          <p className="text-[11px] text-slate-500">{fechaLarga(hoy)}</p>
        </div>
        <div className="flex items-center gap-3">
          {u.rol === "admin" && (
            <Link href={`/admin?empresa=${empresa.clave}`} className="text-xs text-slate-400 hover:text-white">Jefatura</Link>
          )}
          <Link href="/cambiar-pin" aria-label="Cambiar código" className="text-slate-400 hover:text-white">
            <KeyRound size={16} />
          </Link>
          <BotonSalir conTexto={false} />
        </div>
      </header>

      {u.rol === "admin" && (
        <nav aria-label="Empresa" className="mb-4 flex items-center gap-1 rounded-xl border border-aether-border bg-aether-card p-1">
          <Building2 size={14} className="mx-1.5 text-slate-500" />
          {EMPRESAS.map((e) => (
            <Link
              key={e.clave}
              href={`/exec?empresa=${e.clave}`}
              aria-current={e.clave === empresa.clave ? "page" : undefined}
              className={`flex-1 rounded-lg px-3 py-1.5 text-center text-xs font-bold ${
                e.clave === empresa.clave ? "bg-aether-accent text-white" : "text-slate-400"
              }`}
            >
              {e.nombre}
            </Link>
          ))}
        </nav>
      )}

      {/* Indicadores principales */}
      <section className="mb-4 grid grid-cols-2 gap-3">
        <div className="tarjeta flex flex-col items-center p-4">
          <Anillo valor={m.saydo.pct} tamano={76} umbral={75} etiqueta="14 días" />
          <p className="mt-2 text-center text-[11px] leading-tight text-slate-400">
            Say-Do global
            <br />
            <span className="text-slate-500">
              {m.saydo.completadas}/{m.saydo.comprometidas} objetivos · {m.saydo.personas} personas
            </span>
          </p>
        </div>
        <div className="grid gap-3">
          <div className="tarjeta px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Gasto real acumulado</p>
            <p className="text-lg font-bold tabular-nums text-white">{compacto(m.totales.total_clp)}</p>
          </div>
          <div className="tarjeta px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Por validar</p>
            <p className="text-lg font-bold tabular-nums text-white">{compacto(m.totales.por_validar_clp)}</p>
          </div>
        </div>
      </section>

      {/* Gasto por solución */}
      <Tarjeta
        titulo="Gasto por solución"
        nota={`Compras aprobadas y por validar (sin rechazadas), frente al presupuesto de cada proyecto. Una compra de varios proyectos se reparte en partes iguales.${
          m.totales.por_validar_clp ? ` Incluye ${clp(m.totales.por_validar_clp)} aún por validar.` : ""
        }`}
      >
        {m.proyectos.length === 0 && <p className="text-xs text-slate-500">Sin proyectos.</p>}
        <ul className="space-y-4">
          {m.proyectos.map((p) => {
            const pct = p.pct_presupuesto ?? 0;
            const sobre = p.pct_presupuesto !== null && p.pct_presupuesto > 100;
            return (
              <li key={p.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-200">
                    <span className="font-mono text-[10px] text-slate-400">{p.codigo}</span> {p.nombre}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-white">{clp(p.total_clp)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-aether-border" title={`${clp(p.total_clp)} de ${clp(p.presupuesto_clp)}`}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(pct, p.total_clp ? 1 : 0))}%`,
                      background: sobre ? "var(--color-aether-danger)" : C_GASTO,
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                  <span>
                    {p.compras} compra{p.compras === 1 ? "" : "s"}
                    {p.por_validar_clp > 0 && ` · ${clp(p.por_validar_clp)} por validar`}
                  </span>
                  <span className={sobre ? "flex items-center gap-1 font-semibold text-aether-danger" : ""}>
                    {sobre && <AlertTriangle size={11} />}
                    {p.pct_presupuesto === null
                      ? "sin presupuesto"
                      : `${p.pct_presupuesto === 0 && p.total_clp > 0 ? "<1" : p.pct_presupuesto}% de ${compacto(p.presupuesto_clp)}`}
                    {sobre && " · sobre presupuesto"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      {/* Velocidad NPI */}
      <Tarjeta titulo="Velocidad NPI (lead time)" nota="Días transcurridos desde el inicio frente a los días comprometidos hasta la fecha objetivo.">
        <ul className="space-y-4">
          {m.proyectos.map((p) => {
            const cerrado = p.estado === "entregado" || p.estado === "pausado";
            const atrasado = !cerrado && p.dias_restantes < 0;
            return (
              <li key={p.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-200">
                    <span className="font-mono text-[10px] text-slate-400">{p.codigo}</span> {p.nombre}
                  </span>
                  <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] capitalize text-slate-300">{p.estado}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-aether-border">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, p.pct_plazo)}%`,
                      background: atrasado ? "var(--color-aether-danger)" : cerrado ? "#475569" : C_GASTO,
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                  <span className="tabular-nums">
                    Día {p.dias_transcurridos} de {p.dias_comprometidos}
                  </span>
                  <span className={atrasado ? "flex items-center gap-1 font-semibold text-aether-danger" : "tabular-nums"}>
                    {atrasado && <AlertTriangle size={11} />}
                    {cerrado
                      ? `objetivo ${p.fecha_entrega_objetivo}`
                      : atrasado
                        ? `${-p.dias_restantes} días de atraso`
                        : `${p.dias_restantes} días restantes`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-600">
        <TrendingUp size={11} /> Datos de {empresa.nombre} · {m.personas_activas} integrantes activos
      </p>
    </main>
  );
}
