"use client";

import { Archive, ArrowLeft, Download, ExternalLink, FileArchive, FileText, Lightbulb, MessageSquareOff, Pencil, RefreshCw, Rocket } from "lucide-react";
import { useState } from "react";
import type { ResumenPropuesto } from "@/lib/chat/propuestos";
import type { Modulo } from "@/lib/chat/modulos";
import type { EstadoDocs } from "@/lib/chat/docs";
import type { ResultadoActivacion } from "@/lib/chat/repos";
import type { Mensaje, Participante } from "@/lib/chat/salas";
import { api, cx } from "@/lib/cliente";
import { Aviso, Cargando, Vacio, fechaHora, useAccion, useDatos } from "./comun";

interface Transcrito {
  id: string;
  ticket: string;
  participantes: Participante[];
  mensajes: Mensaje[];
}
interface Detalle {
  modulo: Modulo;
  abierta: boolean;
  specs: (Transcrito & { titulo: string; spec: string; html: string; fecha: string })[];
  context: string;
  context_html: string;
  adrs: { ruta: string; archivo: string; titulo: string; contenido: string; html: string }[];
  otras: (Transcrito & { estado: string; iniciada_en: string })[];
}

const descarga = (clave: string, doc?: string) => `/api/admin/chat/propuestos/${clave}/descarga${doc ? `?doc=${encodeURIComponent(doc)}` : ""}`;

/** El HTML llega saneado desde el servidor (lib/markdown.ts: todo escapado, solo enlaces http/https). */
function Markdown({ html }: { html: string }) {
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Descargar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} download className="boton-suave">
      <Download size={13} aria-hidden /> {children}
    </a>
  );
}

function Conversacion({ mensajes }: { mensajes: Mensaje[] }) {
  return (
    <ol className="space-y-2 py-2">
      {mensajes.map((m) => (
        <li key={m.id} className="text-sm">
          <span className={cx("font-semibold", m.rol === "asistente" ? "text-indigo-tinta" : m.rol === "sistema" ? "text-tinta-3" : "text-tinta")}>
            {m.rol === "asistente" ? "Asistente" : m.rol === "sistema" ? "Sistema" : m.autor_nombre}
          </span>{" "}
          <span className="text-xs text-tinta-3">{fechaHora(m.creado_en)}</span>
          <p className="whitespace-pre-wrap text-tinta-2">{m.texto}</p>
          {m.adjuntos.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {m.adjuntos.map((a) => (
                <a key={a.id} href={`/api/chat/adjuntos/${a.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/chat/adjuntos/${a.id}`} alt={a.nombre} className="h-24 w-24 rounded-2xl object-cover" />
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function Fotos({ mensajes }: { mensajes: Mensaje[] }) {
  const fotos = mensajes.flatMap((m) => m.adjuntos);
  if (!fotos.length) return null;
  return (
    <div className="flex flex-wrap gap-2" data-fotos>
      {fotos.map((a) => (
        <a key={a.id} href={`/api/chat/adjuntos/${a.id}`} target="_blank" rel="noreferrer" title={a.nombre}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/chat/adjuntos/${a.id}`} alt={a.nombre} className="h-20 w-20 rounded-2xl object-cover" />
        </a>
      ))}
    </div>
  );
}

function Plegable({ titulo, children, abierto }: { titulo: React.ReactNode; children: React.ReactNode; abierto?: boolean }) {
  return (
    <details open={abierto} className="tarjeta p-4">
      <summary className="cursor-pointer font-semibold text-tinta">{titulo}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

type Envio = ResultadoActivacion["envios"][number];

/** Resultado de la activación: cada especificación enviada, con su Issue y su estado, y «Reintentar» si falló. */
/** Documentos iniciales en el repositorio: enlace al PR (o al primer commit), o el error con «Reintentar». */
function DocsIniciales({ clave, inicial }: { clave: string; inicial: EstadoDocs | null }) {
  const [docs, setDocs] = useState(inicial);
  const { ocupado, aviso, ejecutar } = useAccion();
  if (!docs) return null;
  const reintentar = () =>
    ejecutar("docs", async () => {
      const r = await api<{ docs: EstadoDocs }>(`/api/admin/chat/propuestos/${clave}/docs`, { method: "POST" });
      setDocs(r.docs);
      return r.docs.url ? "Documentos escritos" : "Sigue fallando";
    });
  return (
    <div className="space-y-2 border-t border-linea pt-3 text-sm" data-docs>
      <Aviso aviso={aviso} />
      <h3 className="font-semibold text-tinta">Documentos iniciales</h3>
      {docs.url ? (
        <p className="flex flex-wrap items-center gap-2 text-tinta-2">
          <a href={docs.url} target="_blank" rel="noreferrer" className="boton-texto" data-docs-enlace>
            <ExternalLink size={13} aria-hidden /> {docs.numero ? `Pull request #${docs.numero}` : "Primer commit"}
          </a>
          <span className="text-xs text-tinta-3">{docs.numero ? "Revísalo y mézclalo para dejar el repositorio listo para la flota." : "Ya están en main."}</span>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-error-fondo text-error-tinta">No escritos</span>
          <span className="text-xs text-tinta-3" data-docs-error>
            {docs.error}
            {docs.reintento_en ? ` (reintento automático a las ${fechaHora(docs.reintento_en)})` : ""}
          </span>
          <button type="button" onClick={reintentar} disabled={ocupado === "docs"} className="boton-suave" data-reintentar-docs>
            <RefreshCw size={13} aria-hidden /> Reintentar
          </button>
        </div>
      )}
    </div>
  );
}

function Activado({ clave, nombre, envios: inicial, docs, volver }: { clave: string; nombre: string; envios: Envio[]; docs: EstadoDocs | null; volver: () => void }) {
  const [envios, setEnvios] = useState(inicial);
  const { ocupado, aviso, ejecutar } = useAccion();
  const reintentar = (e: Envio) =>
    ejecutar(e.id, async () => {
      try {
        const r = await api<{ issue_url: string | null; issue_estado: Envio["issue_estado"] }>(`/api/admin/chat/${e.id}/issue`, { method: "POST" });
        setEnvios((x) => x.map((y) => (y.id === e.id ? { ...y, ok: true, error: undefined, issue_url: r.issue_url, issue_estado: r.issue_estado } : y)));
        return `${e.ticket} enviado`;
      } catch (err) {
        setEnvios((x) => x.map((y) => (y.id === e.id ? { ...y, error: (err as Error).message } : y)));
        throw err;
      }
    });
  return (
    <div className="space-y-5" data-activado>
      <Aviso aviso={aviso} />
      <div className="tarjeta space-y-3 p-5">
        <h2 className="text-xl font-semibold text-tinta">
          {nombre} <span className="chip bg-ok-fondo align-middle text-ok-tinta">Activo</span>
        </h2>
        <p className="text-sm text-tinta-2">
          La sala ya es un módulo normal. {envios.length ? "Estas son sus especificaciones publicadas en el repositorio:" : "No tenía especificaciones guardadas."}
        </p>
        <ul className="space-y-2">
          {envios.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm" data-envio={e.ticket}>
              <span className="font-semibold tabular-nums text-tinta">{e.ticket}</span>
              <span className="text-tinta-2">{e.titulo}</span>
              {e.issue_url ? (
                <>
                  <a href={e.issue_url} target="_blank" rel="noreferrer" className="boton-texto">
                    <ExternalLink size={13} aria-hidden /> Issue
                  </a>
                  <span className="chip bg-indigo-suave text-indigo-tinta">{e.issue_estado === "closed" ? "Cerrado" : "Abierto"}</span>
                </>
              ) : (
                <>
                  <span className="chip bg-error-fondo text-error-tinta">No enviado</span>
                  {e.error && <span className="text-xs text-tinta-3">{e.error}</span>}
                  <button type="button" onClick={() => reintentar(e)} disabled={ocupado === e.id} className="boton-suave" data-reintentar={e.ticket}>
                    <RefreshCw size={13} aria-hidden /> Reintentar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <DocsIniciales clave={clave} inicial={docs} />
        <button type="button" onClick={volver} className="boton-texto">
          <ArrowLeft size={15} aria-hidden /> Módulos propuestos
        </button>
      </div>
    </div>
  );
}

function Activar({ clave, nombre, bloqueado, alActivar }: { clave: string; nombre: string; bloqueado: boolean; alActivar: (r: ResultadoActivacion) => void }) {
  const [repo, setRepo] = useState("");
  const [errorRepo, setErrorRepo] = useState<string | null>(null);
  const { ocupado, aviso, ejecutar } = useAccion();
  return (
    <form
      data-activar
      className="ml-auto w-full space-y-2 border-t border-linea pt-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        setErrorRepo(null);
        void ejecutar("activar", async () => {
          const r = await api<ResultadoActivacion>(`/api/admin/chat/propuestos/${clave}/activar`, { method: "POST", json: { repo } });
          if (r.error_repo) return void setErrorRepo(r.error_repo);
          alActivar(r);
        });
      }}
    >
      <Aviso aviso={aviso} />
      <label htmlFor="activar-repo" className="text-sm font-semibold text-tinta">
        <Rocket size={13} className="mr-1 inline" aria-hidden /> Activar «{nombre}»
      </label>
      <p className="text-xs text-tinta-3">
        Crea el repositorio a mano, invita a datasheq-creator (con acceso de escritura) y acepta la invitación; luego pega aquí el enlace.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="activar-repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="https://github.com/dueno/repo o dueno/repo"
          className="campo min-w-64 flex-1 text-sm"
          required
        />
        <button type="submit" disabled={ocupado === "activar" || bloqueado || !repo.trim()} className="boton-primario" data-activar-enviar>
          {ocupado === "activar" ? "Activando…" : "Activar"}
        </button>
      </div>
      {bloqueado && <p className="text-xs text-tinta-3">Cierra la conversación abierta antes de activar.</p>}
      {errorRepo && (
        <p role="alert" className="text-sm text-error-tinta" data-error-repo>
          {errorRepo}
        </p>
      )}
    </form>
  );
}

function DetallePropuesto({ clave, volver, irASalas }: { clave: string; volver: () => void; irASalas: () => void }) {
  const { datos, error, cargando, recargar } = useDatos<Detalle>(`/api/admin/chat/propuestos/${clave}`);
  const { ocupado, aviso, ejecutar } = useAccion();
  const [activado, setActivado] = useState<ResultadoActivacion | null>(null);
  if (activado) return <Activado clave={clave} nombre={datos?.modulo.nombre ?? clave} envios={activado.envios} docs={activado.docs} volver={volver} />;
  if (!datos) return <Cargando cargando={cargando} error={error} />;
  const { modulo: m } = datos;
  return (
    <div className="space-y-5" data-detalle-propuesto={clave}>
      <Aviso aviso={aviso} />
      <button type="button" onClick={volver} className="boton-texto">
        <ArrowLeft size={15} aria-hidden /> Módulos propuestos
      </button>

      <div className="tarjeta space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-tinta">
              {m.nombre} <span className="chip bg-pastel-azul align-middle text-indigo-tinta">Propuesto</span>
            </h2>
            <p className="text-sm text-tinta-2">{m.descripcion || "Sin descripción"}</p>
            <p className="text-xs text-tinta-3">
              Creado por {m.creado_por ?? "el administrador"} · {datos.specs.length} especificación{datos.specs.length === 1 ? "" : "es"} guardada{datos.specs.length === 1 ? "" : "s"}
              {datos.abierta ? " · solicitud abierta" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Descargar href={descarga(clave)}>
              <FileArchive size={13} aria-hidden /> Todo (.zip)
            </Descargar>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-linea pt-3">
          <button type="button" onClick={irASalas} className="boton-suave" data-editar-sala>
            <Pencil size={13} aria-hidden /> Editar sala
          </button>
          {datos.abierta && (
            <button
              type="button"
              disabled={ocupado === "cerrar"}
              onClick={() =>
                ejecutar("cerrar", async () => {
                  await api(`/api/admin/chat/salas/${clave}/cerrar`, { method: "POST" });
                  await recargar();
                  return "Conversación cerrada";
                })
              }
              className="boton-texto"
            >
              <MessageSquareOff size={13} aria-hidden /> Cerrar conversación
            </button>
          )}
          <button
            type="button"
            disabled={ocupado === "archivar"}
            onClick={() =>
              ejecutar("archivar", async () => {
                await api(`/api/admin/chat/salas/${clave}/archivo`, { method: "POST", json: { archivar: true } });
                volver();
                return `Sala «${m.nombre}» archivada`;
              })
            }
            className="boton-texto"
          >
            <Archive size={13} aria-hidden /> Archivar
          </button>
        </div>
        <Activar clave={clave} nombre={m.nombre} bloqueado={datos.abierta} alActivar={setActivado} />
      </div>

      <section className="space-y-3">
        <h3 className="titulo-seccion">Especificaciones guardadas</h3>
        {datos.specs.length === 0 ? (
          <Vacio>Aún no hay solicitudes terminadas en esta sala.</Vacio>
        ) : (
          datos.specs.map((s) => (
            <Plegable
              key={s.id}
              abierto={datos.specs.length === 1}
              titulo={
                <>
                  <span className="tabular-nums">{s.ticket}</span> · {s.titulo}
                  <span className="ml-2 text-xs font-normal text-tinta-3">
                    {fechaHora(s.fecha)} · {s.participantes.map((p) => p.nombre).join(", ") || "sin participantes"}
                  </span>
                </>
              }
            >
              <div className="space-y-3" data-spec={s.ticket}>
                <Descargar href={descarga(clave, `specs/${s.ticket}.md`)}>{s.ticket}.md</Descargar>
                <Markdown html={s.html} />
                <Fotos mensajes={s.mensajes} />
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-indigo-tinta">Transcripción ({s.mensajes.length} mensajes)</summary>
                  <Conversacion mensajes={s.mensajes} />
                </details>
              </div>
            </Plegable>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h3 className="titulo-seccion">Documentos vivos</h3>
        <Plegable titulo={<><FileText size={14} className="mr-1 inline" aria-hidden />CONTEXT.md</>}>
          <div className="space-y-3" data-context>
            <Descargar href={descarga(clave, "CONTEXT.md")}>CONTEXT.md</Descargar>
            {datos.context.trim() ? <Markdown html={datos.context_html} /> : <p className="text-sm text-tinta-3">Aún vacío.</p>}
          </div>
        </Plegable>
        {datos.adrs.length === 0 ? (
          <p className="text-sm text-tinta-3">Aún no hay ADRs.</p>
        ) : (
          datos.adrs.map((a) => (
            <Plegable key={a.archivo} titulo={<>ADR · {a.titulo}</>}>
              <div className="space-y-3" data-adr={a.archivo}>
                <Descargar href={descarga(clave, a.ruta)}>{a.ruta.split("/").pop()}</Descargar>
                <Markdown html={a.html} />
              </div>
            </Plegable>
          ))
        )}
      </section>

      {datos.otras.length > 0 && (
        <section className="space-y-3">
          <h3 className="titulo-seccion">Solicitudes sin guardar</h3>
          {datos.otras.map((o) => (
            <Plegable key={o.id} titulo={<>{o.ticket} · {o.estado} <span className="text-xs font-normal text-tinta-3">{fechaHora(o.iniciada_en)}</span></>}>
              <Fotos mensajes={o.mensajes} />
              <Conversacion mensajes={o.mensajes} />
            </Plegable>
          ))}
        </section>
      )}
    </div>
  );
}

/** «Módulos propuestos»: lo que gerencia quiere construir, con sus especificaciones, documentos vivos y fotos. */
export default function ModulosPropuestos({ irASalas }: { irASalas: () => void }) {
  const { datos, error, cargando } = useDatos<{ propuestos: ResumenPropuesto[] }>("/api/admin/chat/propuestos");
  const [clave, setClave] = useState<string | null>(null);
  if (clave) return <DetallePropuesto key={clave} clave={clave} volver={() => setClave(null)} irASalas={irASalas} />;
  if (!datos) return <Cargando cargando={cargando} error={error} />;
  if (datos.propuestos.length === 0)
    return (
      <Vacio>
        <Lightbulb size={20} className="mx-auto mb-2" aria-hidden />
        Gerencia aún no propone módulos nuevos.
      </Vacio>
    );
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-propuestos>
      {datos.propuestos.map((p) => (
        <li key={p.clave} className="tarjeta flex flex-col gap-2 p-4" data-propuesto={p.clave}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-tinta">{p.nombre}</p>
            {p.abierta && <span className="chip bg-indigo-suave text-indigo-tinta">Solicitud abierta</span>}
          </div>
          <p className="line-clamp-3 text-sm text-tinta-2">{p.descripcion || "Sin descripción"}</p>
          <p className="text-xs text-tinta-3">
            {p.creado_por ?? "Administrador"} · {p.guardadas} guardada{p.guardadas === 1 ? "" : "s"} · actividad {fechaHora(p.ultima_actividad)}
          </p>
          <button type="button" onClick={() => setClave(p.clave)} className="boton-suave mt-auto self-start" aria-label={`Abrir ${p.nombre}`}>
            Ver detalle
          </button>
        </li>
      ))}
    </ul>
  );
}
