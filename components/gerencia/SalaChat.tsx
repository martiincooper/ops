"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Bot,
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
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
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
  const ultimoLatido = useRef(0);
  const entrada = useRef<HTMLTextAreaElement>(null);

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

  const enviar = useCallback(
    async (accion: Accion) => {
      if (!vista || ocupado) return;
      const t = texto.trim();
      if (accion === "mensaje" && !t) return;
      setOcupado(accion);
      setError(null);
      // Muestra al tiro lo que escribió la persona; si falla, se repone en el campo.
      if (accion === "mensaje") {
        setTexto("");
        setVista((v) =>
          v ? { ...v, mensajes: [...v.mensajes, { id: -1, autor: "usuario", texto: t, meta: null, creado_en: new Date().toISOString() }] } : v,
        );
      }
      try {
        const v = await api<Vista>(`/api/chat/conversaciones/${vista.id}/mensaje`, {
          method: "POST",
          json: accion === "mensaje" ? { accion, texto: t } : { accion },
        });
        setVista(v);
        ultimoLatido.current = Date.now();
        if (accion === "mas_detalles") setTimeout(() => entrada.current?.focus(), 50);
      } catch (e) {
        if (accion === "mensaje") {
          setTexto(t);
          setVista((v) => (v ? { ...v, mensajes: v.mensajes.filter((m) => m.id !== -1) } : v));
        }
        manejarError(e);
      } finally {
        setOcupado(null);
      }
    },
    [vista, ocupado, texto, manejarError],
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
                        "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-relaxed sm:text-[15px]",
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
                    {ocupado === "generar" ? "Redactando el requerimiento y creando el ticket…" : "El asistente está escribiendo…"}
                  </span>
                </li>
              )}
            </ol>

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

                <div className="mb-3 flex items-center gap-3">
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
                  <p className="mb-3 text-xs text-tinta-3">
                    <span className="font-semibold">Falta conocer:</span> {faltantes.join(" · ")}
                  </p>
                )}

                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => enviar("siguiente")} disabled={!!ocupado || !hayRespuestas || alTope} className="boton-suave bg-superficie">
                    <SkipForward size={15} aria-hidden /> Pasar a la siguiente pregunta
                  </button>
                  <button type="button" onClick={() => enviar("mas_detalles")} disabled={!!ocupado || !hayRespuestas || alTope} className="boton-suave bg-superficie">
                    <MessageSquarePlus size={15} aria-hidden /> Agregar más detalles
                  </button>
                  <button type="button" onClick={() => setConfirmar("generar")} disabled={!!ocupado || !hayRespuestas} className="boton">
                    <FileText size={15} aria-hidden /> Finalizar y generar requerimiento
                  </button>
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
                  <label htmlFor="respuesta" className="sr-only">Tu respuesta</label>
                  <textarea
                    id="respuesta"
                    ref={entrada}
                    rows={2}
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
                    placeholder={alTope ? "Se alcanzó el máximo de respuestas de esta conversación" : "Escribe tu respuesta… (Enter para enviar, Mayús+Enter para nueva línea)"}
                    disabled={alTope}
                    className="campo min-h-[3.25rem] resize-none bg-superficie"
                    autoFocus
                  />
                  <button type="submit" disabled={!!ocupado || !texto.trim() || alTope} aria-label="Enviar" title="Enviar" className="boton-icono h-[3.25rem] w-[3.25rem] bg-indigo text-white hover:bg-indigo-hondo hover:text-white disabled:opacity-50">
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
