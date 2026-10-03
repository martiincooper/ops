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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-nd"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md animate-subir space-y-4 overflow-y-auto rounded-t-3xl border-t border-aether-border bg-aether-card p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div className="mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-slate-700" />
        <div className="flex items-center justify-between">
          <h3 id="titulo-nd" className="flex items-center gap-2 text-sm font-bold text-white">
            <CalendarOff size={16} className="text-aether-accent-soft" /> Días no disponibles
          </h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-400 hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
        <p className="-mt-2 text-[11px] text-slate-500">
          Avisa qué días no vas a trabajar para que tu jefatura pueda planificar. No afecta tu racha.
        </p>

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

        {error && <p className="rounded-lg bg-aether-danger/10 px-3 py-2 text-xs text-aether-danger">{error}</p>}
        {ok && <p className="rounded-lg bg-aether-success/10 px-3 py-2 text-xs text-aether-success">{ok}</p>}

        <button
          type="button"
          onClick={marcar}
          disabled={ocupado !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-aether-success py-3 text-sm font-bold text-black transition-all active:scale-[0.99] disabled:opacity-50"
        >
          {ocupado === "nuevo" && <LoaderCircle size={16} className="animate-spin" />}
          Marcar no disponible
        </button>

        {dias.length > 0 && (
          <div className="border-t border-aether-border pt-3">
            <p className="etiqueta">Próximos días no disponibles</p>
            <ul className="divide-y divide-aether-border">
              {dias.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <span className="font-semibold text-white">{a.fecha === hoy ? "Hoy" : fechaCorta(a.fecha)}</span>
                    {a.motivo && <p className="text-[11px] text-slate-500">{a.motivo}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => quitar(a.id)}
                    disabled={ocupado !== null}
                    aria-label={`Quitar ${a.fecha === hoy ? "hoy" : fechaCorta(a.fecha)}`}
                    className="rounded-lg p-2 text-slate-500 hover:bg-aether-danger/10 hover:text-aether-danger disabled:opacity-40"
                  >
                    {ocupado === a.id ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
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
