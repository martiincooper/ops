"use client";

import { LoaderCircle } from "lucide-react";
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
    <div className="animate-aparecer space-y-4 rounded-3xl bg-suave p-4">
      <p className="font-semibold text-tinta">Registrar compra</p>
      <div>
        <label htmlFor="g-item" className="etiqueta">Nombre</label>
        <input id="g-item" value={item} maxLength={120} onChange={(e) => setItem(e.target.value)} placeholder="Ej: ST-Link V3 Mini" className="campo bg-superficie" />
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
          className="campo resize-none bg-superficie"
        />
      </div>
      <div>
        <label htmlFor="g-monto" className="etiqueta">Monto</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tinta-3">$</span>
          <input
            id="g-monto"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={monto ? miles(Number(monto)) : ""}
            onChange={(e) => setMonto(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))}
            placeholder="0"
            className="campo bg-superficie pl-8"
          />
        </div>
      </div>
      <div>
        <span className="etiqueta">Proyecto(s)</span>
        <SelectorProyectos etiqueta="Proyectos de la compra" proyectos={proyectos} valor={ids} onCambio={setIds} />
        {ids.length > 1 && (
          <p className="mt-2 text-sm text-tinta-3">
            Se reparte en partes iguales:{" "}
            {ids.map((id, i) => (
              <span key={id} className="whitespace-nowrap">
                <span className="font-mono text-indigo-tinta">{proyectos.find((p) => p.id === id)?.codigo}</span>{" "}
                <span className="font-semibold text-tinta">{clp(partes[i] ?? 0)}</span>
                {i < ids.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        )}
      </div>
      {error && <p className="rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={guardar} disabled={ocupado} className="boton-primario flex-1 py-3">
          {ocupado && <LoaderCircle size={16} className="animate-spin" />} Guardar compra
        </button>
        <button type="button" onClick={onCancelar} className="boton-texto">Cancelar</button>
      </div>
    </div>
  );
}
