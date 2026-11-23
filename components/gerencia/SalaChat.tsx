"use client";

import { ArrowLeft, Bot, Check, ImagePlus, LoaderCircle, SendHorizontal, X } from "lucide-react";
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
  adjuntos: { id: number; nombre: string }[];
}

interface Solicitud {
  id: string;
  ticket: number;
  estado: "abierta" | "terminada" | "cerrada";
  iniciada_en: string;
  envio?: "enviando" | "enviado" | null;
  envio_error?: string | null;
}

interface Vista {
  solicitudes: Solicitud[];
  mensajes: Mensaje[];
  ultimo_id: number;
  asistente: "idle" | "pensando" | "esperando_reintento" | null;
  resumen: string | null;
  botones: boolean;
}

const FOTOS_MAX = 6;
const FOTO_MAX_BYTES = 5 * 1024 * 1024;

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
  const [asistente, setAsistente] = useState<Vista["asistente"]>(null);
  const [resumen, setResumen] = useState<string | null>(null);
  const [botones, setBotones] = useState(false);
  const [pulsando, setPulsando] = useState(false);
  const ultimoId = useRef(0);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const alFinal = useRef(true);
  const selector = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<{ archivo: File; url: string }[]>([]);
  const [ampliada, setAmpliada] = useState<{ id: number; nombre: string } | null>(null);

  const aplicar = useCallback((v: Vista, reemplazar: boolean) => {
    setSolicitudes(v.solicitudes);
    setAsistente(v.asistente);
    setResumen(v.resumen);
    setBotones(v.botones);
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
        .then((v) => (aplicar(v, false), setError(null)))
        .catch((e) => setError((e as ErrorApi).message));
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
  }, [mensajes.length, asistente]);
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

  const agregarFotos = (lista: FileList | null) => {
    const nuevas = Array.from(lista ?? []);
    if (selector.current) selector.current.value = "";
    if (!nuevas.length) return;
    if (fotos.length + nuevas.length > FOTOS_MAX) return setError(`Una solicitud admite como máximo ${FOTOS_MAX} fotos`);
    const grande = nuevas.find((f) => f.size > FOTO_MAX_BYTES);
    if (grande) return setError(`Cada foto debe pesar como máximo 5 MB («${grande.name}»)`);
    setError(null);
    setFotos((f) => [...f, ...nuevas.map((archivo) => ({ archivo, url: URL.createObjectURL(archivo) }))]);
  };
  const quitarFoto = (i: number) =>
    setFotos((f) => {
      URL.revokeObjectURL(f[i].url);
      return f.filter((_, j) => j !== i);
    });

  /** «Terminar» / «Se me olvidó algo»: si otra persona pulsó antes (409), muestra lo que pasó y toma el estado actual. */
  const pulsar = async (accion: "terminar" | "olvide") => {
    if (pulsando) return;
    setPulsando(true);
    setError(null);
    try {
      aplicar((await api<{ vista: Vista }>(`/api/chat/salas/${modulo.clave}/${accion}`, { method: "POST" })).vista, false);
    } catch (e) {
      const err = e as ErrorApi;
      setError(err.message);
      const vista = err.datos?.vista as Vista | undefined;
      if (vista) aplicar(vista, false);
    } finally {
      setPulsando(false);
    }
  };

  const enviar = useCallback(async () => {
    const t = texto.trim();
    if ((!t && !fotos.length) || enviando) return;
    setEnviando(true);
    setError(null);
    setTexto("");
    const enviadas = fotos;
    try {
      const form = new FormData();
      form.set("texto", t);
      enviadas.forEach((f) => form.append("fotos", f.archivo));
      const r = await api<{ mensaje: Mensaje; solicitud: Solicitud }>(`/api/chat/salas/${modulo.clave}/mensajes`, { method: "POST", body: form });
      enviadas.forEach((f) => URL.revokeObjectURL(f.url));
      setFotos([]);
      alFinal.current = true;
      setAsistente((a) => (a === "esperando_reintento" ? a : "pensando"));
      setBotones(false);
      setMensajes((actuales) => unir(actuales, [r.mensaje]));
      setSolicitudes((s) => (s.some((x) => x.id === r.solicitud.id) ? s : [...s, { ...r.solicitud, iniciada_en: r.mensaje.creado_en }]));
    } catch (e) {
      setTexto(t);
      setError((e as ErrorApi).message);
    } finally {
      setEnviando(false);
      entrada.current?.focus();
    }
  }, [texto, fotos, enviando, modulo.clave]);

  return (
    <div className="flex min-h-dvh flex-col">
      <CabeceraPortal
        nombre={nombre}
        subtitulo={`Sala ${modulo.nombre}${modulo.area ? ` · ${modulo.area}` : ""}`}
        esAdmin={esAdmin}
        volver={
          <Link href="/gerencia" aria-label="Volver a las salas" title="Volver a las salas" className="boton-suave bg-superficie">
            <ArrowLeft size={16} aria-hidden /> <span className="hidden sm:inline">Salas</span>
          </Link>
        }
      />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-4 sm:px-4 lg:px-0">
        <section className="tarjeta mb-4 flex items-center gap-3 p-4">
          <IconoModulo clave={modulo.clave} color={modulo.color} tamano={20} />
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-tinta">
              {modulo.nombre} <span className="font-normal text-tinta-3">· {modulo.estado_modulo === "propuesto" ? "Propuesto" : modulo.area}</span>
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
                          {m.adjuntos?.length > 0 && (
                            <span className={cx("grid gap-1.5", m.texto && "mt-2", m.adjuntos.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                              {m.adjuntos.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => setAmpliada(a)}
                                  aria-label={`Ver foto ${a.nombre}`}
                                  className="block overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/api/chat/adjuntos/${a.id}`} alt={a.nombre} loading="lazy" className="max-h-48 w-full object-cover" />
                                </button>
                              ))}
                            </span>
                          )}
                          <time dateTime={m.creado_en} className={cx("mt-1 block text-[11px]", propio ? "text-white/70" : "text-tinta-3")}>
                            {horaDe(m.creado_en)}
                          </time>
                        </div>
                      </div>
                    </div>
                  )}
                  {s?.estado === "terminada" && (!mensajes[i + 1] || mensajes[i + 1].solicitud_id !== m.solicitud_id) && (
                    <p className="flex flex-col items-center gap-1 pt-1" data-testid="envio" data-envio={s.envio ?? ""}>
                      {s.envio === "enviado" ? (
                        <span className="chip bg-ok-fondo text-ok-tinta">
                          <Check size={14} aria-hidden /> Guardado y enviado a revisión ✓
                        </span>
                      ) : (
                        <span role="status" className="chip bg-suave text-tinta-2">
                          <LoaderCircle size={14} className="animate-spin" aria-hidden /> enviando…
                        </span>
                      )}
                      {s.envio !== "enviado" && s.envio_error && <span className="text-xs text-tinta-3">{s.envio_error}</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {!cargando && asistente === "pensando" && (
          <p role="status" data-testid="asistente-pensando" className="mt-2 flex items-center gap-2 px-2 text-sm text-tinta-3">
            <LoaderCircle size={16} className="animate-spin" aria-hidden /> El asistente está pensando…
          </p>
        )}

        {!cargando && resumen !== null && (
          <section className="tarjeta mt-4 space-y-3 p-4" aria-labelledby="resumen-titulo" data-testid="resumen">
            <h2 id="resumen-titulo" className="font-semibold text-tinta">Esto es lo que entendí</h2>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-tinta-2" data-testid="resumen-texto">{resumen}</p>
            {botones && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => pulsar("terminar")} disabled={pulsando} className="boton" data-testid="terminar">
                  Terminar
                </button>
                <button type="button" onClick={() => pulsar("olvide")} disabled={pulsando} className="boton-suave" data-testid="olvide">
                  Se me olvidó algo
                </button>
              </div>
            )}
          </section>
        )}

        <div className="sticky bottom-0 -mx-3 mt-4 bg-fondo/90 px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0">
          {error && (
            <p role="alert" className="mb-3 rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">
              {error}
            </p>
          )}
          {fotos.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2" aria-label="Fotos por enviar">
              {fotos.map((f, i) => (
                <li key={f.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.archivo.name} className="h-16 w-16 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => quitarFoto(i)}
                    aria-label={`Quitar ${f.archivo.name}`}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-tinta text-white"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <input
              ref={selector}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Elegir fotos"
              data-testid="elegir-fotos"
              tabIndex={-1}
              onChange={(e) => agregarFotos(e.target.files)}
            />
            <button
              type="button"
              onClick={() => selector.current?.click()}
              disabled={enviando}
              aria-label="Adjuntar fotos"
              title="Adjuntar fotos"
              className="boton-icono h-11 w-11 shrink-0 bg-superficie sm:h-[3.25rem] sm:w-[3.25rem]"
            >
              <ImagePlus size={20} />
            </button>
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
              disabled={enviando || (!texto.trim() && !fotos.length)}
              aria-label="Enviar"
              title="Enviar"
              className="boton-icono h-11 w-11 shrink-0 bg-indigo text-white hover:bg-indigo-hondo hover:text-white disabled:opacity-50 sm:h-[3.25rem] sm:w-[3.25rem]"
            >
              <SendHorizontal size={20} />
            </button>
          </form>
        </div>
      </main>

      {ampliada && <Lightbox foto={ampliada} onCerrar={() => setAmpliada(null)} />}
    </div>
  );
}

/** Foto a pantalla completa; se cierra con Escape, con el fondo o con el botón. */
function Lightbox({ foto, onCerrar }: { foto: { id: number; nombre: string }; onCerrar: () => void }) {
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cerrar.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${foto.nombre}`}
      data-testid="lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/80 p-4 backdrop-blur-sm"
      onClick={onCerrar}
    >
      <button ref={cerrar} type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar" className="boton-icono absolute right-4 top-4 bg-superficie">
        <X size={18} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/chat/adjuntos/${foto.id}`} alt={foto.nombre} className="max-h-full max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
