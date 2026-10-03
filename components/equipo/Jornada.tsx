"use client";

import { useCallback, useEffect, useState } from "react";
import ModalOoo from "@/components/ModalOoo";
import type { EstadoDia } from "@/lib/dominio";
import { fechaEn, horaEn, momentoDe, vistaPara } from "@/lib/jornada";
import { api } from "@/lib/cliente";
import Cabecera from "./Cabecera";
import Celebracion, { type Mensaje } from "./Celebracion";
import Confeti, { type Disparo } from "./Confeti";
import EncuestaManana from "./EncuestaManana";
import EncuestaTarde from "./EncuestaTarde";
import Tablero from "./Tablero";

/**
 * Vista del integrante según la hora de Chile:
 *  - ventana de la mañana sin objetivos → bitácora de la mañana (obligatoria)
 *  - ventana de la tarde sin cierre      → cierre de la tarde (obligatorio)
 *  - resto del tiempo, o ya hecho         → tablero personal (objetivos, progreso, nivel, logros)
 */
export default function Jornada({ inicial, nombre }: { inicial: EstadoDia; nombre: string }) {
  const [estado, setEstado] = useState(inicial);
  const [hora, setHora] = useState(inicial.hora);
  const [abierta, setAbierta] = useState<"manana" | "tarde" | null>(null);
  const [modalOoo, setModalOoo] = useState(false);
  const [disparo, setDisparo] = useState<Disparo | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  const recargar = useCallback(async () => {
    try {
      setEstado(await api<EstadoDia>("/api/bitacora"));
    } catch {
      /* sin conexión: se reintenta en el próximo tic */
    }
  }, []);

  // Reloj de Chile: recalcula la vista cada 30 s; si cambió el día, recarga el estado.
  useEffect(() => {
    const tic = () => {
      setHora(horaEn(estado.tz));
      if (fechaEn(estado.tz) !== estado.hoy) recargar();
    };
    tic();
    const t = setInterval(tic, 30_000);
    const alVolver = () => document.visibilityState === "visible" && recargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [estado.tz, estado.hoy, recargar]);

  const momento = momentoDe(hora, estado.ventanas);
  const obligatoria = vistaPara(estado.fase, momento, estado.laborable);
  const vista =
    obligatoria !== "tablero"
      ? obligatoria
      : abierta === "manana" && estado.fase === "pendiente_manana"
        ? "encuesta_manana"
        : abierta === "tarde" && estado.fase === "pendiente_tarde"
          ? "encuesta_tarde"
          : "tablero";

  const celebrar = useCallback((d: Omit<Disparo, "id">, m?: Omit<Mensaje, "id">) => {
    const id = Date.now();
    setDisparo({ ...d, id });
    if (m) setMensaje({ ...m, id });
  }, []);

  const cerrarOoo = useCallback(() => setModalOoo(false), []);

  return (
    <div className="mx-auto min-h-dvh max-w-md border-x border-aether-border px-4 pb-24 pt-[env(safe-area-inset-top)]">
      <Confeti disparo={disparo} />
      <Celebracion mensaje={mensaje} />
      <Cabecera estado={estado} nombre={nombre} onOoo={() => setModalOoo(true)} compacta={vista !== "tablero"} />

      {vista === "encuesta_manana" && (
        <EncuestaManana
          estado={estado}
          obligatoria={obligatoria === "encuesta_manana"}
          onOoo={() => setModalOoo(true)}
          onCancelar={() => setAbierta(null)}
          onListo={(e) => {
            setEstado(e);
            setAbierta(null);
            window.scrollTo({ top: 0 });
            celebrar({ tipo: "grande" }, { titulo: "¡Objetivos registrados!", detalle: `${e.tareas.length} objetivos para hoy. ¡A darle!` });
          }}
        />
      )}

      {vista === "encuesta_tarde" && (
        <EncuestaTarde
          estado={estado}
          obligatoria={obligatoria === "encuesta_tarde"}
          fueraDeHora={momento === "despues"}
          onOoo={() => setModalOoo(true)}
          onCancelar={() => setAbierta(null)}
          onListo={(e) => {
            setEstado(e);
            setAbierta(null);
            window.scrollTo({ top: 0 });
            const post = e.tareas.filter((t) => t.estado === "postergado_ooo").length;
            const comp = e.tareas.filter((t) => t.estado === "completado").length;
            const total = e.tareas.length - post;
            const pct = total ? Math.round((comp / total) * 100) : 0;
            celebrar(
              { tipo: pct >= 75 ? "grande" : "chico" },
              {
                titulo: pct === 100 ? "¡Día perfecto!" : pct >= 75 ? "¡Jornada cerrada!" : "Jornada cerrada",
                detalle: `${comp} de ${total} objetivos logrados${e.racha ? ` · racha de ${e.racha}` : ""}`,
              },
            );
          }}
        />
      )}

      {vista === "tablero" && (
        <Tablero
          estado={estado}
          momento={momento}
          onCambio={setEstado}
          onAbrir={setAbierta}
          onOoo={() => setModalOoo(true)}
          celebrar={celebrar}
        />
      )}

      {modalOoo && <ModalOoo hoy={estado.hoy} ausencias={estado.ooo_proximas} onCambio={setEstado} onCerrar={cerrarOoo} />}
    </div>
  );
}
