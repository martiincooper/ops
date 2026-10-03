"use client";

import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, clp, miles } from "@/lib/cliente";
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
        className="tarjeta mb-6 grid gap-3 p-5 md:grid-cols-3 xl:grid-cols-[1.2fr_2fr_1.2fr_1fr_1fr_auto] xl:items-end"
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
        <button type="submit" disabled={ocupado !== null} className="boton h-[50px] px-5">
          {ocupado === "nuevo" && <LoaderCircle size={14} className="animate-spin" />} Crear
        </button>
      </form>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th className="text-right">Costo estimado BOM</th>
                <th>Inicio</th>
                <th>Entrega objetivo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {proyectos.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-tinta-3">
                    Sin proyectos. El equipo de {empresa.nombre} necesita al menos uno activo para registrar objetivos.
                  </td>
                </tr>
              )}
              {proyectos.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono font-semibold text-indigo-tinta">{p.codigo}</td>
                  <td className="font-medium text-tinta">{p.nombre}</td>
                  <td className="text-right text-tinta-2">{clp(p.presupuesto_clp)}</td>
                  <td className="text-tinta-3">{p.fecha_inicio}</td>
                  <td>
                    {p.fecha_entrega_objetivo < hoy && !["entregado", "pausado"].includes(p.estado) ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-error-tinta">
                        <AlertTriangle size={14} aria-hidden /> {p.fecha_entrega_objetivo}
                        <span className="text-xs font-medium">vencida</span>
                      </span>
                    ) : (
                      <span className="text-tinta-3">{p.fecha_entrega_objetivo}</span>
                    )}
                  </td>
                  <td>
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
                      className="rounded-full border-0 bg-suave px-3 py-1.5 capitalize text-tinta"
                      style={{ fontSize: 12 }}
                    >
                      {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="text-right">
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
                        className="rounded-full bg-error px-3 py-1 text-xs font-semibold text-white"
                      >
                        ¿Eliminar?
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => setConfirmar(p.id)}
                        aria-label={`Eliminar ${p.codigo}`}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-tinta-2 hover:bg-error-fondo hover:text-error-tinta disabled:opacity-50"
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
