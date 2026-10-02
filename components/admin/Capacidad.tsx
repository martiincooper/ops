"use client";

import type { Capacidad as TCapacidad, EstadoCelda } from "@/lib/tableros";
import { cx } from "@/lib/cliente";
import { Cargando, conEmpresa, diaCorto, useDatos, type Alcance } from "./comun";

const ESTILO: Record<EstadoCelda, string> = {
  disponible: "bg-aether-success/25",
  parcial: "bg-aether-warning/30",
  ooo: "bg-aether-accent/45",
  fin_de_semana: "bg-white/[0.03]",
  feriado: "bg-white/[0.06]",
};

const TITULO: Record<EstadoCelda, string> = {
  disponible: "Disponible",
  parcial: "Ausencia parcial",
  ooo: "Fuera de oficina",
  fin_de_semana: "Fin de semana",
  feriado: "Feriado",
};

export default function Capacidad({ empresa, alcance }: { empresa: string; alcance: Alcance }) {
  const { datos, error, cargando } = useDatos<TCapacidad>(conEmpresa("/api/admin/capacidad", empresa, { alcance }));

  return (
    <div>
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && datos.filas.length === 0 && (
        <p className="tarjeta px-4 py-6 text-center text-xs text-slate-500">
          {alcance === "mios" ? "No supervisas a nadie en esta empresa." : "Sin integrantes activos."}
        </p>
      )}
      {datos && datos.filas.length > 0 && (
        <>
          <div className="tarjeta overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-aether-card px-4 py-3 text-left font-medium text-slate-500">Persona</th>
                  {datos.dias.map((d) => {
                    const c = diaCorto(d.fecha);
                    return (
                      <th key={d.fecha} className={cx("px-1 py-2 text-center font-medium", d.laboral ? "text-slate-300" : "text-slate-600")}>
                        <span className="block text-[10px] uppercase">{c.dia}</span>
                        <span className="block tabular-nums">{c.num}</span>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right font-medium text-slate-500">Días disp.</th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f) => (
                  <tr key={f.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap border-t border-aether-border bg-aether-card px-4 py-2 font-semibold text-white">
                      {f.nombre}
                    </td>
                    {f.celdas.map((c) => (
                      <td key={c.fecha} className="border-t border-aether-border p-1">
                        <div
                          title={`${TITULO[c.estado]}${c.detalle ? ` · ${c.detalle}` : ""}`}
                          className={cx("flex h-8 min-w-8 items-center justify-center rounded text-[10px] tabular-nums", ESTILO[c.estado])}
                        >
                          {c.estado === "parcial" ? `${Math.round(c.fraccion * 100)}%` : c.estado === "ooo" ? "OOO" : ""}
                        </div>
                      </td>
                    ))}
                    <td className="border-t border-aether-border px-3 text-right font-semibold tabular-nums text-slate-200">
                      {f.dias_disponibles}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-10 border-t border-aether-border bg-aether-card px-4 py-2.5 text-[11px] font-semibold uppercase text-slate-400">
                    Personas-día
                  </td>
                  {datos.dias.map((d) => (
                    <td
                      key={d.fecha}
                      className={cx(
                        "border-t border-aether-border py-2 text-center font-semibold tabular-nums",
                        !d.laboral ? "text-slate-700" : d.disponibles < d.personas ? "text-aether-warning" : "text-aether-success",
                      )}
                    >
                      {d.laboral ? d.disponibles : "·"}
                    </td>
                  ))}
                  <td className="border-t border-aether-border px-3 text-right font-bold tabular-nums text-white">
                    {Math.round(datos.filas.reduce((s, f) => s + f.dias_disponibles, 0) * 10) / 10}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            {(["disponible", "parcial", "ooo", "feriado"] as EstadoCelda[]).map((e) => (
              <span key={e} className="flex items-center gap-1.5">
                <span className={cx("h-3 w-3 rounded", ESTILO[e])} /> {TITULO[e]}
              </span>
            ))}
            <span className="ml-auto">
              Jornada base {datos.jornada.inicio}–{datos.jornada.fin}: una ausencia parcial descuenta la fracción que cae en ese horario.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
