"use client";

import { AlertTriangle, CalendarOff, Check, LifeBuoy, LoaderCircle, PlayCircle, TrendingDown } from "lucide-react";
import { Avatar, Insignia, type Tono } from "@/components/ui";
import type { FilaStandup } from "@/lib/tableros";
import { api, cx } from "@/lib/cliente";
import { Aviso, Cargando, Vacio, conEmpresa, diaCorto, useAccion, useDatos, type Alcance } from "./comun";

const TONO_PRIORIDAD: Record<number, Tono> = { 1: "error", 2: "alerta", 3: "indigo", 4: "neutro" };

function UltimaJornada({ f, hoy }: { f: FilaStandup; hoy: string }) {
  const u = f.ultima;
  if (!u) return <span className="text-tinta-3">Aún sin jornadas</span>;
  const d = diaCorto(u.fecha);
  const cuando = u.fecha === hoy ? "hoy" : `${d.dia} ${d.num} ${d.mes}`;
  if (u.estado === "en_curso") {
    return (
      <span className="font-medium text-indigo-tinta">
        Jornada en curso ({cuando}) · {u.completadas}/{u.comprometidas} logrados
      </span>
    );
  }
  return (
    <span className="font-medium text-tinta-2">
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

  const resumen: [string, number, typeof LifeBuoy, string][] = [
    ["Con bloqueos", filas.filter((f) => f.bloqueos.length).length, LifeBuoy, "bg-pastel-rosa text-error-tinta"],
    ["Say-Do 14 días < 70%", filas.filter((f) => f.saydo_14d !== null && f.saydo_14d < 70).length, TrendingDown, "bg-pastel-durazno text-alerta-tinta"],
    ["No disponibles hoy", filas.filter((f) => f.no_disponible_hoy).length, CalendarOff, "bg-pastel-azul text-indigo-tinta"],
    ["Jornadas en curso", filas.filter((f) => f.ultima?.estado === "en_curso").length, PlayCircle, "bg-pastel-lila text-indigo-tinta"],
  ];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {resumen.map(([t, n, Icono, tono]) => (
          <div key={t} className="tarjeta flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12", tono)}>
              <Icono size={22} />
            </span>
            <div>
              <p className="text-3xl font-bold text-tinta">{n}</p>
              <p className="text-sm text-tinta-3">{t}</p>
            </div>
          </div>
        ))}
      </div>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && filas.length === 0 && (
        <Vacio>
          {alcance === "mios"
            ? "No supervisas a nadie en esta empresa. Cambia a «Todo el equipo» o asigna supervisión en Equipo."
            : "Esta empresa aún no tiene integrantes activos."}
        </Vacio>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {filas.map((f) => (
          <article key={f.id} className="tarjeta flex flex-col p-5">
            <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
              <Avatar nombre={f.nombre} tamano={46} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-tinta">{f.nombre}</p>
                <p className="truncate text-sm text-tinta-3">{f.email}</p>
              </div>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end sm:gap-1.5">
                <Insignia tono={TONO_PRIORIDAD[f.prioridad]} icono={f.prioridad <= 2}>
                  {f.motivo}
                </Insignia>
                <span className="text-xs text-tinta-3">
                  Say-Do 14d{" "}
                  <b className={cx("font-semibold", f.saydo_14d === null ? "text-tinta-3" : f.saydo_14d >= 70 ? "text-ok-tinta" : "text-alerta-tinta")}>
                    {f.saydo_14d === null ? "—" : `${f.saydo_14d}%`}
                  </b>
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-suave p-4 text-sm">
              <p className="mb-2">
                <UltimaJornada f={f} hoy={datos?.hoy ?? ""} />
              </p>
              {f.ultima && f.ultima.tareas.length > 0 && (
                <ul className="space-y-1.5">
                  {f.ultima.tareas.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className={cx(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          t.estado === "completado" ? "bg-tinta text-white" : "bg-superficie ring-2 ring-tinta/15",
                        )}
                      >
                        {t.estado === "completado" && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="text-tinta-2">
                        <span className="font-mono text-xs font-semibold text-indigo-tinta">{t.proyectos.join(" · ")}</span> {t.descripcion}
                        {t.motivo_pendiente && <span className="block text-xs text-alerta-tinta">↳ {t.motivo_pendiente}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {f.no_disponible_hoy && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-indigo-tinta">
                  <CalendarOff size={13} /> No disponible hoy
                  {f.no_disponible_hoy.motivo && <span className="text-tinta-3">· {f.no_disponible_hoy.motivo}</span>}
                </p>
              )}
            </div>

            {f.bloqueos.length > 0 && (
              <div className="mt-3 space-y-2">
                {f.bloqueos.map((b) => {
                  const d = diaCorto(b.fecha);
                  return (
                    <div key={b.bitacora_id} className="flex flex-wrap items-start gap-3 rounded-2xl bg-pastel-rosa p-4">
                      <LifeBuoy size={18} className="mt-0.5 shrink-0 text-error" />
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="text-xs font-semibold uppercase text-error-tinta">
                          Bloqueo · {d.dia} {d.num} {d.mes}
                        </p>
                        <p className="mt-0.5 text-sm text-tinta">{b.texto}</p>
                      </div>
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
                        className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta shadow-sm hover:bg-ok-fondo hover:text-ok-tinta disabled:opacity-50"
                      >
                        {ocupado === b.bitacora_id ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                        Marcar resuelto
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>
      {filas.some((f) => f.prioridad <= 2) && (
        <p className="mt-5 flex items-center gap-1.5 text-xs text-tinta-3">
          <AlertTriangle size={13} /> Orden: bloqueos sin resolver → Say-Do 14 días bajo 70% → no disponibles hoy → resto.
        </p>
      )}
    </div>
  );
}
