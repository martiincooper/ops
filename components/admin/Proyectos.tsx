"use client";

import { AlertTriangle, Flag, History, LoaderCircle, Pencil, Trash2 } from "lucide-react";
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
  hitos: Hito[];
}

type EtapaHito = "concepto" | "prototipado" | "pruebas";
const ETAPAS_HITO: EtapaHito[] = ["concepto", "prototipado", "pruebas"];

interface Hito {
  id: number;
  etapa: EtapaHito;
  titulo: string;
  detalle: string | null;
  fecha: string;
  creado_por_nombre: string;
  editado_en: string | null;
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

/** Hitos del proyecto: lo ya logrado en cada etapa, agrupado por etapa (el más reciente primero). */
function EditorHitos({ p, empresa, hoy, onCambio, onCerrar }: { p: Proyecto; empresa: string; hoy: string; onCambio: () => Promise<void>; onCerrar: () => void }) {
  const etapaActual = (ETAPAS_HITO as string[]).includes(p.estado) ? (p.estado as EtapaHito) : "";
  const [editando, setEditando] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [etapa, setEtapa] = useState<EtapaHito | "">(etapaActual);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<number | null>(null);

  function limpiar() {
    setEditando(null);
    setTitulo("");
    setDetalle("");
    setFecha(hoy);
    setEtapa(etapaActual);
  }

  function editar(h: Hito) {
    setEditando(h.id);
    setTitulo(h.titulo);
    setDetalle(h.detalle ?? "");
    setFecha(h.fecha);
    setEtapa(h.etapa);
    setError(null);
  }

  async function llamar(accion: () => Promise<unknown>) {
    setError(null);
    setOcupado(true);
    try {
      await accion();
      await onCambio();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const json = { titulo, detalle, fecha, etapa };
    const ruta = `/api/admin/proyectos/${p.id}/hitos`;
    const ok = await llamar(() =>
      editando === null
        ? api(conEmpresa(ruta, empresa), { method: "POST", json })
        : api(conEmpresa(`${ruta}/${editando}`, empresa), { method: "PUT", json }),
    );
    if (ok) limpiar();
  }

  const id = (c: string) => `hi-${p.id}-${c}`;
  return (
    <div className="rounded-2xl bg-suave p-4">
      <p className="text-sm font-semibold text-tinta">Hitos de {p.codigo}</p>
      <p className="mt-0.5 text-xs text-tinta-3">Registra lo ya logrado en cada etapa, con la fecha en que se logró. Gerencia lo ve en su tablero.</p>
      {p.hitos.length === 0 ? (
        <p className="mt-3 text-sm text-tinta-3">Sin hitos todavía.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {ETAPAS_HITO.map((et) => {
            const lista = p.hitos.filter((h) => h.etapa === et).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
            if (lista.length === 0) return null;
            return (
              <div key={et}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta-2">{NOMBRE[et]}</p>
                <ul className="space-y-2">
                  {lista.map((h) => (
                    <li key={h.id} className="flex items-start justify-between gap-3 rounded-2xl bg-superficie p-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-tinta">{h.titulo}</p>
                        {h.detalle && <p className="mt-0.5 whitespace-pre-line break-words text-xs text-tinta-2">{h.detalle}</p>}
                        <p className="mt-1 text-xs text-tinta-3">
                          {h.fecha} · {h.creado_por_nombre}
                          {h.editado_en && " · editado"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        <button type="button" onClick={() => editar(h)} aria-label={`Editar hito ${h.titulo}`} className="rounded-full p-2 text-tinta-2 hover:bg-suave">
                          <Pencil size={13} />
                        </button>
                        {confirmar === h.id ? (
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={async () => {
                              if (await llamar(() => api(conEmpresa(`/api/admin/proyectos/${p.id}/hitos/${h.id}`, empresa), { method: "DELETE" }))) {
                                setConfirmar(null);
                                if (editando === h.id) limpiar();
                              }
                            }}
                            className="rounded-full bg-error px-3 py-1 text-xs font-semibold text-white"
                          >
                            ¿Eliminar?
                          </button>
                        ) : (
                          <button type="button" onClick={() => setConfirmar(h.id)} aria-label={`Eliminar hito ${h.titulo}`} className="rounded-full p-2 text-tinta-2 hover:bg-error-fondo hover:text-error-tinta">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <form onSubmit={guardar} className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <p className="text-sm font-semibold text-tinta md:col-span-3">{editando === null ? "Agregar un hito" : "Editar hito"}</p>
        <div>
          <label htmlFor={id("titulo")} className="etiqueta">Título</label>
          <input id={id("titulo")} required maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Primer prototipo funcionando" className="campo bg-superficie text-sm" />
        </div>
        <div>
          <label htmlFor={id("fecha")} className="etiqueta">Fecha</label>
          <input id={id("fecha")} type="date" required min={p.fecha_inicio} max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo bg-superficie text-sm" />
        </div>
        <div>
          <label htmlFor={id("etapa")} className="etiqueta">Etapa</label>
          <select id={id("etapa")} required value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaHito)} className="campo bg-superficie text-sm">
            {etapa === "" && <option value="">Elige una etapa</option>}
            {ETAPAS_HITO.map((et) => <option key={et} value={et}>{NOMBRE[et]}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <label htmlFor={id("detalle")} className="etiqueta">Detalle (opcional)</label>
          <textarea id={id("detalle")} rows={2} maxLength={1000} value={detalle} onChange={(e) => setDetalle(e.target.value)} className="campo bg-superficie text-sm" />
        </div>
        {error && <p className="rounded-2xl bg-error-fondo px-4 py-2 text-sm text-error-tinta md:col-span-3">{error}</p>}
        <div className="flex items-center gap-2 md:col-span-3">
          <button type="submit" disabled={ocupado || !titulo.trim() || !etapa} className="boton">
            {ocupado && <LoaderCircle size={14} className="animate-spin" />} {editando === null ? "Agregar hito" : "Guardar hito"}
          </button>
          {editando !== null && <button type="button" onClick={limpiar} className="boton-texto">Cancelar edición</button>}
          <button type="button" onClick={onCerrar} className="boton-texto">Cerrar</button>
        </div>
      </form>
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
  const [abierto, setAbierto] = useState<{ id: string; modo: "editar" | "etapas" | "hitos" } | null>(null);
  const alternar = (id: string, modo: "editar" | "etapas" | "hitos") => setAbierto(abierto?.id === id && abierto.modo === modo ? null : { id, modo });
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
                    {(["editar", "etapas", "hitos"] as const).map((modo) => {
                      const activo = abierto?.id === p.id && abierto.modo === modo;
                      const Icono = modo === "editar" ? Pencil : modo === "etapas" ? History : Flag;
                      const nombre = modo === "editar" ? "Editar" : modo === "etapas" ? "Etapas" : "Hitos";
                      return (
                        <button
                          key={modo}
                          type="button"
                          aria-expanded={activo}
                          aria-label={`${modo === "editar" ? "Editar" : modo === "etapas" ? "Etapas de" : "Hitos de"} ${p.codigo}`}
                          title={modo === "editar" ? "Editar datos del proyecto" : modo === "etapas" ? "Historial de etapas" : "Hitos logrados"}
                          onClick={() => alternar(p.id, modo)}
                          className={cx(
                            "mr-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                            activo ? "bg-indigo-suave text-indigo-tinta" : "text-tinta-2 hover:bg-suave",
                          )}
                        >
                          <Icono size={13} /> {nombre}{modo === "hitos" && p.hitos.length > 0 && ` (${p.hitos.length})`}
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
                      ) : abierto.modo === "hitos" ? (
                        <EditorHitos p={p} empresa={empresa.clave} hoy={hoy} onCambio={recargar} onCerrar={() => setAbierto(null)} />
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
