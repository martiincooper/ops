"use client";

import {
  AlertTriangle,
  CalendarCheck,
  CircleCheck,
  Circle,
  Clock,
  Flag,
  Flame,
  LoaderCircle,
  Lock,
  Plane,
  Plus,
  Receipt,
  Star,
  Sunrise,
  Sunset,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Anillo from "@/components/Anillo";
import FormGasto from "@/components/FormGasto";
import { CodigosProyecto } from "@/components/SelectorProyectos";
import { textoAusencia } from "@/components/ModalOoo";
import type { EstadoDia, TareaDia } from "@/lib/dominio";
import type { Momento } from "@/lib/jornada";
import { ErrorApi, api, clp, cx, horaDe } from "@/lib/cliente";
import type { Disparo } from "./Confeti";
import type { Mensaje } from "./Celebracion";

const ICONO_LOGRO: Record<string, typeof Flag> = {
  primera: Flag,
  perfecto: Star,
  racha5: Flame,
  madrugador: Sunrise,
  puntual: Clock,
  racha10: Zap,
  perfecto5: Trophy,
  centenario: Target,
};

const DIA = ["D", "L", "M", "M", "J", "V", "S"];

interface Props {
  estado: EstadoDia;
  momento: Momento;
  onCambio: (e: EstadoDia) => void;
  onAbrir: (cual: "manana" | "tarde") => void;
  onOoo: () => void;
  celebrar: (d: Omit<Disparo, "id">, m?: Omit<Mensaje, "id">) => void;
}

function conteo(tareas: TareaDia[]) {
  const post = tareas.filter((t) => t.estado === "postergado_ooo").length;
  const comp = tareas.filter((t) => t.estado === "completado").length;
  const total = tareas.length - post;
  return { comp, total, pct: total > 0 ? Math.round((comp / total) * 100) : null };
}

export default function Tablero({ estado, momento, onCambio, onAbrir, onOoo, celebrar }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formGasto, setFormGasto] = useState(false);
  const j = estado.juego;
  const hoyCuenta = conteo(estado.tareas);
  const vM = estado.ventanas.manana;
  const vT = estado.ventanas.tarde;
  const oooCompleto = estado.ooo_hoy.find((a) => a.dia_completo === 1);
  const pctNivel = Math.round((j.xp_nivel / j.xp_siguiente) * 100);

  async function alternar(t: TareaDia, ev: React.MouseEvent) {
    if (estado.fase !== "pendiente_tarde" || t.estado === "postergado_ooo") return;
    const completar = t.estado !== "completado";
    const x = ev.clientX;
    const y = ev.clientY;
    setOcupado(t.id);
    setError(null);
    try {
      const nuevo = await api<EstadoDia>(`/api/bitacora/tareas/${t.id}`, { method: "PATCH", json: { completada: completar } });
      onCambio(nuevo);
      if (completar) {
        const c = conteo(nuevo.tareas);
        if (c.total > 0 && c.comp === c.total) {
          celebrar({ tipo: "grande" }, { titulo: "¡Todos tus objetivos logrados!", detalle: `+${10} XP · Día perfecto a la vista` });
        } else {
          celebrar({ tipo: "chico", x, y }, { titulo: "¡Objetivo logrado!", detalle: `+10 XP · ${c.comp} de ${c.total}` });
        }
      }
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Nivel y racha */}
      <section className="tarjeta overflow-hidden p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-aether-accent to-[#7c3aed] text-white shadow-lg">
            <span className="text-[9px] font-semibold uppercase leading-none opacity-80">Nivel</span>
            <span className="text-xl font-black leading-none">{j.nivel}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-white">{j.xp} XP</span>
              <span className="text-slate-500">{j.xp_siguiente - j.xp_nivel} XP para el nivel {j.nivel + 1}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-aether-border">
              <div className="h-full rounded-full bg-gradient-to-r from-aether-accent to-aether-success transition-all duration-700" style={{ width: `${pctNivel}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-aether-bg px-2 py-2.5">
            <p className="flex items-center justify-center gap-1 text-lg font-bold tabular-nums text-white">
              <Flame size={16} className={estado.racha ? "fill-aether-success text-aether-success" : "text-slate-600"} />
              {estado.racha}
            </p>
            <p className="text-[10px] text-slate-500">racha actual</p>
          </div>
          <div className="rounded-xl bg-aether-bg px-2 py-2.5">
            <p className="text-lg font-bold tabular-nums text-white">{j.mejor_racha}</p>
            <p className="text-[10px] text-slate-500">mejor racha</p>
          </div>
          <div className="rounded-xl bg-aether-bg px-2 py-2.5">
            <p className={cx("text-lg font-bold tabular-nums", estado.saydo_14d === null ? "text-slate-500" : estado.saydo_14d >= 75 ? "text-aether-success" : "text-aether-warning")}>
              {estado.saydo_14d === null ? "—" : `${estado.saydo_14d}%`}
            </p>
            <p className="text-[10px] text-slate-500">Say-Do 14 días</p>
          </div>
        </div>
      </section>

      {/* Mi día */}
      <section className="tarjeta p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Mi día</h2>
            <p className="text-[11px] text-slate-500">{estado.hoy_texto}</p>
          </div>
          {estado.fase === "pendiente_tarde" || estado.fase === "cerrado" ? <Anillo valor={hoyCuenta.pct} tamano={56} grosor={6} /> : null}
        </div>

        {estado.fase === "ooo_completo" && oooCompleto && (
          <div className="rounded-xl border border-aether-accent/25 bg-aether-accent/5 p-4 text-center">
            <Plane size={24} className="mx-auto mb-1.5 text-aether-accent-soft" />
            <p className="text-sm font-semibold text-white">Hoy estás fuera de oficina</p>
            {oooCompleto.motivo && <p className="text-xs text-slate-400">{oooCompleto.motivo}</p>}
            <p className="mt-1 text-[11px] text-slate-500">Tu racha no se ve afectada.</p>
            <button type="button" onClick={onOoo} className="mt-3 text-xs font-semibold text-aether-accent-soft">Gestionar ausencias</button>
          </div>
        )}

        {estado.fase === "pendiente_manana" && (
          <div className="rounded-xl border border-dashed border-aether-border p-4 text-center">
            {!estado.laborable ? (
              <>
                <CalendarCheck size={24} className="mx-auto mb-1.5 text-aether-success" />
                <p className="text-sm font-semibold text-white">{estado.feriado ? `Feriado: ${estado.feriado}` : "Fin de semana"}</p>
                <p className="text-xs text-slate-400">No se exige bitácora. ¡Descansa!</p>
              </>
            ) : momento === "antes" ? (
              <>
                <Sunrise size={24} className="mx-auto mb-1.5 text-aether-accent-soft" />
                <p className="text-sm font-semibold text-white">Tu bitácora abre a las {vM.inicio}</p>
                <p className="text-xs text-slate-400">Si ya tienes claro tu día, puedes adelantarla.</p>
              </>
            ) : (
              <>
                <AlertTriangle size={24} className="mx-auto mb-1.5 text-aether-warning" />
                <p className="text-sm font-semibold text-white">Aún no registras tus objetivos de hoy</p>
                <p className="text-xs text-slate-400">Hazlo ahora para no perder tu racha.</p>
              </>
            )}
            <button type="button" onClick={() => onAbrir("manana")} className="mx-auto mt-3 flex items-center gap-1.5 rounded-lg bg-aether-accent px-3.5 py-2 text-xs font-bold text-white">
              <Plus size={14} /> Registrar objetivos
            </button>
          </div>
        )}

        {(estado.fase === "pendiente_tarde" || estado.fase === "cerrado") && (
          <>
            <ul className="space-y-2">
              {estado.tareas.map((t) => {
                const hecho = t.estado === "completado";
                const editable = estado.fase === "pendiente_tarde" && t.estado !== "postergado_ooo";
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={!editable || ocupado !== null}
                      aria-pressed={hecho}
                      onClick={(e) => alternar(t, e)}
                      className={cx(
                        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                        hecho ? "border-aether-success/30 bg-aether-success/5" : "border-aether-border bg-aether-bg",
                        editable && "active:scale-[0.99]",
                      )}
                    >
                      <span className={cx("mt-0.5", hecho ? "animate-latido text-aether-success" : t.estado === "postergado_ooo" ? "text-aether-accent-soft" : "text-slate-500")}>
                        {ocupado === t.id ? (
                          <LoaderCircle size={20} className="animate-spin" />
                        ) : hecho ? (
                          <CircleCheck size={20} className="fill-aether-success text-aether-bg" />
                        ) : t.estado === "postergado_ooo" ? (
                          <Plane size={20} />
                        ) : (
                          <Circle size={20} />
                        )}
                      </span>
                      <span className="flex-1">
                        <CodigosProyecto codigos={t.proyectos.map((p) => p.codigo)} />
                        <span className={cx("block text-sm leading-snug", hecho ? "text-slate-400 line-through" : "text-slate-100")}>{t.descripcion}</span>
                        {t.motivo_pendiente && <span className="mt-0.5 block text-[11px] text-aether-warning">{t.motivo_pendiente}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {estado.fase === "pendiente_tarde" && (
              <div className="mt-3 text-center text-[11px] text-slate-500">
                {momento === "despues" ? (
                  <div className="rounded-lg bg-aether-warning/10 p-3 text-aether-warning">
                    Ya pasó la hora de cierre ({vT.fin}). Ciérrala igual: cuenta para tu Say-Do, aunque hoy no suma a la racha.
                    <button type="button" onClick={() => onAbrir("tarde")} className="mx-auto mt-2 flex items-center gap-1.5 rounded-lg bg-aether-warning px-3 py-1.5 font-bold text-black">
                      <Sunset size={13} /> Cerrar jornada
                    </button>
                  </div>
                ) : (
                  <>
                    Toca un objetivo cuando lo logres. El cierre de la tarde se abre a las {vT.inicio}.
                    <button type="button" onClick={() => onAbrir("tarde")} className="mx-auto mt-1.5 block font-semibold text-slate-300 underline-offset-2 hover:underline">
                      ¿Terminas antes? Cerrar jornada ahora
                    </button>
                  </>
                )}
              </div>
            )}

            {estado.fase === "cerrado" && estado.bitacora?.checkout_tarde && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                {hoyCuenta.pct === 100 && <Trophy size={14} className="text-aether-warning" />}
                Jornada cerrada a las {horaDe(estado.bitacora.checkout_tarde)} · {hoyCuenta.comp}/{hoyCuenta.total} logrados
              </p>
            )}
          </>
        )}

        {estado.ooo_hoy.length > 0 && !oooCompleto && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-aether-accent-soft">
            <Plane size={12} /> Ausencia parcial hoy: {estado.ooo_hoy.map(textoAusencia).join(", ")}
          </p>
        )}
        {error && <p className="mt-3 rounded-lg bg-aether-danger/10 px-3 py-2 text-xs text-aether-danger">{error}</p>}
      </section>

      {/* Semana */}
      <section className="tarjeta p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Mi semana</h2>
          <Link href="/mi-progreso" className="text-[11px] font-semibold text-aether-accent-soft">Historial completo</Link>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {estado.semana.map((d) => {
            const dow = new Date(`${d.fecha}T12:00:00Z`).getUTCDay();
            const esHoy = d.fecha === estado.hoy;
            let clase = "bg-white/[0.04] text-slate-600";
            let texto = "·";
            if (d.tipo === "ooo") {
              clase = "bg-aether-accent/20 text-aether-accent-soft";
              texto = "OOO";
            } else if (d.tipo !== "laboral") {
              clase = "bg-white/[0.03] text-slate-700";
              texto = "–";
            } else if (d.registro === "cerrado" && d.saydo !== null) {
              clase = d.saydo >= 75 ? "bg-aether-success/25 text-aether-success" : "bg-aether-warning/20 text-aether-warning";
              texto = `${d.saydo}`;
            } else if (d.registro === "abierto") {
              clase = esHoy ? "bg-aether-accent/15 text-aether-accent-soft" : "bg-aether-warning/15 text-aether-warning";
              texto = esHoy ? "hoy" : "!";
            } else if (!esHoy) {
              clase = "bg-aether-danger/15 text-aether-danger";
              texto = "✕";
            }
            return (
              <div key={d.fecha} className="text-center">
                <p className={cx("mb-1 text-[10px]", esHoy ? "font-bold text-white" : "text-slate-500")}>{DIA[dow]}</p>
                <div className={cx("relative flex h-10 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums", clase, esHoy && "ring-1 ring-white/30")}>
                  {texto}
                  {d.cuenta_racha && <Flame size={10} className="absolute right-0.5 top-0.5 fill-aether-success text-aether-success" />}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">% de cumplimiento por día · la llama marca los días que sumaron a la racha</p>
      </section>

      {/* Logros */}
      <section className="tarjeta p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-white">Logros</h2>
          <span className="text-[11px] text-slate-500">
            {j.logros.filter((l) => l.logrado).length}/{j.logros.length} desbloqueados
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {j.logros.map((l) => {
            const Icono = ICONO_LOGRO[l.clave] ?? Star;
            return (
              <div
                key={l.clave}
                title={l.descripcion}
                className={cx("rounded-xl border p-2.5", l.logrado ? "border-aether-warning/30 bg-aether-warning/5" : "border-aether-border bg-aether-bg")}
              >
                <div className="flex items-center gap-2">
                  <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", l.logrado ? "bg-aether-warning/20 text-aether-warning" : "bg-white/5 text-slate-600")}>
                    {l.logrado ? <Icono size={16} /> : <Lock size={14} />}
                  </span>
                  <div className="min-w-0">
                    <p className={cx("hyphens-auto break-words text-[11px] font-semibold leading-tight", l.logrado ? "text-white" : "text-slate-400")}>{l.titulo}</p>
                    <p className="text-[10px] tabular-nums text-slate-500">{l.logrado ? "Desbloqueado" : `${l.progreso}/${l.meta}`}</p>
                  </div>
                </div>
                {!l.logrado && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-aether-border">
                    <div className="h-full rounded-full bg-aether-accent-soft/70" style={{ width: `${(l.progreso / l.meta) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Compras */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Receipt size={13} /> Compras de hoy
        </h2>
        {estado.gastos_hoy.map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded-xl border border-aether-border bg-aether-card px-3 py-2.5 text-xs">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{g.item}</p>
              {g.descripcion && <p className="line-clamp-2 text-slate-400">{g.descripcion}</p>}
              <CodigosProyecto codigos={g.proyectos} className="mt-1" />
            </div>
            <div className="shrink-0 pl-2 text-right">
              <p className="font-semibold tabular-nums text-white">{clp(g.monto_clp)}</p>
              <p className="text-[10px] text-slate-500">{g.estado}</p>
            </div>
          </div>
        ))}
        {formGasto ? (
          <FormGasto
            proyectos={estado.proyectos}
            proyectosIniciales={
              estado.tareas.length
                ? [...new Set(estado.tareas.flatMap((t) => t.proyectos.map((p) => p.id)))].slice(0, 1)
                : estado.ultimo_proyecto_id
                  ? [estado.ultimo_proyecto_id]
                  : undefined
            }
            onCancelar={() => setFormGasto(false)}
            onGuardado={async () => {
              setFormGasto(false);
              onCambio(await api<EstadoDia>("/api/bitacora"));
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setFormGasto(true)}
            disabled={estado.proyectos.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-aether-border bg-aether-card py-3 text-xs font-semibold text-aether-accent-soft active:bg-aether-border disabled:opacity-40"
          >
            <Plus size={14} /> Registrar compra
          </button>
        )}
      </section>
    </div>
  );
}
