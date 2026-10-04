"use client";

import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Fragment, useState } from "react";
import { Avatar, Insignia, type Tono } from "@/components/ui";
import type { FilaGasto } from "@/lib/tableros";
import { api, clp, cx } from "@/lib/cliente";
import { Aviso, Cargando, Vacio, conEmpresa, fechaHora, useAccion, useDatos, type Alcance } from "./comun";

const ESTADO: Record<FilaGasto["estado"], Tono> = { pendiente: "alerta", aprobado: "ok", rechazado: "error" };

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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="segmentos bg-superficie shadow-tarjeta">
          {(["pendiente", "todos"] as const).map((e) => (
            <button key={e} onClick={() => setEstado(e)} className={cx("segmento", estado === e && "segmento-activo bg-indigo-suave text-indigo-tinta")}>
              {e === "pendiente" ? "Por validar" : "Todas"}
            </button>
          ))}
        </div>
        <span className="ml-auto rounded-full bg-superficie px-4 py-2 text-sm text-tinta-2 shadow-tarjeta">
          {gastos.length} compra(s) · <b className="font-semibold text-tinta">{clp(total)}</b>
        </span>
      </div>
      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && gastos.length === 0 && <Vacio>{estado === "pendiente" ? "No hay compras por validar." : "Sin compras registradas."}</Vacio>}
      {gastos.length > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Compra</th>
                <th>Proyecto(s)</th>
                <th className="text-right">Monto (CLP)</th>
                <th>Estado</th>
                <th className="text-right">Validar</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <Fragment key={g.id}>
                  <tr>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar nombre={g.persona} tamano={34} />
                        <span>
                          <span className="block font-semibold text-tinta">{g.persona}</span>
                          <span className="block text-xs text-tinta-3">
                            {fechaHora(g.creado_en)}
                            {g.heredado && <span className="ml-1.5 rounded-full bg-suave px-2 py-0.5 font-medium text-tinta-2" title="Registrada por una persona eliminada; quedó a nombre de este administrador">heredada</span>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="max-w-72">
                      <p className="font-medium text-tinta">{g.item}</p>
                      {g.descripcion && <p className="mt-0.5 text-xs leading-snug text-tinta-3">{g.descripcion}</p>}
                    </td>
                    <td>
                      {g.proyectos.map((p) => (
                        <p key={p.codigo} className="whitespace-nowrap" title={p.nombre}>
                          <span className="font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span>
                          {g.proyectos.length > 1 && <span className="text-xs text-tinta-3"> {clp(p.monto_clp)}</span>}
                        </p>
                      ))}
                    </td>
                    <td className="text-right">
                      <span className="block font-semibold tabular-nums text-tinta">{clp(g.monto_clp)}</span>
                      {g.envio_clp > 0 && <span className="block whitespace-nowrap text-xs tabular-nums text-tinta-3">incl. envío {clp(g.envio_clp)}</span>}
                    </td>
                    <td>
                      <Insignia tono={ESTADO[g.estado]}>{g.estado}</Insignia>
                      {g.validado_por_nombre && <span className="mt-1 block text-xs text-tinta-3">{g.validado_por_nombre}</span>}
                      {g.observacion && (
                        <span className="mt-0.5 block max-w-40 text-xs text-tinta-2" title={g.observacion}>
                          {g.observacion}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        {ocupado === g.id && <LoaderCircle size={16} className="mr-1 animate-spin text-tinta-3" />}
                        {g.estado !== "aprobado" && (
                          <button type="button" disabled={ocupado !== null} onClick={() => decidir(g, "aprobado")} className="inline-flex items-center gap-1 rounded-full bg-ok-fondo px-3 py-1.5 text-xs font-semibold text-ok-tinta hover:brightness-95 disabled:opacity-50">
                            <Check size={14} /> Aprobar
                          </button>
                        )}
                        {g.estado !== "rechazado" && (
                          <button type="button" disabled={ocupado !== null} onClick={() => setRechazando({ id: g.id, motivo: "" })} className="inline-flex items-center gap-1 rounded-full bg-error-fondo px-3 py-1.5 text-xs font-semibold text-error-tinta hover:brightness-95 disabled:opacity-50">
                            <X size={14} /> Rechazar
                          </button>
                        )}
                        {g.estado !== "pendiente" && (
                          <button type="button" title="Volver a pendiente" aria-label="Volver a pendiente" disabled={ocupado !== null} onClick={() => decidir(g, "pendiente")} className="rounded-full p-2 text-tinta-3 hover:bg-suave disabled:opacity-50">
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {rechazando?.id === g.id && (
                    <tr className="bg-pastel-rosa/60">
                      <td colSpan={6}>
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            decidir(g, "rechazado", rechazando.motivo);
                          }}
                        >
                          <label htmlFor={`m-${g.id}`} className="shrink-0 text-sm text-tinta-2">Motivo del rechazo</label>
                          <input
                            id={`m-${g.id}`}
                            autoFocus
                            required
                            maxLength={300}
                            value={rechazando.motivo}
                            onChange={(e) => setRechazando({ id: g.id, motivo: e.target.value })}
                            placeholder="Ej: no corresponde al proyecto"
                            className="campo min-w-60 flex-1 bg-superficie py-2 text-sm"
                          />
                          <button type="submit" disabled={ocupado !== null} className="rounded-full bg-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            Rechazar
                          </button>
                          <button type="button" onClick={() => setRechazando(null)} className="boton-texto">Cancelar</button>
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
