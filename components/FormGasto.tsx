"use client";

import { Landmark, LoaderCircle, Truck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { SelectorPago } from "@/components/EstadoPago";
import SelectorProyectos from "@/components/SelectorProyectos";
import type { ProyectoActivo } from "@/lib/dominio";
import type { EstadoPago, TipoCosto } from "@/lib/esquemas";
import { ErrorApi, api, clp, cx, dia, miles, tasa, usd } from "@/lib/cliente";
import { repartirMonto } from "@/lib/reparto";

/** Compra existente a editar. monto_clp es el total (compra + envío + impuesto). */
export interface GastoEditable {
  id: string;
  item: string;
  descripcion: string | null;
  monto_clp: number;
  envio_clp: number;
  impuesto_clp: number;
  /** Montos ingresados en dólares (null = en pesos). */
  monto_usd: number | null;
  envio_usd: number | null;
  impuesto_usd: number | null;
  tipo_cambio: number | null;
  tipo_cambio_fecha: string | null;
  tipo_costo: TipoCosto;
  estado_pago: EstadoPago;
  proyecto_refs: ProyectoActivo[];
}

type Moneda = "clp" | "usd";
type TipoCambio = { valor: number; fecha: string };

/** Texto del campo → número ("120,5" → 120.5). */
const aNumero = (v: string) => Number(v.replace(",", ".")) || 0;
/** Número en dólares → texto del campo (120.5 → "120,5"). */
const usdATexto = (n: number) => String(n).replace(".", ",");

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

/** Selector CLP / US$ de un monto. */
function SelectorMoneda({ id, moneda, onCambio, etiqueta }: { id: string; moneda: Moneda; onCambio: (m: Moneda) => void; etiqueta: string }) {
  return (
    <span role="radiogroup" aria-label={`Moneda: ${etiqueta}`} id={id} className="inline-flex rounded-full bg-superficie p-0.5 ring-1 ring-linea">
      {(["clp", "usd"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={moneda === m}
          onClick={() => moneda !== m && onCambio(m)}
          className={cx("rounded-full px-2.5 py-0.5 text-xs font-semibold transition", moneda === m ? "bg-indigo text-white" : "text-tinta-3 hover:text-tinta")}
        >
          {m === "clp" ? "CLP" : "US$"}
        </button>
      ))}
    </span>
  );
}

/**
 * Campo de monto en pesos chilenos (enteros, con separador de miles al escribir) o en dólares (hasta 2 decimales).
 * En dólares muestra debajo el equivalente en pesos con el dólar del día.
 */
function CampoMonto({
  id,
  etiqueta,
  moneda,
  onMoneda,
  valor,
  onCambio,
  tc,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  moneda: Moneda;
  onMoneda: (m: Moneda) => void;
  valor: string;
  onCambio: (v: string) => void;
  tc: TipoCambio | null;
  ayuda?: string;
}) {
  const enUsd = moneda === "usd";
  const n = aNumero(valor);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="etiqueta mb-0">
          {etiqueta} {enUsd ? "en dólares (US$)" : "en pesos chilenos (CLP)"}
        </label>
        <SelectorMoneda id={`${id}-moneda`} moneda={moneda} etiqueta={etiqueta} onCambio={onMoneda} />
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tinta-3">{enUsd ? "US$" : "$"}</span>
        <input
          id={id}
          type="text"
          inputMode={enUsd ? "decimal" : "numeric"}
          autoComplete="off"
          aria-describedby={`${id}-ayuda`}
          value={enUsd ? valor : valor ? miles(Number(valor)) : ""}
          onChange={(e) =>
            onCambio(
              enUsd
                ? e.target.value
                    .replace(/[^\d.,]/g, "")
                    .replace(/[.,]/, "\u0000")
                    .replace(/[.,]/g, "")
                    .replace("\u0000", ",")
                    .replace(/^0+(?=\d)/, "")
                    .replace(/(,\d{2})\d+$/, "$1")
                    .slice(0, 10)
                : e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10),
            )
          }
          placeholder={enUsd ? "0,00" : "0"}
          className={cx("campo bg-superficie pr-14 tabular-nums", enUsd ? "pl-12" : "pl-8")}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-tinta-3">{enUsd ? "USD" : "CLP"}</span>
      </div>
      <p id={`${id}-ayuda`} className="mt-1.5 text-xs text-tinta-3">
        {enUsd
          ? n > 0
            ? tc
              ? `≈ ${clp(Math.round(n * tc.valor))} CLP con el dólar del día`
              : "Se convierte a pesos con el dólar del día al guardar"
            : "Hasta 2 decimales. Ej: 120,50"
          : ayuda}
      </p>
    </div>
  );
}

/**
 * Compra: nombre, descripción, monto, envío e impuesto opcionales, tipo de costo, estado de pago (por enviar a pago,
 * esperando pago o comprada) y uno o más proyectos. Cada monto va en pesos o en dólares (selector CLP / US$): los de
 * dólares se convierten a pesos con el dólar del día al guardar (no cambian después, salvo que se vuelvan a editar).
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
  const [monto, setMonto] = useState(
    inicial ? (inicial.monto_usd !== null ? usdATexto(inicial.monto_usd) : String(inicial.monto_clp - inicial.envio_clp - inicial.impuesto_clp)) : "",
  );
  const [monedaMonto, setMonedaMonto] = useState<Moneda>(inicial?.monto_usd != null ? "usd" : "clp");
  const [conEnvio, setConEnvio] = useState(Boolean(inicial?.envio_clp || inicial?.envio_usd));
  const [envio, setEnvio] = useState(inicial?.envio_usd ? usdATexto(inicial.envio_usd) : inicial?.envio_clp ? String(inicial.envio_clp) : "");
  const [monedaEnvio, setMonedaEnvio] = useState<Moneda>(inicial?.envio_usd ? "usd" : "clp");
  const [conImpuesto, setConImpuesto] = useState(Boolean(inicial?.impuesto_clp || inicial?.impuesto_usd));
  const [impuesto, setImpuesto] = useState(
    inicial?.impuesto_usd ? usdATexto(inicial.impuesto_usd) : inicial?.impuesto_clp ? String(inicial.impuesto_clp) : "",
  );
  const [monedaImpuesto, setMonedaImpuesto] = useState<Moneda>(inicial?.impuesto_usd ? "usd" : "clp");
  // Dólar del día: solo para la vista previa; al guardar, el servidor lo vuelve a pedir y convierte.
  const [tc, setTc] = useState<TipoCambio | null>(null);
  const [errorTc, setErrorTc] = useState(false);
  const [tipo, setTipo] = useState<TipoCosto>(inicial?.tipo_costo ?? "unico");
  const [pago, setPago] = useState<EstadoPago>(inicial?.estado_pago ?? "comprada");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId(); // ids únicos: puede haber más de un formulario en pantalla (registrar + editar)

  const usaDolares =
    monedaMonto === "usd" || (conEnvio && monedaEnvio === "usd") || (conImpuesto && monedaImpuesto === "usd");
  useEffect(() => {
    if (!usaDolares || tc) return;
    let vigente = true;
    api<TipoCambio>("/api/tipo-cambio")
      .then((t) => vigente && (setTc(t), setErrorTc(false)))
      .catch(() => vigente && setErrorTc(true));
    return () => {
      vigente = false;
    };
  }, [usaDolares, tc]);

  /** Monto ingresado (en su moneda) y su equivalente en pesos (null = en dólares sin dólar del día todavía). */
  const valorDe = (v: string, m: Moneda, activo = true) => {
    const n = activo ? aNumero(v) : 0;
    return { n, clp: m === "clp" ? n : tc ? Math.round(n * tc.valor) : null, m };
  };
  const vCompra = valorDe(monto, monedaMonto);
  const vEnvio = valorDe(envio, monedaEnvio, conEnvio);
  const vImpuesto = valorDe(impuesto, monedaImpuesto, conImpuesto);
  const compra = vCompra.clp ?? 0;
  const costoEnvio = vEnvio.clp ?? 0;
  const costoImpuesto = vImpuesto.clp ?? 0;
  const totalConocido = [vCompra, vEnvio, vImpuesto].every((v) => v.clp !== null);
  const total = compra + costoEnvio + costoImpuesto;
  const partes = repartirMonto(total, ids.length);
  /** "$9.700" o, si se ingresó en dólares, "US$10,00 ≈ $9.700". */
  const texto = (v: { n: number; clp: number | null; m: Moneda }) =>
    v.m === "clp" ? clp(v.n) : `${usd(v.n)}${v.clp !== null ? ` ≈ ${clp(v.clp)}` : ""}`;
  const extras = [vEnvio.n > 0 && `envío ${texto(vEnvio)}`, vImpuesto.n > 0 && `impuesto ${texto(vImpuesto)}`].filter(Boolean);

  async function guardar() {
    setError(null);
    if (!ids.length) return setError("Elige al menos un proyecto");
    if (!item.trim()) return setError("Escribe el nombre de la compra");
    if (vCompra.n <= 0) return setError("Ingresa el monto de la compra");
    if (conEnvio && vEnvio.n <= 0) return setError("Ingresa el costo del envío o desactívalo");
    if (conImpuesto && vImpuesto.n <= 0) return setError("Ingresa el monto del impuesto o desactívalo");
    setOcupado(true);
    try {
      const datos = {
        proyecto_ids: ids,
        item: item.trim(),
        descripcion: descripcion.trim() || null,
        // Cada monto en su moneda: los de dólares los convierte el servidor con el dólar del día
        ...(monedaMonto === "usd" ? { monto_usd: vCompra.n } : { monto_clp: vCompra.n, monto_usd: null }),
        ...(!conEnvio
          ? { envio_clp: null, envio_usd: null }
          : monedaEnvio === "usd"
            ? { envio_usd: vEnvio.n }
            : { envio_clp: vEnvio.n, envio_usd: null }),
        ...(!conImpuesto
          ? { impuesto_clp: null, impuesto_usd: null }
          : monedaImpuesto === "usd"
            ? { impuesto_usd: vImpuesto.n }
            : { impuesto_clp: vImpuesto.n, impuesto_usd: null }),
        tipo_costo: tipo,
        estado_pago: pago,
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
      <CampoMonto
        id={`${uid}-monto`}
        etiqueta="Monto"
        moneda={monedaMonto}
        onMoneda={(m) => {
          setMonedaMonto(m);
          setMonto("");
          setError(null);
        }}
        valor={monto}
        onCambio={(v) => {
          setMonto(v);
          setError(null);
        }}
        tc={tc}
        ayuda="Sin decimales. Ej: 15.990"
      />
      {usaDolares && (
        <p className="rounded-2xl bg-superficie px-4 py-2.5 text-xs text-tinta-2">
          {tc ? (
            <>
              Dólar del día: <b className="font-semibold text-tinta">{tasa(tc.valor)}</b> ({dia(tc.fecha)}). Los montos en US$ se
              guardan en pesos con el dólar del día en que se guarda la compra.
            </>
          ) : errorTc ? (
            "No se pudo obtener el dólar del día; se volverá a intentar al guardar."
          ) : (
            "Obteniendo el dólar del día…"
          )}
          {inicial?.tipo_cambio && inicial.tipo_cambio_fecha && (
            <span className="mt-0.5 block text-tinta-3">
              Convertida antes con {tasa(inicial.tipo_cambio)} ({dia(inicial.tipo_cambio_fecha)}); al guardar se convierte con el de hoy.
            </span>
          )}
        </p>
      )}

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

      <SelectorPago id={`${uid}-pago`} valor={pago} onCambio={setPago} />

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
            <CampoMonto
              id={`${uid}-envio`}
              etiqueta="Costo de envío"
              moneda={monedaEnvio}
              onMoneda={(m) => {
                setMonedaEnvio(m);
                setEnvio("");
                setError(null);
              }}
              valor={envio}
              onCambio={(v) => {
                setEnvio(v);
                setError(null);
              }}
              tc={tc}
            />
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
            <CampoMonto
              id={`${uid}-impuesto`}
              etiqueta="Impuesto"
              moneda={monedaImpuesto}
              onMoneda={(m) => {
                setMonedaImpuesto(m);
                setImpuesto("");
                setError(null);
              }}
              valor={impuesto}
              onCambio={(v) => {
                setImpuesto(v);
                setError(null);
              }}
              tc={tc}
            />
          </div>
        )}
      </div>

      {vCompra.n > 0 && (extras.length > 0 || usaDolares) && (
        <p className="flex items-baseline justify-between gap-3 rounded-2xl bg-indigo-suave px-4 py-3 text-sm text-indigo-tinta">
          <span>
            Total en pesos{" "}
            {extras.length > 0 && <span className="text-xs">(compra {texto(vCompra)} + {extras.join(" + ")})</span>}
          </span>
          <span className="whitespace-nowrap text-base font-bold tabular-nums">{totalConocido ? clp(total) : "—"}</span>
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
                <span className="font-semibold text-tinta">{totalConocido ? clp(partes[i] ?? 0) : "—"}</span>
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
