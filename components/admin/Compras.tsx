"use client";

import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Fragment, useState } from "react";
import type { FilaGasto } from "@/lib/tableros";
import { api, clp, cx } from "@/lib/cliente";
import { Aviso, Cargando, conEmpresa, fechaHora, useAccion, useDatos, type Alcance } from "./comun";

const ESTADO = {
  pendiente: "text-aether-warning bg-aether-warning/10",
  aprobado: "text-aether-success bg-aether-success/10",
  rechazado: "text-aether-danger bg-aether-danger/10",
} as const;

export default function Compras({ empresa, alcance }: { empresa: string; alcance: Alcance }) {
  const [estado, setEstado] = useState<"pendiente" | "todos">("pendiente");
  const { datos, error, cargando, recargar } = useDatos<{ gastos: FilaGasto[] }>(
    conEmpresa("/api/admin/gastos", empresa, { alcance, estado }),
  );
  const { ocupado, aviso, ejecutar } = useAccion();
  const [rechazando, setRechazando] = useState<{ id: string; motivo: string } | null>(null);
  const gastos = datos?.gastos ?? [];
  const total = gastos.reduce((s, g) => s + g.monto_clp, 0);

  const decidir = (g: FilaGasto, nuevo: "aprobado" | "rechazado" | "pendiente", observacion?: string) =>
    ejecutar(g.id, async () => {
      await api(conEmpresa(`/api/admin/gastos/${g.id}`, empresa), {
        method: "PATCH",
        json: { estado: nuevo, observacion: observacion?.trim() || null },
      });
      setRechazando(null);
      await recargar();
      return nuevo === "pendiente" ? `${g.item}: vuelve a pendiente.` : `${g.item}: ${nuevo}.`;
    });

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {(["pendiente", "todos"] as const).map((e) => (
          <button key={e} onClick={() => setEstado(e)} className={cx("rounded-lg px-3 py-1.5 text-xs font-semibold", estado === e ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5")}>
            {e === "pendiente" ? "Por validar" : "Todas"}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">
          {gastos.length} compra(s) · {clp(total)}
        </span>
      </div>
      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && gastos.length === 0 && (
        <p className="tarjeta px-4 py-6 text-center text-xs text-slate-500">{estado === "pendiente" ? "No hay compras por validar." : "Sin compras registradas."}</p>
      )}
      {gastos.length > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-aether-border text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Persona</th>
                <th className="px-3 py-3 font-medium">Compra</th>
                <th className="px-3 py-3 font-medium">Proyecto(s)</th>
                <th className="px-3 py-3 text-right font-medium">Monto</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-3 py-3 text-right font-medium">Validar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-aether-border">
              {gastos.map((g) => (
                <Fragment key={g.id}>
                  <tr>
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-semibold text-white">{g.persona}</p>
                      <p className="text-[10px] text-slate-500">{fechaHora(g.creado_en)}</p>
                    </td>
                    <td className="max-w-72 px-3 py-2.5 align-top">
                      <p className="text-slate-100">{g.item}</p>
                      {g.descripcion && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{g.descripcion}</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {g.proyectos.map((p) => (
                        <p key={p.codigo} className="whitespace-nowrap" title={p.nombre}>
                          <span className="font-mono text-[11px] text-aether-accent-soft">{p.codigo}</span>
                          {g.proyectos.length > 1 && <span className="text-[10px] tabular-nums text-slate-500"> {clp(p.monto_clp)}</span>}
                        </p>
                      ))}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums text-white">{clp(g.monto_clp)}</td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold", ESTADO[g.estado])}>{g.estado}</span>
                      {g.validado_por_nombre && <span className="mt-1 block text-[10px] text-slate-500">{g.validado_por_nombre}</span>}
                      {g.observacion && <span className="mt-0.5 block max-w-40 text-[10px] text-slate-400" title={g.observacion}>{g.observacion}</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center justify-end gap-1">
                        {ocupado === g.id && <LoaderCircle size={14} className="mr-1 animate-spin text-slate-400" />}
                        {g.estado !== "aprobado" && (
                          <button type="button" disabled={ocupado !== null} onClick={() => decidir(g, "aprobado")} className="flex items-center gap-1 rounded-md bg-aether-success/15 px-2 py-1 font-semibold text-aether-success hover:bg-aether-success/25 disabled:opacity-50">
                            <Check size={13} /> Aprobar
                          </button>
                        )}
                        {g.estado !== "rechazado" && (
                          <button type="button" disabled={ocupado !== null} onClick={() => setRechazando({ id: g.id, motivo: "" })} className="flex items-center gap-1 rounded-md bg-aether-danger/10 px-2 py-1 font-semibold text-aether-danger hover:bg-aether-danger/20 disabled:opacity-50">
                            <X size={13} /> Rechazar
                          </button>
                        )}
                        {g.estado !== "pendiente" && (
                          <button type="button" title="Volver a pendiente" disabled={ocupado !== null} onClick={() => decidir(g, "pendiente")} className="rounded-md px-1.5 py-1 text-slate-400 hover:bg-white/5 disabled:opacity-50">
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {rechazando?.id === g.id && (
                    <tr className="bg-aether-danger/5">
                      <td colSpan={6} className="px-3 py-2.5">
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            decidir(g, "rechazado", rechazando.motivo);
                          }}
                        >
                          <label htmlFor={`m-${g.id}`} className="shrink-0 text-[11px] text-slate-400">Motivo del rechazo</label>
                          <input
                            id={`m-${g.id}`}
                            autoFocus
                            required
                            maxLength={300}
                            value={rechazando.motivo}
                            onChange={(e) => setRechazando({ id: g.id, motivo: e.target.value })}
                            placeholder="Ej: no corresponde al proyecto"
                            className="campo flex-1 py-1.5 text-sm"
                          />
                          <button type="submit" disabled={ocupado !== null} className="rounded-md bg-aether-danger px-3 py-1.5 font-semibold text-white disabled:opacity-50">
                            Rechazar
                          </button>
                          <button type="button" onClick={() => setRechazando(null)} className="px-2 py-1.5 text-slate-400">Cancelar</button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
