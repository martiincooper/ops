"use client";

import { Landmark, LoaderCircle, Truck } from "lucide-react";
import { useId, useState } from "react";
import SelectorProyectos from "@/components/SelectorProyectos";
import type { ProyectoActivo } from "@/lib/dominio";
import type { TipoCosto } from "@/lib/esquemas";
import { ErrorApi, api, clp, cx, miles } from "@/lib/cliente";
import { repartirMonto } from "@/lib/reparto";

/** Compra existente a editar. monto_clp es el total (compra + envío + impuesto). */
export interface GastoEditable {
  id: string;
  item: string;
  descripcion: string | null;
  monto_clp: number;
  envio_clp: number;
  impuesto_clp: number;
  tipo_costo: TipoCosto;
  proyecto_refs: ProyectoActivo[];
}

interface Props {
  proyectos: ProyectoActivo[];
  proyectosIniciales?: string[];
  /** Si viene, el formulario edita esa compra (PATCH a `urlEdicion`) en vez de registrar una nueva. */
  inicial?: GastoEditable;
  /** Endpoint de alta (POST). Por defecto, el del equipo. */
  url?: string;
  /** Endpoint de edición (PATCH). Por defecto, el del equipo. */
  urlEdicion?: string;
  titulo?: string;
  onGuardado: () => void;
  onCancelar: () => void;
}

export const NOMBRE_TIPO_COSTO: Record<TipoCosto, string> = {
  unico: "Único / fijo",
  diario: "Recurrente diario",
  mensual: "Recurrente mensual",
  anual: "Recurrente anual",
};

/** Interruptor con icono, título y descripción (envío, impuesto). */
function Interruptor({
  id,
  activo,
  onCambio,
  icono,
  titulo,
  descripcion,
}: {
  id: string;
  activo: boolean;
  onCambio: () => void;
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-desc`}
      onClick={onCambio}
      className="flex w-full items-center gap-3 px-4 py-3 text-left"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-suave text-indigo-tinta">{icono}</span>
      <span className="min-w-0 flex-1">
        <span id={`${id}-titulo`} className="block text-sm font-semibold text-tinta">{titulo}</span>
        <span id={`${id}-desc`} className="block text-xs text-tinta-3">{descripcion}</span>
      </span>
      <span aria-hidden className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", activo ? "bg-indigo" : "bg-tinta-3/35")}>
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", activo ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
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
 * Compra: nombre, descripción, monto en CLP, envío e impuesto opcionales en CLP, tipo de costo y uno o más proyectos.
 * El total (compra + envío + impuesto) se reparte en partes iguales entre los proyectos. Con `inicial`, edita una
 * compra existente (en cualquier estado: p. ej. agregar el impuesto de aduana a una compra ya aprobada).
 */
export default function FormGasto({
  proyectos: activos,
  proyectosIniciales,
  inicial,
  url = "/api/gastos",
  urlEdicion,
  titulo,
  onGuardado,
  onCancelar,
}: Props) {
  // Al editar, los proyectos que la compra ya tenía siguen disponibles aunque ya no estén activos.
  const proyectos = inicial
    ? [...activos, ...inicial.proyecto_refs.filter((r) => !activos.some((p) => p.id === r.id))]
    : activos;
  const validos = inicial
    ? inicial.proyecto_refs.map((r) => r.id)
    : (proyectosIniciales ?? []).filter((id) => proyectos.some((p) => p.id === id));
  const [ids, setIds] = useState<string[]>(validos.length ? validos : proyectos[0] ? [proyectos[0].id] : []);
  const [item, setItem] = useState(inicial?.item ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [monto, setMonto] = useState(inicial ? String(inicial.monto_clp - inicial.envio_clp - inicial.impuesto_clp) : "");
  const [conEnvio, setConEnvio] = useState(Boolean(inicial?.envio_clp));
  const [envio, setEnvio] = useState(inicial?.envio_clp ? String(inicial.envio_clp) : "");
  const [conImpuesto, setConImpuesto] = useState(Boolean(inicial?.impuesto_clp));
  const [impuesto, setImpuesto] = useState(inicial?.impuesto_clp ? String(inicial.impuesto_clp) : "");
  const [tipo, setTipo] = useState<TipoCosto>(inicial?.tipo_costo ?? "unico");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId(); // ids únicos: puede haber más de un formulario en pantalla (registrar + editar)

  const compra = Number(monto) || 0;
  const costoEnvio = conEnvio ? Number(envio) || 0 : 0;
  const costoImpuesto = conImpuesto ? Number(impuesto) || 0 : 0;
  const total = compra + costoEnvio + costoImpuesto;
  const partes = repartirMonto(total, ids.length);
  const extras = [costoEnvio > 0 && `envío ${clp(costoEnvio)}`, costoImpuesto > 0 && `impuesto ${clp(costoImpuesto)}`].filter(Boolean);

  async function guardar() {
    setError(null);
    if (!ids.length) return setError("Elige al menos un proyecto");
    if (!item.trim()) return setError("Escribe el nombre de la compra");
    if (compra <= 0) return setError("Ingresa el monto de la compra en pesos chilenos");
    if (conEnvio && costoEnvio <= 0) return setError("Ingresa el costo del envío o desactívalo");
    if (conImpuesto && costoImpuesto <= 0) return setError("Ingresa el monto del impuesto o desactívalo");
    setOcupado(true);
    try {
      const datos = {
        proyecto_ids: ids,
        item: item.trim(),
        descripcion: descripcion.trim() || null,
        monto_clp: compra,
        envio_clp: costoEnvio || null,
        impuesto_clp: costoImpuesto || null,
        tipo_costo: tipo,
      };
      if (inicial) await api(urlEdicion ?? `/api/gastos/${inicial.id}`, { method: "PATCH", json: datos });
      else await api(url, { method: "POST", json: datos });
      onGuardado();
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="animate-aparecer space-y-4 rounded-3xl bg-suave p-4">
      <p className="font-semibold text-tinta">{titulo ?? (inicial ? "Editar compra" : "Registrar compra")}</p>
      <div>
        <label htmlFor={`${uid}-item`} className="etiqueta">Nombre</label>
        <input id={`${uid}-item`} value={item} maxLength={120} onChange={(e) => setItem(e.target.value)} placeholder="Ej: ST-Link V3 Mini" className="campo bg-superficie" />
      </div>
      <div>
        <label htmlFor={`${uid}-desc`} className="etiqueta">Descripción</label>
        <textarea
          id={`${uid}-desc`}
          rows={2}
          maxLength={500}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Para qué es, proveedor, cantidad…"
          className="campo resize-none bg-superficie"
        />
      </div>
      <div>
        <label htmlFor={`${uid}-monto`} className="etiqueta">Monto en pesos chilenos (CLP)</label>
        <CampoClp id={`${uid}-monto`} valor={monto} onCambio={(v) => { setMonto(v); setError(null); }} describe={`${uid}-monto-ayuda`} />
        <p id={`${uid}-monto-ayuda`} className="mt-1.5 text-xs text-tinta-3">Solo pesos chilenos, sin decimales. Ej: 15.990</p>
      </div>

      <div>
        <span className="etiqueta" id={`${uid}-tipo`}>Tipo de costo</span>
        <div role="radiogroup" aria-labelledby={`${uid}-tipo`} className="flex flex-wrap gap-2">
          {(Object.keys(NOMBRE_TIPO_COSTO) as TipoCosto[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => setTipo(t)}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                tipo === t ? "bg-indigo text-white shadow-sm" : "bg-superficie text-tinta-2 ring-1 ring-linea hover:ring-indigo/40",
              )}
            >
              {NOMBRE_TIPO_COSTO[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-superficie">
        <Interruptor
          id={`${uid}-envio`}
          activo={conEnvio}
          onCambio={() => {
            setConEnvio((v) => !v);
            setError(null);
          }}
          icono={<Truck size={17} />}
          titulo="Agregar envío"
          descripcion="Opcional: costo de despacho pagado aparte"
        />
        {conEnvio && (
          <div className="animate-aparecer border-t border-linea px-4 pb-4 pt-3">
            <label htmlFor={`${uid}-envio`} className="etiqueta">Costo de envío en pesos chilenos (CLP)</label>
            <CampoClp id={`${uid}-envio`} valor={envio} onCambio={(v) => { setEnvio(v); setError(null); }} />
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-superficie">
        <Interruptor
          id={`${uid}-impuesto`}
          activo={conImpuesto}
          onCambio={() => {
            setConImpuesto((v) => !v);
            setError(null);
          }}
          icono={<Landmark size={17} />}
          titulo="Agregar impuesto"
          descripcion="Opcional: impuesto extra, p. ej. aduana o internación"
        />
        {conImpuesto && (
          <div className="animate-aparecer border-t border-linea px-4 pb-4 pt-3">
            <label htmlFor={`${uid}-impuesto`} className="etiqueta">Impuesto en pesos chilenos (CLP)</label>
            <CampoClp id={`${uid}-impuesto`} valor={impuesto} onCambio={(v) => { setImpuesto(v); setError(null); }} />
          </div>
        )}
      </div>

      {compra > 0 && extras.length > 0 && (
        <p className="flex items-baseline justify-between gap-3 rounded-2xl bg-indigo-suave px-4 py-3 text-sm text-indigo-tinta">
          <span>
            Total <span className="text-xs">(compra {clp(compra)} + {extras.join(" + ")})</span>
          </span>
          <span className="whitespace-nowrap text-base font-bold tabular-nums">{clp(total)}</span>
        </p>
      )}
      <div>
        <span className="etiqueta">Proyecto(s)</span>
        <SelectorProyectos etiqueta="Proyectos de la compra" proyectos={proyectos} valor={ids} onCambio={setIds} />
        {ids.length > 1 && (
          <p className="mt-2 text-sm text-tinta-3">
            {extras.length ? "El total se reparte en partes iguales:" : "Se reparte en partes iguales:"}{" "}
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
          {ocupado && <LoaderCircle size={16} className="animate-spin" />} {inicial ? "Guardar cambios" : "Guardar compra"}
        </button>
        <button type="button" onClick={onCancelar} className="boton-texto">Cancelar</button>
      </div>
    </div>
  );
}
