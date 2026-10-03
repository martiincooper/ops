"use client";

import { ArrowLeft, LoaderCircle, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import SelectorProyectos from "@/components/SelectorProyectos";
import type { EstadoDia } from "@/lib/dominio";
import { ErrorApi, api } from "@/lib/cliente";

interface Props {
  estado: EstadoDia;
  onListo: (e: EstadoDia) => void;
  onCancelar: () => void;
}

/** Comenzar jornada: 2 a 4 objetivos concretos, cada uno con uno o más proyectos. A cualquier hora. */
export default function FormComienzo({ estado, onListo, onCancelar }: Props) {
  const defecto = estado.ultimo_proyecto_id ?? estado.proyectos[0]?.id ?? "";
  const [filas, setFilas] = useState(() =>
    Array.from({ length: 2 }, () => ({ proyecto_ids: defecto ? [defecto] : [], descripcion: "" })),
  );
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    const limpias = filas.map((f) => ({ ...f, descripcion: f.descripcion.trim() }));
    if (limpias.some((f) => !f.descripcion)) return setError("Completa cada objetivo (o elimina la fila que sobra)");
    if (limpias.some((f) => f.proyecto_ids.length === 0)) return setError("Cada objetivo necesita al menos un proyecto");
    setOcupado(true);
    try {
      onListo(await api<EstadoDia>("/api/jornada/comenzar", { method: "POST", json: { tareas: limpias } }));
    } catch (e) {
      setError((e as ErrorApi).message);
      setOcupado(false);
    }
  }

  return (
    <section className="tarjeta animate-aparecer p-5">
      <div className="mb-5 flex items-center justify-between">
        <button type="button" onClick={onCancelar} aria-label="Volver" className="boton-icono">
          <ArrowLeft size={20} />
        </button>
        <span className="chip bg-indigo-suave text-indigo-tinta">{estado.hoy_texto}</span>
      </div>

      <h1 className="text-2xl font-semibold leading-tight text-tinta">¿Qué vas a lograr en esta jornada?</h1>
      <p className="mt-2 text-sm text-tinta-2">
        Define de 2 a 4 objetivos concretos y verificables. Trabaja a tu ritmo y termina la jornada cuando cierres por hoy.
      </p>

      {estado.proyectos.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-alerta-fondo p-4 text-sm text-alerta-tinta">No hay proyectos activos. Pide a tu jefatura que cree uno.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {filas.map((f, i) => (
            <div key={i} className="animate-aparecer rounded-3xl bg-suave p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-tinta">Objetivo {i + 1}</span>
                {filas.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Quitar objetivo ${i + 1}`}
                    onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                    className="rounded-full p-1.5 text-tinta-3 hover:bg-error-fondo hover:text-error-tinta"
                  >
                    <Trash2 size={16} />
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
                className="campo resize-none bg-superficie"
              />
              <p className="mb-2 mt-3 text-xs text-tinta-3">Proyecto(s)</p>
              <SelectorProyectos
                etiqueta={`Proyectos del objetivo ${i + 1}`}
                proyectos={estado.proyectos}
                valor={f.proyecto_ids}
                onCambio={(ids) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, proyecto_ids: ids } : x)))}
              />
              <p className="mt-2 truncate text-xs text-tinta-3">
                {estado.proyectos.filter((p) => f.proyecto_ids.includes(p.id)).map((p) => p.nombre).join(" · ") || "Elige uno o más proyectos"}
              </p>
            </div>
          ))}
          {filas.length < 4 && (
            <button
              type="button"
              onClick={() => setFilas((fs) => [...fs, { proyecto_ids: [...(fs[fs.length - 1]?.proyecto_ids ?? (defecto ? [defecto] : []))], descripcion: "" }])}
              className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-indigo/25 py-3.5 text-sm font-semibold text-indigo-tinta hover:bg-indigo-suave/50"
            >
              <Plus size={16} /> Agregar objetivo ({filas.length}/4)
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-2xl bg-error-fondo px-4 py-3 text-sm text-error-tinta">{error}</p>}

      <button type="button" onClick={enviar} disabled={ocupado || estado.proyectos.length === 0} className="boton-primario mt-6">
        {ocupado ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} className="fill-white" />} Comenzar jornada
      </button>
    </section>
  );
}
