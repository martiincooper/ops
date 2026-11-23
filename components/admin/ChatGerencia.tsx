"use client";

import { AlertTriangle, Bot, CheckCircle2, ChevronDown, Clock, ExternalLink, MessagesSquare, RefreshCw, ScrollText } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { ChipEstadoIssue, IconoModulo } from "@/components/gerencia/comun";
import type { Modulo } from "@/lib/chat/modulos";
import type { EstadoSala } from "@/lib/chat/salas";
import { type EstadoSincronizacion, type EstadoVisible, NOMBRE_ESTADO } from "@/lib/chat/seguimiento";
import { api, cx } from "@/lib/cliente";
import EditorSalas from "./EditorSalas";
import { Aviso, Cargando, Vacio, fechaHora, useAccion, useDatos } from "./comun";

interface Fila {
  id: string;
  sala: string;
  participantes: string | null;
  mensajes: number;
  estado: "abierta" | "terminada" | "cerrada";
  iniciada_en: string;
  terminada_en: string | null;
  ticket: string | null;
  titulo: string | null;
  issue_numero: number | null;
  issue_url: string | null;
  issue_repo: string | null;
  issue_error: string | null;
  issue_asignado: string | null;
  issue_actualizado_en: string | null;
  issue_intentos: number;
  issue_proximo_intento: string | null;
  estado_issue: EstadoVisible | null;
}

interface Datos {
  salas: EstadoSala[];
  archivadas: Modulo[];
  /** Nombre de cada sala (también las archivadas), para el historial. */
  nombres: Record<string, string>;
  historial: Fila[];
  seguimiento: EstadoSincronizacion;
  config: {
    github: boolean;
    token: { ok: boolean; login?: string; motivo?: string };
    cuenta: string;
    reintentos_max: number;
  };
}

interface Detalle {
  resumen: string | null;
  mensajes: { id: number; rol: string; autor_nombre: string; texto: string; creado_en: string }[];
}

// Estado de la solicitud; distinto del estado del Issue en GitHub (columna aparte, #14)
const SOLICITUD: Record<Fila["estado"], { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-indigo-suave text-indigo-tinta" },
  terminada: { texto: "Terminada", clase: "bg-ok-fondo text-ok-tinta" },
  cerrada: { texto: "Cerrada", clase: "bg-suave text-tinta-2" },
};

function Transcripcion({ id }: { id: string }) {
  const { datos, error, cargando } = useDatos<Detalle>(`/api/admin/chat/${id}`);
  if (!datos) return <Cargando cargando={cargando} error={error} />;
  return (
    <div className="space-y-3 py-2">
      {datos.resumen && (
        <div className="rounded-2xl bg-pastel-menta px-4 py-3 text-sm text-tinta-2">
          <p className="font-semibold text-tinta">Resumen</p>
          <p className="whitespace-pre-wrap">{datos.resumen}</p>
        </div>
      )}
      <ol className="space-y-2">
        {datos.mensajes.map((m) => (
          <li key={m.id} className="text-sm">
            <span className={cx("font-semibold", m.rol === "asistente" ? "text-indigo-tinta" : m.rol === "sistema" ? "text-tinta-3" : "text-tinta")}>
              {m.rol === "asistente" ? "Asistente" : m.rol === "sistema" ? "Sistema" : m.autor_nombre}
            </span>{" "}
            <span className="text-xs text-tinta-3">{fechaHora(m.creado_en)}</span>
            <p className="whitespace-pre-wrap text-tinta-2">{m.texto}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Panel del portal gerencial: salas, historial de solicitudes e Issues de GitHub. */
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
    (f) => (filtro === "todos" || f.sala === filtro) && (filtroEstado === "todos" || f.estado_issue === filtroEstado),
  );
  const terminadas = datos.historial.filter((f) => f.estado === "terminada");
  const pendientes = terminadas.filter((f) => !f.issue_url);

  return (
    <div className="space-y-6">
      <Aviso aviso={aviso} />

      {!datos.config.github && (
        <div className="flex gap-3 rounded-2xl bg-alerta-fondo px-4 py-3 text-sm text-alerta-tinta">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            <b>GitHub sin configurar:</b> define <code>GITHUB_TOKEN</code> con un token de la cuenta de DataSHEQ{" "}
            <code>{datos.config.cuenta}</code> (permiso «Issues: write» sobre el repositorio de cada sala). Los
            requerimientos se guardan y se envían con «Reintentar».
          </p>
        </div>
      )}

      {datos.config.github && (
        <p data-salud-github className={cx("flex items-center gap-2 text-sm", datos.config.token.ok ? "text-ok-tinta" : "text-alerta-tinta")}>
          {datos.config.token.ok ? <CheckCircle2 size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
          {datos.config.token.ok
            ? `GitHub: el token es válido y pertenece a ${datos.config.token.login}`
            : `GitHub: ${datos.config.token.motivo ?? "el token no se pudo verificar"}`}
        </p>
      )}

      <EditorSalas salas={datos.salas} archivadas={datos.archivadas} recargar={recargar} />

      <div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="tarjeta p-4">
            <p className="text-3xl font-bold text-tinta">{datos.salas.filter((s) => s.abierta).length}/{datos.salas.length}</p>
            <p className="text-sm text-tinta-3">salas con una solicitud abierta</p>
          </div>
          <div className="tarjeta p-4">
            <p className="text-3xl font-bold text-tinta">{terminadas.length}</p>
            <p className="text-sm text-tinta-3">solicitudes terminadas</p>
          </div>
          <div className="tarjeta p-4">
            <p className={cx("text-3xl font-bold", pendientes.length ? "text-alerta-tinta" : "text-tinta")}>{pendientes.length}</p>
            <p className="text-sm text-tinta-3">Issues pendientes de envío</p>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="titulo-seccion">Estado de las salas</h2>
          <button type="button" onClick={actualizar} disabled={actualizando} className="boton-texto">
            <RefreshCw size={15} aria-hidden className={cx(actualizando && "animate-spin")} /> Actualizar
          </button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {datos.salas.map((s) => {
            return (
              <li key={s.clave} className="tarjeta flex flex-col gap-2 p-4">
                <div className="flex items-center gap-3">
                  <IconoModulo clave={s.clave} color={s.color} tamano={18} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-tinta">{s.nombre}</p>
                    <p className="truncate text-xs text-tinta-3">{s.area}</p>
                  </div>
                  {!s.disponible ? (
                    <span className="chip bg-suave text-tinta-3">Próximamente</span>
                  ) : s.abierta ? (
                    <span className="chip bg-indigo-suave text-indigo-tinta">
                      <MessagesSquare size={12} aria-hidden /> Abierta
                    </span>
                  ) : (
                    <span className="chip bg-suave text-tinta-2">Sin solicitud</span>
                  )}
                </div>
                <p className="truncate text-xs text-tinta-3">
                  {s.repo ? (
                    <>
                      Repositorio: <code>{s.repo}</code>
                    </>
                  ) : (
                    "Sin repositorio verificado: en el portal sale como «Próximamente»"
                  )}
                </p>
                {s.abierta && (
                  <p className="text-xs text-tinta-3">
                    {s.mensajes} mensaje{s.mensajes === 1 ? "" : "s"} en la solicitud abierta
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="titulo-seccion">Historial de solicitudes</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-tinta-3">
              Módulo
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="campo w-auto py-2">
                <option value="todos">Todos</option>
                {Object.entries(datos.nombres).map(([clave, nombre]) => (
                  <option key={clave} value={clave}>{nombre}</option>
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
            Aún no hay solicitudes{filtro !== "todos" || filtroEstado !== "todos" ? " con estos filtros" : ""}.
          </Vacio>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="tabla min-w-[1020px]">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Módulo</th>
                  <th>Participantes</th>
                  <th>Requerimiento</th>
                  <th>Solicitud</th>
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
                      <td className="whitespace-nowrap">{datos.nombres[f.sala] ?? f.sala}</td>
                      <td>
                        <p className="text-tinta">{f.participantes ?? "—"}</p>
                      </td>
                      <td className="max-w-[18rem]">
                        {f.titulo ? (
                          <p className="text-tinta">{f.titulo}</p>
                        ) : (
                          <span className="text-tinta-3">
                            {f.mensajes} mensaje{f.mensajes === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={cx("chip whitespace-nowrap", SOLICITUD[f.estado].clase)}>{SOLICITUD[f.estado].texto}</span>
                      </td>
                      <td className="whitespace-nowrap text-tinta-3">{fechaHora(f.iniciada_en)}</td>
                      <td>
                        {f.issue_url ? (
                          <a href={f.issue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-tinta hover:underline">
                            {f.issue_repo ? `${f.issue_repo}#` : "#"}
                            {f.issue_numero} <ExternalLink size={13} aria-hidden />
                          </a>
                        ) : f.estado === "terminada" ? (
                          <div className="space-y-1">
                            {f.issue_error && <p className="max-w-[14rem] text-xs text-error-tinta">{f.issue_error}</p>}
                            {f.issue_proximo_intento ? (
                              <p className="flex max-w-[14rem] items-center gap-1 text-xs text-tinta-3">
                                <Clock size={12} aria-hidden className="shrink-0" /> Reintento automático {fechaHora(f.issue_proximo_intento)} (
                                {f.issue_intentos} de {datos.config.reintentos_max})
                              </p>
                            ) : (
                              f.issue_intentos >= datos.config.reintentos_max && (
                                <p className="max-w-[14rem] text-xs text-tinta-3">Sin más reintentos automáticos</p>
                              )
                            )}
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
