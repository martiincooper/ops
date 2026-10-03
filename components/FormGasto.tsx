"use client";

import { DollarSign, LoaderCircle } from "lucide-react";
import { useState } from "react";
import SelectorProyectos from "@/components/SelectorProyectos";
import type { GastoResumen, ProyectoActivo } from "@/lib/dominio";
import { ErrorApi, api, clp, miles } from "@/lib/cliente";
import { repartirMonto } from "@/lib/reparto";

interface Props {
  proyectos: ProyectoActivo[];
  proyectosIniciales?: string[];
  onGuardado: (gastos: GastoResumen[]) => void;
  onCancelar: () => void;
}

/** Compra: nombre, descripción, monto y uno o más proyectos (el monto se reparte en partes iguales). */
export default function FormGasto({ proyectos, proyectosIniciales, onGuardado, onCancelar }: Props) {
  const validos = (proyectosIniciales ?? []).filter((id) => proyectos.some((p) => p.id === id));
  const [ids, setIds] = useState<string[]>(validos.length ? validos : proyectos[0] ? [proyectos[0].id] : []);
  const [item, setItem] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Number(monto) || 0;
  const partes = repartirMonto(total, ids.length);

  async function guardar() {
    setError(null);
    if (!ids.length) return setError("Elige al menos un proyecto");
    if (!item.trim()) return setError("Escribe el nombre de la compra");
    if (total <= 0) return setError("Ingresa el monto");
    setOcupado(true);
    try {
      const r = await api<{ gastos: GastoResumen[] }>("/api/gastos", {
        method: "POST",
        json: { proyecto_ids: ids, item: item.trim(), descripcion: descripcion.trim() || null, monto_clp: total },
      });
      onGuardado(r.gastos);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="tarjeta animate-aparecer space-y-3 p-4">
      <div className="flex items-center justify-between border-b border-aether-border pb-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-white">
          <DollarSign size={14} className="text-aether-success" /> Registrar compra
        </span>
        <button type="button" onClick={onCancelar} className="text-xs text-slate-400">Cancelar</button>
      </div>

      <div>
        <label htmlFor="g-item" className="etiqueta">Nombre</label>
        <input id="g-item" value={item} maxLength={120} onChange={(e) => setItem(e.target.value)} placeholder="Ej: ST-Link V3 Mini" className="campo" />
      </div>

      <div>
        <label htmlFor="g-desc" className="etiqueta">Descripción</label>
        <textarea
          id="g-desc"
          rows={2}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Para qué es, proveedor, cantidad…"
          className="campo resize-none"
        />
      </div>

      <div>
        <label htmlFor="g-monto" className="etiqueta">Monto</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
          <input
            id="g-monto"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={monto ? miles(Number(monto)) : ""}
            onChange={(e) => setMonto(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))}
            placeholder="0"
            className="campo pl-7 tabular-nums"
          />
        </div>
      </div>

      <div>
        <span className="etiqueta">Proyecto(s)</span>
        <SelectorProyectos etiqueta="Proyectos de la compra" proyectos={proyectos} valor={ids} onCambio={setIds} />
        {ids.length > 1 && (
          <p className="mt-2 rounded-lg bg-aether-bg px-3 py-2 text-[11px] text-slate-400">
            Se reparte en partes iguales:{" "}
            {ids.map((id, i) => (
              <span key={id} className="whitespace-nowrap">
                <span className="font-mono text-aether-accent-soft">{proyectos.find((p) => p.id === id)?.codigo}</span>{" "}
                <span className="font-semibold text-white">{clp(partes[i] ?? 0)}</span>
                {i < ids.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-aether-danger/10 px-3 py-2 text-xs text-aether-danger">{error}</p>}

      <button type="button" onClick={guardar} disabled={ocupado} className="flex w-full items-center justify-center gap-2 rounded-xl bg-aether-success py-3 text-sm font-bold text-black active:scale-[0.99] disabled:opacity-50">
        {ocupado && <LoaderCircle size={16} className="animate-spin" />} Guardar compra
      </button>
    </div>
  );
}
