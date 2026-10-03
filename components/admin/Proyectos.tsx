"use client";

import { AlertTriangle, History, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { api, clp, cx, miles } from "@/lib/cliente";
import { Aviso, Cargando, conEmpresa, useAccion, useDatos, type EmpresaPublica } from "./comun";

interface Etapa {
  id: number;
  estado: Proyecto["estado"];
  desde: string;
}

interface Proyecto {
  id: string;
  codigo: string;
  nombre: string;
  presupuesto_clp: number;
  fecha_inicio: string;
  fecha_entrega_objetivo: string;
  estado: "concepto" | "prototipado" | "pruebas" | "entregado" | "pausado";
  etapas: Etapa[];
}

const ESTADOS: Proyecto["estado"][] = ["concepto", "prototipado", "pruebas", "entregado", "pausado"];
const NOMBRE: Record<Proyecto["estado"], string> = {
  concepto: "Concepto",
  prototipado: "Prototipado",
  pruebas: "Pruebas",
  entregado: "Entregado",
  pausado: "En pausa",
};

/** Historial de etapas: corrige la fecha en que el proyecto entró a cada etapa (p. ej. la entrega real). */
function EditorEtapas({ p, empresa, hoy, onGuardado, onCerrar }: { p: Proyecto; empresa: string; hoy: string; onGuardado: (texto: string) => void; onCerrar: () => void }) {
  const [fechas, setFechas] = useState(p.etapas.map((e) => e.desde));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setOcupado(true);
    try {
      await api(conEmpresa(`/api/admin/proyectos/${p.id}/etapas`, empresa), {
        method: "PUT",
        json: { etapas: p.etapas.map((e, i) => ({ id: e.id, desde: fechas[i] })) },
      });
      onGuardado(`${p.codigo}: fechas de etapas actualizadas.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-2xl bg-suave p-4">
      <p className="text-sm font-semibold text-tinta">Etapas de {p.codigo}</p>
      <p className="mt-0.5 text-xs text-tinta-3">
        Se registran solas al cambiar el estado. Corrige aquí la fecha en que empezó cada etapa (por ejemplo, la fecha real de entrega de un
        proyecto antiguo). La primera fecha es el inicio del proyecto.
      </p>
      {p.etapas.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-3">Sin historial.</p>
      ) : (
        <ol className="mt-3 flex flex-wrap gap-3">
          {p.etapas.map((e, i) => (
            <li key={e.id} className="rounded-2xl bg-superficie p-3">
              <label htmlFor={`et-${e.id}`} className="mb-1 block text-xs font-semibold text-tinta-2">
                {i + 1}. {NOMBRE[e.estado]} desde
              </label>
              <input
                id={`et-${e.id}`}
                type="date"
                max={i === 0 ? undefined : hoy}
                value={fechas[i]}
                onChange={(ev) => setFechas((f) => f.map((x, j) => (j === i ? ev.target.value : x)))}
                className="campo py-2 text-sm"
              />
            </li>
          ))}
        </ol>
      )}
      {error && <p className="mt-3 rounded-2xl bg-error-fondo px-4 py-2 text-sm text-error-tinta">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        {p.etapas.length > 0 && (
          <button type="button" onClick={guardar} disabled={ocupado} className="boton">
            {ocupado && <LoaderCircle size={14} className="animate-spin" />} Guardar fechas
          </button>
        )}
        <button type="button" onClick={onCerrar} className="boton-texto">Cerrar</button>
      </div>
    </div>
  );
}

/** Edición de los datos del proyecto. Solo se envían los campos que cambiaron. */
function EditorProyecto({ p, empresa, onGuardado, onCerrar }: { p: Proyecto; empresa: string; onGuardado: (texto: string) => void; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState(p.codigo);
  const [nombre, setNombre] = useState(p.nombre);
  const [presupuesto, setPresupuesto] = useState(String(p.presupuesto_clp));
  const [inicio, setInicio] = useState(p.fecha_inicio);
  const [entrega, setEntrega] = useState(p.fecha_entrega_objetivo);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambios: Record<string, string | number> = {};
  if (codigo.trim().toUpperCase() !== p.codigo) cambios.codigo = codigo;
  if (nombre.trim() !== p.nombre) cambios.nombre = nombre;
  if (Number(presupuesto || 0) !== p.presupuesto_clp) cambios.presupuesto_clp = Number(presupuesto || 0);
  if (inicio !== p.fecha_inicio) cambios.fecha_inicio = inicio;
  if (entrega !== p.fecha_entrega_objetivo) cambios.fecha_entrega_objetivo = entrega;
  const hayCambios = Object.keys(cambios).length > 0;
  const id = (c: string) => `ed-${p.id}-${c}`;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!hayCambios) return onCerrar();
    setError(null);
    setOcupado(true);
    try {
      await api(conEmpresa(`/api/admin/proyectos/${p.id}`, empresa), { method: "PATCH", json: cambios });
      onGuardado(`${(cambios.codigo as string | undefined)?.trim().toUpperCase() ?? p.codigo}: datos actualizados.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={guardar} className="rounded-2xl bg-suave p-4">
      <p className="mb-3 text-sm font-semibold text-tinta">Editar {p.codigo}</p>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[1.2fr_2fr_1.2fr_1fr_1fr]">
        <div>
          <label htmlFor={id("codigo")} className="etiqueta">Código</label>
          <input id={id("codigo")} required value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="campo bg-superficie font-mono text-sm" />
        </div>
        <div>
          <label htmlFor={id("nombre")} className="etiqueta">Nombre</label>
          <input id={id("nombre")} required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo bg-superficie text-sm" />
        </div>
        <div>
          <label htmlFor={id("bom")} className="etiqueta">Costo estimado BOM (CLP)</label>
          <input
            id={id("bom")}
            inputMode="numeric"
            required
            value={presupuesto ? miles(Number(presupuesto)) : ""}
            onChange={(e) => setPresupuesto(e.target.value.replace(/\D/g, "").slice(0, 12))}
            className="campo bg-superficie text-sm tabular-nums"
          />
        </div>
        <div>
          <label htmlFor={id("inicio")} className="etiqueta">Inicio</label>
          <input id={id("inicio")} type="date" required max={entrega} value={inicio} onChange={(e) => setInicio(e.target.value)} className="campo bg-superficie text-sm" />
        </div>
        <div>
          <label htmlFor={id("entrega")} className="etiqueta">Entrega estimada</label>
          <input id={id("entrega")} type="date" required min={inicio} value={entrega} onChange={(e) => setEntrega(e.target.value)} className="campo bg-superficie text-sm" />
        </div>
      </div>
      {error && <p className="mt-3 rounded-2xl bg-error-fondo px-4 py-2 text-sm text-error-tinta">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={ocupado || !hayCambios} className="boton">
          {ocupado && <LoaderCircle size={14} className="animate-spin" />} Guardar cambios
        </button>
        <button type="button" onClick={onCerrar} className="boton-texto">Cancelar</button>
      </div>
    </form>
  );
}

export default function Proyectos({ empresa, hoy }: { empresa: EmpresaPublica; hoy: string }) {
  const { datos, error, cargando, recargar } = useDatos<{ proyectos: Proyecto[] }>(conEmpresa("/api/admin/proyectos", empresa.clave));
  const { ocupado, aviso, ejecutar } = useAccion();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<{ id: string; modo: "editar" | "etapas" } | null>(null);
  const alternar = (id: string, modo: "editar" | "etapas") => setAbierto(abierto?.id === id && abierto.modo === modo ? null : { id, modo });
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
          <label htmlFor="p-entrega" className="etiqueta">Entrega estimada</label>
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
                <th>Entrega estimada</th>
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
                <Fragment key={p.id}>
                <tr>
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
                    {p.etapas.length > 0 && (
                      <span className="mt-1 block pl-3 text-xs text-tinta-3">desde {p.etapas[p.etapas.length - 1].desde}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {(["editar", "etapas"] as const).map((modo) => {
                      const activo = abierto?.id === p.id && abierto.modo === modo;
                      const Icono = modo === "editar" ? Pencil : History;
                      return (
                        <button
                          key={modo}
                          type="button"
                          aria-expanded={activo}
                          aria-label={`${modo === "editar" ? "Editar" : "Etapas de"} ${p.codigo}`}
                          title={modo === "editar" ? "Editar datos del proyecto" : "Historial de etapas"}
                          onClick={() => alternar(p.id, modo)}
                          className={cx(
                            "mr-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                            activo ? "bg-indigo-suave text-indigo-tinta" : "text-tinta-2 hover:bg-suave",
                          )}
                        >
                          <Icono size={13} /> {modo === "editar" ? "Editar" : "Etapas"}
                        </button>
                      );
                    })}
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
                {abierto?.id === p.id && (
                  <tr>
                    <td colSpan={7}>
                      {abierto.modo === "etapas" ? (
                        <EditorEtapas
                          key={p.etapas.map((e) => e.id + e.desde).join()}
                          p={p}
                          empresa={empresa.clave}
                          hoy={hoy}
                          onCerrar={() => setAbierto(null)}
                          onGuardado={async (texto) => {
                            await ejecutar(p.id, async () => {
                              await recargar();
                              return texto;
                            });
                          }}
                        />
                      ) : (
                        <EditorProyecto
                          p={p}
                          empresa={empresa.clave}
                          onCerrar={() => setAbierto(null)}
                          onGuardado={async (texto) => {
                            setAbierto(null);
                            await ejecutar(p.id, async () => {
                              await recargar();
                              return texto;
                            });
                          }}
                        />
                      )}
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
