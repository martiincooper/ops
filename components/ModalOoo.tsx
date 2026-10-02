"use client";

import { LoaderCircle, Plane, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Ausencia, EstadoDia } from "@/lib/dominio";
import { ErrorApi, api, cx } from "@/lib/cliente";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCorta(f: string) {
  const [y, m, d] = f.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]} ${d} ${MESES[m - 1]}`;
}

export function textoAusencia(a: Ausencia) {
  return a.dia_completo ? "Día completo" : `${a.hora_inicio} – ${a.hora_fin}`;
}

interface Props {
  hoy: string;
  ausencias: Ausencia[];
  onCambio: (e: EstadoDia) => void;
  onCerrar: () => void;
}

export default function ModalOoo({ hoy, ausencias, onCambio, onCerrar }: Props) {
  const [fecha, setFecha] = useState(hoy);
  const [diaCompleto, setDiaCompleto] = useState(true);
  const [inicio, setInicio] = useState("14:00");
  const [fin, setFin] = useState("17:00");
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

  async function registrar() {
    setOcupado("nuevo");
    setError(null);
    setOk(null);
    try {
      const e = await api<EstadoDia>("/api/ooo", {
        method: "POST",
        json: {
          fecha,
          dia_completo: diaCompleto,
          hora_inicio: diaCompleto ? null : inicio,
          hora_fin: diaCompleto ? null : fin,
          motivo: motivo.trim() || null,
        },
      });
      onCambio(e);
      setMotivo("");
      setOk(`Ausencia registrada: ${fechaCorta(fecha)}, ${diaCompleto ? "día completo" : `${inicio} – ${fin}`}`);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setOcupado(null);
    }
  }

  async function cancelar(id: string) {
    setOcupado(id);
    setError(null);
    setOk(null);
    try {
      onCambio(await api<EstadoDia>(`/api/ooo/${id}`, { method: "DELETE" }));
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
      aria-labelledby="titulo-ooo"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md animate-subir space-y-4 overflow-y-auto rounded-t-3xl border-t border-aether-border bg-aether-card p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
      >
        <div className="mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-slate-700" />
        <div className="flex items-center justify-between">
          <h3 id="titulo-ooo" className="flex items-center gap-2 text-sm font-bold text-white">
            <Plane size={16} className="text-aether-accent-soft" /> Fuera de Oficina
          </h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-400 hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <div>
          <label htmlFor="ooo-fecha" className="etiqueta">Fecha</label>
          <input id="ooo-fecha" type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setDiaCompleto(true)} className={cx("segmento", diaCompleto ? "segmento-activo" : "segmento-inactivo")}>
            Todo el día
          </button>
          <button type="button" onClick={() => setDiaCompleto(false)} className={cx("segmento", !diaCompleto ? "segmento-activo" : "segmento-inactivo")}>
            Parcial
          </button>
        </div>
        <p className="-mt-2 text-[11px] text-slate-500">
          {diaCompleto
            ? "Ese día no se exige bitácora y no afecta tu racha."
            : "Podrás marcar objetivos como postergados por ausencia al cerrar la jornada."}
        </p>

        {!diaCompleto && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ooo-inicio" className="etiqueta">Hora inicio</label>
              <input id="ooo-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className="campo" />
            </div>
            <div>
              <label htmlFor="ooo-fin" className="etiqueta">Hora término</label>
              <input id="ooo-fin" type="time" value={fin} onChange={(e) => setFin(e.target.value)} className="campo" />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="ooo-motivo" className="etiqueta">Motivo (opcional)</label>
          <input
            id="ooo-motivo"
            type="text"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Trámite personal, médico"
            className="campo"
          />
        </div>

        {error && <p className="rounded-lg bg-aether-danger/10 px-3 py-2 text-xs text-aether-danger">{error}</p>}
        {ok && <p className="rounded-lg bg-aether-success/10 px-3 py-2 text-xs text-aether-success">{ok}</p>}

        <button
          type="button"
          onClick={registrar}
          disabled={ocupado !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-aether-success py-3 text-sm font-bold text-black transition-all active:scale-[0.99] disabled:opacity-50"
        >
          {ocupado === "nuevo" && <LoaderCircle size={16} className="animate-spin" />}
          Confirmar ausencia
        </button>

        {ausencias.length > 0 && (
          <div className="border-t border-aether-border pt-3">
            <p className="etiqueta">Próximas ausencias</p>
            <ul className="divide-y divide-aether-border">
              {ausencias.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <span className="font-semibold text-white">{a.fecha === hoy ? "Hoy" : fechaCorta(a.fecha)}</span>
                    <span className="text-slate-400"> · {textoAusencia(a)}</span>
                    {a.motivo && <p className="text-[11px] text-slate-500">{a.motivo}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelar(a.id)}
                    disabled={ocupado !== null}
                    aria-label="Cancelar ausencia"
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
