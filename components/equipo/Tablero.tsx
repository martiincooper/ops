"use client";

import {
  AlertTriangle,
  CalendarOff,
  CalendarRange,
  CircleCheck,
  Circle,
  Flag,
  Flame,
  Layers,
  LoaderCircle,
  Lock,
  Play,
  Plus,
  Receipt,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Anillo from "@/components/Anillo";
import FormGasto from "@/components/FormGasto";
import { CodigosProyecto } from "@/components/SelectorProyectos";
import type { EstadoDia, TareaDia } from "@/lib/dominio";
import { ErrorApi, api, clp, cx, horaDe } from "@/lib/cliente";
import type { Disparo } from "./Confeti";
import type { Mensaje } from "./Celebracion";

const ICONO_LOGRO: Record<string, typeof Flag> = {
  primera: Flag,
  perfecto: Star,
  racha5: Flame,
  constante: CalendarRange,
  todoterreno: Layers,
  racha10: Zap,
  perfecto5: Trophy,
  centenario: Target,
};

const DIA = ["D", "L", "M", "M", "J", "V", "S"];

interface Props {
  estado: EstadoDia;
  onCambio: (e: EstadoDia) => void;
  onAbrir: (cual: "comenzar" | "terminar") => void;
  onNoDisponible: () => void;
  celebrar: (d: Omit<Disparo, "id">, m?: Omit<Mensaje, "id">) => void;
}

/** "2 h 15 min" entre dos instantes ISO. */
function duracion(desde: string, hasta: string): string {
  const min = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 60_000));
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

function conteo(tareas: TareaDia[]) {
  const post = tareas.filter((t) => t.estado === "postergado_ooo").length;
  const comp = tareas.filter((t) => t.estado === "completado").length;
  const total = tareas.length - post;
  return { comp, total, pct: total > 0 ? Math.round((comp / total) * 100) : null };
}

export default function Tablero({ estado, onCambio, onAbrir, onNoDisponible, celebrar }: Props) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formGasto, setFormGasto] = useState(false);
  const juego = estado.juego;
  const hoyCuenta = conteo(estado.tareas);
  const j = estado.jornada;
  const deOtroDia = estado.fase === "en_curso" && j !== null && j.fecha !== estado.hoy;
  const pctNivel = Math.round((juego.xp_nivel / juego.xp_siguiente) * 100);

  async function alternar(t: TareaDia, ev: React.MouseEvent) {
    if (estado.fase !== "en_curso" || t.estado === "postergado_ooo") return;
    const completar = t.estado !== "completado";
    const x = ev.clientX;
    const y = ev.clientY;
    setOcupado(t.id);
    setError(null);
    try {
      const nuevo = await api<EstadoDia>(`/api/jornada/objetivos/${t.id}`, { method: "PATCH", json: { completada: completar } });
      onCambio(nuevo);
      if (completar) {
        const c = conteo(nuevo.tareas);
        if (c.total > 0 && c.comp === c.total) {
          celebrar({ tipo: "grande" }, { titulo: "¡Todos tus objetivos logrados!", detalle: "+10 XP · Termina la jornada para sumar la jornada perfecta" });
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
            <span className="text-xl font-black leading-none">{juego.nivel}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-white">{juego.xp} XP</span>
              <span className="text-slate-500">{juego.xp_siguiente - juego.xp_nivel} XP para el nivel {juego.nivel + 1}</span>
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
            <p className="text-[10px] text-slate-500">racha</p>
          </div>
          <div className="rounded-xl bg-aether-bg px-2 py-2.5">
            <p className="text-lg font-bold tabular-nums text-white">{juego.mejor_racha}</p>
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

      {/* Mi jornada */}
      <section className="tarjeta p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Mi jornada</h2>
            <p className="text-[11px] text-slate-500">
              {estado.fase === "en_curso" && j
                ? deOtroDia
                  ? `Comenzada el ${j.fecha_texto.toLowerCase()}`
                  : `En curso desde las ${horaDe(j.checkin_manana)}`
                : estado.hoy_texto}
            </p>
          </div>
          {estado.fase === "en_curso" || estado.fase === "terminada" ? <Anillo valor={hoyCuenta.pct} tamano={56} grosor={6} /> : null}
        </div>

        {estado.fase === "sin_iniciar" && (
          <div className="rounded-xl border border-dashed border-aether-accent/40 bg-aether-accent/5 p-4 text-center">
            <p className="text-sm font-semibold text-white">¿Listo para trabajar?</p>
            <p className="mt-0.5 text-xs text-slate-400">Comienza cuando quieras: define tus objetivos y termina la jornada cuando cierres por hoy.</p>
            <button
              type="button"
              onClick={() => onAbrir("comenzar")}
              disabled={estado.proyectos.length === 0}
              className="mx-auto mt-3 flex items-center gap-2 rounded-xl bg-aether-accent px-5 py-3 text-sm font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-40"
            >
              <Play size={16} className="fill-white" /> Comenzar jornada
            </button>
            {estado.proyectos.length === 0 && (
              <p className="mt-2 text-[11px] text-aether-warning">No hay proyectos activos. Pide a tu jefatura que cree uno.</p>
            )}
          </div>
        )}

        {estado.fase === "no_disponible" && (
          <div className="rounded-xl border border-aether-accent/25 bg-aether-accent/5 p-4 text-center">
            <CalendarOff size={24} className="mx-auto mb-1.5 text-aether-accent-soft" />
            <p className="text-sm font-semibold text-white">Hoy marcaste no disponible</p>
            {estado.no_disponible_hoy?.motivo && <p className="text-xs text-slate-400">{estado.no_disponible_hoy.motivo}</p>}
            <button type="button" onClick={onNoDisponible} className="mt-3 text-xs font-semibold text-aether-accent-soft">
              ¿Vas a trabajar igual? Quita la marca
            </button>
          </div>
        )}

        {(estado.fase === "en_curso" || estado.fase === "terminada") && (
          <>
            {deOtroDia && (
              <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-aether-warning/10 px-3 py-2 text-[11px] text-aether-warning">
                <AlertTriangle size={13} className="mt-px shrink-0" /> Esta jornada sigue abierta. Termínala para comenzar la de hoy.
              </p>
            )}
            <ul className="space-y-2">
              {estado.tareas.map((t) => {
                const hecho = t.estado === "completado";
                const editable = estado.fase === "en_curso" && t.estado !== "postergado_ooo";
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
                      <span className={cx("mt-0.5", hecho ? "animate-latido text-aether-success" : "text-slate-500")}>
                        {ocupado === t.id ? (
                          <LoaderCircle size={20} className="animate-spin" />
                        ) : hecho ? (
                          <CircleCheck size={20} className="fill-aether-success text-aether-bg" />
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

            {estado.fase === "en_curso" && (
              <>
                <p className="mt-3 text-center text-[11px] text-slate-500">Toca un objetivo cuando lo logres.</p>
                <button
                  type="button"
                  onClick={() => onAbrir("terminar")}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-aether-warning py-3 text-sm font-bold text-black active:scale-[0.99]"
                >
                  <Flag size={16} /> Terminar jornada
                </button>
              </>
            )}

            {estado.fase === "terminada" && j?.checkout_tarde && (
              <div className="mt-3 text-center text-xs text-slate-400">
                <p className="flex items-center justify-center gap-1.5">
                  {hoyCuenta.pct === 100 && <Trophy size={14} className="text-aether-warning" />}
                  Jornada terminada · {hoyCuenta.comp}/{hoyCuenta.total} logrados · {duracion(j.checkin_manana, j.checkout_tarde)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Mañana puedes comenzar otra.</p>
              </div>
            )}
          </>
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
            let clase = "bg-white/[0.03] text-slate-600";
            let texto = "·";
            if (d.registro === "cerrado" && d.saydo !== null) {
              clase = d.saydo >= 75 ? "bg-aether-success/25 text-aether-success" : "bg-aether-warning/20 text-aether-warning";
              texto = `${d.saydo}`;
            } else if (d.registro === "abierto") {
              clase = "bg-aether-accent/15 text-aether-accent-soft";
              texto = "▶";
            } else if (d.tipo === "ooo") {
              clase = "bg-aether-accent/10 text-aether-accent-soft";
              texto = "N/D";
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
        <p className="mt-2 text-[10px] text-slate-500">% logrado por jornada · ▶ en curso · N/D no disponible · la llama marca las que sumaron a la racha</p>
      </section>

      {/* Logros */}
      <section className="tarjeta p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-white">Logros</h2>
          <span className="text-[11px] text-slate-500">
            {juego.logros.filter((l) => l.logrado).length}/{juego.logros.length} desbloqueados
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {juego.logros.map((l) => {
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
