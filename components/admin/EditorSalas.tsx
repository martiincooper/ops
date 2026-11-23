"use client";

import { Archive, ArchiveRestore, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { slugSala } from "@/lib/chat/catalogo";
import type { Autonomia, Modulo } from "@/lib/chat/modulos";
import type { EstadoSala } from "@/lib/chat/salas";
import { api } from "@/lib/cliente";
import { Aviso, useAccion } from "./comun";

interface Borrador {
  /** null: sala nueva. */
  clave: string | null;
  nombre: string;
  area: string;
  descripcion: string;
  color: string;
  orden: string;
  autonomia: Autonomia;
}

const NUEVA: Borrador = { clave: null, nombre: "", area: "", descripcion: "", color: "#5b4fd6", orden: "", autonomia: "revisar" };

const deSala = (s: EstadoSala | Modulo): Borrador => ({
  clave: s.clave,
  nombre: s.nombre,
  area: s.area,
  descripcion: s.descripcion,
  color: `#${s.color}`,
  orden: String(s.orden),
  autonomia: ("autonomia" in s && s.autonomia) || "revisar",
});

/** Editor de salas del portal (solo administradores): crear, editar, archivar y restaurar. */
export default function EditorSalas({
  salas,
  archivadas,
  recargar,
}: {
  salas: EstadoSala[];
  archivadas: Modulo[];
  recargar: () => Promise<void>;
}) {
  const { ocupado, aviso, ejecutar } = useAccion();
  const [b, setB] = useState<Borrador | null>(null);
  const poner = (c: Partial<Borrador>) => setB((x) => (x ? { ...x, ...c } : x));

  const guardar = async () => {
    if (!b) return;
    const cuerpo = {
      nombre: b.nombre,
      area: b.area,
      descripcion: b.descripcion,
      color: b.color,
      autonomia: b.autonomia,
      ...(b.orden.trim() !== "" ? { orden: Number(b.orden) } : {}),
    };
    const ok = await ejecutar("guardar", async () => {
      if (b.clave) await api(`/api/admin/chat/salas/${b.clave}`, { method: "PATCH", json: cuerpo });
      else await api("/api/admin/chat/salas", { method: "POST", json: cuerpo });
      await recargar();
      return b.clave ? `Sala «${b.nombre.trim()}» guardada` : `Sala «${b.nombre.trim()}» creada`;
    });
    if (ok) setB(null);
  };

  const archivar = (clave: string, nombre: string, archivar: boolean) =>
    ejecutar(clave, async () => {
      await api(`/api/admin/chat/salas/${clave}/archivo`, { method: "POST", json: { archivar } });
      await recargar();
      return archivar ? `Sala «${nombre}» archivada` : `Sala «${nombre}» restaurada`;
    });

  return (
    <section aria-labelledby="titulo-salas" data-editor-salas>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="titulo-salas" className="titulo-seccion">Salas</h2>
        <button type="button" onClick={() => setB({ ...NUEVA })} className="boton">
          <Plus size={15} aria-hidden /> Nueva sala
        </button>
      </div>
      <Aviso aviso={aviso} />

      {b && (
        <form
          className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="font-semibold text-tinta">{b.clave ? `Editar «${b.clave}»` : "Nueva sala"}</h3>
            <button type="button" onClick={() => setB(null)} className="boton-texto" aria-label="Cancelar">
              <X size={15} aria-hidden /> Cancelar
            </button>
          </div>
          <label className="etiqueta">
            Nombre
            <input className="campo" value={b.nombre} maxLength={60} required onChange={(e) => poner({ nombre: e.target.value })} />
          </label>
          <label className="etiqueta">
            Área
            <input className="campo" value={b.area} maxLength={80} onChange={(e) => poner({ area: e.target.value })} />
          </label>
          <label className="etiqueta sm:col-span-2">
            Descripción
            <textarea className="campo" rows={2} value={b.descripcion} maxLength={500} onChange={(e) => poner({ descripcion: e.target.value })} />
          </label>
          <label className="etiqueta">
            Color (hex)
            <input className="campo" value={b.color} placeholder="#5b4fd6" onChange={(e) => poner({ color: e.target.value })} />
          </label>
          <label className="etiqueta">
            Orden
            <input className="campo" type="number" min={0} max={9999} value={b.orden} placeholder="Al final" onChange={(e) => poner({ orden: e.target.value })} />
          </label>
          <label className="etiqueta">
            Autonomía
            <select className="campo" value={b.autonomia} onChange={(e) => poner({ autonomia: e.target.value as Autonomia })}>
              <option value="revisar">Revisar</option>
              <option value="automatico">Automático</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-tinta-3">Sin efecto aún: por ahora no cambia el comportamiento de la sala.</span>
          </label>
          <p className="text-sm text-tinta-3">
            Clave: <code>{b.clave ?? (slugSala(b.nombre) || "—")}</code>
            {b.clave ? " (no se puede cambiar)" : " (se genera del nombre y no se podrá cambiar)"}
          </p>
          <div className="sm:col-span-2">
            <button type="submit" disabled={ocupado === "guardar"} className="boton">
              {b.clave ? "Guardar cambios" : "Crear sala"}
            </button>
          </div>
        </form>
      )}

      {salas.length === 0 ? (
        <p className="tarjeta px-6 py-6 text-center text-sm text-tinta-3">Aún no hay salas: crea la primera con «Nueva sala».</p>
      ) : (
        <ul className="tarjeta divide-y divide-linea">
          {salas.map((s) => (
            <li key={s.clave} data-sala={s.clave} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: `#${s.color}` }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-tinta">
                  {s.nombre} <span className="font-normal text-tinta-3">· {s.clave} · orden {s.orden}</span>
                </p>
                <p className="truncate text-xs text-tinta-3">{s.area || "Sin área"} · autonomía {s.autonomia === "automatico" ? "automático" : "revisar"}</p>
              </div>
              <button type="button" onClick={() => setB(deSala(s))} className="boton-suave" aria-label={`Editar ${s.nombre}`}>
                <Pencil size={13} aria-hidden /> Editar
              </button>
              <button type="button" disabled={ocupado === s.clave} onClick={() => archivar(s.clave, s.nombre, true)} className="boton-texto" aria-label={`Archivar ${s.nombre}`}>
                <Archive size={13} aria-hidden /> Archivar
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-tinta-2">Archivadas</h3>
      {archivadas.length === 0 ? (
        <p className="text-sm text-tinta-3">No hay salas archivadas.</p>
      ) : (
        <ul className="tarjeta divide-y divide-linea" data-archivadas>
          {archivadas.map((m) => (
            <li key={m.clave} data-sala={m.clave} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-tinta-2">
                  {m.nombre} <span className="font-normal text-tinta-3">· {m.clave}</span>
                </p>
              </div>
              <button type="button" disabled={ocupado === m.clave} onClick={() => archivar(m.clave, m.nombre, false)} className="boton-suave" aria-label={`Restaurar ${m.nombre}`}>
                <ArchiveRestore size={13} aria-hidden /> Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
