"use client";

import { CircleCheck, Circle, Flag, LifeBuoy, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import Anillo from "@/components/Anillo";
import { CodigosProyecto } from "@/components/SelectorProyectos";
import type { EstadoDia } from "@/lib/dominio";
import { ErrorApi, api, cx, horaDe } from "@/lib/cliente";

type EstadoTarea = "completado" | "pendiente" | "postergado_ooo";

interface Props {
  estado: EstadoDia;
  onListo: (e: EstadoDia) => void;
  onCancelar: () => void;
}

/** Terminar jornada: balance de cada objetivo. Parte de lo que la persona ya marcó mientras trabajaba. */
export default function FormTermino({ estado, onListo, onCancelar }: Props) {
  const [marcas, setMarcas] = useState<Record<string, { estado: EstadoTarea; motivo: string }>>(() =>
    Object.fromEntries(estado.tareas.map((t) => [t.id, { estado: t.estado, motivo: t.motivo_pendiente ?? "" }])),
  );
  const [bloqueo, setBloqueo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const j = estado.jornada;
  const deOtroDia = j !== null && j.fecha !== estado.hoy;

  const cuenta = useMemo(() => {
    const lista = estado.tareas.map((t) => marcas[t.id]?.estado ?? t.estado);
    const post = lista.filter((e) => e === "postergado_ooo").length;
    const comp = lista.filter((e) => e === "completado").length;
    const total = lista.length - post;
    return { comp, total, pct: total > 0 ? Math.round((comp / total) * 100) : null };
  }, [estado.tareas, marcas]);

  const marcar = (id: string, e: EstadoTarea) => setMarcas((m) => ({ ...m, [id]: { motivo: m[id]?.motivo ?? "", estado: e } }));

  async function enviar() {
    setError(null);
    const sinMotivo = estado.tareas.find((t) => marcas[t.id]?.estado === "pendiente" && !marcas[t.id]?.motivo.trim());
    if (sinMotivo) return setError(`Cuéntanos por qué quedó pendiente: "${sinMotivo.descripcion}"`);
    setOcupado(true);
    try {
      onListo(
        await api<EstadoDia>("/api/jornada/terminar", {
          method: "POST",
          json: {
            tareas: estado.tareas.map((t) => ({
              id: t.id,
              estado: marcas[t.id]?.estado ?? "pendiente",
              motivo_pendiente: marcas[t.id]?.estado === "completado" ? null : marcas[t.id]?.motivo.trim() || null,
            })),
            bloqueo: bloqueo.trim() || null,
          },
        }),
      );
    } catch (e) {
      setError((e as ErrorApi).message);
      setOcupado(false);
    }
  }

  return (
    <section className="animate-aparecer">
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-aether-warning/25 bg-gradient-to-br from-aether-warning/10 to-transparent p-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-aether-warning">
            <Flag size={14} /> Terminar jornada
          </p>
          <h1 className="mt-2 text-lg font-bold text-white">¿Cómo te fue?</h1>
          <p className="mt-1 text-xs text-slate-400">
            {deOtroDia ? `Jornada del ${j!.fecha_texto.toLowerCase()}. ` : j ? `Comenzaste a las ${horaDe(j.checkin_manana)}. ` : ""}
            Confirma lo logrado y cuéntanos qué quedó pendiente.
          </p>
        </div>
        <Anillo valor={cuenta.pct} tamano={68} etiqueta="logrado" />
      </div>

      <div className="space-y-3">
        {estado.tareas.map((t) => {
          const m = marcas[t.id] ?? { estado: "pendiente" as EstadoTarea, motivo: "" };
          const hecho = m.estado === "completado";
          return (
            <div key={t.id} className={cx("rounded-xl border transition-colors", hecho ? "border-aether-success/30 bg-aether-success/5" : "border-aether-border bg-aether-card")}>
              <button type="button" aria-pressed={hecho} onClick={() => marcar(t.id, hecho ? "pendiente" : "completado")} className="flex w-full items-start gap-3 p-3.5 text-left">
                <span className={cx("mt-0.5 transition-transform", hecho ? "scale-110 text-aether-success" : "text-slate-500")}>
                  {hecho ? <CircleCheck size={20} className="fill-aether-success text-aether-bg" /> : <Circle size={20} />}
                </span>
                <span className="flex-1">
                  <CodigosProyecto codigos={t.proyectos.map((p) => p.codigo)} />
                  <span className={cx("mt-1 block text-sm leading-snug", hecho ? "text-slate-400 line-through" : "font-medium text-slate-100")}>{t.descripcion}</span>
                </span>
              </button>
              {!hecho && (
                <div className="space-y-2 px-3.5 pb-3.5">
                  <input
                    aria-label={`Motivo pendiente: ${t.descripcion}`}
                    value={m.motivo}
                    maxLength={280}
                    onChange={(e) => setMarcas((ms) => ({ ...ms, [t.id]: { ...m, motivo: e.target.value } }))}
                    placeholder="¿Por qué quedó pendiente?"
                    className="campo border-aether-warning/25 py-2 text-sm focus:border-aether-warning"
                  />
                </div>
              )}
            </div>
          );
        })}

        <div className="tarjeta p-3.5">
          <label htmlFor="bloqueo" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-aether-warning">
            <LifeBuoy size={14} /> ¿Algo te bloquea y necesitas ayuda? (opcional)
          </label>
          <input id="bloqueo" value={bloqueo} maxLength={500} onChange={(e) => setBloqueo(e.target.value)} placeholder="Ej: Esperando componentes de importación" className="campo py-2 text-sm" />
          <p className="mt-1.5 text-[11px] text-slate-500">Tu jefatura lo verá primero en el standup.</p>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-aether-danger/30 bg-aether-danger/10 px-3 py-2.5 text-xs text-aether-danger">{error}</p>}

      <button type="button" onClick={enviar} disabled={ocupado} className="boton-primario mt-5">
        {ocupado && <LoaderCircle size={16} className="animate-spin" />} Terminar jornada
      </button>
      <button type="button" onClick={onCancelar} className="mx-auto mt-4 block text-xs text-slate-400 hover:text-white">
        Volver al tablero
      </button>
    </section>
  );
}
