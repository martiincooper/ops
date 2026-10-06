import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  Coins,
  HelpCircle,
  KeyRound,
  LayoutList,
  Minus,
  PackageCheck,
  PauseCircle,
  Receipt,
  Repeat,
  Wallet,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import BotonSalir from "@/components/BotonSalir";
import EditorMetas from "@/components/EditorMetas";
import { ESTADO_PAGO } from "@/components/EstadoPago";
import Marca from "@/components/Marca";
import { Avatar } from "@/components/ui";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { EMPRESAS } from "@/lib/empresas";
import { type DiasPorEtapa, NOMBRE_ESTADO, diasEntre } from "@/lib/etapas";
import { METAS_DEFECTO } from "@/lib/metas";
import {
  type EstadoKpi,
  type MontoPorPeriodo,
  PERIODOS_COSTO,
  type PeriodoCosto,
  type ProyectoEnCurso,
  type SituacionCosto,
  type TipoCostoRecurrente,
  metricasExec,
} from "@/lib/tableros";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/tiempo";
import { cx } from "@/lib/cliente";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const clp = (n: number) => fmt.format(n);
const compacto = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : clp(n);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Estados: color reservado + ícono + texto (nunca solo color).
const ESTADO: Record<EstadoKpi, { texto: string; clase: string; barra: string; Icono: typeof CircleCheck }> = {
  en_meta: { texto: "En meta", clase: "bg-ok-fondo text-ok-tinta", barra: "bg-ok", Icono: CircleCheck },
  en_riesgo: { texto: "En riesgo", clase: "bg-alerta-fondo text-alerta-tinta", barra: "bg-alerta", Icono: AlertTriangle },
  fuera: { texto: "Fuera de meta", clase: "bg-error-fondo text-error-tinta", barra: "bg-error", Icono: CircleX },
  sin_datos: { texto: "Sin datos", clase: "bg-suave text-tinta-3", barra: "bg-tinta-3", Icono: Minus },
};
const KPI_COSTO: Record<SituacionCosto, EstadoKpi> = { dentro: "en_meta", en_riesgo: "en_riesgo", fuera: "fuera", sin_estimacion: "sin_datos" };

// Etapas: rampa ordinal de un solo tono (concepto claro → pruebas oscuro), validada contra la superficie.
// La pausa no es avance: gris con trama.
const ETAPA_COLOR: Record<keyof DiasPorEtapa, string> = {
  concepto: "#9a98f5",
  prototipado: "#615ef0",
  pruebas: "#3a36b8",
  pausado: "repeating-linear-gradient(135deg, #a9acbe 0 3px, #dcdde7 3px 6px)",
};
const ORDEN_ETAPAS: (keyof DiasPorEtapa)[] = ["concepto", "prototipado", "pruebas", "pausado"];
/** Fila de la línea de tiempo: en celular, código y estado arriba y la barra abajo; en escritorio, una sola línea. */
const FILA = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[14rem_minmax(0,1fr)_6.5rem]";
const colorDe = (e: string) => (e in ETAPA_COLOR ? ETAPA_COLOR[e as keyof DiasPorEtapa] : "#a9acbe");

// Tipo de costo: único (indigo) y recurrente (cian, siempre con el ícono ↻). Par validado para daltonismo y separado
// de los colores de estado (ok / alerta / error), que quedan reservados para el Costo vs BOM.
type TipoCostoVista = "unico" | "recurrente";
const COLOR_COSTO: Record<TipoCostoVista, string> = { unico: "bg-indigo", recurrente: "bg-recurrente" };
const NOMBRE_COSTO: Record<TipoCostoVista, string> = { unico: "Único / fijo", recurrente: "Recurrente" };
const PERIODO: Record<PeriodoCosto, { nombre: string; sufijo: string }> = {
  dia: { nombre: "Día", sufijo: "/ día" },
  mes: { nombre: "Mes", sufijo: "/ mes" },
  anio: { nombre: "Año", sufijo: "/ año" },
};
/** Cada tipo recurrente y la unidad en que se registra su monto. */
const TIPO_RECURRENTE: Record<TipoCostoRecurrente, { nombre: string; unidad: PeriodoCosto }> = {
  diario: { nombre: "Diario", unidad: "dia" },
  mensual: { nombre: "Mensual", unidad: "mes" },
  anual: { nombre: "Anual", unidad: "anio" },
};
/** Fila del desglose por proyecto: en celular, proyecto y monto arriba y la barra abajo; en escritorio, una línea. */
const FILA_COSTO =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[14rem_minmax(0,1fr)_5.5rem_8.5rem]";

/** Porcentaje de cada tipo sobre el total, en enteros que suman 100 («<1%» si es mínimo pero no cero). */
function porcentajes(unico: number, recurrente: number): Record<TipoCostoVista, string> {
  const total = unico + recurrente;
  if (total <= 0) return { unico: "0%", recurrente: "0%" };
  const pu = Math.round((unico / total) * 100);
  const texto = (valor: number, pct: number, otro: number) => (valor > 0 && pct <= 0 ? "<1%" : otro > 0 && pct >= 100 ? ">99%" : `${pct}%`);
  return { unico: texto(unico, pu, recurrente), recurrente: texto(recurrente, 100 - pu, unico) };
}

function MuestraCosto({ tipo }: { tipo: TipoCostoVista }) {
  return <span aria-hidden className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]", COLOR_COSTO[tipo])} />;
}

/** Barra apilada único | recurrente (2 px de separación). `ancho`: % del largo disponible, para una escala común. */
function BarraTipoCosto({ unico, recurrente, alto = "h-3", ancho = 100 }: { unico: number; recurrente: number; alto?: string; ancho?: number }) {
  const texto = `${NOMBRE_COSTO.unico} ${clp(unico)} · ${NOMBRE_COSTO.recurrente} ${clp(recurrente)}`;
  return (
    <div
      className={cx("flex gap-[2px] overflow-hidden rounded-full", alto)}
      style={{ width: `${Math.max(0, Math.min(100, ancho))}%`, minWidth: unico + recurrente > 0 ? 6 : 0 }}
      role="img"
      aria-label={texto}
      title={texto}
    >
      {(["unico", "recurrente"] as const).map((t) => {
        const v = t === "unico" ? unico : recurrente;
        return v > 0 ? <span key={t} className={COLOR_COSTO[t]} style={{ flexGrow: v, flexBasis: 0, minWidth: 3 }} /> : null;
      })}
    </div>
  );
}

/** Costo recurrente con su periodo, p. ej. «↻ $18.000 / mes». */
function MontoRecurrente({ monto, periodo, className }: { monto: number; periodo: PeriodoCosto; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold tabular-nums text-recurrente-tinta", className)}>
      <Repeat size={12} aria-label="Recurrente" /> {compacto(monto)} {PERIODO[periodo].sufijo}
    </span>
  );
}

function Chip({ e, texto }: { e: EstadoKpi; texto?: string }) {
  const { texto: t, clase, Icono } = ESTADO[e];
  return (
    <span className={cx("chip shrink-0 whitespace-nowrap", clase)}>
      <Icono size={13} aria-hidden /> {texto ?? t}
    </span>
  );
}

function Muestra({ etapa }: { etapa: keyof DiasPorEtapa | "plan" }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]", etapa === "plan" && "bg-indigo-suave ring-1 ring-indigo/25")}
      style={etapa === "plan" ? undefined : { background: ETAPA_COLOR[etapa] }}
    />
  );
}

function Leyenda({ conPlan = false }: { conPlan?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-tinta-3">
      {ORDEN_ETAPAS.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <Muestra etapa={k} /> {NOMBRE_ESTADO[k]}
        </li>
      ))}
      {conPlan && (
        <li className="flex items-center gap-1.5">
          <Muestra etapa="plan" /> Plan hasta la entrega estimada
        </li>
      )}
    </ul>
  );
}

/** Barra de costo (bullet): relleno con el color del estado sobre pista del mismo tono; marca = 100% del BOM. */
function BarraCosto({ pct, max, estado, titulo }: { pct: number; max: number; estado: EstadoKpi; titulo: string }) {
  const { barra } = ESTADO[estado];
  return (
    <div className="relative h-3 rounded-full" title={titulo} role="img" aria-label={titulo}>
      <div className={cx("absolute inset-0 rounded-full opacity-20", barra)} />
      <div className={cx("absolute inset-y-0 left-0 rounded-full", barra)} style={{ width: `${Math.min(100, (Math.max(pct, 0) / max) * 100)}%`, minWidth: pct > 0 ? 6 : 0 }} />
      <div className="absolute -top-1 h-5 w-[3px] rounded-full bg-tinta ring-2 ring-white" style={{ left: `calc(${(100 / max) * 100}% - 1.5px)` }} aria-hidden />
    </div>
  );
}

/** Días por etapa apilados (2px de separación). */
function BarraEtapas({ d, alto = "h-3" }: { d: DiasPorEtapa; alto?: string }) {
  const visibles = ORDEN_ETAPAS.filter((k) => d[k] > 0);
  const texto = visibles.map((k) => `${NOMBRE_ESTADO[k]} ${d[k]} d`).join(" · ");
  return (
    <div className={cx("flex w-full gap-[2px] overflow-hidden rounded-full", alto)} role="img" aria-label={texto || "Sin días registrados"}>
      {visibles.map((k) => (
        <div key={k} title={`${NOMBRE_ESTADO[k]}: ${d[k]} días`} style={{ flexGrow: d[k], flexBasis: 0, background: ETAPA_COLOR[k] }} />
      ))}
      {visibles.length === 0 && <div className="flex-1 bg-indigo-suave" />}
    </div>
  );
}

/**
 * Número principal. En celular: una fila (ícono · número · estado); en escritorio: tarjeta alta. `extra` (mini
 * gráfico) va a la derecha del número o, con `extraEnEtiqueta` (números largos como montos), en la línea de la
 * etiqueta, para que los números de las cuatro tarjetas queden alineados.
 */
function Tile({
  href,
  icono: Icono,
  tono,
  chip,
  valor,
  etiqueta,
  extra,
  extraEnEtiqueta = false,
}: {
  href: string;
  icono: typeof Clock;
  tono: string;
  chip: React.ReactNode;
  valor: string;
  etiqueta: string;
  extra?: React.ReactNode;
  extraEnEtiqueta?: boolean;
}) {
  return (
    <a href={href} className="tarjeta flex items-center gap-3 p-4 transition hover:-translate-y-0.5 sm:flex-col sm:items-stretch sm:p-5">
      <span className="flex items-center justify-between gap-2">
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", tono)}>
          <Icono size={20} aria-hidden />
        </span>
        <span className="hidden sm:inline-flex">{chip}</span>
      </span>
      <span className="flex min-w-0 flex-1 items-end justify-between gap-3">
        <span className={cx("min-w-0", extraEnEtiqueta && "sm:flex-1")}>
          <span className="block text-3xl font-bold tracking-tight text-tinta sm:text-4xl">{valor}</span>
          {extra && extraEnEtiqueta ? (
            <span className="flex items-center gap-3">
              <span className="shrink-0 text-sm text-tinta-3">{etiqueta}</span>
              <span className="hidden min-w-0 flex-1 sm:block [&>*]:w-full">{extra}</span>
            </span>
          ) : (
            <span className="block text-sm text-tinta-3">{etiqueta}</span>
          )}
        </span>
        {extra && !extraEnEtiqueta && <span className="hidden sm:mb-1 sm:flex sm:w-1/2 sm:justify-end [&>*]:w-full">{extra}</span>}
      </span>
      <span className="flex flex-col items-end gap-2 sm:hidden">
        {chip}
        {extra}
      </span>
    </a>
  );
}

function Seccion({ id, icono: Icono, tono, titulo, chip, children }: { id: string; icono: typeof Clock; tono: string; titulo: string; chip?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="tarjeta min-w-0 scroll-mt-24 p-5 sm:p-6">
      <header className="mb-5 flex items-center gap-3">
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", tono)}>
          <Icono size={20} aria-hidden />
        </span>
        <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug text-tinta">{titulo}</h2>
        {chip}
      </header>
      {children}
    </section>
  );
}

export default async function Exec({ searchParams }: { searchParams: Promise<{ empresa?: string; periodo?: string }> }) {
  const u = await requirePagina(["executive", "admin"]);
  const q = await searchParams;
  let empresa;
  try {
    empresa = empresaDe(u, q.empresa); // gerencia: siempre la propia; admin: la elegida
  } catch {
    empresa = empresaDe(u);
  }
  const hoy = hoyLocal();
  const m = metricasExec(getDbEmpresa(empresa.clave), hoy);
  const { costo, tiempo, pipeline, entregados, metas, desglose, pagos } = m;

  // Costo recurrente por día, mes o año (?periodo=dia|mes|anio; por defecto, mes)
  const periodo: PeriodoCosto = PERIODOS_COSTO.find((p) => p === q.periodo) ?? "mes";
  const sufijo = PERIODO[periodo].sufijo;
  const rec: MontoPorPeriodo = desglose.recurrente.por_periodo;
  const pctTipo = porcentajes(desglose.unico_clp, desglose.recurrente_clp);
  const maxProyecto = Math.max(1, ...desglose.proyectos.map((p) => p.total_clp));
  /** Enlace a esta vista conservando la empresa (administradores) y el periodo del costo recurrente. */
  const hrefExec = (op: { empresa?: string; periodo?: PeriodoCosto }) => {
    const s = new URLSearchParams();
    if (u.rol === "admin") s.set("empresa", op.empresa ?? empresa.clave);
    const p = op.periodo ?? periodo;
    if (p !== "mes") s.set("periodo", p);
    return s.size ? `/exec?${s}` : "/exec";
  };

  const anio = hoy.slice(0, 4);
  const fecha = (f: string) => fechaCorta(f).replace(/^\S+ /, "") + (f.slice(0, 4) !== anio ? ` ${f.slice(2, 4)}` : ""); // "3 oct" / "29 ene 27"
  const cargadas = pipeline.etapas.filter((e) => e.saturada);

  // ── Línea de tiempo (concepto → cliente): un eje común para todos los proyectos en desarrollo
  const proyectosT = tiempo.proyectos;
  const d0 = proyectosT.length ? proyectosT.map((p) => p.fecha_inicio).sort()[0] : hoy;
  const fin = [hoy, ...proyectosT.map((p) => p.fecha_entrega_estimada)].sort().reverse()[0];
  const span = Math.max(30, diasEntre(d0, fin));
  const total = span + Math.round(span * 0.03);
  const pos = (f: string) => Math.max(0, Math.min(100, (diasEntre(d0, f) / total) * 100));
  const meses: { f: string; etiqueta: string }[] = [];
  {
    let [y, mm] = d0.split("-").map(Number);
    mm += 1;
    for (;;) {
      if (mm > 12) {
        mm = 1;
        y += 1;
      }
      const f = `${y}-${String(mm).padStart(2, "0")}-01`;
      if (diasEntre(d0, f) > total) break;
      meses.push({ f, etiqueta: MESES[mm - 1] + (mm === 1 ? ` ${String(y).slice(2)}` : "") });
      mm += 1;
    }
  }
  const paso = meses.length > 12 ? 3 : meses.length > 7 ? 2 : 1;

  const estadoPlazo = (p: ProyectoEnCurso) =>
    p.situacion === "atrasado" ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-error-tinta">
        <CircleX size={13} aria-hidden /> {-p.dias_restantes} d atraso
      </span>
    ) : p.situacion === "por_vencer" ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-alerta-tinta">
        <AlertTriangle size={13} aria-hidden /> faltan {p.dias_restantes} d
      </span>
    ) : (
      <span className="whitespace-nowrap text-xs text-tinta-3">faltan {p.dias_restantes} d</span>
    );

  const totalPipeline = Math.max(1, pipeline.en_desarrollo);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-linea/70 bg-fondo/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
          <Marca conTexto={false} />
          <div className="min-w-0">
            <p className="text-base font-semibold text-tinta">Gerencia General</p>
            <p className="text-xs text-tinta-3">
              {empresa.nombre} · {fechaLarga(hoy)}
            </p>
          </div>
          {u.rol === "admin" && (
            <nav aria-label="Empresa" className="segmentos bg-superficie shadow-tarjeta">
              {EMPRESAS.map((e) => (
                <Link
                  key={e.clave}
                  href={hrefExec({ empresa: e.clave })}
                  aria-current={e.clave === empresa.clave ? "page" : undefined}
                  className={cx("segmento", e.clave === empresa.clave && "bg-indigo text-white shadow-sm hover:text-white")}
                >
                  {e.nombre}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {u.rol === "admin" && (
              <Link href={`/admin?empresa=${empresa.clave}`} title="Jefatura" aria-label="Jefatura" className="boton-icono bg-superficie">
                <LayoutList size={18} />
              </Link>
            )}
            <Link href="/cambiar-pin" aria-label="Cambiar código" title="Cambiar código" className="boton-icono bg-superficie">
              <KeyRound size={18} />
            </Link>
            <BotonSalir conTexto={false} className="bg-superficie" />
            <span className="hidden sm:block">
              <Avatar nombre={u.nombre} tamano={40} />
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8">
        <h1 className="sr-only">Panel de gerencia de {empresa.nombre}</h1>

        {cargadas.length > 0 && (
          <div role="alert" className="flex items-center gap-3 rounded-3xl bg-alerta-fondo px-5 py-4 text-alerta-tinta">
            <AlertTriangle size={22} className="shrink-0" aria-hidden />
            <p className="text-sm sm:text-base">
              <b className="font-semibold">{cargadas.map((e) => `${e.nombre}: ${e.proyectos.length} proyectos`).join(" · ")}.</b> Sumar proyectos ahora
              retrasa los que están en curso.
            </p>
          </div>
        )}

        {/* ── Resumen: cuatro números */}
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <Tile
            href="#costo"
            icono={Wallet}
            tono="bg-pastel-durazno text-alerta-tinta"
            chip={<Chip e={costo.estado} />}
            valor={costo.con_estimacion ? `${costo.dentro}/${costo.con_estimacion}` : "—"}
            etiqueta="dentro del costo BOM"
          />
          <Tile
            href="#desglose"
            icono={Coins}
            tono="bg-recurrente-fondo text-recurrente-tinta"
            chip={
              rec[periodo] > 0 ? (
                <span className="chip bg-recurrente-fondo text-recurrente-tinta" title={`Costo recurrente vigente ${sufijo}`}>
                  <Repeat size={13} aria-label="Recurrente" /> {compacto(rec[periodo])} {sufijo}
                </span>
              ) : (
                <span className="chip bg-suave text-tinta-3">Sin recurrentes</span>
              )
            }
            valor={compacto(desglose.total_clp)}
            etiqueta="costo total"
            extraEnEtiqueta
            extra={
              desglose.total_clp > 0 ? (
                <span className="block w-24 sm:w-full">
                  <BarraTipoCosto unico={desglose.unico_clp} recurrente={desglose.recurrente_clp} alto="h-2.5" />
                </span>
              ) : undefined
            }
          />
          <Tile
            href="#plazo"
            icono={Clock}
            tono="bg-pastel-azul text-indigo"
            chip={<Chip e={tiempo.estado} />}
            valor={tiempo.en_desarrollo ? `${tiempo.en_plazo}/${tiempo.en_desarrollo}` : "—"}
            etiqueta="a tiempo para su entrega"
          />
          <Tile
            href="#pipeline"
            icono={Workflow}
            tono="bg-pastel-lila text-indigo-tinta"
            chip={cargadas.length > 0 ? <Chip e="en_riesgo" texto="Cargado" /> : <span className="chip bg-suave text-tinta-3">Normal</span>}
            valor={`${pipeline.en_desarrollo}`}
            etiqueta="en desarrollo"
            extra={
              /* Mini pipeline: proyectos por etapa */
              <span className="flex h-7 w-24 gap-[2px] overflow-hidden rounded-lg sm:w-1/2" role="img" aria-label={pipeline.etapas.map((e) => `${e.nombre} ${e.proyectos.length}`).join(", ")}>
                {pipeline.etapas.map((e) =>
                  e.proyectos.length ? (
                    <span
                      key={e.estado}
                      title={`${e.nombre}: ${e.proyectos.length}`}
                      className={cx("flex items-center justify-center text-xs font-bold", e.estado === "concepto" ? "text-tinta" : "text-white")}
                      style={{ flexGrow: e.proyectos.length / totalPipeline, flexBasis: 0, background: ETAPA_COLOR[e.estado] }}
                    >
                      {e.proyectos.length}
                    </span>
                  ) : null,
                )}
                {pipeline.en_desarrollo === 0 && <span className="flex-1 bg-suave" />}
              </span>
            }
          />
        </div>

        {/* ── 1. Costo vs BOM */}
        <Seccion id="costo" icono={Wallet} tono="bg-pastel-durazno text-alerta-tinta" titulo="Costo vs BOM" chip={<Chip e={costo.estado} />}>
          <p className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl font-bold tracking-tight text-tinta">{compacto(costo.total_clp)}</span>
            <span className="text-sm text-tinta-3">de {compacto(costo.estimado_clp)} estimados</span>
            <span className="rounded-full bg-suave px-2.5 py-0.5 text-xs font-medium text-tinta-2">+{compacto(costo.periodo_clp)} en 14 días</span>
          </p>
          {costo.proyectos.length === 0 ? (
            <p className="text-sm text-tinta-3">Sin proyectos en curso.</p>
          ) : (
            <ul className="grid gap-x-10 gap-y-4 md:grid-cols-2">
              {costo.proyectos.map((p) => {
                const max = Math.max(100 + metas.tolerancia_costo_pct, p.pct ?? 0);
                return (
                  <li key={p.id} className="min-w-0">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate" title={p.nombre}>
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span>{" "}
                        <span className="text-tinta-2">{p.nombre}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <b className="font-semibold text-tinta">{p.pct === null ? "—" : `${p.pct === 0 && p.total_clp > 0 ? "<1" : p.pct}%`}</b>
                        <span className="ml-1.5 text-xs text-tinta-3">{compacto(p.total_clp)}</span>
                      </span>
                    </div>
                    {p.pct !== null ? (
                      <BarraCosto pct={p.pct} max={max} estado={KPI_COSTO[p.situacion]} titulo={`${clp(p.total_clp)} de ${clp(p.estimado_clp)} (${p.pct}%)`} />
                    ) : (
                      <p className="text-xs text-tinta-3">Sin estimación BOM</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-tinta-3">
            <span aria-hidden className="inline-block h-3 w-[3px] rounded-full bg-tinta" /> 100% del BOM
          </p>
        </Seccion>

        {/* ── 2. Desglose de costos: total (único vs recurrente), recurrente por periodo y por proyecto */}
        <Seccion id="desglose" icono={Coins} tono="bg-recurrente-fondo text-recurrente-tinta" titulo="Desglose de costos">
          {desglose.compras === 0 ? (
            <p className="text-sm text-tinta-3">Sin compras registradas.</p>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Total: único vs recurrente */}
                <div className="flex min-w-0 flex-col gap-4 rounded-3xl bg-suave p-4 sm:p-5 lg:justify-between">
                  <div>
                    <p className="text-sm font-medium text-tinta-2">Costo total</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-3xl font-bold tracking-tight text-tinta">{compacto(desglose.total_clp)}</span>
                      <span className="text-sm text-tinta-3">
                        {desglose.compras} {desglose.compras === 1 ? "compra" : "compras"} · todos los proyectos
                      </span>
                    </p>
                  </div>
                  <div>
                    <BarraTipoCosto unico={desglose.unico_clp} recurrente={desglose.recurrente_clp} alto="h-4" />
                    <ul className="mt-4 grid grid-cols-2 gap-3">
                      {(["unico", "recurrente"] as const).map((t) => (
                        <li key={t} className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm text-tinta-2">
                            <MuestraCosto tipo={t} /> {NOMBRE_COSTO[t]}
                            {t === "recurrente" && <Repeat size={13} className="text-recurrente-tinta" aria-hidden />}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                            <b className="text-xl font-bold text-tinta">{compacto(t === "unico" ? desglose.unico_clp : desglose.recurrente_clp)}</b>
                            <span className="text-sm text-tinta-3">{pctTipo[t]}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-tinta-3">
                    {desglose.por_validar_clp > 0 ? `Incluye ${compacto(desglose.por_validar_clp)} por validar. ` : ""}Envío e impuesto incluidos; sin
                    rechazadas.
                  </p>
                </div>

                {/* Recurrente vigente, llevado al periodo elegido */}
                <div className="min-w-0 rounded-3xl bg-recurrente-fondo/70 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-recurrente-tinta">
                      <Repeat size={15} aria-hidden /> Costo recurrente
                    </p>
                    <nav aria-label="Ver el costo recurrente por" className="inline-flex items-center gap-0.5 rounded-full bg-superficie p-0.5 shadow-sm">
                      {PERIODOS_COSTO.map((p) => (
                        <Link
                          key={p}
                          href={hrefExec({ periodo: p })}
                          scroll={false}
                          replace
                          aria-current={p === periodo ? "true" : undefined}
                          className={cx(
                            "rounded-full px-2.5 py-1 text-xs font-semibold transition sm:px-3",
                            p === periodo ? "bg-recurrente text-white" : "text-tinta-3 hover:text-tinta",
                          )}
                        >
                          {PERIODO[p].nombre}
                        </Link>
                      ))}
                    </nav>
                  </div>
                  {desglose.recurrente.costos.length === 0 ? (
                    <p className="mt-3 text-sm text-tinta-2">
                      Sin costos recurrentes. Al registrar una compra se puede marcar como recurrente diaria, mensual o anual.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-3xl font-bold tracking-tight text-tinta">{compacto(rec[periodo])}</span>
                        <span className="text-lg font-semibold text-tinta-2">{sufijo}</span>
                      </p>
                      <p className="text-xs text-tinta-3">
                        ≈{" "}
                        {PERIODOS_COSTO.filter((p) => p !== periodo)
                          .map((p) => `${compacto(rec[p])} ${PERIODO[p].sufijo}`)
                          .join(" · ")}
                      </p>
                      <ul className="mt-4 space-y-3">
                        {desglose.recurrente.por_tipo.map((t) => (
                          <li key={t.tipo}>
                            <div className="flex items-end justify-between gap-x-3 text-sm">
                              <span className="min-w-0">
                                <b className="font-semibold text-tinta">{TIPO_RECURRENTE[t.tipo].nombre}</b>
                                <span className="block text-xs text-tinta-3">
                                  {t.costos} {t.costos === 1 ? "costo" : "costos"} · {clp(t.monto_clp)} {PERIODO[TIPO_RECURRENTE[t.tipo].unidad].sufijo}
                                </span>
                              </span>
                              <span className="whitespace-nowrap tabular-nums">
                                <b className="font-semibold text-tinta">{compacto(t.por_periodo[periodo])}</b>{" "}
                                <span className="text-xs text-tinta-3">{sufijo}</span>
                              </span>
                            </div>
                            <div
                              className="mt-1.5 h-2 rounded-full bg-superficie"
                              role="img"
                              aria-label={`${TIPO_RECURRENTE[t.tipo].nombre}: ${Math.round((t.por_periodo.anio / Math.max(1, rec.anio)) * 100)}% del costo recurrente`}
                            >
                              <div
                                className="h-full rounded-full bg-recurrente"
                                style={{ width: `${(t.por_periodo.anio / Math.max(1, rec.anio)) * 100}%`, minWidth: 6 }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>

              {/* Por proyecto: misma escala para todos; el largo es el costo total */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h3 className="text-sm font-semibold text-tinta">Por proyecto</h3>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-tinta-3">
                  {(["unico", "recurrente"] as const).map((t) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <MuestraCosto tipo={t} /> {NOMBRE_COSTO[t]}
                    </li>
                  ))}
                  <li className="flex items-center gap-1">
                    <Repeat size={12} className="text-recurrente-tinta" aria-hidden /> recurrente vigente {sufijo}
                  </li>
                </ul>
              </div>
              <ul className="mt-3 space-y-3 sm:space-y-2.5">
                {desglose.proyectos.map((p) => {
                  const r = p.recurrente_por_periodo[periodo];
                  return (
                    <li key={p.id} className={FILA_COSTO}>
                      <span className="flex min-w-0 items-center gap-1.5 text-sm" title={p.nombre}>
                        <span className="min-w-0 truncate">
                          <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span>{" "}
                          <span className="text-tinta-2">{p.nombre}</span>
                        </span>
                        {p.estado === "entregado" && <PackageCheck size={14} className="shrink-0 text-ok-tinta" aria-label="Entregado" />}
                        {p.estado === "pausado" && <PauseCircle size={14} className="shrink-0 text-tinta-3" aria-label="En pausa" />}
                      </span>
                      <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                        <BarraTipoCosto unico={p.unico_clp} recurrente={p.recurrente_clp} ancho={(p.total_clp / maxProyecto) * 100} />
                      </div>
                      <span className="text-right">
                        <b className="block text-sm font-semibold tabular-nums text-tinta">{compacto(p.total_clp)}</b>
                        {r > 0 && <MontoRecurrente monto={r} periodo={periodo} className="sm:hidden" />}
                      </span>
                      <span className="hidden text-right sm:block">
                        {r > 0 ? <MontoRecurrente monto={r} periodo={periodo} /> : <span className="text-xs text-tinta-3">—</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Cada costo recurrente, a un clic */}
              {desglose.recurrente.costos.length > 0 && (
                <details className="group mt-5 rounded-2xl bg-suave">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-tinta-2 [&::-webkit-details-marker]:hidden">
                    <Repeat size={15} className="text-recurrente-tinta" aria-hidden /> Costos recurrentes ({desglose.recurrente.costos.length})
                    <ChevronDown size={16} className="ml-auto text-tinta-3 transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="divide-y divide-linea border-t border-linea">
                    {desglose.recurrente.costos.map((c, i) => {
                      const unidad = TIPO_RECURRENTE[c.tipo].unidad;
                      return (
                        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_9rem_8rem]">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-tinta" title={c.item}>
                              {c.item}
                            </span>
                            <span className="block text-xs text-tinta-3">
                              {c.proyectos.map((p, j) => (
                                <span key={p.codigo}>
                                  {j > 0 && " · "}
                                  <span className="whitespace-nowrap font-mono font-semibold text-indigo-tinta" title={p.nombre}>
                                    {p.codigo}
                                  </span>
                                </span>
                              ))}
                              {" · "}último registro {fecha(c.ultimo_registro)}
                              {c.registros > 1 && ` · ${c.registros} registros (${compacto(c.pagado_clp)} en total)`}
                            </span>
                          </span>
                          <span className="hidden sm:block">
                            <span className="chip bg-recurrente-fondo text-recurrente-tinta">
                              <Repeat size={12} aria-hidden /> {TIPO_RECURRENTE[c.tipo].nombre}
                            </span>
                          </span>
                          <span className="whitespace-nowrap text-right text-sm tabular-nums">
                            <b className="font-semibold text-tinta">{clp(c.monto_clp)}</b> <span className="text-xs text-tinta-3">{PERIODO[unidad].sufijo}</span>
                          </span>
                          <span className={cx("col-span-2 text-right text-xs tabular-nums text-tinta-3 sm:col-span-1", unidad === periodo && "hidden sm:block")}>
                            {unidad === periodo ? "" : `≈ ${compacto(c.por_periodo[periodo])} ${sufijo}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </>
          )}
        </Seccion>

        {/* ── Estado de pago: por enviar, esperando pago y compradas */}
        <Seccion id="pagos" icono={Receipt} tono="bg-pastel-menta text-ok-tinta" titulo="Estado de pago de las compras">
          <div className="grid gap-4 lg:grid-cols-3">
            {pagos.map((g) => {
              const { nombre, ayuda, clase, Icono } = ESTADO_PAGO[g.estado_pago];
              return (
                <div key={g.estado_pago} className="flex min-w-0 flex-col rounded-3xl bg-suave p-4">
                  <div className="flex items-center gap-3">
                    <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", clase)}>
                      <Icono size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-tinta">{nombre}</span>
                      <span className="block text-xs text-tinta-3">{ayuda}</span>
                    </span>
                  </div>
                  <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-2xl font-bold tracking-tight text-tinta">{compacto(g.total_clp)}</span>
                    <span className="text-sm text-tinta-3">
                      {g.compras} {g.compras === 1 ? "compra" : "compras"}
                    </span>
                  </p>
                  {g.por_validar_clp > 0 && <p className="text-xs text-tinta-3">Incluye {compacto(g.por_validar_clp)} por validar</p>}
                  {g.items.length === 0 ? (
                    <p className="mt-3 text-sm text-tinta-3">Sin compras.</p>
                  ) : (
                    <ul className="mt-3 max-h-96 divide-y divide-linea overflow-y-auto rounded-2xl bg-superficie">
                      {g.items.map((c) => (
                        <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-tinta">
                              <span className="truncate" title={c.item}>
                                {c.item}
                              </span>
                              {c.tipo_costo !== "unico" && <Repeat size={12} className="shrink-0 text-recurrente-tinta" aria-label="Recurrente" />}
                            </span>
                            <span className="block text-xs text-tinta-3">
                              {c.proyectos.map((p, j) => (
                                <span key={p.codigo}>
                                  {j > 0 && " · "}
                                  <span className="whitespace-nowrap font-mono font-semibold text-indigo-tinta" title={p.nombre}>
                                    {p.codigo}
                                  </span>
                                </span>
                              ))}
                              {" · "}
                              {c.persona} · {fecha(c.fecha)}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <b className="block text-sm font-semibold tabular-nums text-tinta">{clp(c.monto_clp)}</b>
                            {c.por_validar && <span className="block text-[11px] text-alerta-tinta">por validar</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Seccion>

        {/* ── 3. Concepto → cliente: línea de tiempo */}
        <Seccion id="plazo" icono={Clock} tono="bg-pastel-azul text-indigo" titulo="Concepto → cliente" chip={<Chip e={tiempo.estado} />}>
          {proyectosT.length === 0 ? (
            <p className="text-sm text-tinta-3">Sin proyectos en desarrollo.</p>
          ) : (
            <>
              {/* eje de meses */}
              <div className={cx(FILA, "mb-1")} aria-hidden>
                <span className="hidden sm:block" />
                <div className="relative col-span-2 h-5 text-[11px] text-tinta-3 sm:col-span-1">
                  {meses.map((x, i) =>
                    i % paso === 0 && Math.abs(pos(x.f) - pos(hoy)) > 4 ? (
                      <span key={x.f} className={cx("absolute -translate-x-1/2", i % (paso * 2) !== 0 && "hidden sm:inline")} style={{ left: `${pos(x.f)}%` }}>
                        {x.etiqueta}
                      </span>
                    ) : null,
                  )}
                  <span className="absolute z-10 -translate-x-1/2 rounded-full bg-tinta px-1.5 font-semibold text-white" style={{ left: `${pos(hoy)}%` }}>
                    Hoy
                  </span>
                </div>
              </div>
              <ul className="space-y-3 sm:space-y-2">
                {proyectosT.map((p) => (
                  <li key={p.id} className={FILA}>
                    <span className="min-w-0 truncate text-sm" title={p.nombre}>
                      <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span>
                      <span className="ml-1.5 hidden text-tinta-2 sm:inline">{p.nombre}</span>
                    </span>
                    <div
                      className="relative order-last col-span-2 h-6 sm:order-none sm:col-span-1"
                      role="img"
                      aria-label={`${p.codigo}: ${p.tramos.map((t) => `${NOMBRE_ESTADO[t.estado]} ${t.dias} d`).join(", ")}; entrega estimada ${fecha(p.fecha_entrega_estimada)}`}
                    >
                      {meses.map((x) => (
                        <span key={x.f} aria-hidden className="absolute inset-y-0 w-px bg-linea" style={{ left: `${pos(x.f)}%` }} />
                      ))}
                      {/* plan: inicio → entrega estimada */}
                      <span
                        className="absolute inset-y-[5px] rounded-full bg-indigo-suave ring-1 ring-inset ring-indigo/15"
                        style={{ left: `${pos(p.fecha_inicio)}%`, width: `${pos(p.fecha_entrega_estimada) - pos(p.fecha_inicio)}%` }}
                        title={`Plan: ${fecha(p.fecha_inicio)} → ${fecha(p.fecha_entrega_estimada)} (${p.dias_estimados} días)`}
                      />
                      {/* avance real por etapa, hasta hoy */}
                      <span
                        className="absolute inset-y-[5px] flex gap-[2px] overflow-hidden rounded-full"
                        style={{ left: `${pos(p.fecha_inicio)}%`, width: `${Math.max(0.6, pos(hoy) - pos(p.fecha_inicio))}%` }}
                      >
                        {p.tramos
                          .filter((t) => t.dias > 0)
                          .map((t, i) => (
                            <span
                              key={i}
                              title={`${NOMBRE_ESTADO[t.estado]}: ${fecha(t.desde)} → ${t.hasta === hoy ? "hoy" : fecha(t.hasta)} (${t.dias} días)`}
                              style={{ flexGrow: t.dias, flexBasis: 0, background: colorDe(t.estado) }}
                            />
                          ))}
                      </span>
                      <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-tinta/60" style={{ left: `${pos(hoy)}%` }} />
                      {p.situacion === "atrasado" && (
                        <span
                          className="absolute inset-y-0 w-[3px] rounded-full bg-error ring-2 ring-white"
                          style={{ left: `calc(${pos(p.fecha_entrega_estimada)}% - 1.5px)` }}
                          title={`Entrega estimada: ${fecha(p.fecha_entrega_estimada)}`}
                        />
                      )}
                    </div>
                    <span className="text-right">{estadoPlazo(p)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Leyenda conPlan />
                <span className="flex items-center gap-1.5 text-xs text-tinta-3">
                  <span aria-hidden className="inline-block h-3 w-[3px] rounded-full bg-error" /> Entrega estimada vencida
                </span>
              </div>
            </>
          )}
        </Seccion>

        {/* ── 4. Pipeline */}
        <Seccion
          id="pipeline"
          icono={Workflow}
          tono="bg-pastel-lila text-indigo-tinta"
          titulo="Pipeline"
          chip={cargadas.length > 0 ? <Chip e="en_riesgo" texto="Cargado" /> : <span className="chip bg-suave text-tinta-3">Normal</span>}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {pipeline.etapas.map((e) => (
              <div key={e.estado} className={cx("min-w-0 rounded-3xl p-4", e.saturada ? "bg-alerta-fondo/70 ring-2 ring-alerta/50" : "bg-suave")}>
                <div className="mb-3 flex items-center gap-2">
                  <Muestra etapa={e.estado} />
                  <h3 className="text-sm font-semibold text-tinta">{e.nombre}</h3>
                  {e.saturada && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-alerta-tinta">
                      <AlertTriangle size={13} aria-hidden /> Cargada
                    </span>
                  )}
                  <span className="ml-auto text-3xl font-bold leading-none tabular-nums text-tinta">{e.proyectos.length}</span>
                </div>
                <ul className="space-y-2">
                  {e.proyectos.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-2xl bg-superficie px-3 py-2.5" title={`${p.nombre} · ${p.dias_en_etapa} días en ${e.nombre.toLowerCase()}`}>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span>{" "}
                        <span className="text-tinta-2">{p.nombre}</span>
                      </span>
                      {p.situacion === "atrasado" && <CircleX size={15} className="shrink-0 text-error" aria-label="Atrasado" />}
                      <span className="shrink-0 rounded-full bg-suave px-2 py-0.5 text-xs font-semibold tabular-nums text-tinta-2">{p.dias_en_etapa} d</span>
                    </li>
                  ))}
                  {e.proyectos.length === 0 && <li className="px-1 text-xs text-tinta-3">—</li>}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-tinta-3">
            <span>d = días en la etapa</span>
            {pipeline.pausados.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                <PauseCircle size={14} aria-hidden /> En pausa:
                {pipeline.pausados.map((p) => (
                  <span key={p.id} title={p.nombre} className="rounded-full bg-suave px-2 py-0.5 font-mono font-semibold text-indigo-tinta">
                    {p.codigo}
                  </span>
                ))}
              </span>
            )}
          </div>
        </Seccion>

        {/* ── Entregados */}
        <Seccion id="entregados" icono={PackageCheck} tono="bg-ok-fondo text-ok-tinta" titulo={`Entregados (${entregados.length})`}>
          {entregados.length === 0 ? (
            <p className="text-sm text-tinta-3">Aún no hay proyectos entregados.</p>
          ) : (
            <div className="space-y-2">
              {entregados.map((p) => (
                <details key={p.id} className="group rounded-2xl bg-suave">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="w-full min-w-0 truncate text-sm sm:w-auto sm:flex-1" title={p.nombre}>
                      <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span>{" "}
                      <span className="font-medium text-tinta">{p.nombre}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="whitespace-nowrap text-sm font-bold tabular-nums text-tinta" title="Días de concepto a cliente">
                        {p.dias_concepto_cliente === null ? "—" : `${p.dias_concepto_cliente} d`}
                      </span>
                      {p.desvio_dias === null ? (
                        <Chip e="sin_datos" texto="Sin fecha" />
                      ) : p.desvio_dias <= 0 ? (
                        <Chip e="en_meta" texto="A tiempo" />
                      ) : (
                        <Chip e="fuera" texto={`+${p.desvio_dias} d`} />
                      )}
                      <Chip e={p.costo} texto={p.pct_costo === null ? "Sin BOM" : `${p.pct_costo}% BOM`} />
                      <ChevronDown size={18} className="text-tinta-3 transition group-open:rotate-180" aria-hidden />
                    </span>
                  </summary>
                  <div className="grid gap-5 border-t border-linea px-4 py-4 sm:grid-cols-[1.4fr_1fr_1fr]">
                    <div>
                      <p className="mb-2 text-xs text-tinta-3">
                        {fecha(p.fecha_inicio)} → {p.fecha_entregado ? fecha(p.fecha_entregado) : "?"}
                      </p>
                      <BarraEtapas d={p.dias_por_etapa} />
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-tinta-2">
                        {ORDEN_ETAPAS.filter((k) => p.dias_por_etapa[k] > 0).map((k) => (
                          <li key={k} className="flex items-center gap-1.5">
                            <Muestra etapa={k} /> {NOMBRE_ESTADO[k]} <b className="font-semibold text-tinta">{p.dias_por_etapa[k]} d</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs text-tinta-3">Entrega</p>
                      <p className="text-2xl font-bold text-tinta">{p.desvio_dias === null ? "—" : p.desvio_dias <= 0 ? "A tiempo" : `+${p.desvio_dias} d`}</p>
                      <p className="text-xs text-tinta-3">estimada {fecha(p.fecha_entrega_estimada)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-tinta-3">Costo final</p>
                      <p className="text-2xl font-bold text-tinta">{p.pct_costo === null ? "—" : `${p.pct_costo}%`}</p>
                      <p className="mb-2 text-xs text-tinta-3">
                        {compacto(p.costo_clp)} de {compacto(p.estimado_clp)}
                      </p>
                      {p.pct_costo !== null && (
                        <BarraCosto
                          pct={p.pct_costo}
                          max={Math.max(100 + metas.tolerancia_costo_pct, p.pct_costo)}
                          estado={p.costo}
                          titulo={`${clp(p.costo_clp)} de ${clp(p.estimado_clp)} (${p.pct_costo}%)`}
                        />
                      )}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Seccion>

        {/* ── Definiciones, a un clic */}
        <details className="tarjeta group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-tinta-2 [&::-webkit-details-marker]:hidden">
            <HelpCircle size={16} aria-hidden /> ¿Cómo se calcula?
            <ChevronDown size={16} className="ml-auto transition group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-tinta-2">
            <li>
              <b className="text-tinta">Costo vs BOM:</b> compras aprobadas y por validar (envío incluido) frente a la estimación BOM de cada proyecto no
              entregado. Hasta +{metas.tolerancia_costo_pct}% es «en riesgo»; más, «fuera de meta».
            </li>
            <li>
              <b className="text-tinta">Desglose de costos:</b> todas las compras aprobadas y por validar (envío e impuesto incluidos) de
              todos los proyectos, también los entregados y en pausa, separadas en costo único y recurrente. El costo recurrente se
              lleva a día, mes o año: diario × 365 y mensual × 12 dan el valor anual; mes = año ÷ 12 y día = año ÷ 365. Si el mismo
              costo recurrente (mismo nombre y proyectos) se registra varias veces, por ejemplo cada mes, para el costo por periodo
              cuenta solo el registro más reciente; todos los pagos suman al costo total.
            </li>
            <li>
              <b className="text-tinta">Estado de pago:</b> compras aprobadas y por validar (sin rechazadas), separadas en por enviar a pago (se
              enviarán a procesar más adelante), esperando pago (ya enviadas, falta pagarlas) y compradas (ya pagadas). Lo marca quien registra
              la compra y lo actualiza la persona o la jefatura. Todas suman al costo, estén pagadas o no. Todos los montos están en pesos: las compras ingresadas en dólares se convierten con el dólar del día en que se
              registran o editan.
            </li>
            <li>
              <b className="text-tinta">Concepto → cliente:</b> días desde el inicio del proyecto hasta la entrega. La meta es la fecha estimada que la
              jefatura registra al crear el proyecto. Los colores muestran en qué etapa estuvo cada tramo.
            </li>
            <li>
              <b className="text-tinta">Pipeline:</b> proyectos sin entregar, por etapa. Con más de {pipeline.aviso_por_etapa} en una misma etapa aparece
              un aviso: no es un tope, es una señal para no sumar carga.
            </li>
            <li>
              <b className="text-tinta">Entregados:</b> no cuentan arriba; cada uno muestra sus días reales, su entrega frente a la fecha estimada y su
              costo final frente al BOM.
            </li>
          </ul>
        </details>

        {u.rol === "admin" && <EditorMetas empresa={empresa.clave} metas={metas} defecto={METAS_DEFECTO} />}
      </main>
    </div>
  );
}
