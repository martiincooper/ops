"use client";

import { Camera, DollarSign, FileText, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GastoResumen, ProyectoActivo } from "@/lib/dominio";
import { ErrorApi, clp, cx, miles } from "@/lib/cliente";

type Tipo = "factura" | "boleta" | "extranjero";

const MAX_LADO = 2000;

/** Reduce fotos de 3–8 MB a ~300 KB. Si el navegador no puede decodificar (ej. HEIC en Chrome), envía el original. */
async function comprimir(f: File): Promise<File> {
  if (!f.type.startsWith("image/") || f.size < 600 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f);
    const escala = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return f;
  }
}

function CampoMonto({ id, etiqueta, valor, onCambio }: { id: string; etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={valor ? miles(Number(valor)) : ""}
          onChange={(e) => onCambio(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))}
          placeholder="0"
          className="campo pl-7 tabular-nums"
        />
      </div>
    </div>
  );
}

interface Props {
  proyectos: ProyectoActivo[];
  proyectoInicial?: string;
  hoy: string;
  onGuardado: (gastos: GastoResumen[]) => void;
  onCancelar: () => void;
}

export default function FormGasto({ proyectos, proyectoInicial, hoy, onGuardado, onCancelar }: Props) {
  const [proyecto, setProyecto] = useState(proyectoInicial ?? proyectos[0]?.id ?? "");
  const [item, setItem] = useState("");
  const [tipo, setTipo] = useState<Tipo>("factura");
  const [rut, setRut] = useState("");
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [montoItem, setMontoItem] = useState("");
  const [montoEnvio, setMontoEnvio] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const subir = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  const neto = (Number(montoItem) || 0) + (Number(montoEnvio) || 0);
  const iva = tipo === "factura" ? Math.round(neto * 0.19) : 0;

  async function elegir(f: File | undefined) {
    if (!f) return;
    setError(null);
    setProcesando(true);
    const c = await comprimir(f);
    setProcesando(false);
    if (c.size > 10 * 1024 * 1024) return setError("El archivo supera 10 MB");
    setArchivo(c);
    setVista(c.type.startsWith("image/") && c.type !== "image/heic" ? URL.createObjectURL(c) : null);
  }

  async function guardar() {
    setError(null);
    if (!proyecto) return setError("Selecciona un proyecto");
    if (!item.trim()) return setError("Describe el ítem comprado");
    if (neto <= 0) return setError("Ingresa el monto");
    if (tipo === "factura" && !rut.trim()) return setError("El RUT del emisor es obligatorio en facturas");
    if (!folio.trim()) return setError("Ingresa el folio del documento");
    if (!archivo) return setError("Adjunta la foto o PDF del comprobante");

    const fd = new FormData();
    fd.set("proyecto_id", proyecto);
    fd.set("item", item.trim());
    fd.set("tipo_documento", tipo);
    fd.set("rut_emisor", tipo === "extranjero" ? "" : rut.trim());
    fd.set("folio_documento", folio.trim());
    fd.set("fecha_documento", fecha);
    fd.set("monto_item_clp", montoItem || "0");
    fd.set("monto_envio_clp", montoEnvio || "0");
    fd.set("comprobante", archivo);

    setOcupado(true);
    try {
      const res = await fetch("/api/gastos", { method: "POST", body: fd, credentials: "same-origin" });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new ErrorApi(res.status, datos.error ?? `Error ${res.status}`);
      onGuardado(datos.gastos);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo enviar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  const etiquetas: Record<Tipo, [string, string]> = {
    factura: ["Neto ítem (sin IVA)", "Neto envío (sin IVA)"],
    boleta: ["Ítem pagado", "Envío pagado"],
    extranjero: ["Ítem en CLP", "Envío / courier CLP"],
  };

  return (
    <div className="tarjeta animate-aparecer space-y-3 p-4">
      <div className="flex items-center justify-between border-b border-aether-border pb-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-white">
          <DollarSign size={14} className="text-aether-success" /> Declarar compra
        </span>
        <button type="button" onClick={onCancelar} className="text-xs text-slate-400">Cancelar</button>
      </div>

      <div>
        <label htmlFor="g-proyecto" className="etiqueta">Proyecto</label>
        <select id="g-proyecto" value={proyecto} onChange={(e) => setProyecto(e.target.value)} className="campo">
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="g-item" className="etiqueta">Ítem</label>
        <input id="g-item" value={item} maxLength={200} onChange={(e) => setItem(e.target.value)} placeholder="Ej: ST-Link V3 Mini" className="campo" />
      </div>

      <div>
        <span className="etiqueta">Documento</span>
        <div className="flex gap-2">
          {(["factura", "boleta", "extranjero"] as Tipo[]).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)} className={cx("segmento", tipo === t ? "segmento-activo" : "segmento-inactivo")}>
              {t === "factura" ? "Factura" : t === "boleta" ? "Boleta" : "Extranjero"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tipo !== "extranjero" && (
          <div>
            <label htmlFor="g-rut" className="etiqueta">RUT emisor{tipo === "boleta" && " (opc.)"}</label>
            <input id="g-rut" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="76.123.456-7" autoCapitalize="characters" className="campo" />
          </div>
        )}
        <div className={cx(tipo === "extranjero" && "col-span-2")}>
          <label htmlFor="g-folio" className="etiqueta">{tipo === "extranjero" ? "N° invoice / orden" : "Folio"}</label>
          <input id="g-folio" value={folio} maxLength={40} onChange={(e) => setFolio(e.target.value)} placeholder="44102" className="campo" />
        </div>
      </div>

      <div>
        <label htmlFor="g-fecha" className="etiqueta">Fecha del documento</label>
        <input id="g-fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="campo" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CampoMonto id="g-item-monto" etiqueta={etiquetas[tipo][0]} valor={montoItem} onCambio={setMontoItem} />
        <CampoMonto id="g-envio-monto" etiqueta={etiquetas[tipo][1]} valor={montoEnvio} onCambio={setMontoEnvio} />
      </div>

      <div className="rounded-lg bg-aether-bg px-3 py-2 text-[11px] text-slate-400">
        {tipo === "factura" ? (
          <>
            Costo proyecto <span className="font-semibold text-white">{clp(neto)}</span> · IVA crédito fiscal{" "}
            <span className="font-semibold text-aether-success">{clp(iva)}</span> · Total factura{" "}
            <span className="font-semibold text-white">{clp(neto + iva)}</span>
          </>
        ) : (
          <>
            Costo proyecto <span className="font-semibold text-white">{clp(neto)}</span> · IVA no recuperable
          </>
        )}
      </div>

      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={subir} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />

      {archivo ? (
        <div className="flex items-center gap-3 rounded-lg border border-aether-success/30 bg-aether-success/5 p-2">
          {vista ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vista} alt="Vista previa del comprobante" className="h-14 w-14 rounded object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded bg-aether-bg text-slate-400"><FileText size={22} /></span>
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-aether-success">Comprobante listo</p>
            <p className="truncate text-slate-400">{archivo.name} · {Math.max(1, Math.round(archivo.size / 1024))} KB</p>
          </div>
          <button type="button" onClick={() => { setArchivo(null); setVista(null); }} aria-label="Quitar comprobante" className="p-2 text-slate-400">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={procesando} onClick={() => camara.current?.click()} className="flex items-center justify-center gap-2 rounded-lg bg-aether-border py-3 text-xs font-semibold text-slate-200 active:scale-[0.98]">
            {procesando ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />} Tomar foto
          </button>
          <button type="button" disabled={procesando} onClick={() => subir.current?.click()} className="flex items-center justify-center gap-2 rounded-lg border border-aether-border py-3 text-xs font-semibold text-slate-300 active:scale-[0.98]">
            <Upload size={16} /> Subir PDF / imagen
          </button>
        </div>
      )}

      {error && <p className="rounded-lg bg-aether-danger/10 px-3 py-2 text-xs text-aether-danger">{error}</p>}

      <button type="button" onClick={guardar} disabled={ocupado || procesando} className="flex w-full items-center justify-center gap-2 rounded-xl bg-aether-success py-3 text-sm font-bold text-black active:scale-[0.99] disabled:opacity-50">
        {ocupado && <LoaderCircle size={16} className="animate-spin" />} Guardar compra
      </button>
    </div>
  );
}
