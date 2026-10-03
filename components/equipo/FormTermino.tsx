"use client";

import { ArrowLeft, Check, Flag, LifeBuoy, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { CodigosProyecto } from "@/components/SelectorProyectos";
import { PASTELES } from "@/components/ui";
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
    <section className="tarjeta animate-aparecer p-5">
      <div className="mb-5 flex items-center justify-between">
        <button type="button" onClick={onCancelar} aria-label="Volver al tablero" className="boton-icono">
          <ArrowLeft size={20} />
        </button>
        <span className="chip bg-indigo-suave text-indigo-tinta">{cuenta.pct === null ? "—" : `${cuenta.pct}% logrado`}</span>
      </div>

      <h1 className="text-2xl font-semibold leading-tight text-tinta">Terminar jornada</h1>
      <p className="mt-2 text-sm text-tinta-2">
        {deOtroDia ? `Jornada del ${j!.fecha_texto.toLowerCase()}. ` : j ? `Comenzaste a las ${horaDe(j.checkin_manana)}. ` : ""}
        Confirma lo logrado y cuéntanos qué quedó pendiente.
      </p>

      <div className="mb-3 mt-6 flex items-baseline justify-between">
        <h2 className="titulo-seccion">Objetivos</h2>
        <span className="text-sm text-tinta-3">
          {cuenta.comp} de {cuenta.total} logrados
        </span>
      </div>
      <div className="space-y-3">
        {estado.tareas.map((t, i) => {
          const m = marcas[t.id] ?? { estado: "pendiente" as EstadoTarea, motivo: "" };
          const hecho = m.estado === "completado";
          return (
            <div key={t.id} className={cx("rounded-3xl", PASTELES[i % PASTELES.length])}>
              <button
                type="button"
                aria-pressed={hecho}
                onClick={() => marcar(t.id, hecho ? "pendiente" : "completado")}
                className="flex w-full items-start gap-3 p-4 text-left"
              >
                <span
                  className={cx(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition",
                    hecho ? "bg-tinta text-white" : "bg-superficie text-transparent ring-2 ring-tinta/15",
                  )}
                >
                  <Check size={15} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx("block font-medium leading-snug text-tinta", hecho && "text-tinta-2 line-through decoration-tinta-3")}>{t.descripcion}</span>
                  <CodigosProyecto codigos={t.proyectos.map((p) => p.codigo)} className="mt-2" />
                </span>
              </button>
              {!hecho && (
                <div className="px-4 pb-4">
                  <input
                    aria-label={`Motivo pendiente: ${t.descripcion}`}
                    value={m.motivo}
                    maxLength={280}
                    onChange={(e) => setMarcas((ms) => ({ ...ms, [t.id]: { ...m, motivo: e.target.value } }))}
                    placeholder="¿Por qué quedó pendiente?"
                    className="campo bg-superficie py-2.5 text-sm"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-3xl bg-suave p-4">
        <label htmlFor="bloqueo" className="mb-2 flex items-center gap-2 text-sm font-semibold text-tinta">
          <LifeBuoy size={16} className="text-alerta" /> ¿Algo te bloquea y necesitas ayuda? <span className="font-normal text-tinta-3">(opcional)</span>
        </label>
        <input id="bloqueo" value={bloqueo} maxLength={500} onChange={(e) => setBloqueo(e.target.value)} placeholder="Ej: Esperando componentes de importación" className="campo bg-superficie py-2.5 text-sm" />
        <p className="mt-2 text-xs text-tinta-3">Tu jefatura lo verá primero en el standup.</p>
      </div>

      {error && <p role="alert" className="mt-4 rounded-2xl bg-error-fondo px-4 py-3 text-sm text-error-tinta">{error}</p>}

      <button type="button" onClick={enviar} disabled={ocupado} className="boton-primario mt-6">
        {ocupado ? <LoaderCircle size={18} className="animate-spin" /> : <Flag size={18} />} Terminar jornada
      </button>
    </section>
  );
}
