"use client";

import { AlertTriangle, Bot, ChevronDown, ExternalLink, Lock, LockOpen, RefreshCw, ScrollText } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { ChipEstadoIssue, IconoModulo } from "@/components/gerencia/comun";
import {
  type Clasificacion,
  MODULOS,
  NOMBRE_CLASIFICACION,
  NOMBRE_PRIORIDAD,
  type Prioridad,
  moduloPorClave,
} from "@/lib/chat/modulos";
import type { EstadoSala } from "@/lib/chat/salas";
import { type EstadoSincronizacion, type EstadoVisible, NOMBRE_ESTADO } from "@/lib/chat/seguimiento";
import { CUPO_POR_MINUTO, type ConsumoMes } from "@/lib/chat/uso";
import { api, cx, miles } from "@/lib/cliente";
import { Aviso, Cargando, Vacio, fechaHora, useAccion, useDatos } from "./comun";

interface Fila {
  id: string;
  modulo: string;
  usuario_nombre: string;
  usuario_email: string;
  estado: "activa" | "generada" | "finalizada" | "expirada";
  completitud: number;
  iniciada_en: string;
  terminada_en: string | null;
  ticket: string | null;
  titulo: string | null;
  prioridad: Prioridad | null;
  clasificacion: Clasificacion | null;
  issue_numero: number | null;
  issue_url: string | null;
  issue_error: string | null;
  issue_asignado: string | null;
  issue_actualizado_en: string | null;
  estado_issue: EstadoVisible | null;
  respuestas: number;
}

interface Datos {
  salas: EstadoSala[];
  historial: Fila[];
  consumo: ConsumoMes;
  seguimiento: EstadoSincronizacion;
  config: { github: boolean; repositorio: string; ia: boolean; inactividad_min: number; turnos_max: number };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** "2026-10" → "octubre" */
const nombreMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
/** Tokens en forma compacta: 1.234 · 45,6 mil · 1,2 M */
const tokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`
    : n >= 10_000
      ? `${(n / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} mil`
      : miles(n);

interface Detalle {
  requerimiento: { resumen: string; alcance: string[]; criterios_aceptacion: string[] } | null;
  mensajes: { id: number; autor: string; texto: string; creado_en: string }[];
}

// Estado de la conversación con el asistente; distinto del estado del Issue en GitHub (columna aparte, #14)
const CONVERSACION: Record<Fila["estado"], { texto: string; clase: string }> = {
  activa: { texto: "Entrevista abierta", clase: "bg-indigo-suave text-indigo-tinta" },
  generada: { texto: "Requerimiento generado", clase: "bg-ok-fondo text-ok-tinta" },
  finalizada: { texto: "Finalizada", clase: "bg-suave text-tinta-2" },
  expirada: { texto: "Expirada", clase: "bg-alerta-fondo text-alerta-tinta" },
};

const PRIORIDAD_CLASE: Record<Prioridad, string> = {
  critica: "bg-error-fondo text-error-tinta",
  alta: "bg-alerta-fondo text-alerta-tinta",
  media: "bg-indigo-suave text-indigo-tinta",
  baja: "bg-suave text-tinta-2",
};

function Transcripcion({ id }: { id: string }) {
  const { datos, error, cargando } = useDatos<Detalle>(`/api/admin/chat/${id}`);
  if (!datos) return <Cargando cargando={cargando} error={error} />;
  return (
    <div className="space-y-3 py-2">
      {datos.requerimiento && (
        <div className="rounded-2xl bg-pastel-menta px-4 py-3 text-sm text-tinta-2">
          <p className="font-semibold text-tinta">Resumen</p>
          <p className="whitespace-pre-wrap">{datos.requerimiento.resumen}</p>
        </div>
      )}
      <ol className="space-y-2">
        {datos.mensajes.map((m) => (
          <li key={m.id} className="text-sm">
            <span className={cx("font-semibold", m.autor === "robot" ? "text-indigo-tinta" : m.autor === "sistema" ? "text-tinta-3" : "text-tinta")}>
              {m.autor === "robot" ? "Asistente" : m.autor === "sistema" ? "Acción" : "Gerencia"}
            </span>{" "}
            <span className="text-xs text-tinta-3">{fechaHora(m.creado_en)}</span>
            <p className="whitespace-pre-wrap text-tinta-2">{m.texto}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Panel del portal gerencial: salas en uso, historial de conversaciones e Issues de GitHub. */
export default function ChatGerencia() {
  const { datos, error, cargando, recargar } = useDatos<Datos>("/api/admin/chat");
  const { ocupado, aviso, ejecutar } = useAccion();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>("todos");
  const [filtroEstado, setFiltroEstado] = useState<EstadoVisible | "todos">("todos");
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    const t = setInterval(recargar, 30_000);
    return () => clearInterval(t);
  }, [recargar]);

  /** «Actualizar»: vuelve a consultar GitHub (como máximo cada minuto) y recarga el panel. */
  const actualizar = async () => {
    setActualizando(true);
    await api("/api/admin/chat?actualizar=1").catch(() => {});
    await recargar();
    setActualizando(false);
  };

  if (!datos) return <Cargando cargando={cargando} error={error} />;
  const historial = datos.historial.filter(
    (f) => (filtro === "todos" || f.modulo === filtro) && (filtroEstado === "todos" || f.estado_issue === filtroEstado),
  );
  const generados = datos.historial.filter((f) => f.estado === "generada");
  const pendientes = generados.filter((f) => !f.issue_url);

  return (
    <div className="space-y-6">
      <Aviso aviso={aviso} />

      {(!datos.config.github || !datos.config.ia) && (
        <div className="flex gap-3 rounded-2xl bg-alerta-fondo px-4 py-3 text-sm text-alerta-tinta">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            {!datos.config.github && (
              <p>
                <b>GitHub sin configurar:</b> define <code>GITHUB_TOKEN</code> (permiso «Issues: write» sobre{" "}
                <code>{datos.config.repositorio}</code>). Los requerimientos se guardan y se envían con «Reintentar».
              </p>
            )}
            {!datos.config.ia && (
              <p>
                <b>IA sin configurar:</b> define <code>ANTHROPIC_API_KEY</code>. Mientras tanto, el asistente usa una entrevista guiada.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="tarjeta p-4">
          <p className="text-3xl font-bold text-tinta">{datos.salas.filter((s) => s.ocupada).length}/7</p>
          <p className="text-sm text-tinta-3">salas en uso ahora</p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-3xl font-bold text-tinta">{generados.length}</p>
          <p className="text-sm text-tinta-3">requerimientos generados</p>
        </div>
        <div className="tarjeta p-4">
          <p className={cx("text-3xl font-bold", pendientes.length ? "text-alerta-tinta" : "text-tinta")}>{pendientes.length}</p>
          <p className="text-sm text-tinta-3">Issues pendientes de envío</p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-3xl font-bold text-tinta">{tokens(datos.consumo.total.entrada + datos.consumo.total.salida)}</p>
          <p className="text-sm text-tinta-3">tokens de IA en {nombreMes(datos.consumo.mes)}</p>
        </div>
      </div>

      <section className="tarjeta p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titulo-seccion">Consumo de IA en {nombreMes(datos.consumo.mes)}</h2>
          <p className="text-xs text-tinta-3">
            Tope de {datos.config.turnos_max} respuestas por conversación y {CUPO_POR_MINUTO.mensaje} turnos por minuto por cuenta
          </p>
        </div>
        {datos.consumo.por_modulo.length === 0 ? (
          <p className="text-sm text-tinta-3">
            {datos.config.ia ? "Aún no hay consumo este mes." : "Sin consumo: el asistente está en modo de entrevista guiada (sin IA)."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[520px]">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th className="text-right">Conversaciones</th>
                  <th className="text-right">Tokens de entrada</th>
                  <th className="text-right">Tokens de salida</th>
                </tr>
              </thead>
              <tbody>
                {datos.consumo.por_modulo.map((x) => (
                  <tr key={x.modulo}>
                    <td>{moduloPorClave(x.modulo)?.nombre ?? x.modulo}</td>
                    <td className="text-right tabular-nums">{x.conversaciones}</td>
                    <td className="text-right tabular-nums">{miles(x.entrada)}</td>
                    <td className="text-right tabular-nums">{miles(x.salida)}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-tinta">
                  <td>Total</td>
                  <td className="text-right tabular-nums">{datos.consumo.total.conversaciones}</td>
                  <td className="text-right tabular-nums">{miles(datos.consumo.total.entrada)}</td>
                  <td className="text-right tabular-nums">{miles(datos.consumo.total.salida)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="titulo-seccion">Estado de las salas</h2>
          <button type="button" onClick={actualizar} disabled={actualizando} className="boton-texto">
            <RefreshCw size={15} aria-hidden className={cx(actualizando && "animate-spin")} /> Actualizar
          </button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {datos.salas.map((s) => {
            const m = moduloPorClave(s.clave)!;
            return (
              <li key={s.clave} className="tarjeta flex flex-col gap-2 p-4">
                <div className="flex items-center gap-3">
                  <IconoModulo clave={m.clave} color={m.color} tamano={18} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-tinta">{m.nombre}</p>
                    <p className="truncate text-xs text-tinta-3">{m.area}</p>
                  </div>
                  {s.ocupada ? (
                    <span className="chip bg-alerta-fondo text-alerta-tinta">
                      <Lock size={12} aria-hidden /> En uso
                    </span>
                  ) : (
                    <span className="chip bg-ok-fondo text-ok-tinta">
                      <LockOpen size={12} aria-hidden /> Libre
                    </span>
                  )}
                </div>
                {s.ocupada && (
                  <>
                    <p className="text-sm text-tinta-2">
                      {s.usuario_nombre} <span className="text-tinta-3">· {s.usuario_email}</span>
                    </p>
                    <p className="text-xs text-tinta-3">
                      Desde {fechaHora(s.desde)} · se libera {fechaHora(s.expira_en)} si no hay actividad
                    </p>
                    <button
                      type="button"
                      disabled={ocupado === s.clave}
                      onClick={() =>
                        ejecutar(s.clave, async () => {
                          await api(`/api/admin/chat/salas/${s.clave}`, { method: "DELETE" });
                          await recargar();
                          return `Sala ${m.nombre} liberada`;
                        })
                      }
                      className="boton-suave self-start"
                    >
                      <LockOpen size={14} aria-hidden /> Liberar sala
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-tinta-3">Las salas se liberan solas tras {datos.config.inactividad_min} min sin actividad.</p>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="titulo-seccion">Historial de conversaciones</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-tinta-3">
              Módulo
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="campo w-auto py-2">
                <option value="todos">Todos</option>
                {MODULOS.map((m) => (
                  <option key={m.clave} value={m.clave}>{m.nombre}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-tinta-3">
              Estado en GitHub
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as EstadoVisible | "todos")} className="campo w-auto py-2">
                <option value="todos">Todos</option>
                {(Object.keys(NOMBRE_ESTADO) as EstadoVisible[]).map((k) => (
                  <option key={k} value={k}>{NOMBRE_ESTADO[k]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {datos.config.github && (
          <p className={cx("mb-3 text-xs", datos.seguimiento.error ? "text-alerta-tinta" : "text-tinta-3")}>
            {datos.seguimiento.error
              ? `No se pudo consultar GitHub (${datos.seguimiento.error}). Se muestra el último estado conocido${datos.seguimiento.sincronizado_en ? `, del ${fechaHora(datos.seguimiento.sincronizado_en)}` : ""}.`
              : datos.seguimiento.sincronizado_en
                ? `Estados de GitHub al ${fechaHora(datos.seguimiento.sincronizado_en)} (se consultan cada 10 minutos o con «Actualizar»).`
                : "Los estados de GitHub se consultan cada 10 minutos."}
          </p>
        )}

        {historial.length === 0 ? (
          <Vacio>
            <Bot size={20} className="mx-auto mb-2" aria-hidden />
            Aún no hay conversaciones{filtro !== "todos" || filtroEstado !== "todos" ? " con estos filtros" : ""}.
          </Vacio>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="tabla min-w-[1020px]">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Módulo</th>
                  <th>Solicitante</th>
                  <th>Requerimiento</th>
                  <th>Conversación</th>
                  <th>Inicio</th>
                  <th>Issue en GitHub</th>
                  <th>Estado en GitHub</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historial.map((f) => (
                  <Fragment key={f.id}>
                    <tr>
                      <td className="whitespace-nowrap font-semibold tabular-nums text-tinta">{f.ticket ?? "—"}</td>
                      <td className="whitespace-nowrap">{moduloPorClave(f.modulo)?.nombre ?? f.modulo}</td>
                      <td>
                        <p className="text-tinta">{f.usuario_nombre}</p>
                        <p className="text-xs text-tinta-3">{f.usuario_email}</p>
                      </td>
                      <td className="max-w-[18rem]">
                        {f.titulo ? (
                          <>
                            <p className="text-tinta">{f.titulo}</p>
                            <p className="mt-1 flex flex-wrap gap-1">
                              {f.prioridad && <span className={cx("chip", PRIORIDAD_CLASE[f.prioridad])}>{NOMBRE_PRIORIDAD[f.prioridad]}</span>}
                              {f.clasificacion && <span className="chip bg-suave text-tinta-2">{NOMBRE_CLASIFICACION[f.clasificacion] ?? f.clasificacion}</span>}
                            </p>
                          </>
                        ) : (
                          <span className="text-tinta-3">
                            {f.respuestas} respuesta{f.respuestas === 1 ? "" : "s"} · {f.completitud}% reunido
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={cx("chip whitespace-nowrap", CONVERSACION[f.estado].clase)}>{CONVERSACION[f.estado].texto}</span>
                      </td>
                      <td className="whitespace-nowrap text-tinta-3">{fechaHora(f.iniciada_en)}</td>
                      <td>
                        {f.issue_url ? (
                          <a href={f.issue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-tinta hover:underline">
                            #{f.issue_numero} <ExternalLink size={13} aria-hidden />
                          </a>
                        ) : f.estado === "generada" ? (
                          <div className="space-y-1">
                            {f.issue_error && <p className="max-w-[14rem] text-xs text-error-tinta">{f.issue_error}</p>}
                            <button
                              type="button"
                              disabled={ocupado === f.id}
                              onClick={() =>
                                ejecutar(f.id, async () => {
                                  await api(`/api/admin/chat/${f.id}/issue`, { method: "POST" });
                                  await recargar();
                                  return `Issue de ${f.ticket} creado`;
                                })
                              }
                              className="boton-suave"
                            >
                              <RefreshCw size={13} aria-hidden /> Reintentar
                            </button>
                          </div>
                        ) : (
                          <span className="text-tinta-3">—</span>
                        )}
                      </td>
                      <td>
                        {f.estado_issue ? (
                          <div className="space-y-1">
                            <ChipEstadoIssue estado={f.estado_issue} />
                            {f.issue_asignado && <p className="text-xs text-tinta-3"></p>}
                          </div>
                        ) : (
                          <span className="text-tinta-3">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setAbierta(abierta === f.id ? null : f.id)}
                          aria-expanded={abierta === f.id}
                          aria-label="Transcripción"
                          title="Transcripción"
                          className="boton-texto whitespace-nowrap"
                        >
                          {/* Solo ícono bajo 1536 px: la tabla cabe sin desplazarse de lado */}
                          <ScrollText size={15} aria-hidden className="2xl:hidden" />
                          <span className="hidden 2xl:inline">Transcripción</span>
                          <ChevronDown size={14} className={cx("transition", abierta === f.id && "rotate-180")} aria-hidden />
                        </button>
                      </td>
                    </tr>
                    {abierta === f.id && (
                      <tr>
                        <td colSpan={9} className="bg-suave/60">
                          <Transcripcion id={f.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
