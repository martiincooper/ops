"use client";

import { Check, LoaderCircle, Pencil, Plus, Repeat, RotateCcw, X } from "lucide-react";
import { Fragment, useState } from "react";
import { ESTADO_PAGO, SelectPago } from "@/components/EstadoPago";
import FormGasto, { NOMBRE_TIPO_COSTO } from "@/components/FormGasto";
import NotaDolares from "@/components/NotaDolares";
import { Avatar, Insignia, type Tono } from "@/components/ui";
import type { ProyectoActivo } from "@/lib/dominio";
import { ESTADOS_PAGO, type EstadoPago } from "@/lib/esquemas";
import type { FilaGasto } from "@/lib/tableros";
import { api, clp, cx } from "@/lib/cliente";
import { Aviso, Cargando, Vacio, conEmpresa, fechaHora, useAccion, useDatos, type Alcance } from "./comun";

const ESTADO: Record<FilaGasto["estado"], Tono> = { pendiente: "alerta", aprobado: "ok", rechazado: "error" };

export default function Compras({ empresa, alcance }: { empresa: string; alcance: Alcance }) {
  const [estado, setEstado] = useState<"pendiente" | "todos">("pendiente");
  const [pago, setPago] = useState<EstadoPago | "todos">("todos");
  const { datos, error, cargando, recargar } = useDatos<{ gastos: FilaGasto[] }>(
    conEmpresa("/api/admin/gastos", empresa, { alcance, estado, ...(pago === "todos" ? {} : { pago }) }),
  );
  const { ocupado, aviso, setAviso, ejecutar } = useAccion();
  // Proyectos activos (para registrar o editar costos desde aquí)
  const { datos: datosProyectos } = useDatos<{ proyectos: (ProyectoActivo & { estado: string })[] }>(conEmpresa("/api/admin/proyectos", empresa));
  const activos = (datosProyectos?.proyectos ?? [])
    .filter((p) => ["concepto", "prototipado", "pruebas"].includes(p.estado))
    .map(({ id, codigo, nombre }) => ({ id, codigo, nombre }));
  const [formulario, setFormulario] = useState<"nuevo" | string | null>(null);
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

  const cambiarPago = (g: FilaGasto, nuevo: EstadoPago) =>
    ejecutar(g.id, async () => {
      await api(conEmpresa(`/api/admin/gastos/${g.id}/datos`, empresa), { method: "PATCH", json: { estado_pago: nuevo } });
      await recargar();
      return `${g.item}: ${ESTADO_PAGO[nuevo].nombre.toLowerCase()}.`;
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
        <div className="segmentos bg-superficie shadow-tarjeta" role="group" aria-label="Estado de pago">
          {(["todos", ...ESTADOS_PAGO] as const).map((e) => {
            const Icono = e === "todos" ? null : ESTADO_PAGO[e].Icono;
            return (
              <button key={e} onClick={() => setPago(e)} aria-pressed={pago === e} className={cx("segmento", pago === e && "segmento-activo bg-indigo-suave text-indigo-tinta")}>
                {Icono && <Icono size={14} aria-hidden className="mr-1 inline" />}
                {e === "todos" ? "Todo pago" : ESTADO_PAGO[e].corto}
              </button>
            );
          })}
        </div>
        <span className="ml-auto rounded-full bg-superficie px-4 py-2 text-sm text-tinta-2 shadow-tarjeta">
          {gastos.length} compra(s) · <b className="font-semibold text-tinta">{clp(total)}</b>
        </span>
        {formulario !== "nuevo" && (
          <button type="button" onClick={() => setFormulario("nuevo")} disabled={activos.length === 0} className="boton shrink-0 whitespace-nowrap">
            <Plus size={16} /> Registrar costo
          </button>
        )}
      </div>
      {formulario === "nuevo" && (
        <div className="mb-4 max-w-xl">
          <FormGasto
            titulo="Registrar costo de proyecto (queda aprobado)"
            proyectos={activos}
            url={conEmpresa("/api/admin/gastos", empresa)}
            onCancelar={() => setFormulario(null)}
            onGuardado={async () => {
              setFormulario(null);
              setAviso({ tipo: "ok", texto: "Costo registrado y aprobado." });
              await recargar();
            }}
          />
        </div>
      )}
      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && gastos.length === 0 && (
        <Vacio>
          {estado === "pendiente" ? "No hay compras por validar" : "Sin compras registradas"}
          {pago === "todos" ? "." : ` en «${ESTADO_PAGO[pago].nombre}».`}
        </Vacio>
      )}
      {gastos.length > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Compra</th>
                <th>Proyecto(s)</th>
                <th className="text-right">Monto (CLP)</th>
                <th>Pago</th>
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
                            {g.de_jefatura && <span className="ml-1.5 rounded-full bg-indigo-suave px-2 py-0.5 font-medium text-indigo-tinta" title="Registrado por la jefatura">jefatura</span>}
                            {g.heredado && <span className="ml-1.5 rounded-full bg-suave px-2 py-0.5 font-medium text-tinta-2" title="Registrada por una persona eliminada; quedó a nombre de este administrador">heredada</span>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="max-w-72">
                      <p className="font-medium text-tinta">{g.item}</p>
                      {g.descripcion && <p className="mt-0.5 text-xs leading-snug text-tinta-3">{g.descripcion}</p>}
                      {g.tipo_costo !== "unico" && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-tinta">
                          <Repeat size={12} /> {NOMBRE_TIPO_COSTO[g.tipo_costo]}
                        </p>
                      )}
                      {g.editado_por_nombre && (
                        <p className="mt-0.5 text-[11px] text-tinta-3">
                          Editada por {g.editado_por_nombre} · {fechaHora(g.editado_en)}
                        </p>
                      )}
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
                      {g.impuesto_clp > 0 && <span className="block whitespace-nowrap text-xs tabular-nums text-tinta-3">incl. impuesto {clp(g.impuesto_clp)}</span>}
                      <NotaDolares g={g} className="ml-auto mt-1 max-w-48 justify-end text-right" />
                    </td>
                    <td>
                      <SelectPago id={`pago-${g.id}`} item={g.item} valor={g.estado_pago} disabled={ocupado !== null} onCambio={(e) => cambiarPago(g, e)} />
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
                        <button type="button" title="Editar compra" aria-label={`Editar compra: ${g.item}`} disabled={ocupado !== null} onClick={() => setFormulario(formulario === g.id ? null : g.id)} className="rounded-full p-2 text-tinta-3 hover:bg-suave hover:text-tinta disabled:opacity-50">
                          <Pencil size={14} />
                        </button>
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
                  {formulario === g.id && (
                    <tr>
                      <td colSpan={7}>
                        <div className="max-w-xl">
                          <FormGasto
                            proyectos={activos}
                            inicial={{ ...g, proyecto_refs: g.proyectos.map(({ id, codigo, nombre }) => ({ id, codigo, nombre })) }}
                            urlEdicion={conEmpresa(`/api/admin/gastos/${g.id}/datos`, empresa)}
                            onCancelar={() => setFormulario(null)}
                            onGuardado={async () => {
                              setFormulario(null);
                              setAviso({ tipo: "ok", texto: `${g.item}: cambios guardados (estado ${g.estado}).` });
                              await recargar();
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  {rechazando?.id === g.id && (
                    <tr className="bg-pastel-rosa/60">
                      <td colSpan={7}>
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
