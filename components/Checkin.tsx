"use client";

import {
  AlertTriangle,
  CircleCheck,
  Circle,
  Clock,
  Flame,
  LifeBuoy,
  LoaderCircle,
  Plane,
  Plus,
  Receipt,
  Trash2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Anillo from "@/components/Anillo";
import FormGasto from "@/components/FormGasto";
import ModalOoo, { textoAusencia } from "@/components/ModalOoo";
import type { EstadoDia, GastoResumen } from "@/lib/dominio";
import { ErrorApi, api, clp, cx, horaDe } from "@/lib/cliente";

type EstadoTarea = "completado" | "pendiente" | "postergado_ooo";

const fmtHoraLocal = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Santiago",
});

function useHoraLocal() {
  const [hora, setHora] = useState<string | null>(null);
  useEffect(() => {
    const act = () => setHora(fmtHoraLocal.format(new Date()));
    act();
    const t = setInterval(act, 60_000);
    return () => clearInterval(t);
  }, []);
  return hora;
}

export default function Checkin({ inicial, nombre }: { inicial: EstadoDia; nombre: string }) {
  const [estado, setEstado] = useState(inicial);
  const [modalOoo, setModalOoo] = useState(false);
  const [formGasto, setFormGasto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hora = useHoraLocal();

  const proyectoDefecto = estado.tareas[0]?.proyecto_id ?? estado.ultimo_proyecto_id ?? estado.proyectos[0]?.id ?? "";

  // Mañana: 2 a 4 objetivos
  const [filas, setFilas] = useState(() =>
    Array.from({ length: 2 }, () => ({ proyecto_id: proyectoDefecto, descripcion: "" })),
  );

  // Tarde: estado local por tarea
  const [marcas, setMarcas] = useState<Record<string, { estado: EstadoTarea; motivo: string }>>({});
  const [bloqueo, setBloqueo] = useState("");

  // Sincroniza con el servidor sin perder lo que el usuario ya marcó (ej. si abre el modal OOO a medio cierre).
  useEffect(() => {
    setMarcas((prev) =>
      Object.fromEntries(
        estado.tareas.map((t) => [
          t.id,
          prev[t.id] && t.estado === "pendiente"
            ? prev[t.id]
            : { estado: t.estado as EstadoTarea, motivo: t.motivo_pendiente ?? "" },
        ]),
      ),
    );
  }, [estado.tareas]);

  const cuenta = useMemo(() => {
    const lista = estado.tareas.map((t) => (estado.fase === "pendiente_tarde" ? marcas[t.id]?.estado ?? t.estado : t.estado));
    const postergadas = lista.filter((e) => e === "postergado_ooo").length;
    const completadas = lista.filter((e) => e === "completado").length;
    const comprometidas = lista.length - postergadas;
    return {
      completadas,
      comprometidas,
      pct: comprometidas > 0 ? Math.round((completadas / comprometidas) * 100) : null,
    };
  }, [estado.tareas, estado.fase, marcas]);

  const tieneOooHoy = estado.ooo_hoy.length > 0;
  const tarde = hora !== null && hora > "19:30";

  async function enviarManana() {
    setError(null);
    const limpias = filas.map((f) => ({ ...f, descripcion: f.descripcion.trim() }));
    if (limpias.some((f) => !f.descripcion)) return setError("Completa la descripción de cada objetivo (o elimina la fila)");
    setOcupado(true);
    try {
      setEstado(await api<EstadoDia>("/api/bitacora/manana", { method: "POST", json: { tareas: limpias } }));
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setOcupado(false);
    }
  }

  async function enviarTarde() {
    setError(null);
    const sinMotivo = estado.tareas.find((t) => marcas[t.id]?.estado === "pendiente" && !marcas[t.id]?.motivo.trim());
    if (sinMotivo) return setError(`Indica por qué quedó pendiente: "${sinMotivo.descripcion}"`);
    setOcupado(true);
    try {
      setEstado(
        await api<EstadoDia>("/api/bitacora/tarde", {
          method: "POST",
          json: {
            tareas: estado.tareas.map((t) => ({
              id: t.id,
              estado: marcas[t.id]?.estado ?? "pendiente",
              motivo_pendiente: marcas[t.id]?.estado === "completado" ? null : marcas[t.id]?.motivo.trim() || null,
            })),
            bloqueo: bloqueo.trim() || null,
          },
        }),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setOcupado(false);
    }
  }

  function marcar(id: string, estadoNuevo: EstadoTarea) {
    setMarcas((m) => ({ ...m, [id]: { motivo: m[id]?.motivo ?? "", estado: estadoNuevo } }));
  }

  const oooCompleto = estado.ooo_hoy.find((a) => a.dia_completo === 1);
  const cerrarModal = useCallback(() => setModalOoo(false), []);

  return (
    <div className="mx-auto min-h-dvh max-w-md border-x border-aether-border px-4 pb-24 pt-[env(safe-area-inset-top)]">
      {/* Cabecera */}
      <header className="mb-5 flex items-center justify-between border-b border-aether-border py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aether-muted">Aether Ops</p>
          <p className="text-base font-bold text-white">Hola, {nombre.split(" ")[0]}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/mi-progreso"
            aria-label={`Racha activa: ${estado.racha} días. Ver mi progreso`}
            className={cx(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
              estado.racha > 0
                ? "border-aether-success/30 bg-aether-success/10 text-aether-success"
                : "border-aether-border text-slate-400",
            )}
          >
            <Flame size={14} className={estado.racha > 0 ? "fill-aether-success" : ""} />
            {estado.racha} {estado.racha === 1 ? "día" : "días"}
          </Link>
          <button
            type="button"
            onClick={() => setModalOoo(true)}
            className="flex items-center gap-1 rounded-full border border-aether-accent/30 bg-aether-accent/10 px-2.5 py-1 text-xs font-semibold text-aether-accent-soft active:scale-95"
          >
            <Plane size={14} /> OOO
          </button>
          <Link href="/mi-progreso" aria-label="Mi progreso" className="rounded-full p-1.5 text-slate-400 hover:bg-white/5">
            <TrendingUp size={18} />
          </Link>
        </div>
      </header>

      <section className="mb-4">
        <h1 className="text-lg font-bold text-white">Mi Enfoque de Hoy</h1>
        <p className="text-xs text-slate-400">{estado.hoy_texto}</p>
      </section>

      {/* Anillo de cumplimiento */}
      <section className="tarjeta mb-5 flex items-center gap-4 p-4">
        <Anillo valor={estado.fase === "pendiente_manana" || oooCompleto ? null : cuenta.pct} etiqueta="hoy" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-400">Cumplimiento diario (Say-Do)</p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {estado.fase === "pendiente_manana"
              ? "Define tus objetivos para empezar"
              : oooCompleto
                ? "Día fuera de oficina"
                : `${cuenta.completadas} de ${cuenta.comprometidas} objetivos logrados`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Últimos 14 días: {estado.saydo_14d === null ? "sin datos" : `${estado.saydo_14d}%`}
          </p>
        </div>
      </section>

      {/* Ausencias de hoy */}
      {tieneOooHoy && !oooCompleto && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-aether-accent/25 bg-aether-accent/5 px-3 py-2 text-xs text-aether-accent-soft">
          <Plane size={14} />
          Ausencia parcial hoy: {estado.ooo_hoy.map(textoAusencia).join(", ")}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 animate-aparecer rounded-xl border border-aether-danger/30 bg-aether-danger/10 px-3 py-2.5 text-xs text-aether-danger">
          {error}
        </p>
      )}

      {/* OOO día completo */}
      {estado.fase === "ooo_completo" && oooCompleto && (
        <section className="tarjeta mb-6 p-5 text-center">
          <Plane size={28} className="mx-auto mb-2 text-aether-accent-soft" />
          <p className="text-sm font-bold text-white">Hoy estás fuera de oficina</p>
          {oooCompleto.motivo && <p className="mt-1 text-xs text-slate-400">{oooCompleto.motivo}</p>}
          <p className="mt-2 text-[11px] text-slate-500">No se exige bitácora y tu racha no se ve afectada.</p>
          {estado.tareas.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              {estado.tareas.filter((t) => t.estado === "postergado_ooo").length} objetivo(s) quedaron postergados.
            </p>
          )}
          <button type="button" onClick={() => setModalOoo(true)} className="mt-4 text-xs font-semibold text-aether-accent-soft">
            Gestionar ausencias
          </button>
        </section>
      )}

      {/* Mañana */}
      {estado.fase === "pendiente_manana" && (
        <section className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Mañana · Define 2 a 4 objetivos</h2>
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-aether-accent/10 px-2 py-0.5 text-[11px] text-aether-accent-soft">
              <Clock size={11} /> 08:30 – 10:30
            </span>
          </div>

          {estado.proyectos.length === 0 ? (
            <p className="tarjeta p-4 text-xs text-aether-warning">
              No hay proyectos activos. Pide a tu jefatura que cree uno en Administración.
            </p>
          ) : (
            filas.map((f, i) => (
              <div key={i} className="tarjeta animate-aparecer space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aether-border text-[11px] font-bold text-slate-300">
                    {i + 1}
                  </span>
                  <select
                    aria-label={`Proyecto del objetivo ${i + 1}`}
                    value={f.proyecto_id}
                    onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, proyecto_id: e.target.value } : x)))}
                    className="campo py-2 font-mono text-sm"
                  >
                    {estado.proyectos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} — {p.nombre}
                      </option>
                    ))}
                  </select>
                  {filas.length > 2 && (
                    <button
                      type="button"
                      aria-label={`Quitar objetivo ${i + 1}`}
                      onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                      className="p-2 text-slate-500 hover:text-aether-danger"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <textarea
                  aria-label={`Descripción del objetivo ${i + 1}`}
                  value={f.descripcion}
                  maxLength={280}
                  rows={2}
                  onChange={(e) => setFilas((fs) => fs.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
                  placeholder="Objetivo concreto y verificable hoy (ej. Ruteo de líneas SPI en PCB)"
                  className="campo resize-none"
                />
              </div>
            ))
          )}

          {filas.length < 4 && estado.proyectos.length > 0 && (
            <button
              type="button"
              onClick={() => setFilas((fs) => [...fs, { proyecto_id: fs[fs.length - 1]?.proyecto_id ?? proyectoDefecto, descripcion: "" }])}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-aether-border py-2.5 text-xs font-semibold text-aether-accent-soft"
            >
              <Plus size={14} /> Agregar objetivo ({filas.length}/4)
            </button>
          )}

          <button type="button" onClick={enviarManana} disabled={ocupado || estado.proyectos.length === 0} className="boton-primario">
            {ocupado && <LoaderCircle size={16} className="animate-spin" />} Registrar objetivos del día
          </button>
        </section>
      )}

      {/* Tarde */}
      {estado.fase === "pendiente_tarde" && (
        <section className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tarde · Validación y cierre</h2>
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-aether-accent/10 px-2 py-0.5 text-[11px] text-aether-accent-soft">
              <Clock size={11} /> 17:00 – 19:30
            </span>
          </div>

          {estado.tareas.map((t) => {
            const m = marcas[t.id] ?? { estado: "pendiente" as EstadoTarea, motivo: "" };
            const hecho = m.estado === "completado";
            return (
              <div
                key={t.id}
                className={cx(
                  "rounded-xl border transition-colors",
                  hecho ? "border-aether-success/30 bg-aether-success/5" : "border-aether-border bg-aether-card",
                )}
              >
                <button
                  type="button"
                  aria-pressed={hecho}
                  onClick={() => marcar(t.id, hecho ? "pendiente" : "completado")}
                  className="flex w-full items-start gap-3 p-3.5 text-left"
                >
                  <span className={cx("mt-0.5 transition-transform", hecho ? "scale-110 text-aether-success" : "text-slate-500")}>
                    {hecho ? <CircleCheck size={20} className="fill-aether-success text-aether-bg" /> : <Circle size={20} />}
                  </span>
                  <span className="flex-1">
                    <span className="rounded bg-aether-border px-1.5 py-0.5 font-mono text-[10px] font-semibold text-aether-accent-soft">
                      {t.proyecto_codigo}
                    </span>
                    <span className={cx("mt-1 block text-sm leading-snug", hecho ? "text-slate-400 line-through" : "font-medium text-slate-100")}>
                      {t.descripcion}
                    </span>
                  </span>
                </button>
                {!hecho && (
                  <div className="space-y-2 px-3.5 pb-3.5">
                    <input
                      aria-label={`Motivo pendiente: ${t.descripcion}`}
                      value={m.motivo}
                      maxLength={280}
                      onChange={(e) => setMarcas((ms) => ({ ...ms, [t.id]: { ...m, motivo: e.target.value } }))}
                      placeholder={m.estado === "postergado_ooo" ? "Detalle (opcional)" : "¿Por qué quedó pendiente?"}
                      className="campo border-aether-warning/25 py-2 text-sm focus:border-aether-warning"
                    />
                    {tieneOooHoy && (
                      <label className="flex items-center gap-2 text-[11px] text-slate-400">
                        <input
                          type="checkbox"
                          checked={m.estado === "postergado_ooo"}
                          onChange={(e) => marcar(t.id, e.target.checked ? "postergado_ooo" : "pendiente")}
                          className="h-4 w-4 accent-aether-accent"
                        />
                        Postergado por mi ausencia de hoy (no cuenta en Say-Do)
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="tarjeta p-3.5">
            <label htmlFor="bloqueo" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-aether-warning">
              <LifeBuoy size={14} /> ¿Algo te bloquea y necesitas ayuda? (opcional)
            </label>
            <input
              id="bloqueo"
              value={bloqueo}
              maxLength={500}
              onChange={(e) => setBloqueo(e.target.value)}
              placeholder="Ej: Esperando componentes de importación"
              className="campo py-2 text-sm"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">Aparecerá primero en el standup de tu jefatura.</p>
          </div>

          {tarde && (
            <p className="flex items-center gap-1.5 text-[11px] text-aether-warning">
              <AlertTriangle size={12} /> Pasadas las 19:30 el cierre de hoy no suma a la racha.
            </p>
          )}

          <button type="button" onClick={enviarTarde} disabled={ocupado} className="boton-primario">
            {ocupado && <LoaderCircle size={16} className="animate-spin" />} Cerrar jornada y guardar bitácora
          </button>
        </section>
      )}

      {/* Cerrado */}
      {estado.fase === "cerrado" && estado.bitacora && (
        <section className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Jornada cerrada</h2>
            <span className="rounded bg-aether-success/10 px-2 py-0.5 text-[11px] text-aether-success">
              {horaDe(estado.bitacora.checkout_tarde!)}
            </span>
          </div>
          {estado.tareas.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-xl border border-aether-border bg-aether-card p-3">
              <span className={t.estado === "completado" ? "text-aether-success" : t.estado === "postergado_ooo" ? "text-aether-accent-soft" : "text-aether-warning"}>
                {t.estado === "completado" ? <CircleCheck size={18} /> : t.estado === "postergado_ooo" ? <Plane size={18} /> : <AlertTriangle size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-200">{t.descripcion}</p>
                <p className="font-mono text-[10px] text-slate-500">{t.proyecto_codigo}</p>
                {t.motivo_pendiente && <p className="mt-1 text-[11px] text-slate-400">{t.motivo_pendiente}</p>}
              </div>
            </div>
          ))}
          {estado.bitacora.bloqueos && (
            <p className="rounded-xl border border-aether-warning/25 bg-aether-warning/5 px-3 py-2 text-xs text-aether-warning">
              Bloqueo reportado: {estado.bitacora.bloqueos}
            </p>
          )}
        </section>
      )}

      {/* Rendición de compras */}
      <section className="mb-6 space-y-3">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Receipt size={13} /> Rendición de compras / insumos
        </h2>
        {estado.gastos_hoy.map((g: GastoResumen) => (
          <div key={g.id} className="flex items-center justify-between rounded-xl border border-aether-border bg-aether-card px-3 py-2.5 text-xs">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{g.item}</p>
              <p className="text-slate-500">
                <span className="font-mono">{g.proyecto_codigo}</span> · {g.tipo_documento} {g.folio_documento}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums text-white">{clp(g.monto_item_clp + g.monto_envio_clp)}</p>
              {g.iva_clp > 0 && <p className="text-[10px] text-aether-success">IVA {clp(g.iva_clp)}</p>}
            </div>
          </div>
        ))}
        {formGasto ? (
          <FormGasto
            proyectos={estado.proyectos}
            proyectoInicial={proyectoDefecto}
            hoy={estado.hoy}
            onCancelar={() => setFormGasto(false)}
            onGuardado={async () => {
              setFormGasto(false);
              setEstado(await api<EstadoDia>("/api/bitacora"));
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setFormGasto(true)}
            disabled={estado.proyectos.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-aether-border bg-aether-card py-3 text-xs font-semibold text-aether-accent-soft active:bg-aether-border disabled:opacity-40"
          >
            <Plus size={14} /> Declarar compra de prototipo / repuesto
          </button>
        )}
      </section>

      {modalOoo && (
        <ModalOoo hoy={estado.hoy} ausencias={estado.ooo_proximas} onCambio={setEstado} onCerrar={cerrarModal} />
      )}
    </div>
  );
}
