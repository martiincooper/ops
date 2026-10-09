"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Bot,
  Check,
  CircleCheck,
  ExternalLink,
  FileText,
  Hourglass,
  LoaderCircle,
  Lock,
  LogOut,
  MessageSquarePlus,
  SendHorizontal,
  SkipForward,
  Square,
  SquareCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import type { PreguntaVista } from "@/lib/chat/flujo";
import { MENSAJE_SALA_OCUPADA, NOMBRE_PRIORIDAD, type Modulo, type Prioridad, moduloPorClave } from "@/lib/chat/modulos";
import { ErrorApi, api, cx, horaDe } from "@/lib/cliente";
import { CabeceraPortal, IconoModulo } from "./comun";

interface Mensaje {
  id: number;
  autor: "robot" | "usuario" | "sistema";
  texto: string;
  meta: { completitud?: number; faltantes?: string[]; sala_sugerida?: string | null; listo?: boolean } | null;
  creado_en: string;
}

interface Vista {
  id: string;
  modulo: string;
  estado: "activa" | "generada" | "finalizada" | "expirada";
  completitud: number;
  expira_en: string | null;
  ticket: string | null;
  issue_url: string | null;
  issue_error: string | null;
  turnos: number;
  turnos_max: number;
  /** Pregunta en curso del árbol de la sala: botones de respuesta (#17). */
  pregunta: PreguntaVista | null;
  mensajes: Mensaje[];
}

interface Resultado {
  ticket: string;
  titulo: string;
  prioridad: Prioridad;
  issue: { ok: boolean; error?: string };
}

type Fase = "entrando" | "ocupada" | "activa" | "cerrada" | "error";
type Accion = "mensaje" | "siguiente" | "mas_detalles";

const LATIDO_MS = 60_000;

export default function SalaChat({ modulo, nombre, esAdmin }: { modulo: Modulo; nombre: string; esAdmin: boolean }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("entrando");
  const [vista, setVista] = useState<Vista | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState<null | Accion | "generar" | "finalizar">(null);
  const [error, setError] = useState<string | null>(null);
  const [cierre, setCierre] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmar, setConfirmar] = useState<null | "generar" | "finalizar">(null);
  // Bajo 640 px (como `sm:` de Tailwind) la barra inferior se compacta (#13)
  const [angosto, setAngosto] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    const cambio = () => setAngosto(mq.matches);
    cambio();
    mq.addEventListener("change", cambio);
    return () => mq.removeEventListener("change", cambio);
  }, []);
  const ultimoLatido = useRef(0);
  const entrada = useRef<HTMLTextAreaElement>(null);

  // El campo crece con el texto (hasta max-h-32, unas 4 líneas) y vuelve a su alto mínimo al enviar. Si la
  // persona está al final de la conversación, la página baja con él para que la barra no tape el último mensaje.
  useLayoutEffect(() => {
    const el = entrada.current;
    if (!el) return;
    const doc = document.documentElement;
    const alFinal = window.innerHeight + window.scrollY >= doc.scrollHeight - 80;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (alFinal) window.scrollTo({ top: doc.scrollHeight });
  }, [texto, angosto]);

  /** Errores que cierran la sesión (expiró o ya terminó) pasan a la pantalla de cierre. */
  const manejarError = useCallback((e: unknown) => {
    const err = e as ErrorApi;
    if (err.status === 410) {
      setCierre(err.message);
      setFase("cerrada");
    } else setError(err.message);
  }, []);

  const entrar = useCallback(async () => {
    setFase("entrando");
    setError(null);
    try {
      const v = await api<Vista>(`/api/chat/salas/${modulo.clave}`, { method: "POST" });
      setVista(v);
      setFase("activa");
      ultimoLatido.current = Date.now();
    } catch (e) {
      const err = e as ErrorApi;
      if (err.status === 409) setFase("ocupada");
      else {
        setError(err.message);
        setFase("error");
      }
    }
  }, [modulo.clave]);

  useEffect(() => {
    entrar();
  }, [entrar]);

  // Al final del documento (no de la lista): así el último mensaje queda sobre la barra fija inferior en vez de
  // debajo de ella, y al generar se ve la tarjeta del requerimiento.
  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [vista?.mensajes.length, ocupado, fase]);

  // Liberación por inactividad: al vencer el plazo, la sala ya no es de la persona.
  useEffect(() => {
    if (fase !== "activa" || !vista?.expira_en) return;
    const ms = new Date(vista.expira_en).getTime() - Date.now();
    const t = setTimeout(() => {
      setCierre("La sesión se cerró por inactividad y la sala quedó liberada. Puedes volver a entrar para comenzar de nuevo.");
      setFase("cerrada");
    }, Math.max(0, ms) + 1000);
    return () => clearTimeout(t);
  }, [fase, vista?.expira_en]);

  /** Escribir cuenta como actividad (como máximo un aviso al servidor por minuto). */
  const latido = useCallback(() => {
    if (!vista || fase !== "activa" || Date.now() - ultimoLatido.current < LATIDO_MS) return;
    ultimoLatido.current = Date.now();
    api<{ expira_en: string }>(`/api/chat/conversaciones/${vista.id}/latido`, { method: "POST" })
      .then((r) => setVista((v) => (v ? { ...v, expira_en: r.expira_en } : v)))
      .catch(manejarError);
  }, [vista, fase, manejarError]);

  // Opciones marcadas en una pregunta de selección múltiple (se reinician al cambiar de pregunta)
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const preguntaId = vista?.pregunta?.id;
  useEffect(() => setSeleccion([]), [preguntaId]);

  /**
   * Envía un turno. Sin `opcion`: el texto del campo (respuesta escrita, fecha u «Otra»), junto con las opciones
   * marcadas si la pregunta es de selección múltiple. Con `opcion`: un botón de respuesta.
   */
  const enviar = useCallback(
    async (accion: Accion, opcion?: { valores: string[]; etiqueta: string }) => {
      if (!vista || ocupado) return;
      const t = opcion ? "" : texto.trim();
      const valores = opcion?.valores ?? (vista.pregunta?.tipo === "multiple" ? seleccion : []);
      if (accion === "mensaje" && !t && !valores.length) return;
      const visible = opcion?.etiqueta ?? [...(vista.pregunta?.opciones ?? []).filter((o) => valores.includes(o.valor)).map((o) => o.etiqueta), ...(t ? [t] : [])].join(", ");
      setOcupado(accion);
      setError(null);
      // Muestra al tiro la respuesta de la persona; si falla, se repone lo escrito.
      if (accion === "mensaje") {
        if (!opcion) setTexto("");
        setVista((v) =>
          v ? { ...v, mensajes: [...v.mensajes, { id: -1, autor: "usuario", texto: visible, meta: null, creado_en: new Date().toISOString() }] } : v,
        );
      }
      try {
        const v = await api<Vista>(`/api/chat/conversaciones/${vista.id}/mensaje`, {
          method: "POST",
          json: accion === "mensaje" ? { accion, ...(t ? { texto: t } : {}), ...(valores.length ? { valores } : {}) } : { accion },
        });
        setVista(v);
        ultimoLatido.current = Date.now();
        if (accion === "mas_detalles") setTimeout(() => entrada.current?.focus(), 50);
      } catch (e) {
        if (accion === "mensaje") {
          if (!opcion) setTexto(t);
          setVista((v) => (v ? { ...v, mensajes: v.mensajes.filter((m) => m.id !== -1) } : v));
        }
        manejarError(e);
      } finally {
        setOcupado(null);
      }
    },
    [vista, ocupado, texto, seleccion, manejarError],
  );

  const generar = useCallback(async () => {
    if (!vista) return;
    setConfirmar(null);
    setOcupado("generar");
    setError(null);
    try {
      const r = await api<Vista & { resultado: Resultado }>(`/api/chat/conversaciones/${vista.id}/generar`, { method: "POST" });
      setVista(r);
      setResultado(r.resultado);
      setFase("cerrada");
    } catch (e) {
      manejarError(e);
    } finally {
      setOcupado(null);
    }
  }, [vista, manejarError]);

  const finalizar = useCallback(async () => {
    if (!vista) return;
    setConfirmar(null);
    setOcupado("finalizar");
    try {
      await api(`/api/chat/conversaciones/${vista.id}/finalizar`, { method: "POST" });
      router.push("/gerencia");
    } catch (e) {
      manejarError(e);
      setOcupado(null);
    }
  }, [vista, router, manejarError]);

  const ultimoRobot = [...(vista?.mensajes ?? [])].reverse().find((m) => m.autor === "robot");
  const sugerida = moduloPorClave(ultimoRobot?.meta?.sala_sugerida ?? null);
  const faltantes = ultimoRobot?.meta?.faltantes ?? [];
  const completitud = vista?.completitud ?? 0;
  const hayRespuestas = !!vista?.mensajes.some((m) => m.autor === "usuario" && m.id !== -1);
  // Tope de respuestas del asistente (#4): solo queda generar el requerimiento o finalizar
  const alTope = !!vista && vista.turnos >= vista.turnos_max;
  const activa = fase === "activa";
  const pregunta = vista?.pregunta ?? null;
  const varias = pregunta?.tipo === "multiple";
  const conOpciones = !!pregunta && pregunta.opciones.length > 0;
  const esFecha = pregunta?.tipo === "fecha";
  // El campo de texto sirve para respuestas escritas, fechas y «Otra»; en preguntas solo de opciones queda deshabilitado
  const soloOpciones = conOpciones && !pregunta.otra;

  return (
    <div className="flex min-h-dvh flex-col">
      <CabeceraPortal
        nombre={nombre}
        subtitulo={`Sala ${modulo.nombre} · ${modulo.area}`}
        esAdmin={esAdmin}
        enSala={fase === "activa"}
        volver={
          <Link href="/gerencia" aria-label="Volver al portal" title="Volver al portal" className="boton-icono bg-superficie">
            <ArrowLeft size={18} />
          </Link>
        }
      />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5 lg:px-0">
        <section className="tarjeta mb-4 flex items-center gap-3 p-4">
          <IconoModulo clave={modulo.clave} color={modulo.color} tamano={20} />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-tinta">
              {modulo.nombre} <span className="font-normal text-tinta-3">· {modulo.area}</span>
            </h1>
            {activa && vista?.expira_en ? (
              <p className="flex items-center gap-1 text-xs text-tinta-3">
                <Lock size={12} aria-hidden /> Sala reservada para ti. Se libera a las {horaDe(vista.expira_en)} si no hay actividad.
              </p>
            ) : (
              <p className="text-xs text-tinta-3">{modulo.descripcion}</p>
            )}
          </div>
          {activa && (
            <button type="button" onClick={() => setConfirmar("finalizar")} disabled={!!ocupado} className="boton-texto shrink-0">
              <LogOut size={16} aria-hidden /> <span className="hidden sm:inline">Finalizar conversación</span>
            </button>
          )}
        </section>

        {fase === "entrando" && (
          <p className="flex items-center gap-2 py-10 text-sm text-tinta-3">
            <LoaderCircle size={16} className="animate-spin" aria-hidden /> Preparando la sala…
          </p>
        )}

        {fase === "ocupada" && (
          <div role="alert" className="tarjeta p-6 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-alerta-fondo text-alerta-tinta">
              <Lock size={24} aria-hidden />
            </span>
            <p className="font-semibold text-tinta">{MENSAJE_SALA_OCUPADA}.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={entrar} className="boton-suave">Reintentar</button>
              <Link href="/gerencia" className="boton">Volver al portal</Link>
            </div>
          </div>
        )}

        {fase === "error" && (
          <div role="alert" className="tarjeta p-6 text-center">
            <p className="text-error-tinta">{error}</p>
            <button type="button" onClick={entrar} className="boton-suave mt-4">Reintentar</button>
          </div>
        )}

        {vista && (fase === "activa" || fase === "cerrada") && (
          <>
            <ol className="flex-1 space-y-3" aria-live="polite">
              {vista.mensajes.map((m) =>
                m.autor === "sistema" ? (
                  <li key={m.id} className="flex justify-center">
                    <span className="chip bg-suave text-tinta-3">{m.texto}</span>
                  </li>
                ) : (
                  <li key={m.id} className={cx("flex items-end gap-2 animate-aparecer", m.autor === "usuario" && "flex-row-reverse")}>
                    {m.autor === "robot" ? (
                      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo text-white">
                        <Bot size={18} />
                      </span>
                    ) : (
                      <Avatar nombre={nombre} tamano={36} />
                    )}
                    <div
                      className={cx(
                        "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-justify text-sm leading-relaxed hyphens-auto sm:text-[15px]",
                        m.autor === "robot" ? "rounded-bl-md bg-superficie text-tinta shadow-tarjeta" : "rounded-br-md bg-indigo text-white",
                      )}
                    >
                      <span className="sr-only">{m.autor === "robot" ? "Asistente: " : "Tú: "}</span>
                      {m.texto}
                      <span className={cx("mt-1 block text-[11px]", m.autor === "robot" ? "text-tinta-3" : "text-white/70")}>{horaDe(m.creado_en)}</span>
                    </div>
                  </li>
                ),
              )}
              {(ocupado === "mensaje" || ocupado === "siguiente" || ocupado === "mas_detalles" || ocupado === "generar") && (
                <li className="flex items-end gap-2">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo text-white">
                    <Bot size={18} />
                  </span>
                  <span className="flex items-center gap-2 rounded-3xl rounded-bl-md bg-superficie px-4 py-3 text-sm text-tinta-3 shadow-tarjeta">
                    <LoaderCircle size={14} className="animate-spin" aria-hidden />
                    {ocupado === "generar" ? "Generando el requerimiento y creando el ticket…" : "El asistente está escribiendo…"}
                  </span>
                </li>
              )}
            </ol>

            {/* Botones de respuesta de la pregunta en curso (#17): un toque responde; en selección múltiple, marcar y confirmar */}
            {activa && pregunta && pregunta.opciones.length > 0 && !ocupado && !alTope && (
              <div role="group" aria-label="Respuestas posibles" className="mt-3 flex flex-wrap gap-2 pl-11">
                {pregunta.opciones.map((o) => {
                  const marcada = seleccion.includes(o.valor);
                  return varias ? (
                    <button
                      key={o.valor}
                      type="button"
                      aria-pressed={marcada}
                      onClick={() => setSeleccion((s) => (marcada ? s.filter((x) => x !== o.valor) : [...s, o.valor]))}
                      className={cx("boton-suave", marcada ? "bg-indigo text-white hover:bg-indigo-hondo" : "bg-superficie")}
                    >
                      {marcada ? <SquareCheck size={15} aria-hidden /> : <Square size={15} aria-hidden />} {o.etiqueta}
                    </button>
                  ) : (
                    <button
                      key={o.valor}
                      type="button"
                      onClick={() => enviar("mensaje", { valores: [o.valor], etiqueta: o.etiqueta })}
                      className="boton-suave bg-superficie text-left"
                    >
                      {o.etiqueta}
                    </button>
                  );
                })}
                {varias && (
                  <button type="button" onClick={() => enviar("mensaje")} disabled={!seleccion.length && !texto.trim()} className="boton">
                    <Check size={15} aria-hidden /> Confirmar{seleccion.length ? ` (${seleccion.length})` : ""}
                  </button>
                )}
              </div>
            )}

            {fase === "cerrada" && (
              <section className="tarjeta mt-5 p-5">
                {resultado ? (
                  <>
                    <p className="flex items-center gap-2 font-semibold text-ok-tinta">
                      <CircleCheck size={18} aria-hidden /> Requerimiento {resultado.ticket} generado
                    </p>
                    <p className="mt-1 text-tinta">{resultado.titulo}</p>
                    <p className="mt-1 text-sm text-tinta-3">Prioridad: {NOMBRE_PRIORIDAD[resultado.prioridad]}</p>
                    {vista.issue_url ? (
                      <a href={vista.issue_url} target="_blank" rel="noreferrer" className="boton-suave mt-3">
                        <FileText size={16} aria-hidden /> Ver Issue en GitHub <ExternalLink size={14} aria-hidden />
                      </a>
                    ) : (
                      <p className="mt-3 rounded-2xl bg-alerta-fondo px-3 py-2 text-sm text-alerta-tinta">
                        El requerimiento quedó registrado; el envío a GitHub está pendiente y el administrador lo completará.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-tinta-2">
                    <Hourglass size={18} aria-hidden /> {cierre ?? "Esta conversación terminó."}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/gerencia" className="boton">Volver al portal</Link>
                  {!resultado && (
                    <button type="button" onClick={entrar} className="boton-suave">Volver a entrar</button>
                  )}
                </div>
              </section>
            )}

            {activa && (
              <div className="sticky bottom-0 mt-4 -mx-4 bg-fondo/90 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur lg:mx-0 lg:px-0">
                {sugerida && (
                  <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-pastel-azul px-4 py-3 text-sm text-tinta-2">
                    <ArrowRightLeft size={16} aria-hidden className="shrink-0" />
                    <span className="flex-1">
                      Este tema parece corresponder a <b className="text-tinta">{sugerida.nombre}</b> ({sugerida.area}).
                    </span>
                    <Link href={`/gerencia/${sugerida.clave}`} className="boton-suave bg-superficie">
                      Ir a {sugerida.nombre} <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                )}

                <div className="mb-2 flex items-center gap-3 sm:mb-3">
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-indigo-suave"
                    role="progressbar"
                    aria-valuenow={completitud}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Información reunida"
                  >
                    <div className="h-full rounded-full bg-indigo transition-all" style={{ width: `${completitud}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-tinta-3">{completitud}% reunido</span>
                </div>
                {alTope && (
                  <p role="status" className="mb-3 rounded-2xl bg-alerta-fondo px-4 py-2.5 text-sm text-alerta-tinta">
                    Esta conversación llegó al máximo de {vista.turnos_max} respuestas del asistente. Presiona «Finalizar y generar
                    requerimiento» para enviar lo conversado.
                  </p>
                )}
                {faltantes.length > 0 && (
                  <>
                    {/* Celular: plegado en una línea para dejar espacio a la conversación (#13) */}
                    <details className="mb-2 text-xs text-tinta-3 sm:hidden">
                      <summary className="cursor-pointer font-semibold">Falta conocer ({faltantes.length})</summary>
                      <p className="mt-1">{faltantes.join(" · ")}</p>
                    </details>
                    <p className="mb-3 hidden text-xs text-tinta-3 sm:block">
                      <span className="font-semibold">Falta conocer:</span> {faltantes.join(" · ")}
                    </p>
                  </>
                )}

                {/* Celular: una fila con textos cortos (el texto completo queda como nombre accesible y tooltip) */}
                <div className="mb-2 grid grid-cols-3 gap-1.5 sm:mb-3 sm:flex sm:flex-wrap sm:gap-2">
                  {(
                    [
                      { accion: () => enviar("siguiente"), Icono: SkipForward, corto: "Siguiente", largo: "Pasar a la siguiente pregunta", clase: "boton-suave bg-superficie", off: alTope || !pregunta || pregunta.obligatorio },
                      { accion: () => enviar("mas_detalles"), Icono: MessageSquarePlus, corto: "Más detalles", largo: "Agregar más detalles", clase: "boton-suave bg-superficie", off: alTope },
                      { accion: () => setConfirmar("generar"), Icono: FileText, corto: "Generar", largo: "Finalizar y generar requerimiento", clase: "boton", off: false },
                    ] as const
                  ).map((b) => (
                    <button
                      key={b.largo}
                      type="button"
                      onClick={b.accion}
                      disabled={!!ocupado || !hayRespuestas || b.off}
                      aria-label={b.largo}
                      title={b.largo}
                      className={cx(b.clase, "min-w-0 gap-1 px-1.5 text-[13px] sm:gap-1.5 sm:px-4 sm:text-sm")}
                    >
                      <b.Icono size={15} aria-hidden className="shrink-0" />
                      <span className="truncate sm:hidden">{b.corto}</span>
                      <span className="hidden sm:inline">{b.largo}</span>
                    </button>
                  ))}
                </div>

                {confirmar && (
                  <div role="alertdialog" aria-label="Confirmar" className="mb-3 rounded-2xl bg-superficie p-4 shadow-tarjeta">
                    <p className="text-sm text-tinta">
                      {confirmar === "generar"
                        ? "¿Generar el requerimiento con lo conversado? Se creará el ticket, se enviará al equipo de desarrollo y la sala quedará libre."
                        : "¿Finalizar la conversación sin generar un requerimiento? La sala quedará libre para otra persona."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={confirmar === "generar" ? generar : finalizar} className="boton">
                        {confirmar === "generar" ? "Sí, generar requerimiento" : "Sí, finalizar"}
                      </button>
                      <button type="button" onClick={() => setConfirmar(null)} className="boton-texto">Cancelar</button>
                    </div>
                  </div>
                )}

                {error && <p role="alert" className="mb-3 rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}

                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    enviar("mensaje");
                  }}
                >
                  <label htmlFor="respuesta" className="sr-only">{esFecha ? "Fecha" : "Tu respuesta"}</label>
                  {esFecha ? (
                    <input
                      id="respuesta"
                      type="date"
                      value={texto}
                      onChange={(e) => {
                        setTexto(e.target.value);
                        latido();
                      }}
                      disabled={alTope}
                      className="campo min-h-11 bg-superficie py-2.5 sm:min-h-[3.25rem] sm:py-3"
                    />
                  ) : (
                    <textarea
                      id="respuesta"
                      ref={entrada}
                      rows={angosto ? 1 : 2}
                      maxLength={4000}
                      value={texto}
                      onChange={(e) => {
                        setTexto(e.target.value);
                        latido();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          enviar("mensaje");
                        }
                      }}
                      placeholder={
                        alTope
                          ? "Se alcanzó el máximo de respuestas de esta conversación"
                          : soloOpciones
                            ? angosto
                              ? "Elige una respuesta de arriba"
                              : "Elige una de las respuestas de arriba"
                            : conOpciones
                              ? "O escribe otra respuesta…"
                              : angosto
                                ? "Escribe tu respuesta…"
                                : "Escribe tu respuesta… (Enter para enviar, Mayús+Enter para nueva línea)"
                      }
                      disabled={alTope || soloOpciones}
                      className="campo max-h-32 min-h-11 resize-none bg-superficie py-2.5 disabled:opacity-60 sm:min-h-[3.25rem] sm:py-3"
                      autoFocus
                    />
                  )}
                  <button
                    type="submit"
                    disabled={!!ocupado || alTope || soloOpciones || (!texto.trim() && !(varias && seleccion.length))}
                    aria-label="Enviar"
                    title="Enviar"
                    className="boton-icono h-11 w-11 bg-indigo text-white hover:bg-indigo-hondo hover:text-white disabled:opacity-50 sm:h-[3.25rem] sm:w-[3.25rem]"
                  >
                    <SendHorizontal size={20} />
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
