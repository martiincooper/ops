"use client";

import { AlertTriangle, CalendarOff, Flag, ListChecks, LoaderCircle, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Anillo from "@/components/Anillo";
import FormGasto from "@/components/FormGasto";
import type { EstadoDia, TareaDia } from "@/lib/dominio";
import { ErrorApi, api, cx, horaDe } from "@/lib/cliente";
import HistorialCompras from "./HistorialCompras";
import ListaCompras from "./ListaCompras";
import Objetivos from "./Objetivos";
import Tareas from "./Tareas";

const DIA = ["D", "L", "M", "M", "J", "V", "S"];

interface Props {
  estado: EstadoDia;
  onCambio: (e: EstadoDia) => void;
  onTerminar: () => void;
  onAviso: (texto: string) => void;
  onNoDisponible: () => void;
}

/** "2 h 15 min" entre dos instantes ISO. */
function duracion(desde: string, hasta: string): string {
  const min = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 60_000));
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

function conteo(tareas: TareaDia[]) {
  const post = tareas.filter((t) => t.estado === "postergado_ooo").length;
  const comp = tareas.filter((t) => t.estado === "completado").length;
  const total = tareas.length - post;
  return { comp, total, pct: total > 0 ? Math.round((comp / total) * 100) : null };
}

export default function Tablero({ estado, onCambio, onTerminar, onAviso, onNoDisponible }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formGasto, setFormGasto] = useState(false);
  // Compras: las de hoy o todas (historial, para editarlas o mover su estado de pago). `versionCompras` recarga el historial.
  const [vistaCompras, setVistaCompras] = useState<"hoy" | "todas">("hoy");
  const [versionCompras, setVersionCompras] = useState(0);
  const j = estado.jornada;
  const enCurso = estado.fase === "en_curso";
  const conJornada = enCurso || estado.fase === "terminada";
  const cuenta = conteo(conJornada ? estado.tareas : []);
  const deOtroDia = enCurso && j !== null && j.fecha !== estado.hoy;

  // Comenzar es solo el evento: un toque. Los objetivos se agregan después, aquí mismo.
  async function comenzar() {
    setOcupado("comenzar");
    setError(null);
    try {
      onCambio(await api<EstadoDia>("/api/jornada/comenzar", { method: "POST", json: {} }));
      onAviso("Jornada comenzada. Agrega tus objetivos.");
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mi jornada: resumen + acción principal */}
      <section className="tarjeta p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 className="titulo-seccion whitespace-nowrap">Mi jornada</h2>
          <p className="text-sm text-tinta-3">
            {enCurso && j ? (deOtroDia ? `Comenzada el ${j.fecha_texto.toLowerCase()}` : `En curso desde las ${horaDe(j.checkin_manana)}`) : estado.hoy_texto}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-pastel-lila p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-superficie text-indigo">
                <ListChecks size={20} />
              </span>
              <span className="text-3xl font-bold text-tinta">{conJornada ? estado.tareas.length : 0}</span>
            </div>
            {conJornada ? (
              <ul className="space-y-1.5 text-sm text-tinta-2">
                {estado.tareas.slice(0, 4).map((t) => (
                  <li key={t.id} className="flex items-center gap-1.5">
                    <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", t.estado === "completado" ? "bg-ok" : "bg-indigo/40")} />
                    <span className={cx("truncate", t.estado === "completado" && "text-tinta-3 line-through")}>{t.descripcion}</span>
                  </li>
                ))}
                {estado.tareas.length > 4 && <li className="pl-3 text-xs font-semibold text-tinta-3">+{estado.tareas.length - 4} más</li>}
              </ul>
            ) : (
              <p className="text-sm text-tinta-3">objetivos de hoy</p>
            )}
          </div>
          <div className="flex flex-col items-center justify-center rounded-3xl bg-suave p-4 text-center">
            <Anillo valor={conJornada ? cuenta.pct : null} tamano={104} grosor={14} />
            <p className="mt-3 text-sm font-semibold text-tinta">Objetivos logrados</p>
            <p className="text-xs text-tinta-3">{conJornada ? `${cuenta.comp} de ${cuenta.total}` : "sin jornada"}</p>
          </div>
        </div>

        {estado.fase === "sin_iniciar" && (
          <div className="mt-5">
            <button type="button" onClick={comenzar} disabled={estado.proyectos.length === 0 || ocupado !== null} className="boton-primario">
              {ocupado === "comenzar" ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} className="fill-white" />} Comenzar jornada
            </button>
            <p className="mt-2 text-center text-xs text-tinta-3">Marca el comienzo; tus objetivos los agregas después.</p>
            {estado.proyectos.length === 0 && (
              <p className="mt-2 text-center text-sm text-alerta-tinta">No hay proyectos activos. Pide a tu jefatura que cree uno.</p>
            )}
          </div>
        )}

        {estado.fase === "no_disponible" && (
          <div className="mt-5 rounded-3xl bg-pastel-azul p-4 text-center">
            <CalendarOff size={22} className="mx-auto mb-1 text-indigo" />
            <p className="font-semibold text-tinta">Hoy marcaste no disponible</p>
            {estado.no_disponible_hoy?.motivo && <p className="text-sm text-tinta-2">{estado.no_disponible_hoy.motivo}</p>}
            <button type="button" onClick={onNoDisponible} className="boton-suave mt-3">
              ¿Vas a trabajar igual? Quita la marca
            </button>
          </div>
        )}

        {enCurso && (
          <div className="mt-5 space-y-3">
            {deOtroDia && (
              <p className="flex items-start gap-2 rounded-2xl bg-alerta-fondo px-4 py-3 text-sm text-alerta-tinta">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Esta jornada sigue abierta. Termínala para comenzar la de hoy.
              </p>
            )}
            <button type="button" onClick={onTerminar} disabled={estado.tareas.length === 0} className="boton-primario">
              <Flag size={18} /> Terminar jornada
            </button>
            {estado.tareas.length === 0 && <p className="text-center text-xs text-tinta-3">Agrega al menos un objetivo para terminar.</p>}
          </div>
        )}

        {estado.fase === "terminada" && j?.checkout_tarde && (
          <div className="mt-5 rounded-2xl bg-ok-fondo px-4 py-3 text-center text-sm text-ok-tinta">
            <p className="font-semibold">
              Jornada terminada · {cuenta.comp}/{cuenta.total} logrados · {duracion(j.checkin_manana, j.checkout_tarde)}
            </p>
            <p className="text-xs opacity-80">Puedes seguir editando tus objetivos hasta que comiences la próxima jornada.</p>
          </div>
        )}
      </section>

      {/* Objetivos de la jornada editable (en curso o la última terminada, hasta comenzar la próxima) */}
      {j && <Objetivos key={j.id} estado={estado} onCambio={onCambio} />}

      {/* Tareas pendientes: no son objetivos del día; quedan hasta marcarlas hechas */}
      <Tareas estado={estado} onCambio={onCambio} />
      {error && <p role="alert" className="rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}

      {/* Semana */}
      <section className="tarjeta p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="titulo-seccion">Mi semana</h2>
          <Link href="/mi-progreso" className="text-sm font-semibold text-indigo-tinta hover:underline">Historial</Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {estado.semana.map((d) => {
            const dow = new Date(`${d.fecha}T12:00:00Z`).getUTCDay();
            const esHoy = d.fecha === estado.hoy;
            const pct = d.registro === "cerrado" ? d.saydo : null;
            return (
              <div key={d.fecha} className="flex flex-col items-center gap-1.5">
                <span className="text-xs text-tinta-3">{DIA[dow]}</span>
                <span
                  className={cx(
                    "flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold",
                    esHoy ? "bg-indigo text-white shadow-boton" : "text-tinta",
                  )}
                >
                  {Number(d.fecha.slice(8))}
                </span>
                <span className="h-4 text-[11px] font-semibold text-tinta-2" title={pct !== null ? `${d.completadas} de ${d.comprometidas} logrados` : undefined}>
                  {pct !== null ? (
                    `${pct}%`
                  ) : d.registro === "abierto" ? (
                    <span className="text-indigo-tinta">●</span>
                  ) : d.tipo === "ooo" ? (
                    <span className="text-tinta-3">N/D</span>
                  ) : (
                    <span className="text-linea">●</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-tinta-3">
          % logrado por jornada terminada · <span className="text-indigo-tinta">●</span> en curso · N/D no disponible
        </p>
      </section>

      {/* Compras */}
      <section className="tarjeta p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3">
            <h2 className="titulo-seccion whitespace-nowrap">Compras</h2>
            <div className="segmentos" role="group" aria-label="Qué compras ver">
              {(["hoy", "todas"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vistaCompras === v}
                  onClick={() => setVistaCompras(v)}
                  className={cx("segmento", vistaCompras === v && "segmento-activo bg-superficie text-indigo-tinta shadow-sm")}
                >
                  {v === "hoy" ? "Hoy" : "Todas"}
                </button>
              ))}
            </div>
          </div>
          {!formGasto && (
            <button type="button" onClick={() => setFormGasto(true)} disabled={estado.proyectos.length === 0} className="boton shrink-0 whitespace-nowrap">
              <Plus size={16} /> Registrar<span className="sr-only sm:not-sr-only">&nbsp;compra</span>
            </button>
          )}
        </div>
        {vistaCompras === "hoy" ? (
          <>
            {estado.gastos_hoy.length === 0 && !formGasto && <p className="text-sm text-tinta-3">Sin compras registradas hoy.</p>}
            <ListaCompras gastos={estado.gastos_hoy} proyectos={estado.proyectos} onCambio={async () => onCambio(await api<EstadoDia>("/api/jornada"))} />
          </>
        ) : (
          <HistorialCompras key={versionCompras} proyectos={estado.proyectos} />
        )}
        {formGasto && (
          <div className="mt-3">
            <FormGasto
              proyectos={estado.proyectos}
              proyectosIniciales={
                estado.tareas.length
                  ? [...new Set(estado.tareas.flatMap((t) => t.proyectos.map((p) => p.id)))].slice(0, 1)
                  : estado.ultimo_proyecto_id
                    ? [estado.ultimo_proyecto_id]
                    : undefined
              }
              onCancelar={() => setFormGasto(false)}
              onGuardado={async () => {
                setFormGasto(false);
                setVersionCompras((v) => v + 1);
                onCambio(await api<EstadoDia>("/api/jornada"));
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
