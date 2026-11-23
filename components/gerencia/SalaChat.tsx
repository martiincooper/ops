"use client";

import { ArrowLeft, Bot, LoaderCircle, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { type Modulo, codigoTicket } from "@/lib/chat/modulos";
import { ErrorApi, api, cx, horaDe } from "@/lib/cliente";
import { CabeceraPortal, IconoModulo } from "./comun";

interface Mensaje {
  id: number;
  solicitud_id: string;
  autor_email: string;
  autor_nombre: string;
  rol: "gerente" | "asistente" | "sistema";
  texto: string;
  creado_en: string;
}

interface Solicitud {
  id: string;
  ticket: number;
  estado: "abierta" | "terminada" | "cerrada";
  iniciada_en: string;
}

interface Vista {
  solicitudes: Solicitud[];
  mensajes: Mensaje[];
  ultimo_id: number;
}

/** Cada cuánto se consultan los mensajes nuevos (2 a 3 segundos). */
const REFRESCO_MS = 2500;

const fmtDia = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" });

const ESTADO: Record<Solicitud["estado"], string> = { abierta: "Abierta", terminada: "Terminada", cerrada: "Cerrada" };

/** Une mensajes nuevos al historial sin repetir (el envío propio y la consulta pueden traer el mismo). */
function unir(actuales: Mensaje[], nuevos: Mensaje[]): Mensaje[] {
  if (!nuevos.length) return actuales;
  const vistos = new Set(actuales.map((m) => m.id));
  const extra = nuevos.filter((m) => !vistos.has(m.id));
  return extra.length ? [...actuales, ...extra].sort((a, b) => a.id - b.id) : actuales;
}

/** Sala = chat grupal compartido: historial completo de sus solicitudes, mensajes propios a la derecha. */
export default function SalaChat({ modulo, nombre, email, esAdmin }: { modulo: Modulo; nombre: string; email: string; esAdmin: boolean }) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultimoId = useRef(0);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const alFinal = useRef(true);

  const aplicar = useCallback((v: Vista, reemplazar: boolean) => {
    setSolicitudes(v.solicitudes);
    setMensajes((actuales) => (reemplazar ? v.mensajes : unir(actuales, v.mensajes)));
    ultimoId.current = Math.max(ultimoId.current, v.ultimo_id);
  }, []);

  // Historial completo al abrir la sala
  useEffect(() => {
    let vivo = true;
    api<Vista>(`/api/chat/salas/${modulo.clave}`)
      .then((v) => vivo && (aplicar(v, true), setError(null)))
      .catch((e) => vivo && setError((e as ErrorApi).message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [modulo.clave, aplicar]);

  // Mensajes de otras personas: consulta los más nuevos que el último visto
  useEffect(() => {
    if (cargando) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      api<Vista>(`/api/chat/salas/${modulo.clave}?desde=${ultimoId.current}`)
        .then((v) => aplicar(v, false))
        .catch(() => {});
    }, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargando, modulo.clave, aplicar]);

  // Si la persona estaba al final de la conversación, baja con los mensajes nuevos
  useEffect(() => {
    const doc = document.documentElement;
    const onScroll = () => {
      alFinal.current = window.innerHeight + window.scrollY >= doc.scrollHeight - 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (alFinal.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [mensajes.length]);
  useEffect(() => {
    if (!cargando) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [cargando]);

  // El campo crece con el texto (hasta unas 4 líneas) y vuelve a su alto mínimo al enviar
  useLayoutEffect(() => {
    const el = entrada.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [texto]);

  const enviar = useCallback(async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setError(null);
    setTexto("");
    try {
      const r = await api<{ mensaje: Mensaje; solicitud: Solicitud }>(`/api/chat/salas/${modulo.clave}/mensajes`, { method: "POST", json: { texto: t } });
      alFinal.current = true;
      setMensajes((actuales) => unir(actuales, [r.mensaje]));
      setSolicitudes((s) => (s.some((x) => x.id === r.solicitud.id) ? s : [...s, { ...r.solicitud, iniciada_en: r.mensaje.creado_en }]));
      ultimoId.current = Math.max(ultimoId.current, r.mensaje.id);
    } catch (e) {
      setTexto(t);
      setError((e as ErrorApi).message);
    } finally {
      setEnviando(false);
      entrada.current?.focus();
    }
  }, [texto, enviando, modulo.clave]);

  return (
    <div className="flex min-h-dvh flex-col">
      <CabeceraPortal
        nombre={nombre}
        subtitulo={`Sala ${modulo.nombre} · ${modulo.area}`}
        esAdmin={esAdmin}
        volver={
          <Link href="/gerencia" aria-label="Volver al portal" title="Volver al portal" className="boton-icono bg-superficie">
            <ArrowLeft size={18} />
          </Link>
        }
      />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-4 sm:px-4 lg:px-0">
        <section className="tarjeta mb-4 flex items-center gap-3 p-4">
          <IconoModulo clave={modulo.clave} color={modulo.color} tamano={20} />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-tinta">
              {modulo.nombre} <span className="font-normal text-tinta-3">· {modulo.area}</span>
            </h1>
            <p className="text-xs text-tinta-3">{modulo.descripcion}</p>
          </div>
        </section>

        {cargando && (
          <p className="flex items-center gap-2 py-10 text-sm text-tinta-3">
            <LoaderCircle size={16} className="animate-spin" aria-hidden /> Cargando la conversación…
          </p>
        )}

        {!cargando && (
          <ol className="flex-1 space-y-2" aria-live="polite" aria-label="Conversación de la sala" data-testid="mensajes">
            {mensajes.length === 0 && (
              <li className="rounded-2xl bg-suave px-4 py-3 text-center text-sm text-tinta-3">
                Aún no hay mensajes en esta sala. Escribe el primero para abrir un requerimiento.
              </li>
            )}
            {mensajes.map((m, i) => {
              const s = solicitudes.find((x) => x.id === m.solicitud_id);
              const nuevaSolicitud = !mensajes[i - 1] || mensajes[i - 1].solicitud_id !== m.solicitud_id;
              const propio = m.rol === "gerente" && m.autor_email.toLowerCase() === email.toLowerCase();
              const previo = mensajes[i - 1];
              const mismoAutor = !nuevaSolicitud && previo.rol === m.rol && previo.autor_email === m.autor_email;
              return (
                <li key={m.id} className="space-y-2">
                  {nuevaSolicitud && s && (
                    <p className="flex items-center justify-center gap-2 pt-3 text-xs text-tinta-3">
                      <span className="chip bg-suave text-tinta-2">
                        {codigoTicket(s.ticket)} · {fmtDia.format(new Date(s.iniciada_en))} · {ESTADO[s.estado]}
                      </span>
                    </p>
                  )}
                  {m.rol === "sistema" ? (
                    <p className="flex justify-center">
                      <span className="chip bg-suave text-tinta-3">{m.texto}</span>
                    </p>
                  ) : (
                    <div className={cx("flex items-end gap-2 animate-aparecer", propio && "flex-row-reverse")} data-propio={propio}>
                      {propio ? null : m.rol === "asistente" ? (
                        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo text-white">
                          <Bot size={16} />
                        </span>
                      ) : (
                        <Avatar nombre={m.autor_nombre} tamano={32} />
                      )}
                      <div className={cx("flex max-w-[82%] flex-col", propio ? "items-end" : "items-start")}>
                        {!propio && !mismoAutor && <span className="mb-0.5 px-2 text-xs font-medium text-tinta-2">{m.rol === "asistente" ? "Asistente" : m.autor_nombre}</span>}
                        <div
                          className={cx(
                            "whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed",
                            propio ? "rounded-br-md bg-indigo text-white" : "rounded-bl-md bg-superficie text-tinta shadow-tarjeta",
                          )}
                        >
                          <span className="sr-only">{propio ? "Tú" : m.autor_nombre}: </span>
                          {m.texto}
                          <time dateTime={m.creado_en} className={cx("mt-1 block text-[11px]", propio ? "text-white/70" : "text-tinta-3")}>
                            {horaDe(m.creado_en)}
                          </time>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="sticky bottom-0 -mx-3 mt-4 bg-fondo/90 px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0">
          {error && (
            <p role="alert" className="mb-3 rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">
              {error}
            </p>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <label htmlFor="mensaje" className="sr-only">Tu mensaje</label>
            <textarea
              id="mensaje"
              ref={entrada}
              rows={1}
              maxLength={4000}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Escribe un mensaje…"
              className="campo max-h-32 min-h-11 resize-none bg-superficie py-2.5 sm:min-h-[3.25rem] sm:py-3"
              autoFocus
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              aria-label="Enviar"
              title="Enviar"
              className="boton-icono h-11 w-11 shrink-0 bg-indigo text-white hover:bg-indigo-hondo hover:text-white disabled:opacity-50 sm:h-[3.25rem] sm:w-[3.25rem]"
            >
              <SendHorizontal size={20} />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
