"use client";

import { Archive, ArrowLeft, Download, FileArchive, FileText, Lightbulb, MessageSquareOff, Pencil, Rocket } from "lucide-react";
import { useState } from "react";
import type { ResumenPropuesto } from "@/lib/chat/propuestos";
import type { Modulo } from "@/lib/chat/modulos";
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

function DetallePropuesto({ clave, volver, irASalas }: { clave: string; volver: () => void; irASalas: () => void }) {
  const { datos, error, cargando, recargar } = useDatos<Detalle>(`/api/admin/chat/propuestos/${clave}`);
  const { ocupado, aviso, ejecutar } = useAccion();
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
          {/* Espacio reservado para «Activar» (siguiente ticket: pegar el repositorio y publicar las especificaciones) */}
          <div data-slot-activar className="ml-auto flex items-center gap-2 text-xs text-tinta-3">
            <Rocket size={13} aria-hidden /> «Activar» llegará pronto
          </div>
        </div>
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
