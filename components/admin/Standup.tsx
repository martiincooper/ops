"use client";

import { AlertTriangle, CalendarOff, CircleCheck, Circle, Flame, LifeBuoy, LoaderCircle } from "lucide-react";
import type { FilaStandup } from "@/lib/tableros";
import { api, cx } from "@/lib/cliente";
import { Aviso, Cargando, conEmpresa, diaCorto, useAccion, useDatos, type Alcance } from "./comun";

const COLOR_PRIORIDAD: Record<number, string> = {
  1: "bg-aether-danger",
  2: "bg-aether-warning",
  3: "bg-aether-accent-soft",
  4: "bg-slate-700",
};

function UltimaJornada({ f, hoy }: { f: FilaStandup; hoy: string }) {
  const u = f.ultima;
  if (!u) return <span className="text-slate-500">Aún sin jornadas</span>;
  const d = diaCorto(u.fecha);
  const cuando = u.fecha === hoy ? "hoy" : `${d.dia} ${d.num} ${d.mes}`;
  if (u.estado === "en_curso") {
    return (
      <span className="text-aether-accent-soft">
        Jornada en curso ({cuando}) · {u.completadas}/{u.comprometidas} logrados
      </span>
    );
  }
  return (
    <span className={u.saydo !== null && u.saydo >= 75 ? "text-aether-success" : "text-aether-warning"}>
      Última jornada {cuando} · {u.completadas}/{u.comprometidas} ({u.saydo ?? "—"}%)
    </span>
  );
}

export default function Standup({ empresa, alcance }: { empresa: string; alcance: Alcance }) {
  const { datos, error, cargando, recargar } = useDatos<{ filas: FilaStandup[]; hoy: string }>(
    conEmpresa("/api/admin/standup", empresa, { alcance }),
  );
  const { ocupado, aviso, ejecutar } = useAccion();
  const filas = datos?.filas ?? [];

  const resumen = {
    bloqueos: filas.filter((f) => f.bloqueos.length).length,
    bajo: filas.filter((f) => f.saydo_14d !== null && f.saydo_14d < 70).length,
    noDisponibles: filas.filter((f) => f.no_disponible_hoy).length,
    enCurso: filas.filter((f) => f.ultima?.estado === "en_curso").length,
  };

  return (
    <div>
      <div className="mb-5 grid grid-cols-4 gap-3">
        {[
          ["Con bloqueos", resumen.bloqueos, "text-aether-danger"],
          ["Say-Do 14 días < 70%", resumen.bajo, "text-aether-warning"],
          ["No disponibles hoy", resumen.noDisponibles, "text-aether-accent-soft"],
          ["Jornadas en curso", resumen.enCurso, "text-slate-300"],
        ].map(([t, n, c]) => (
          <div key={t as string} className="tarjeta px-4 py-3">
            <p className={cx("text-2xl font-bold tabular-nums", n ? (c as string) : "text-slate-600")}>{n as number}</p>
            <p className="text-[11px] text-slate-400">{t as string}</p>
          </div>
        ))}
      </div>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && filas.length === 0 && (
        <p className="tarjeta px-4 py-6 text-center text-xs text-slate-500">
          {alcance === "mios"
            ? "No supervisas a nadie en esta empresa. Cambia a «Todo el equipo» o asigna supervisión en Equipo."
            : "Esta empresa aún no tiene integrantes activos."}
        </p>
      )}

      <div className="space-y-3">
        {filas.map((f) => (
          <article key={f.id} className="tarjeta flex overflow-hidden">
            <span className={cx("w-1.5 shrink-0", COLOR_PRIORIDAD[f.prioridad])} aria-hidden />
            <div className="grid flex-1 grid-cols-[1.1fr_1.6fr_1fr] gap-5 p-4">
              <div>
                <p className="font-semibold text-white">{f.nombre}</p>
                <p className="text-[11px] text-slate-500">{f.email}</p>
                <p
                  className={cx(
                    "mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    f.prioridad === 1 && "bg-aether-danger/10 text-aether-danger",
                    f.prioridad === 2 && "bg-aether-warning/10 text-aether-warning",
                    f.prioridad === 3 && "bg-aether-accent/10 text-aether-accent-soft",
                    f.prioridad === 4 && "bg-white/5 text-slate-400",
                  )}
                >
                  {f.motivo}
                </p>
                <div className="mt-3 flex gap-4 text-[11px] text-slate-400">
                  <span>
                    Say-Do 14d{" "}
                    <b className={f.saydo_14d === null ? "text-slate-500" : f.saydo_14d >= 70 ? "text-aether-success" : "text-aether-warning"}>
                      {f.saydo_14d === null ? "—" : `${f.saydo_14d}%`}
                    </b>
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame size={12} className={f.racha ? "fill-aether-success text-aether-success" : "text-slate-600"} /> {f.racha}
                  </span>
                </div>
              </div>

              <div className="text-xs">
                <p className="mb-1.5 text-[11px]">
                  <UltimaJornada f={f} hoy={datos?.hoy ?? ""} />
                </p>
                {f.ultima && f.ultima.tareas.length > 0 && (
                  <ul className="space-y-1">
                    {f.ultima.tareas.map((t, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5">
                          {t.estado === "completado" ? (
                            <CircleCheck size={13} className="text-aether-success" />
                          ) : (
                            <Circle size={13} className="text-slate-500" />
                          )}
                        </span>
                        <span className="text-slate-300">
                          <span className="font-mono text-[10px] text-aether-accent-soft">{t.proyectos.join(" · ")}</span> {t.descripcion}
                          {t.motivo_pendiente && <span className="block text-[11px] text-aether-warning">↳ {t.motivo_pendiente}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {f.no_disponible_hoy && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-aether-accent-soft">
                    <CalendarOff size={12} /> No disponible hoy
                    {f.no_disponible_hoy.motivo && <span className="text-slate-500">· {f.no_disponible_hoy.motivo}</span>}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {f.bloqueos.length === 0 ? (
                  <p className="text-[11px] text-slate-600">Sin bloqueos</p>
                ) : (
                  f.bloqueos.map((b) => {
                    const d = diaCorto(b.fecha);
                    return (
                      <div key={b.bitacora_id} className="rounded-lg border border-aether-danger/25 bg-aether-danger/5 p-2.5">
                        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-aether-danger">
                          <LifeBuoy size={11} /> {d.dia} {d.num} {d.mes}
                        </p>
                        <p className="mt-1 text-xs text-slate-200">{b.texto}</p>
                        <button
                          type="button"
                          disabled={ocupado !== null}
                          onClick={() =>
                            ejecutar(b.bitacora_id, async () => {
                              await api(conEmpresa(`/api/admin/bloqueos/${b.bitacora_id}`, empresa), { method: "POST" });
                              await recargar();
                              return `Bloqueo de ${f.nombre} marcado como resuelto.`;
                            })
                          }
                          className="mt-2 flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          {ocupado === b.bitacora_id ? <LoaderCircle size={12} className="animate-spin" /> : <CircleCheck size={12} />}
                          Marcar resuelto
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {filas.some((f) => f.prioridad <= 2) && (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
          <AlertTriangle size={12} /> Orden: bloqueos sin resolver → Say-Do 14 días bajo 70% → no disponibles hoy → resto.
        </p>
      )}
    </div>
  );
}
