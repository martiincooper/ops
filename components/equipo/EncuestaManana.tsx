"use client";

import { Clock, LoaderCircle, Plane, Plus, Sunrise, Trash2 } from "lucide-react";
import { useState } from "react";
import SelectorProyectos from "@/components/SelectorProyectos";
import type { EstadoDia } from "@/lib/dominio";
import { ErrorApi, api } from "@/lib/cliente";

interface Props {
  estado: EstadoDia;
  obligatoria: boolean;
  onListo: (e: EstadoDia) => void;
  onCancelar: () => void;
  onOoo: () => void;
}

/** Bitácora de la mañana: 2 a 4 objetivos concretos. Obligatoria dentro de su ventana si aún no se hizo. */
export default function EncuestaManana({ estado, obligatoria, onListo, onCancelar, onOoo }: Props) {
  const defecto = estado.ultimo_proyecto_id ?? estado.proyectos[0]?.id ?? "";
  const [filas, setFilas] = useState(() =>
    Array.from({ length: 2 }, () => ({ proyecto_ids: defecto ? [defecto] : [], descripcion: "" })),
  );
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = estado.ventanas.manana;

  async function enviar() {
    setError(null);
    const limpias = filas.map((f) => ({ ...f, descripcion: f.descripcion.trim() }));
    if (limpias.some((f) => !f.descripcion)) return setError("Completa cada objetivo (o elimina la fila que sobra)");
    if (limpias.some((f) => f.proyecto_ids.length === 0)) return setError("Cada objetivo necesita al menos un proyecto");
    setOcupado(true);
    try {
      onListo(await api<EstadoDia>("/api/bitacora/manana", { method: "POST", json: { tareas: limpias } }));
    } catch (e) {
      setError((e as ErrorApi).message);
      setOcupado(false);
    }
  }

  return (
    <section className="animate-aparecer">
      <div className="mb-5 rounded-2xl border border-aether-accent/25 bg-gradient-to-br from-aether-accent/15 to-transparent p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-aether-accent-soft">
          <Sunrise size={14} /> Bitácora de la mañana
          <span className="ml-auto flex items-center gap-1 normal-case tracking-normal text-slate-400">
            <Clock size={11} /> {v.inicio}–{v.fin}
          </span>
        </p>
        <h1 className="mt-2 text-lg font-bold text-white">¿Qué vas a lograr hoy?</h1>
        <p className="mt-1 text-xs text-slate-400">
          {estado.hoy_texto}. Define de 2 a 4 objetivos concretos y verificables
          {obligatoria ? "; después verás tu tablero." : "."}
        </p>
      </div>

      {estado.proyectos.length === 0 ? (
        <p className="tarjeta p-4 text-xs text-aether-warning">No hay proyectos activos. Pide a tu jefatura que cree uno.</p>
      ) : (
        <div className="space-y-3">
          {filas.map((f, i) => (
            <div key={i} className="tarjeta animate-aparecer space-y-2 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aether-accent/20 text-[11px] font-bold text-aether-accent-soft">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <SelectorProyectos
                    etiqueta={`Proyectos del objetivo ${i + 1}`}
                    proyectos={estado.proyectos}
                    valor={f.proyecto_ids}
                    onCambio={(ids) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, proyecto_ids: ids } : x)))}
                  />
                  <p className="mt-1 truncate text-[10px] text-slate-500">
                    {estado.proyectos.filter((p) => f.proyecto_ids.includes(p.id)).map((p) => p.nombre).join(" · ") || "Elige uno o más proyectos"}
                  </p>
                </div>
                {filas.length > 2 && (
                  <button type="button" aria-label={`Quitar objetivo ${i + 1}`} onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} className="p-2 text-slate-500 hover:text-aether-danger">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <textarea
                aria-label={`Descripción del objetivo ${i + 1}`}
                value={f.descripcion}
                maxLength={280}
                rows={2}
                onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
                placeholder="Ej: Ruteo de líneas SPI en PCB v1.2"
                className="campo resize-none"
              />
            </div>
          ))}
          {filas.length < 4 && (
            <button
              type="button"
              onClick={() => setFilas((fs) => [...fs, { proyecto_ids: [...(fs[fs.length - 1]?.proyecto_ids ?? (defecto ? [defecto] : []))], descripcion: "" }])}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-aether-border py-2.5 text-xs font-semibold text-aether-accent-soft"
            >
              <Plus size={14} /> Agregar objetivo ({filas.length}/4)
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-xl border border-aether-danger/30 bg-aether-danger/10 px-3 py-2.5 text-xs text-aether-danger">{error}</p>}

      <button type="button" onClick={enviar} disabled={ocupado || estado.proyectos.length === 0} className="boton-primario mt-5">
        {ocupado && <LoaderCircle size={16} className="animate-spin" />} Registrar objetivos del día
      </button>

      <div className="mt-4 flex items-center justify-center gap-4 text-xs">
        <button type="button" onClick={onOoo} className="flex items-center gap-1 text-slate-400 hover:text-white">
          <Plane size={13} /> Hoy estoy fuera de oficina
        </button>
        {!obligatoria && (
          <button type="button" onClick={onCancelar} className="text-slate-400 hover:text-white">
            Volver al tablero
          </button>
        )}
      </div>
    </section>
  );
}
