"use client";

import { LoaderCircle, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Metas } from "@/lib/metas";
import { ErrorApi, api } from "@/lib/cliente";

const CAMPOS: { clave: keyof Metas; etiqueta: string; sufijo: string; min: number; max: number }[] = [
  { clave: "tolerancia_costo_pct", etiqueta: "Tolerancia de costo sobre la estimación BOM", sufijo: "%", min: 0, max: 100 },
  { clave: "objetivos_diarios_pct", etiqueta: "Meta de objetivos diarios logrados (14 días)", sufijo: "%", min: 50, max: 100 },
  { clave: "bloqueo_max_dias", etiqueta: "Días máximos de un bloqueo sin resolver", sufijo: "días", min: 1, max: 30 },
];

/** Metas de los indicadores de gerencia (solo administradores, por empresa). */
export default function EditorMetas({ empresa, metas, defecto }: { empresa: string; metas: Metas; defecto: Metas }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<keyof Metas, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.clave, String(metas[c.clave])])) as Record<keyof Metas, string>,
  );
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardar() {
    setOcupado(true);
    setAviso(null);
    try {
      await api(`/api/admin/metas?empresa=${encodeURIComponent(empresa)}`, {
        method: "PUT",
        json: Object.fromEntries(CAMPOS.map((c) => [c.clave, Number(valores[c.clave])])),
      });
      setAviso({ ok: true, texto: "Metas guardadas." });
      router.refresh();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof ErrorApi ? e.message : "No se pudo guardar." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="tarjeta mb-4 p-4">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1.5 text-xs font-bold text-white">
          <Target size={14} className="text-aether-accent-soft" /> Metas de los indicadores
        </span>
        <span className="text-[11px] text-slate-400">{abierto ? "Cerrar" : "Editar"}</span>
      </button>
      <p className="mt-1 text-[11px] text-slate-500">Las define la jefatura para esta empresa; gerencia las ve en cada indicador.</p>
      {abierto && (
        <div className="mt-3 space-y-3">
          {CAMPOS.map((c) => (
            <div key={c.clave}>
              <label htmlFor={`meta-${c.clave}`} className="etiqueta">
                {c.etiqueta}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`meta-${c.clave}`}
                  type="number"
                  inputMode="numeric"
                  min={c.min}
                  max={c.max}
                  value={valores[c.clave]}
                  onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
                  className="campo w-28 text-sm"
                />
                <span className="text-xs text-slate-400">
                  {c.sufijo} · por defecto {defecto[c.clave]}
                </span>
              </div>
            </div>
          ))}
          {aviso && (
            <p className={`rounded-lg px-3 py-2 text-xs ${aviso.ok ? "bg-aether-success/10 text-aether-success" : "bg-aether-danger/10 text-aether-danger"}`}>
              {aviso.texto}
            </p>
          )}
          <button type="button" onClick={guardar} disabled={ocupado} className="flex items-center gap-2 rounded-lg bg-aether-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            {ocupado && <LoaderCircle size={14} className="animate-spin" />} Guardar metas
          </button>
        </div>
      )}
    </section>
  );
}
