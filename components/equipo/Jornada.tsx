"use client";

import { CircleCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ModalNoDisponible from "@/components/ModalNoDisponible";
import type { EstadoDia } from "@/lib/dominio";
import { api } from "@/lib/cliente";
import Cabecera from "./Cabecera";
import FormComienzo from "./FormComienzo";
import FormTermino from "./FormTermino";
import Tablero from "./Tablero";

/**
 * Inicio del integrante. Sin horario: siempre ve su tablero; la jornada se comienza y se termina con un botón
 * cuando la persona quiere (una por día). Nada se abre solo por la hora.
 */
export default function Jornada({ inicial, nombre }: { inicial: EstadoDia; nombre: string }) {
  const [estado, setEstado] = useState(inicial);
  const [abierto, setAbierto] = useState<"comenzar" | "terminar" | null>(null);
  const [modal, setModal] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setEstado(await api<EstadoDia>("/api/jornada"));
    } catch {
      /* sin conexión: se reintenta al volver a la pestaña */
    }
  }, []);

  // Al volver a la app (otro día, u otra pestaña) se actualiza el estado.
  useEffect(() => {
    const alVolver = () => document.visibilityState === "visible" && recargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [recargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const vista =
    abierto === "comenzar" && estado.fase === "sin_iniciar"
      ? "comenzar"
      : abierto === "terminar" && estado.fase === "en_curso"
        ? "terminar"
        : "tablero";

  const cerrarModal = useCallback(() => setModal(false), []);
  const volver = () => {
    setAbierto(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-16 pt-[max(env(safe-area-inset-top),1rem)]">
      {vista === "tablero" && <Cabecera estado={estado} nombre={nombre} onNoDisponible={() => setModal(true)} />}

      {aviso && (
        <div role="status" className="mb-4 flex animate-aparecer items-center gap-2 rounded-2xl bg-ok-fondo px-4 py-3 text-sm font-medium text-ok-tinta">
          <CircleCheck size={18} className="shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="rounded-full p-1 hover:bg-white/60">
            <X size={14} />
          </button>
        </div>
      )}

      {vista === "comenzar" && (
        <FormComienzo
          estado={estado}
          onCancelar={volver}
          onListo={(e) => {
            setEstado(e);
            volver();
            setAviso(`Jornada comenzada con ${e.tareas.length} objetivos.`);
          }}
        />
      )}

      {vista === "terminar" && (
        <FormTermino
          estado={estado}
          onCancelar={volver}
          onListo={(e) => {
            setEstado(e);
            volver();
            const comp = e.tareas.filter((t) => t.estado === "completado").length;
            const total = e.tareas.filter((t) => t.estado !== "postergado_ooo").length;
            setAviso(`Jornada terminada: ${comp} de ${total} objetivos logrados.`);
          }}
        />
      )}

      {vista === "tablero" && (
        <Tablero
          estado={estado}
          onCambio={setEstado}
          onAbrir={(cual) => {
            setAviso(null);
            setAbierto(cual);
            window.scrollTo({ top: 0 });
          }}
          onNoDisponible={() => setModal(true)}
        />
      )}

      {modal && <ModalNoDisponible hoy={estado.hoy} dias={estado.no_disponible} onCambio={setEstado} onCerrar={cerrarModal} />}
    </div>
  );
}
