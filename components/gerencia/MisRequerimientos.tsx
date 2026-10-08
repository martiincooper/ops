"use client";

import { ClipboardList, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { NOMBRE_PRIORIDAD, type Prioridad, moduloPorClave } from "@/lib/chat/modulos";
import type { EstadoSincronizacion, EstadoVisible } from "@/lib/chat/seguimiento";
import { api } from "@/lib/cliente";
import { ChipEstadoIssue } from "./comun";

interface Requerimiento {
  id: string;
  ticket: string;
  modulo: string;
  titulo: string | null;
  prioridad: Prioridad | null;
  fecha: string | null;
  estado: EstadoVisible;
  estado_al: string | null;
  issue_numero: number | null;
  issue_url: string | null; // solo para administradores
}

const fmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" });
const fmtHora = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago" });

/** «Mis requerimientos» (#6): lo que la persona pidió y en qué está cada Issue en GitHub. */
export default function MisRequerimientos() {
  const [datos, setDatos] = useState<{ requerimientos: Requerimiento[]; seguimiento: EstadoSincronizacion } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ requerimientos: Requerimiento[]; seguimiento: EstadoSincronizacion }>("/api/chat/mis-requerimientos")
      .then(setDatos)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="mt-8 rounded-2xl bg-error-fondo px-4 py-3 text-sm text-error-tinta">{error}</p>;
  if (!datos || datos.requerimientos.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="mis-requerimientos">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="mis-requerimientos" className="titulo-seccion flex items-center gap-2">
          <ClipboardList size={20} aria-hidden /> Mis requerimientos
        </h2>
        {datos.seguimiento.error ? (
          <p className="text-xs text-alerta-tinta">No se pudo consultar GitHub: se muestra el último estado conocido.</p>
        ) : datos.seguimiento.sincronizado_en ? (
          <p className="text-xs text-tinta-3">Estados al {fmtHora.format(new Date(datos.seguimiento.sincronizado_en))}</p>
        ) : null}
      </div>
      <ul className="tarjeta divide-y divide-linea">
        {datos.requerimientos.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-tinta-3">
                <span className="font-semibold tabular-nums text-tinta">{r.ticket}</span> · {moduloPorClave(r.modulo)?.nombre ?? r.modulo}
                {r.fecha && <> · {fmt.format(new Date(r.fecha))}</>}
                {r.prioridad && <> · Prioridad {NOMBRE_PRIORIDAD[r.prioridad].toLowerCase()}</>}
              </p>
              <p className="mt-0.5 text-tinta">{r.titulo ?? "Sin título"}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <ChipEstadoIssue estado={r.estado} />
              {r.issue_url ? (
                <a href={r.issue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-tinta hover:underline">
                  Issue #{r.issue_numero} <ExternalLink size={12} aria-hidden />
                </a>
              ) : (
                r.estado_al && r.estado !== "pendiente" && <span className="text-xs text-tinta-3">al {fmtHora.format(new Date(r.estado_al))}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
