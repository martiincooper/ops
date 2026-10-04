"use client";

import { Check, LifeBuoy, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import SelectorProyectos, { CodigosProyecto } from "@/components/SelectorProyectos";
import { PASTELES } from "@/components/ui";
import type { EstadoDia, TareaDia } from "@/lib/dominio";
import { ErrorApi, api, cx } from "@/lib/cliente";

const MAX = 4;

interface Props {
  estado: EstadoDia;
  onCambio: (e: EstadoDia) => void;
}

/** Descripción + proyectos de un objetivo (nuevo o en edición). */
function FormObjetivo({
  estado,
  inicial,
  etiqueta,
  ocupado,
  onGuardar,
  onCancelar,
  enfocar = true,
}: {
  estado: EstadoDia;
  inicial: { descripcion: string; proyecto_ids: string[] };
  etiqueta: string;
  ocupado: boolean;
  enfocar?: boolean;
  onGuardar: (v: { descripcion: string; proyecto_ids: string[] }) => void;
  onCancelar?: () => void;
}) {
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [ids, setIds] = useState(inicial.proyecto_ids);
  const listo = descripcion.trim().length > 0 && ids.length > 0;
  return (
    <form
      className="animate-aparecer space-y-3 rounded-3xl bg-suave p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) onGuardar({ descripcion: descripcion.trim(), proyecto_ids: ids });
      }}
    >
      <textarea
        aria-label={etiqueta}
        autoFocus={enfocar}
        value={descripcion}
        maxLength={280}
        rows={2}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Ej: Ruteo de líneas SPI en PCB v1.2"
        className="campo resize-none bg-superficie"
      />
      <SelectorProyectos etiqueta={`Proyectos: ${etiqueta}`} proyectos={estado.proyectos} valor={ids} onCambio={setIds} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!listo || ocupado} className="boton">
          {ocupado ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Guardar
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="boton-texto">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Objetivos de la jornada editable: la en curso o la última terminada, hasta comenzar la próxima. Se agregan,
 * editan, quitan y marcan aquí; después de terminar también se edita el motivo de lo pendiente y el bloqueo.
 */
export default function Objetivos({ estado, onCambio }: Props) {
  const j = estado.jornada!;
  const terminada = Boolean(j.checkout_tarde);
  const deAntes = j.fecha !== estado.hoy;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null); // id | "nuevo" | "bloqueo" | "motivo:<id>"
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const defecto = estado.ultimo_proyecto_id ?? estado.proyectos[0]?.id;
  const sinObjetivos = estado.tareas.length === 0;
  const formNuevo = editando === "nuevo" || (sinObjetivos && !terminada);

  async function enviar(clave: string, url: string, method: "POST" | "PATCH" | "DELETE", json?: unknown) {
    setOcupado(clave);
    setError(null);
    try {
      onCambio(await api<EstadoDia>(url, { method, json }));
      setEditando(null);
      setConfirmar(null);
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="titulo-seccion">{deAntes && terminada ? `Última jornada · ${j.fecha_texto.toLowerCase()}` : "Objetivos"}</h2>
        <span className="text-xs text-tinta-3">{terminada ? "Editable hasta que comiences la próxima" : `${estado.tareas.length}/${MAX}`}</span>
      </div>

      <ul className="space-y-3">
        {estado.tareas.map((t: TareaDia, i) => {
          const hecho = t.estado === "completado";
          const postergado = t.estado === "postergado_ooo";
          if (editando === t.id) {
            return (
              <li key={t.id}>
                <FormObjetivo
                  estado={estado}
                  inicial={{ descripcion: t.descripcion, proyecto_ids: t.proyectos.map((p) => p.id) }}
                  etiqueta={`Objetivo ${i + 1}`}
                  ocupado={ocupado === t.id}
                  onCancelar={() => setEditando(null)}
                  onGuardar={(v) => enviar(t.id, `/api/jornada/objetivos/${t.id}`, "PATCH", v)}
                />
              </li>
            );
          }
          return (
            <li key={t.id} className={cx("flex items-start gap-3 rounded-3xl p-4", PASTELES[i % PASTELES.length])}>
              <button
                type="button"
                disabled={postergado || ocupado !== null}
                aria-pressed={hecho}
                aria-label={`Logrado: ${t.descripcion}`}
                onClick={() => enviar(t.id, `/api/jornada/objetivos/${t.id}`, "PATCH", { completada: !hecho })}
                className={cx(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition active:scale-95",
                  hecho ? "bg-tinta text-white" : "bg-superficie text-transparent ring-2 ring-tinta/15 hover:ring-tinta/30",
                )}
              >
                {ocupado === t.id ? <LoaderCircle size={15} className="animate-spin text-tinta" /> : <Check size={15} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cx("font-medium leading-snug text-tinta", hecho && "text-tinta-2 line-through decoration-tinta-3")}>{t.descripcion}</p>
                <CodigosProyecto codigos={t.proyectos.map((p) => p.codigo)} className="mt-2" />
                {terminada && !hecho && !postergado && (
                  editando === `motivo:${t.id}` ? (
                    <form
                      className="mt-2 flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        enviar(t.id, `/api/jornada/objetivos/${t.id}`, "PATCH", { motivo_pendiente: texto.trim() || null });
                      }}
                    >
                      <input
                        autoFocus
                        aria-label={`Motivo pendiente: ${t.descripcion}`}
                        value={texto}
                        maxLength={280}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="¿Por qué quedó pendiente?"
                        className="campo min-w-0 flex-1 bg-superficie py-2 text-sm"
                      />
                      <button type="submit" aria-label="Guardar motivo" className="boton-icono h-9 w-9 bg-superficie">
                        <Check size={16} />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTexto(t.motivo_pendiente ?? "");
                        setEditando(`motivo:${t.id}`);
                      }}
                      className="mt-2 block text-left text-sm text-alerta-tinta hover:underline"
                    >
                      {t.motivo_pendiente ? `Pendiente: ${t.motivo_pendiente}` : "Pendiente · agrega el motivo"}
                    </button>
                  )
                )}
              </div>
              <div className="flex shrink-0 items-center">
                {!postergado && (
                  <button type="button" aria-label={`Editar: ${t.descripcion}`} onClick={() => setEditando(t.id)} className="rounded-full p-1.5 text-tinta-3 hover:bg-white/70 hover:text-tinta">
                    <Pencil size={15} />
                  </button>
                )}
                {confirmar === t.id ? (
                  <button
                    type="button"
                    onClick={() => enviar(t.id, `/api/jornada/objetivos/${t.id}`, "DELETE")}
                    className="rounded-full bg-error px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    ¿Quitar?
                  </button>
                ) : (
                  <button type="button" aria-label={`Quitar: ${t.descripcion}`} onClick={() => setConfirmar(t.id)} className="rounded-full p-1.5 text-tinta-3 hover:bg-error-fondo hover:text-error-tinta">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {formNuevo ? (
        <div className={cx(!sinObjetivos && "mt-3")}>
          {sinObjetivos && <p className="mb-2 text-sm text-tinta-2">¿Qué vas a lograr? Agrega tu primer objetivo.</p>}
          <FormObjetivo
            key={estado.tareas.length}
            estado={estado}
            inicial={{ descripcion: "", proyecto_ids: defecto ? [defecto] : [] }}
            etiqueta={`Objetivo ${estado.tareas.length + 1}`}
            ocupado={ocupado === "nuevo"}
            enfocar={editando === "nuevo"}
            onCancelar={sinObjetivos ? undefined : () => setEditando(null)}
            onGuardar={(v) => enviar("nuevo", "/api/jornada/objetivos", "POST", v)}
          />
        </div>
      ) : (
        estado.tareas.length < MAX && (
          <button
            type="button"
            onClick={() => setEditando("nuevo")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-indigo/25 py-3 text-sm font-semibold text-indigo-tinta hover:bg-indigo-suave/50"
          >
            <Plus size={16} /> Agregar objetivo ({estado.tareas.length}/{MAX})
          </button>
        )
      )}

      {terminada && (
        <div className="mt-4 rounded-2xl bg-suave p-3">
          {editando === "bloqueo" ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                enviar("bloqueo", "/api/jornada", "PATCH", { bloqueo: texto.trim() || null });
              }}
            >
              <label htmlFor="bloqueo-edit" className="flex items-center gap-1.5 text-sm font-semibold text-tinta">
                <LifeBuoy size={15} className="text-error" /> ¿Algo te bloquea?
              </label>
              <textarea
                id="bloqueo-edit"
                autoFocus
                rows={2}
                maxLength={500}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Ej: Esperando componentes de importación"
                className="campo resize-none bg-superficie text-sm"
              />
              <div className="flex items-center gap-2">
                <button type="submit" disabled={ocupado !== null} className="boton">
                  {ocupado === "bloqueo" ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Guardar
                </button>
                <button type="button" onClick={() => setEditando(null)} className="boton-texto">
                  <X size={14} /> Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTexto(j.bloqueos ?? "");
                setEditando("bloqueo");
              }}
              className="flex w-full items-center gap-2 text-left text-sm"
            >
              <LifeBuoy size={15} className={j.bloqueos ? "text-error" : "text-tinta-3"} />
              <span className={cx("min-w-0 flex-1", j.bloqueos ? "text-tinta" : "text-tinta-3")}>
                {j.bloqueos ? `Bloqueo: ${j.bloqueos}` : "Sin bloqueo informado"}
              </span>
              <Pencil size={14} className="shrink-0 text-tinta-3" aria-label="Editar bloqueo" />
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}
    </section>
  );
}
