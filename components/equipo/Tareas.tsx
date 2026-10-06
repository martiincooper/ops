"use client";

import { Check, ClipboardList, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { EstadoDia } from "@/lib/dominio";
import { ErrorApi, api, cx } from "@/lib/cliente";

/**
 * Tareas asignadas: pendientes que no son objetivos del día (p. ej. «pedirle a X la información»). Las agrega la
 * persona o la jefatura desde el standup; quedan aquí hasta marcarlas hechas y no cuentan para el Say-Do.
 */
export default function Tareas({ estado, onCambio }: { estado: EstadoDia; onCambio: (e: EstadoDia) => void }) {
  const [texto, setTexto] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tareas = estado.tareas_asignadas;
  const abiertas = tareas.filter((t) => !t.completada_en).length;

  async function enviar(clave: string, url: string, method: "POST" | "PATCH" | "DELETE", json?: unknown) {
    setOcupado(clave);
    setError(null);
    try {
      onCambio(await api<EstadoDia>(url, { method, json }));
      setConfirmar(null);
      return true;
    } catch (e) {
      setError((e as ErrorApi).message);
      return false;
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="titulo-seccion flex items-center gap-2">
          <ClipboardList size={18} className="text-indigo" /> Tareas pendientes
        </h2>
        <span className="text-xs text-tinta-3">{abiertas ? `${abiertas} por hacer` : "Quedan hasta marcarlas hechas"}</span>
      </div>

      {tareas.length === 0 && !agregando && (
        <p className="mb-3 text-sm text-tinta-3">Sin tareas. Aquí aparecen también las que te asigna tu jefatura.</p>
      )}

      <ul className="space-y-2">
        {tareas.map((t) => {
          const hecha = Boolean(t.completada_en);
          return (
            <li key={t.id} className="flex items-start gap-3 rounded-2xl bg-suave p-3">
              <button
                type="button"
                disabled={ocupado !== null}
                aria-pressed={hecha}
                aria-label={`Hecha: ${t.descripcion}`}
                onClick={() => enviar(t.id, `/api/tareas/${t.id}`, "PATCH", { completada: !hecha })}
                className={cx(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition active:scale-95",
                  hecha ? "bg-tinta text-white" : "bg-superficie text-transparent ring-2 ring-tinta/15 hover:ring-tinta/30",
                )}
              >
                {ocupado === t.id ? <LoaderCircle size={13} className="animate-spin text-tinta" /> : <Check size={13} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cx("break-words text-sm leading-snug text-tinta", hecha && "text-tinta-3 line-through")}>{t.descripcion}</p>
                {t.asignada && <p className="mt-0.5 text-xs text-indigo-tinta">Asignada por {t.creado_por_nombre}</p>}
              </div>
              {confirmar === t.id ? (
                <button type="button" onClick={() => enviar(t.id, `/api/tareas/${t.id}`, "DELETE")} className="shrink-0 rounded-full bg-error px-2.5 py-1 text-xs font-semibold text-white">
                  ¿Quitar?
                </button>
              ) : (
                <button type="button" aria-label={`Quitar: ${t.descripcion}`} onClick={() => setConfirmar(t.id)} className="shrink-0 rounded-full p-1.5 text-tinta-3 hover:bg-error-fondo hover:text-error-tinta">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {agregando ? (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            if (await enviar("nueva", "/api/tareas", "POST", { descripcion: texto.trim() })) setTexto("");
          }}
        >
          <input
            autoFocus
            aria-label="Nueva tarea"
            value={texto}
            maxLength={280}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej: Pedirle a Carla las medidas del gabinete"
            className="campo min-w-0 flex-1 bg-superficie py-2 text-sm"
          />
          <button type="submit" disabled={!texto.trim() || ocupado !== null} className="boton shrink-0">
            {ocupado === "nueva" ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Agregar
          </button>
          <button type="button" onClick={() => setAgregando(false)} className="boton-texto shrink-0">
            Cerrar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-indigo/25 py-2.5 text-sm font-semibold text-indigo-tinta hover:bg-indigo-suave/50"
        >
          <Plus size={16} /> Agregar tarea
        </button>
      )}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}
    </section>
  );
}
