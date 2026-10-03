"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, clp, cx, miles } from "@/lib/cliente";
import { Aviso, Cargando, conEmpresa, useAccion, useDatos, type EmpresaPublica } from "./comun";

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  presupuesto_clp: number;
  fecha_inicio: string;
  fecha_entrega_objetivo: string;
  estado: "concepto" | "prototipado" | "pruebas" | "entregado" | "pausado";
}

const ESTADOS: Proyecto["estado"][] = ["concepto", "prototipado", "pruebas", "entregado", "pausado"];

export default function Proyectos({ empresa, hoy }: { empresa: EmpresaPublica; hoy: string }) {
  const { datos, error, cargando, recargar } = useDatos<{ proyectos: Proyecto[] }>(conEmpresa("/api/admin/proyectos", empresa.clave));
  const { ocupado, aviso, ejecutar } = useAccion();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [presupuesto, setPresupuesto] = useState("");
  const [inicio, setInicio] = useState(hoy);
  const [entrega, setEntrega] = useState("");
  const proyectos = datos?.proyectos ?? [];

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar("nuevo", async () => {
            await api(conEmpresa("/api/admin/proyectos", empresa.clave), {
              method: "POST",
              json: {
                codigo,
                nombre,
                presupuesto_clp: Number(presupuesto || 0),
                fecha_inicio: inicio,
                fecha_entrega_objetivo: entrega,
              },
            });
            await recargar();
            setCodigo("");
            setNombre("");
            setPresupuesto("");
            setEntrega("");
            return `Proyecto creado en ${empresa.nombre}.`;
          });
        }}
        className="tarjeta mb-5 grid grid-cols-[1.2fr_2fr_1.2fr_1fr_1fr_auto] items-end gap-3 p-4"
      >
        <div>
          <label htmlFor="p-codigo" className="etiqueta">Código</label>
          <input id="p-codigo" required value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="AETH-SEN-01" className="campo font-mono text-sm" />
        </div>
        <div>
          <label htmlFor="p-nombre" className="etiqueta">Nombre</label>
          <input id="p-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Sensor IoT v2.1" className="campo text-sm" />
        </div>
        <div>
          <label htmlFor="p-presupuesto" className="etiqueta">Costo estimado BOM (CLP)</label>
          <input id="p-presupuesto" inputMode="numeric" required value={presupuesto ? miles(Number(presupuesto)) : ""} onChange={(e) => setPresupuesto(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="5.000.000" className="campo text-sm tabular-nums" />
        </div>
        <div>
          <label htmlFor="p-inicio" className="etiqueta">Inicio</label>
          <input id="p-inicio" type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)} className="campo text-sm" />
        </div>
        <div>
          <label htmlFor="p-entrega" className="etiqueta">Entrega objetivo</label>
          <input id="p-entrega" type="date" required min={inicio} value={entrega} onChange={(e) => setEntrega(e.target.value)} className="campo text-sm" />
        </div>
        <button type="submit" disabled={ocupado !== null} className="flex h-[46px] items-center gap-1.5 rounded-lg bg-aether-accent px-4 text-xs font-bold text-white disabled:opacity-50">
          {ocupado === "nuevo" && <LoaderCircle size={14} className="animate-spin" />} Crear
        </button>
      </form>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && (
        <div className="tarjeta overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-aether-border text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 text-right font-medium">Costo estimado BOM</th>
                <th className="px-4 py-3 font-medium">Inicio</th>
                <th className="px-4 py-3 font-medium">Entrega objetivo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-aether-border">
              {proyectos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Sin proyectos. El equipo de {empresa.nombre} necesita al menos uno activo para registrar objetivos.
                  </td>
                </tr>
              )}
              {proyectos.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono font-semibold text-aether-accent-soft">{p.codigo}</td>
                  <td className="px-4 py-3 text-white">{p.nombre}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">{clp(p.presupuesto_clp)}</td>
                  <td className="px-4 py-3 text-slate-400">{p.fecha_inicio}</td>
                  <td className={cx("px-4 py-3", p.fecha_entrega_objetivo < hoy && !["entregado", "pausado"].includes(p.estado) ? "text-aether-danger" : "text-slate-400")}>
                    {p.fecha_entrega_objetivo}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Estado de ${p.codigo}`}
                      value={p.estado}
                      disabled={ocupado !== null}
                      onChange={(e) =>
                        ejecutar(p.id, async () => {
                          await api(conEmpresa(`/api/admin/proyectos/${p.id}`, empresa.clave), { method: "PATCH", json: { estado: e.target.value } });
                          await recargar();
                          return `${p.codigo}: ${e.target.value}.`;
                        })
                      }
                      className="rounded-md border border-aether-border bg-aether-bg px-2 py-1 capitalize text-slate-200"
                      style={{ fontSize: 12 }}
                    >
                      {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {confirmar === p.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          ejecutar(p.id, async () => {
                            const r = await api<{ objetivos: number; compras: number; compras_reasignadas: number }>(
                              conEmpresa(`/api/admin/proyectos/${p.id}`, empresa.clave),
                              { method: "DELETE" },
                            );
                            setConfirmar(null);
                            await recargar();
                            return `${p.codigo} eliminado: ${r.objetivos} objetivo(s) y ${r.compras} compra(s) borrados` +
                              (r.compras_reasignadas ? `; ${r.compras_reasignadas} compra(s) compartidas repartidas entre sus otros proyectos.` : ".");
                          })
                        }
                        title="Borra también los objetivos y compras registrados solo para este proyecto. No se puede deshacer."
                        className="rounded-md bg-aether-danger px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        ¿Eliminar?
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => setConfirmar(p.id)}
                        aria-label={`Eliminar ${p.codigo}`}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-400 hover:bg-aether-danger/10 hover:text-aether-danger disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
