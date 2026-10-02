"use client";

import { Check, FileText, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FilaGasto } from "@/lib/tableros";
import { api, clp, cx } from "@/lib/cliente";
import { Aviso, Cargando, conEmpresa, fechaHora, useAccion, useDatos, type Alcance } from "./comun";

const ESTADO = {
  pendiente: "text-aether-warning bg-aether-warning/10",
  aprobado: "text-aether-success bg-aether-success/10",
  rechazado: "text-aether-danger bg-aether-danger/10",
} as const;

const esImagenVisible = (mime: string) => mime.startsWith("image/") && mime !== "image/heic";

function Miniatura({ g, empresa, onClick }: { g: FilaGasto; empresa: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block h-12 w-12 overflow-hidden rounded border border-aether-border bg-aether-bg hover:border-aether-accent-soft" aria-label="Ver comprobante">
      {esImagenVisible(g.comprobante_mime) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={conEmpresa(`/api/comprobantes/${g.id}`, empresa)} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-slate-400">
          <FileText size={18} />
        </span>
      )}
    </button>
  );
}

function Revision({ g, empresa, onCerrar, onCambio }: { g: FilaGasto; empresa: string; onCerrar: () => void; onCambio: (t: string) => void }) {
  const [motivo, setMotivo] = useState(g.observacion ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = conEmpresa(`/api/comprobantes/${g.id}`, empresa);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCerrar]);

  async function decidir(estado: "aprobado" | "rechazado" | "pendiente") {
    setOcupado(estado);
    setError(null);
    try {
      await api(conEmpresa(`/api/admin/gastos/${g.id}`, empresa), {
        method: "PATCH",
        json: { estado, observacion: motivo.trim() || null },
      });
      onCambio(estado === "pendiente" ? `${g.item}: vuelve a pendiente.` : `${g.item}: ${estado}.`);
    } catch (e) {
      setError((e as Error).message);
      setOcupado(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={onCerrar} role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} className="grid h-[85vh] w-full max-w-6xl grid-cols-[1.6fr_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-aether-border bg-aether-card">
        <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-black/40 p-3">
          {esImagenVisible(g.comprobante_mime) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`Comprobante ${g.folio_documento}`} className="max-h-full max-w-full object-contain" />
          ) : g.comprobante_mime === "application/pdf" ? (
            <iframe src={src} title="Comprobante PDF" className="h-full w-full bg-white" />
          ) : (
            <a href={src} target="_blank" rel="noopener" className="text-xs text-aether-accent-soft underline">
              Descargar comprobante (HEIC: el navegador no lo muestra)
            </a>
          )}
        </div>
        <div className="flex min-h-0 flex-col overflow-y-auto p-5 text-xs">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-base font-bold text-white">{g.item}</p>
              <p className="text-slate-400">
                {g.persona} · <span className="font-mono text-aether-accent-soft">{g.proyecto_codigo}</span>
              </p>
            </div>
            <button onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-400 hover:bg-white/5">
              <X size={18} />
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-slate-500">Documento</dt>
            <dd className="capitalize text-slate-200">{g.tipo_documento} {g.folio_documento}</dd>
            <dt className="text-slate-500">RUT emisor</dt>
            <dd className="text-slate-200">{g.rut_emisor ?? "—"}</dd>
            <dt className="text-slate-500">Fecha documento</dt>
            <dd className="text-slate-200">{g.fecha_documento}</dd>
            <dt className="text-slate-500">{g.tipo_documento === "factura" ? "Componentes (neto)" : "Componentes"}</dt>
            <dd className="tabular-nums text-slate-200">{clp(g.monto_item_clp)}</dd>
            <dt className="text-slate-500">{g.tipo_documento === "factura" ? "Envío (neto)" : "Envío"}</dt>
            <dd className="tabular-nums text-slate-200">{clp(g.monto_envio_clp)}</dd>
            <dt className="text-slate-500">IVA crédito fiscal</dt>
            <dd className="tabular-nums text-aether-success">{clp(g.iva_clp)}</dd>
            <dt className="text-slate-500">Total documento</dt>
            <dd className="font-semibold tabular-nums text-white">{clp(g.monto_item_clp + g.monto_envio_clp + g.iva_clp)}</dd>
            <dt className="text-slate-500">Rendido</dt>
            <dd className="text-slate-200">{fechaHora(g.creado_en)}</dd>
            {g.validado_por_nombre && (
              <>
                <dt className="text-slate-500">Revisado por</dt>
                <dd className="text-slate-200">
                  {g.validado_por_nombre} · {fechaHora(g.validado_en)}
                </dd>
              </>
            )}
          </dl>
          <p className="mt-4 text-[11px] text-slate-500">Compara montos, folio y RUT con la imagen antes de aprobar.</p>
          <label htmlFor="motivo" className="etiqueta mt-4">Observación (obligatoria para rechazar)</label>
          <textarea id="motivo" rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo resize-none text-sm" placeholder="Ej: el folio no coincide con la imagen" />
          {error && <p className="mt-2 rounded bg-aether-danger/10 px-2 py-1.5 text-aether-danger">{error}</p>}
          <div className="mt-auto flex gap-2 pt-4">
            <button type="button" disabled={ocupado !== null} onClick={() => decidir("aprobado")} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-aether-success py-2.5 text-sm font-bold text-black disabled:opacity-50">
              {ocupado === "aprobado" ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Aprobar
            </button>
            <button type="button" disabled={ocupado !== null} onClick={() => decidir("rechazado")} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-aether-danger py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {ocupado === "rechazado" ? <LoaderCircle size={15} className="animate-spin" /> : <X size={15} />} Rechazar
            </button>
            {g.estado !== "pendiente" && (
              <button type="button" disabled={ocupado !== null} onClick={() => decidir("pendiente")} title="Volver a pendiente" className="rounded-lg border border-aether-border px-3 text-slate-300 disabled:opacity-50">
                <RotateCcw size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Compras({ empresa, alcance }: { empresa: string; alcance: Alcance }) {
  const [estado, setEstado] = useState<"pendiente" | "todos">("pendiente");
  const { datos, error, cargando, recargar } = useDatos<{ gastos: FilaGasto[] }>(
    conEmpresa("/api/admin/gastos", empresa, { alcance, estado }),
  );
  const { aviso, setAviso } = useAccion();
  const [abierto, setAbierto] = useState<FilaGasto | null>(null);
  const gastos = datos?.gastos ?? [];
  const tot = gastos.reduce(
    (s, g) => ({ item: s.item + g.monto_item_clp, envio: s.envio + g.monto_envio_clp, iva: s.iva + g.iva_clp }),
    { item: 0, envio: 0, iva: 0 },
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {(["pendiente", "todos"] as const).map((e) => (
          <button key={e} onClick={() => setEstado(e)} className={cx("rounded-lg px-3 py-1.5 text-xs font-semibold", estado === e ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5")}>
            {e === "pendiente" ? "Por validar" : "Todas"}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">
          {gastos.length} compra(s) · componentes {clp(tot.item)} · envío {clp(tot.envio)} · IVA {clp(tot.iva)}
        </span>
      </div>
      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && gastos.length === 0 && (
        <p className="tarjeta px-4 py-6 text-center text-xs text-slate-500">{estado === "pendiente" ? "No hay compras por validar." : "Sin compras rendidas."}</p>
      )}
      {gastos.length > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-aether-border text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Comprobante</th>
                <th className="px-3 py-3 font-medium">Persona · proyecto</th>
                <th className="px-3 py-3 font-medium">Ítem</th>
                <th className="px-3 py-3 font-medium">Documento</th>
                <th className="px-3 py-3 text-right font-medium">Componentes</th>
                <th className="px-3 py-3 text-right font-medium">Envío</th>
                <th className="px-3 py-3 text-right font-medium">IVA rec.</th>
                <th className="px-3 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-aether-border">
              {gastos.map((g) => (
                <tr key={g.id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setAbierto(g)}>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Miniatura g={g} empresa={empresa} onClick={() => setAbierto(g)} />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-white">{g.persona}</p>
                    <p className="font-mono text-[10px] text-aether-accent-soft">{g.proyecto_codigo}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-200">{g.item}</td>
                  <td className="px-3 py-2 text-slate-400">
                    <span className="capitalize text-slate-200">{g.tipo_documento}</span> {g.folio_documento}
                    {g.rut_emisor && <span className="block text-[10px]">RUT {g.rut_emisor}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{clp(g.monto_item_clp)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{clp(g.monto_envio_clp)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-aether-success">{g.iva_clp ? clp(g.iva_clp) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-semibold", ESTADO[g.estado])}>{g.estado}</span>
                    {g.observacion && <span className="mt-1 block max-w-40 truncate text-[10px] text-slate-500" title={g.observacion}>{g.observacion}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abierto && (
        <Revision
          g={abierto}
          empresa={empresa}
          onCerrar={() => setAbierto(null)}
          onCambio={async (t) => {
            setAbierto(null);
            setAviso({ tipo: "ok", texto: t });
            await recargar();
          }}
        />
      )}
    </div>
  );
}
