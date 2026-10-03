import { ArrowLeft, CalendarOff, CircleCheck, Flame, KeyRound } from "lucide-react";
import Link from "next/link";
import Anillo from "@/components/Anillo";
import BotonSalir from "@/components/BotonSalir";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { ausenciasDesde, gastosRecientes } from "@/lib/dominio";
import { calcularProgreso, type DiaResumen } from "@/lib/metricas";
import { UMBRAL_RACHA, fechaCorta, fechaLocal, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function Dia({ d, hoy }: { d: DiaResumen; hoy: string }) {
  let detalle: string;
  let color = "text-slate-600";
  if (d.registro === "cerrado") {
    detalle = `${d.completadas}/${d.comprometidas} · ${d.inicio_local}–${d.cierre_local}`;
    color = "text-slate-400";
  } else if (d.registro === "abierto") {
    detalle = d.fecha === hoy ? `En curso desde las ${d.inicio_local}` : "Sin terminar";
    color = "text-aether-accent-soft";
  } else if (d.tipo === "ooo") detalle = "No disponible";
  else if (d.tipo === "feriado") detalle = "Feriado";
  else if (d.tipo === "fin_de_semana") detalle = "Fin de semana";
  else detalle = "Sin jornada";
  return (
    <li className="flex items-center justify-between py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-20 capitalize text-slate-300">{fechaCorta(d.fecha)}</span>
        <span className={color}>{detalle}</span>
      </div>
      <div className="flex items-center gap-2">
        {d.cuenta_racha && <Flame size={13} className="fill-aether-success text-aether-success" />}
        {d.saydo !== null && d.registro === "cerrado" && (
          <span className={d.saydo >= 75 ? "font-semibold text-aether-success" : "font-semibold text-aether-warning"}>
            {d.saydo}%
          </span>
        )}
      </div>
    </li>
  );
}

const ESTADO_GASTO = {
  pendiente: "text-aether-warning bg-aether-warning/10",
  aprobado: "text-aether-success bg-aether-success/10",
  rechazado: "text-aether-danger bg-aether-danger/10",
} as const;

export default async function MiProgreso() {
  const u = await requirePagina(["team"]);
  const empresa = empresaDe(u);
  const db = getDbEmpresa(empresa.clave);
  const hoy = hoyLocal();
  const p = calcularProgreso(db, u.id, hoy, fechaLocal(u.creado_en));
  const gastos = gastosRecientes(db, u.id, 15);
  const ausencias = ausenciasDesde(db, u.id, hoy);

  return (
    <main className="mx-auto min-h-dvh max-w-md border-x border-aether-border px-4 pb-16 pt-[env(safe-area-inset-top)]">
      <header className="mb-5 flex items-center justify-between border-b border-aether-border py-4">
        <Link href="/checkin" className="flex items-center gap-1.5 text-xs text-slate-400">
          <ArrowLeft size={14} /> Mi jornada
        </Link>
        <div className="text-center">
          <p className="text-sm font-bold text-white">Mi Progreso</p>
          <p className="text-[10px] uppercase tracking-wider text-aether-muted">{empresa.nombre}</p>
        </div>
        <BotonSalir conTexto={false} className="p-1.5" />
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3">
        <div className="tarjeta flex flex-col items-center justify-center p-4">
          <Flame size={26} className={p.racha > 0 ? "fill-aether-success text-aether-success" : "text-slate-600"} />
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{p.racha}</p>
          <p className="text-[11px] text-slate-400">{p.racha === 1 ? "jornada de racha" : "jornadas de racha"}</p>
        </div>
        <div className="tarjeta flex flex-col items-center justify-center p-4">
          <Anillo valor={p.saydo_14d} tamano={72} etiqueta="14 días" />
          <p className="mt-2 text-[11px] text-slate-400">
            {p.completadas_14d} de {p.comprometidas_14d} objetivos
          </p>
        </div>
      </section>

      <p className="mb-5 text-[11px] leading-relaxed text-slate-500">
        La racha suma cada jornada terminada con al menos {UMBRAL_RACHA}% de sus objetivos logrados. Los días sin jornada
        no la cortan; una jornada bajo {UMBRAL_RACHA}% la reinicia.
      </p>

      <section className="tarjeta mb-5 px-4 py-2">
        <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Últimos 14 días</h2>
        <ul className="divide-y divide-aether-border">
          {p.historial.map((d) => (
            <Dia key={d.fecha} d={d} hoy={hoy} />
          ))}
        </ul>
      </section>

      {ausencias.length > 0 && (
        <section className="tarjeta mb-5 px-4 py-3">
          <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <CalendarOff size={13} /> Próximos días no disponibles
          </h2>
          <ul className="divide-y divide-aether-border text-xs">
            {ausencias.map((a) => (
              <li key={a.id} className="flex justify-between py-2">
                <span className="capitalize text-slate-300">{a.fecha === hoy ? "Hoy" : fechaCorta(a.fecha)}</span>
                <span className="text-slate-500">{a.motivo ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta mb-5 px-4 py-3">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Mis compras</h2>
        {gastos.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">Aún no registras compras.</p>
        ) : (
          <ul className="divide-y divide-aether-border">
            {gastos.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{g.item}</p>
                  <p className="text-slate-500">
                    <span className="font-mono">{g.proyectos.join(" · ")}</span> · {fechaCorta(fechaLocal(g.creado_en))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-slate-200">{clp.format(g.monto_clp)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ESTADO_GASTO[g.estado]}`}>{g.estado}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/cambiar-pin" className="tarjeta flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-300">
        <KeyRound size={15} /> Cambiar mi código de acceso
      </Link>
      <p className="mt-6 flex items-center justify-center gap-1 text-[10px] text-slate-600">
        <CircleCheck size={11} /> {u.email}
      </p>
    </main>
  );
}
