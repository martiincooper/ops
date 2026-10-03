"use client";

import { LoaderCircle, Truck } from "lucide-react";
import { useState } from "react";
import SelectorProyectos from "@/components/SelectorProyectos";
import type { GastoResumen, ProyectoActivo } from "@/lib/dominio";
import { ErrorApi, api, clp, cx, miles } from "@/lib/cliente";
import { repartirMonto } from "@/lib/reparto";

interface Props {
  proyectos: ProyectoActivo[];
  proyectosIniciales?: string[];
  onGuardado: (gastos: GastoResumen[]) => void;
  onCancelar: () => void;
}

/** Campo de monto en pesos chilenos: enteros, con separador de miles al escribir. */
function CampoClp({ id, valor, onCambio, describe }: { id: string; valor: string; onCambio: (v: string) => void; describe?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tinta-3">$</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-describedby={describe}
        value={valor ? miles(Number(valor)) : ""}
        onChange={(e) => onCambio(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))}
        placeholder="0"
        className="campo bg-superficie pl-8 pr-14 tabular-nums"
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-tinta-3">CLP</span>
    </div>
  );
}

/**
 * Compra: nombre, descripción, monto en CLP, envío opcional en CLP y uno o más proyectos.
 * El total (compra + envío) se reparte en partes iguales entre los proyectos.
 */
export default function FormGasto({ proyectos, proyectosIniciales, onGuardado, onCancelar }: Props) {
  const validos = (proyectosIniciales ?? []).filter((id) => proyectos.some((p) => p.id === id));
  const [ids, setIds] = useState<string[]>(validos.length ? validos : proyectos[0] ? [proyectos[0].id] : []);
  const [item, setItem] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [conEnvio, setConEnvio] = useState(false);
  const [envio, setEnvio] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compra = Number(monto) || 0;
  const costoEnvio = conEnvio ? Number(envio) || 0 : 0;
  const total = compra + costoEnvio;
  const partes = repartirMonto(total, ids.length);

  async function guardar() {
    setError(null);
    if (!ids.length) return setError("Elige al menos un proyecto");
    if (!item.trim()) return setError("Escribe el nombre de la compra");
    if (compra <= 0) return setError("Ingresa el monto de la compra en pesos chilenos");
    if (conEnvio && costoEnvio <= 0) return setError("Ingresa el costo del envío o desactívalo");
    setOcupado(true);
    try {
      const r = await api<{ gastos: GastoResumen[] }>("/api/gastos", {
        method: "POST",
        json: { proyecto_ids: ids, item: item.trim(), descripcion: descripcion.trim() || null, monto_clp: compra, envio_clp: costoEnvio || null },
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
        <label htmlFor="g-monto" className="etiqueta">Monto en pesos chilenos (CLP)</label>
        <CampoClp id="g-monto" valor={monto} onCambio={(v) => { setMonto(v); setError(null); }} describe="g-monto-ayuda" />
        <p id="g-monto-ayuda" className="mt-1.5 text-xs text-tinta-3">Solo pesos chilenos, sin decimales. Ej: 15.990</p>
      </div>

      <div className="rounded-2xl bg-superficie">
        <button
          type="button"
          role="switch"
          aria-checked={conEnvio}
          aria-labelledby="g-envio-titulo"
          aria-describedby="g-envio-desc"
          onClick={() => {
            setConEnvio((v) => !v);
            setError(null);
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-suave text-indigo-tinta">
            <Truck size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span id="g-envio-titulo" className="block text-sm font-semibold text-tinta">Agregar envío</span>
            <span id="g-envio-desc" className="block text-xs text-tinta-3">Opcional: costo de despacho pagado aparte</span>
          </span>
          <span aria-hidden className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", conEnvio ? "bg-indigo" : "bg-tinta-3/35")}>
            <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", conEnvio ? "left-[22px]" : "left-0.5")} />
          </span>
        </button>
        {conEnvio && (
          <div className="animate-aparecer border-t border-linea px-4 pb-4 pt-3">
            <label htmlFor="g-envio" className="etiqueta">Costo de envío en pesos chilenos (CLP)</label>
            <CampoClp id="g-envio" valor={envio} onCambio={(v) => { setEnvio(v); setError(null); }} />
          </div>
        )}
      </div>

      {conEnvio && compra > 0 && costoEnvio > 0 && (
        <p className="flex items-baseline justify-between gap-3 rounded-2xl bg-indigo-suave px-4 py-3 text-sm text-indigo-tinta">
          <span>
            Total <span className="text-xs">(compra {clp(compra)} + envío {clp(costoEnvio)})</span>
          </span>
          <span className="whitespace-nowrap text-base font-bold tabular-nums">{clp(total)}</span>
        </p>
      )}
      <div>
        <span className="etiqueta">Proyecto(s)</span>
        <SelectorProyectos etiqueta="Proyectos de la compra" proyectos={proyectos} valor={ids} onCambio={setIds} />
        {ids.length > 1 && (
          <p className="mt-2 text-sm text-tinta-3">
            {costoEnvio > 0 ? "El total, envío incluido, se reparte en partes iguales:" : "Se reparte en partes iguales:"}{" "}
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
