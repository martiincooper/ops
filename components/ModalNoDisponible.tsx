"use client";

import { CalendarOff, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Ausencia, EstadoDia } from "@/lib/dominio";
import { ErrorApi, api } from "@/lib/cliente";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCorta(f: string) {
  const [y, m, d] = f.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]} ${d} ${MESES[m - 1]}`;
}

interface Props {
  hoy: string;
  dias: Ausencia[];
  onCambio: (e: EstadoDia) => void;
  onCerrar: () => void;
}

/** Días completos en que la persona no estará disponible (para la planificación de la jefatura). */
export default function ModalNoDisponible({ hoy, dias, onCambio, onCerrar }: Props) {
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onCerrar]);

  async function marcar() {
    setOcupado("nuevo");
    setError(null);
    setOk(null);
    try {
      onCambio(await api<EstadoDia>("/api/no-disponible", { method: "POST", json: { fecha, motivo: motivo.trim() || null } }));
      setMotivo("");
      setOk(`Marcado: ${fecha === hoy ? "hoy" : fechaCorta(fecha)}`);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setOcupado(null);
    }
  }

  async function quitar(id: string) {
    setOcupado(id);
    setError(null);
    setOk(null);
    try {
      onCambio(await api<EstadoDia>(`/api/no-disponible/${id}`, { method: "DELETE" }));
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/30 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-nd"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md animate-subir space-y-4 overflow-y-auto rounded-t-[2rem] bg-superficie p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-tarjeta sm:rounded-[2rem]"
      >
        <div className="mx-auto -mt-2 mb-1 h-1.5 w-12 rounded-full bg-linea sm:hidden" />
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pastel-azul text-indigo">
            <CalendarOff size={22} />
          </span>
          <h3 id="titulo-nd" className="flex-1 text-lg font-semibold text-tinta">
            Días no disponibles
          </h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="boton-icono h-10 w-10">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-tinta-3">Avisa qué días no vas a trabajar para que tu jefatura pueda planificar.</p>

        <div>
          <label htmlFor="nd-fecha" className="etiqueta">Día</label>
          <input id="nd-fecha" type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
        <div>
          <label htmlFor="nd-motivo" className="etiqueta">Motivo (opcional)</label>
          <input
            id="nd-motivo"
            type="text"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Viaje, trámite, otro proyecto"
            className="campo"
          />
        </div>

        {error && <p className="rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}
        {ok && <p className="rounded-2xl bg-ok-fondo px-4 py-2.5 text-sm text-ok-tinta">{ok}</p>}

        <button type="button" onClick={marcar} disabled={ocupado !== null} className="boton-primario">
          {ocupado === "nuevo" && <LoaderCircle size={18} className="animate-spin" />}
          Marcar no disponible
        </button>

        {dias.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-sm font-semibold text-tinta">Próximos días no disponibles</p>
            <ul className="space-y-2">
              {dias.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-2xl bg-suave px-4 py-2.5 text-sm">
                  <div>
                    <span className="font-semibold capitalize text-tinta">{a.fecha === hoy ? "Hoy" : fechaCorta(a.fecha)}</span>
                    {a.motivo && <p className="text-xs text-tinta-3">{a.motivo}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => quitar(a.id)}
                    disabled={ocupado !== null}
                    aria-label={`Quitar ${a.fecha === hoy ? "hoy" : fechaCorta(a.fecha)}`}
                    className="rounded-full p-2 text-tinta-3 hover:bg-error-fondo hover:text-error-tinta disabled:opacity-40"
                  >
                    {ocupado === a.id ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
