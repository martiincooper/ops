"use client";

import { Avatar } from "@/components/ui";
import type { Capacidad as TCapacidad, EstadoCelda } from "@/lib/tableros";
import { cx } from "@/lib/cliente";
import { Cargando, Vacio, conEmpresa, diaCorto, useDatos, type Alcance } from "./comun";

const ESTILO: Record<EstadoCelda, string> = {
  disponible: "bg-pastel-menta",
  no_disponible: "bg-indigo text-white",
  fin_de_semana: "bg-suave",
  feriado: "bg-pastel-durazno",
};

const TITULO: Record<EstadoCelda, string> = {
  disponible: "Disponible",
  no_disponible: "No disponible",
  fin_de_semana: "Fin de semana",
  feriado: "Feriado",
};

export default function Capacidad({ empresa, alcance }: { empresa: string; alcance: Alcance }) {
  const { datos, error, cargando } = useDatos<TCapacidad>(conEmpresa("/api/admin/capacidad", empresa, { alcance }));

  return (
    <div>
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && datos.filas.length === 0 && <Vacio>{alcance === "mios" ? "No supervisas a nadie en esta empresa." : "Sin integrantes activos."}</Vacio>}
      {datos && datos.filas.length > 0 && (
        <>
          <div className="tarjeta overflow-x-auto p-2">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-superficie px-3 py-2 text-left font-medium text-tinta-3">Persona</th>
                  {datos.dias.map((d) => {
                    const c = diaCorto(d.fecha);
                    return (
                      <th key={d.fecha} className={cx("px-1 py-2 text-center font-medium", d.laboral ? "text-tinta-2" : "text-tinta-3/60")}>
                        <span className="block text-[11px] capitalize">{c.dia}</span>
                        <span className="block text-base font-semibold">{c.num}</span>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right font-medium text-tinta-3">Días disp.</th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f) => (
                  <tr key={f.id}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-superficie px-3 py-1.5">
                      <span className="flex items-center gap-2 font-semibold text-tinta">
                        <Avatar nombre={f.nombre} tamano={32} /> {f.nombre}
                      </span>
                    </td>
                    {f.celdas.map((c) => (
                      <td key={c.fecha} className="p-0">
                        <div
                          title={`${TITULO[c.estado]}${c.detalle ? ` · ${c.detalle}` : ""}`}
                          className={cx("flex h-10 min-w-10 items-center justify-center rounded-xl text-[11px] font-semibold", ESTILO[c.estado])}
                        >
                          {c.estado === "no_disponible" ? "N/D" : ""}
                        </div>
                      </td>
                    ))}
                    <td className="px-3 text-right text-base font-semibold text-tinta">{f.dias_disponibles}</td>
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-10 bg-superficie px-3 py-2.5 text-xs font-semibold uppercase text-tinta-3">Disponibles</td>
                  {datos.dias.map((d) => (
                    <td
                      key={d.fecha}
                      className={cx(
                        "py-2 text-center font-semibold",
                        !d.laboral ? "text-tinta-3/50" : d.disponibles < d.personas ? "text-alerta-tinta" : "text-ok-tinta",
                      )}
                    >
                      {d.laboral ? d.disponibles : "·"}
                    </td>
                  ))}
                  <td className="px-3 text-right text-base font-bold text-tinta">{datos.filas.reduce((s, f) => s + f.dias_disponibles, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-tinta-2">
            {(["disponible", "no_disponible", "feriado", "fin_de_semana"] as EstadoCelda[]).map((e) => (
              <span key={e} className="flex items-center gap-2">
                <span className={cx("h-4 w-4 rounded-md ring-1 ring-tinta/10", ESTILO[e])} /> {TITULO[e]}
              </span>
            ))}
            <span className="ml-auto text-tinta-3">Días que cada persona marcó como no disponible. Sin horario: se planifica por días.</span>
          </div>
        </>
      )}
    </div>
  );
}
