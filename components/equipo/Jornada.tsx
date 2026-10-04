"use client";

import { CircleCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ModalNoDisponible from "@/components/ModalNoDisponible";
import type { EstadoDia } from "@/lib/dominio";
import { api } from "@/lib/cliente";
import Cabecera from "./Cabecera";
import FormTermino from "./FormTermino";
import Tablero from "./Tablero";

/**
 * Inicio del integrante. Sin horario: siempre ve su tablero. Comenzar y terminar la jornada son eventos (botones,
 * una por día); los objetivos se agregan y editan en el tablero, también después de terminar, hasta comenzar la
 * próxima jornada. Nada se abre solo por la hora.
 */
export default function Jornada({ inicial, nombre }: { inicial: EstadoDia; nombre: string }) {
  const [estado, setEstado] = useState(inicial);
  const [terminando, setTerminando] = useState(false);
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

  const vista = terminando && estado.fase === "en_curso" ? "terminar" : "tablero";

  const cerrarModal = useCallback(() => setModal(false), []);
  const volver = () => {
    setTerminando(false);
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
          onTerminar={() => {
            setAviso(null);
            setTerminando(true);
            window.scrollTo({ top: 0 });
          }}
          onAviso={setAviso}
          onNoDisponible={() => setModal(true)}
        />
      )}

      {modal && <ModalNoDisponible hoy={estado.hoy} dias={estado.no_disponible} onCambio={setEstado} onCerrar={cerrarModal} />}
    </div>
  );
}
