import { ArrowLeft, CircleCheck, FileText, Flame, KeyRound, Plane } from "lucide-react";
import Link from "next/link";
import Anillo from "@/components/Anillo";
import BotonSalir from "@/components/BotonSalir";
import { requirePagina } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ausenciasDesde, gastosRecientes } from "@/lib/dominio";
import { calcularProgreso, type DiaResumen } from "@/lib/metricas";
import { fechaCorta, fechaLocal, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function Dia({ d }: { d: DiaResumen }) {
  let detalle: string;
  let color = "text-slate-500";
  if (d.tipo === "fin_de_semana") detalle = "Fin de semana";
  else if (d.tipo === "feriado") detalle = "Feriado";
  else if (d.tipo === "ooo") detalle = "Fuera de oficina";
  else if (d.registro === "sin_registro") {
    detalle = "Sin registro";
    color = "text-aether-danger";
  } else if (d.registro === "abierto") {
    detalle = "Sin cerrar";
    color = "text-aether-warning";
  } else {
    detalle = `${d.completadas}/${d.comprometidas} · cierre ${d.cierre_local}`;
    color = "text-slate-400";
  }
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
  const u = await requirePagina(["team", "admin"]);
  const db = getDb();
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
        <p className="text-sm font-bold text-white">Mi Progreso</p>
        <BotonSalir conTexto={false} className="p-1.5" />
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3">
        <div className="tarjeta flex flex-col items-center justify-center p-4">
          <Flame size={26} className={p.racha > 0 ? "fill-aether-success text-aether-success" : "text-slate-600"} />
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{p.racha}</p>
          <p className="text-[11px] text-slate-400">{p.racha === 1 ? "día de racha" : "días de racha"}</p>
        </div>
        <div className="tarjeta flex flex-col items-center justify-center p-4">
          <Anillo valor={p.saydo_14d} tamano={72} etiqueta="14 días" />
          <p className="mt-2 text-[11px] text-slate-400">
            {p.completadas_14d} de {p.comprometidas_14d} objetivos
          </p>
        </div>
      </section>

      <p className="mb-5 text-[11px] leading-relaxed text-slate-500">
        La racha suma cada día hábil cerrado antes de las 19:30 con al menos 75% de cumplimiento. Fines de semana,
        feriados y ausencias de día completo no la cortan.
        {p.dias_sin_registro_14d > 0 && (
          <span className="text-aether-warning"> {p.dias_sin_registro_14d} día(s) hábil(es) sin registro en las últimas 2 semanas.</span>
        )}
      </p>

      <section className="tarjeta mb-5 px-4 py-2">
        <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Últimos 14 días</h2>
        <ul className="divide-y divide-aether-border">
          {p.historial.map((d) => (
            <Dia key={d.fecha} d={d} />
          ))}
        </ul>
      </section>

      {ausencias.length > 0 && (
        <section className="tarjeta mb-5 px-4 py-3">
          <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Plane size={13} /> Próximas ausencias
          </h2>
          <ul className="divide-y divide-aether-border text-xs">
            {ausencias.map((a) => (
              <li key={a.id} className="flex justify-between py-2">
                <span className="capitalize text-slate-300">{a.fecha === hoy ? "Hoy" : fechaCorta(a.fecha)}</span>
                <span className="text-slate-400">{a.dia_completo ? "Día completo" : `${a.hora_inicio} – ${a.hora_fin}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta mb-5 px-4 py-3">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Mis compras rendidas</h2>
        {gastos.length === 0 ? (
          <p className="py-2 text-xs text-slate-500">Aún no has rendido compras.</p>
        ) : (
          <ul className="divide-y divide-aether-border">
            {gastos.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{g.item}</p>
                  <p className="text-slate-500">
                    <span className="font-mono">{g.proyecto_codigo}</span> · {fechaCorta(fechaLocal(g.creado_en))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-slate-200">{clp.format(g.monto_item_clp + g.monto_envio_clp)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ESTADO_GASTO[g.estado]}`}>{g.estado}</span>
                  <a href={`/api/comprobantes/${g.id}`} target="_blank" rel="noopener" aria-label="Ver comprobante" className="text-slate-400 hover:text-white">
                    <FileText size={15} />
                  </a>
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
