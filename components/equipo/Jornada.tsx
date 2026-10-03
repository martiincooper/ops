"use client";

import { useCallback, useEffect, useState } from "react";
import ModalNoDisponible from "@/components/ModalNoDisponible";
import type { EstadoDia } from "@/lib/dominio";
import { api } from "@/lib/cliente";
import Cabecera from "./Cabecera";
import Celebracion, { type Mensaje } from "./Celebracion";
import Confeti, { type Disparo } from "./Confeti";
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
  const [disparo, setDisparo] = useState<Disparo | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

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

  const vista =
    abierto === "comenzar" && estado.fase === "sin_iniciar"
      ? "comenzar"
      : abierto === "terminar" && estado.fase === "en_curso"
        ? "terminar"
        : "tablero";

  const celebrar = useCallback((d: Omit<Disparo, "id">, m?: Omit<Mensaje, "id">) => {
    const id = Date.now();
    setDisparo({ ...d, id });
    if (m) setMensaje({ ...m, id });
  }, []);

  const cerrarModal = useCallback(() => setModal(false), []);
  const volver = () => {
    setAbierto(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-md border-x border-aether-border px-4 pb-24 pt-[env(safe-area-inset-top)]">
      <Confeti disparo={disparo} />
      <Celebracion mensaje={mensaje} />
      <Cabecera estado={estado} nombre={nombre} onNoDisponible={() => setModal(true)} compacta={vista !== "tablero"} />

      {vista === "comenzar" && (
        <FormComienzo
          estado={estado}
          onCancelar={volver}
          onListo={(e) => {
            setEstado(e);
            volver();
            celebrar({ tipo: "grande" }, { titulo: "¡Jornada en marcha!", detalle: `${e.tareas.length} objetivos. ¡A darle!` });
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
            const post = e.tareas.filter((t) => t.estado === "postergado_ooo").length;
            const comp = e.tareas.filter((t) => t.estado === "completado").length;
            const total = e.tareas.length - post;
            const pct = total ? Math.round((comp / total) * 100) : 0;
            celebrar(
              { tipo: pct >= 75 ? "grande" : "chico" },
              {
                titulo: pct === 100 ? "¡Jornada perfecta!" : pct >= 75 ? "¡Jornada terminada!" : "Jornada terminada",
                detalle: `${comp} de ${total} objetivos logrados${e.racha ? ` · racha de ${e.racha}` : ""}`,
              },
            );
          }}
        />
      )}

      {vista === "tablero" && (
        <Tablero
          estado={estado}
          onCambio={setEstado}
          onAbrir={(cual) => {
            setAbierto(cual);
            window.scrollTo({ top: 0 });
          }}
          onNoDisponible={() => setModal(true)}
          celebrar={celebrar}
        />
      )}

      {modal && <ModalNoDisponible hoy={estado.hoy} dias={estado.no_disponible} onCambio={setEstado} onCerrar={cerrarModal} />}
    </div>
  );
}
