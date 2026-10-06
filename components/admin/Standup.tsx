"use client";

import { AlertTriangle, CalendarOff, Check, ClipboardList, LifeBuoy, LoaderCircle, PlayCircle, Plus, Trash2, TrendingDown } from "lucide-react";
import { useState } from "react";
import SelectorProyectos from "@/components/SelectorProyectos";
import { Avatar, Insignia, type Tono } from "@/components/ui";
import type { ProyectoActivo } from "@/lib/dominio";
import type { FilaStandup } from "@/lib/tableros";
import { api, cx } from "@/lib/cliente";
import { Aviso, Cargando, Vacio, conEmpresa, diaCorto, useAccion, useDatos, type Alcance } from "./comun";

const TONO_PRIORIDAD: Record<number, Tono> = { 1: "error", 2: "alerta", 3: "indigo", 4: "neutro" };

function UltimaJornada({ f, hoy }: { f: FilaStandup; hoy: string }) {
  const u = f.ultima;
  if (!u) return <span className="text-tinta-3">Aún sin jornadas</span>;
  const d = diaCorto(u.fecha);
  const cuando = u.fecha === hoy ? "hoy" : `${d.dia} ${d.num} ${d.mes}`;
  if (u.estado === "en_curso") {
    return (
      <span className="font-medium text-indigo-tinta">
        Jornada en curso ({cuando}) · {u.completadas}/{u.comprometidas} logrados
      </span>
    );
  }
  return (
    <span className="font-medium text-tinta-2">
      Última jornada {cuando} · {u.completadas}/{u.comprometidas} ({u.saydo ?? "—"}%)
    </span>
  );
}

type Ejecutar = (clave: string, fn: () => Promise<string | void>) => Promise<boolean>;

/**
 * Objetivo del día agregado por la jefatura. Si la persona no ha comenzado la jornada de hoy, se le comienza con
 * este objetivo.
 */
function NuevoObjetivo({
  f,
  hoy,
  empresa,
  proyectos,
  ocupado,
  ejecutar,
  onListo,
}: {
  f: FilaStandup;
  hoy: string;
  empresa: string;
  proyectos: ProyectoActivo[];
  ocupado: string | null;
  ejecutar: Ejecutar;
  onListo: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [ids, setIds] = useState<string[]>(proyectos[0] ? [proyectos[0].id] : []);
  const clave = `obj:${f.id}`;
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} disabled={proyectos.length === 0} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-indigo-tinta hover:bg-superficie disabled:opacity-50">
        <Plus size={13} /> Agregar objetivo del día
      </button>
    );
  }
  const listo = descripcion.trim().length > 0 && ids.length > 0;
  return (
    <form
      className="mt-2 space-y-2 rounded-2xl bg-superficie p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!listo) return;
        ejecutar(clave, async () => {
          const r = await api<{ resultado: "agregado" | "jornada_creada" }>(conEmpresa(`/api/admin/standup/${f.id}/objetivos`, empresa), {
            method: "POST",
            json: { descripcion: descripcion.trim(), proyecto_ids: ids },
          });
          setDescripcion("");
          setAbierto(false);
          await onListo();
          return r.resultado === "jornada_creada"
            ? `Se comenzó la jornada de hoy de ${f.nombre} con ese objetivo.`
            : `Objetivo agregado a la jornada de ${f.nombre}.`;
        });
      }}
    >
      <textarea
        autoFocus
        aria-label={`Nuevo objetivo para ${f.nombre}`}
        rows={2}
        maxLength={280}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Ej: Enviar el paquete a Valparaíso"
        className="campo resize-none bg-suave text-sm"
      />
      <SelectorProyectos etiqueta={`Proyectos del objetivo de ${f.nombre}`} proyectos={proyectos} valor={ids} onCambio={setIds} />
      {(!f.ultima || (f.ultima.fecha !== hoy && f.ultima.estado === "terminada")) && (
        <p className="text-xs text-tinta-3">Aún no comienza la jornada de hoy: se le comenzará con este objetivo.</p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!listo || ocupado !== null} className="boton">
          {ocupado === clave ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Agregar
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="boton-texto">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Tareas asignadas abiertas de la persona: no son objetivos del día; quedan hasta marcarlas hechas. */
function TareasPersona({
  f,
  empresa,
  ocupado,
  ejecutar,
  onListo,
}: {
  f: FilaStandup;
  empresa: string;
  ocupado: string | null;
  ejecutar: Ejecutar;
  onListo: () => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const clave = `tarea:${f.id}`;
  return (
    <div className="mt-3 rounded-2xl bg-pastel-lila/60 p-4 text-sm">
      <p className="mb-2 flex items-center gap-1.5 font-medium text-tinta-2">
        <ClipboardList size={14} className="text-indigo" /> Tareas pendientes
        {f.tareas_abiertas.length > 0 && <span className="text-xs text-tinta-3">· {f.tareas_abiertas.length}</span>}
      </p>
      {f.tareas_abiertas.length > 0 && (
        <ul className="mb-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {f.tareas_abiertas.map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <button
                type="button"
                disabled={ocupado !== null}
                aria-label={`Marcar hecha: ${t.descripcion}`}
                onClick={() =>
                  ejecutar(t.id, async () => {
                    await api(conEmpresa(`/api/admin/tareas/${t.id}`, empresa), { method: "PATCH", json: { completada: true } });
                    await onListo();
                    return `Tarea de ${f.nombre} marcada como hecha.`;
                  })
                }
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-superficie text-transparent ring-2 ring-tinta/15 hover:text-tinta-3 disabled:opacity-50"
              >
                {ocupado === t.id ? <LoaderCircle size={11} className="animate-spin text-tinta" /> : <Check size={11} strokeWidth={3} />}
              </button>
              <span className="min-w-0 flex-1 break-words text-tinta-2">
                {t.descripcion}
                <span className="block text-[11px] text-tinta-3">por {t.creado_por_nombre}</span>
              </span>
              <button
                type="button"
                disabled={ocupado !== null}
                aria-label={`Quitar tarea: ${t.descripcion}`}
                onClick={() =>
                  ejecutar(t.id, async () => {
                    await api(conEmpresa(`/api/admin/tareas/${t.id}`, empresa), { method: "DELETE" });
                    await onListo();
                    return `Tarea de ${f.nombre} quitada.`;
                  })
                }
                className="shrink-0 rounded-full p-1 text-tinta-3 hover:bg-error-fondo hover:text-error-tinta disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!texto.trim()) return;
          ejecutar(clave, async () => {
            await api(conEmpresa("/api/admin/tareas", empresa), { method: "POST", json: { usuario_id: f.id, descripcion: texto.trim() } });
            setTexto("");
            await onListo();
            return `Tarea asignada a ${f.nombre}.`;
          });
        }}
      >
        <input
          aria-label={`Nueva tarea para ${f.nombre}`}
          value={texto}
          maxLength={280}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Asignar tarea (p. ej. pedirle a Carla la info)"
          className="campo min-w-0 flex-1 bg-superficie py-2 text-sm"
        />
        <button type="submit" disabled={!texto.trim() || ocupado !== null} aria-label={`Asignar tarea a ${f.nombre}`} className="boton-icono h-9 w-9 shrink-0 bg-superficie">
          {ocupado === clave ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </form>
    </div>
  );
}

export default function Standup({ empresa, alcance }: { empresa: string; alcance: Alcance }) {
  const { datos, error, cargando, recargar } = useDatos<{ filas: FilaStandup[]; hoy: string }>(
    conEmpresa("/api/admin/standup", empresa, { alcance }),
  );
  const { ocupado, aviso, ejecutar } = useAccion();
  const filas = datos?.filas ?? [];
  // Proyectos activos, para los objetivos que agrega la jefatura
  const { datos: datosProyectos } = useDatos<{ proyectos: (ProyectoActivo & { estado: string })[] }>(conEmpresa("/api/admin/proyectos", empresa));
  const proyectos = (datosProyectos?.proyectos ?? [])
    .filter((p) => ["concepto", "prototipado", "pruebas"].includes(p.estado))
    .map(({ id, codigo, nombre }) => ({ id, codigo, nombre }));

  const resumen: [string, number, typeof LifeBuoy, string][] = [
    ["Con bloqueos", filas.filter((f) => f.bloqueos.length).length, LifeBuoy, "bg-pastel-rosa text-error-tinta"],
    ["Say-Do 14 días < 70%", filas.filter((f) => f.saydo_14d !== null && f.saydo_14d < 70).length, TrendingDown, "bg-pastel-durazno text-alerta-tinta"],
    ["No disponibles hoy", filas.filter((f) => f.no_disponible_hoy).length, CalendarOff, "bg-pastel-azul text-indigo-tinta"],
    ["Jornadas en curso", filas.filter((f) => f.ultima?.estado === "en_curso").length, PlayCircle, "bg-pastel-lila text-indigo-tinta"],
  ];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {resumen.map(([t, n, Icono, tono]) => (
          <div key={t} className="tarjeta flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12", tono)}>
              <Icono size={22} />
            </span>
            <div>
              <p className="text-3xl font-bold text-tinta">{n}</p>
              <p className="text-sm text-tinta-3">{t}</p>
            </div>
          </div>
        ))}
      </div>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {datos && filas.length === 0 && (
        <Vacio>
          {alcance === "mios"
            ? "No supervisas a nadie en esta empresa. Cambia a «Todo el equipo» o asigna supervisión en Equipo."
            : "Esta empresa aún no tiene integrantes activos."}
        </Vacio>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {filas.map((f) => (
          <article key={f.id} className="tarjeta flex flex-col p-5">
            <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
              <Avatar nombre={f.nombre} tamano={46} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-tinta">{f.nombre}</p>
                <p className="truncate text-sm text-tinta-3">{f.email}</p>
              </div>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end sm:gap-1.5">
                <Insignia tono={TONO_PRIORIDAD[f.prioridad]} icono={f.prioridad <= 2}>
                  {f.motivo}
                </Insignia>
                <span className="text-xs text-tinta-3">
                  Say-Do 14d{" "}
                  <b className={cx("font-semibold", f.saydo_14d === null ? "text-tinta-3" : f.saydo_14d >= 70 ? "text-ok-tinta" : "text-alerta-tinta")}>
                    {f.saydo_14d === null ? "—" : `${f.saydo_14d}%`}
                  </b>
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-suave p-4 text-sm">
              <p className="mb-2">
                <UltimaJornada f={f} hoy={datos?.hoy ?? ""} />
              </p>
              {f.ultima && f.ultima.tareas.length > 0 && (
                <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {f.ultima.tareas.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className={cx(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          t.estado === "completado" ? "bg-tinta text-white" : "bg-superficie ring-2 ring-tinta/15",
                        )}
                      >
                        {t.estado === "completado" && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="text-tinta-2">
                        <span className="font-mono text-xs font-semibold text-indigo-tinta">{t.proyectos.join(" · ")}</span> {t.descripcion}
                        {t.motivo_pendiente && <span className="block text-xs text-alerta-tinta">↳ {t.motivo_pendiente}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {f.no_disponible_hoy && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-indigo-tinta">
                  <CalendarOff size={13} /> No disponible hoy
                  {f.no_disponible_hoy.motivo && <span className="text-tinta-3">· {f.no_disponible_hoy.motivo}</span>}
                </p>
              )}
              {!f.no_disponible_hoy && (
                <div className="mt-2">
                  <NuevoObjetivo key={`${f.id}:${proyectos.length}`} f={f} hoy={datos?.hoy ?? ""} empresa={empresa} proyectos={proyectos} ocupado={ocupado} ejecutar={ejecutar} onListo={recargar} />
                </div>
              )}
            </div>

            <TareasPersona f={f} empresa={empresa} ocupado={ocupado} ejecutar={ejecutar} onListo={recargar} />

            {f.bloqueos.length > 0 && (
              <div className="mt-3 space-y-2">
                {f.bloqueos.map((b) => {
                  const d = diaCorto(b.fecha);
                  return (
                    <div key={b.bitacora_id} className="flex flex-wrap items-start gap-3 rounded-2xl bg-pastel-rosa p-4">
                      <LifeBuoy size={18} className="mt-0.5 shrink-0 text-error" />
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="text-xs font-semibold uppercase text-error-tinta">
                          Bloqueo · {d.dia} {d.num} {d.mes}
                        </p>
                        <p className="mt-0.5 text-sm text-tinta">{b.texto}</p>
                      </div>
                      <button
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() =>
                          ejecutar(b.bitacora_id, async () => {
                            await api(conEmpresa(`/api/admin/bloqueos/${b.bitacora_id}`, empresa), { method: "POST" });
                            await recargar();
                            return `Bloqueo de ${f.nombre} marcado como resuelto.`;
                          })
                        }
                        className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta shadow-sm hover:bg-ok-fondo hover:text-ok-tinta disabled:opacity-50"
                      >
                        {ocupado === b.bitacora_id ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                        Marcar resuelto
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>
      {filas.some((f) => f.prioridad <= 2) && (
        <p className="mt-5 flex items-center gap-1.5 text-xs text-tinta-3">
          <AlertTriangle size={13} /> Orden: bloqueos sin resolver → Say-Do 14 días bajo 70% → no disponibles hoy → resto.
        </p>
      )}
    </div>
  );
}
