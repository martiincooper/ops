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
    <section className="tarjeta p-6">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-suave text-indigo-tinta">
          <Target size={20} />
        </span>
        <span className="flex-1">
          <span className="block text-base font-semibold text-tinta">Metas de los indicadores</span>
          <span className="block text-sm text-tinta-3">Las define la jefatura para esta empresa; gerencia las ve en cada indicador.</span>
        </span>
        <span className="boton-suave">{abierto ? "Cerrar" : "Editar"}</span>
      </button>
      {abierto && (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {CAMPOS.map((c) => (
            <div key={c.clave} className="rounded-2xl bg-suave p-4">
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
                  className="campo w-28 bg-superficie"
                />
                <span className="text-sm text-tinta-3">
                  {c.sufijo} · por defecto {defecto[c.clave]}
                </span>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 md:col-span-3">
            <button type="button" onClick={guardar} disabled={ocupado} className="boton px-6 py-2.5">
              {ocupado && <LoaderCircle size={16} className="animate-spin" />} Guardar metas
            </button>
            {aviso && (
              <p className={`rounded-full px-4 py-2 text-sm ${aviso.ok ? "bg-ok-fondo text-ok-tinta" : "bg-error-fondo text-error-tinta"}`}>{aviso.texto}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}