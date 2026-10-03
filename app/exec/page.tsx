import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CircleX,
  Clock,
  KeyRound,
  LayoutList,
  Minus,
  PackageCheck,
  PauseCircle,
  Wallet,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import BotonSalir from "@/components/BotonSalir";
import EditorMetas from "@/components/EditorMetas";
import Marca from "@/components/Marca";
import { Avatar } from "@/components/ui";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { EMPRESAS } from "@/lib/empresas";
import { type DiasPorEtapa, NOMBRE_ESTADO } from "@/lib/etapas";
import { METAS_DEFECTO } from "@/lib/metas";
import { DIAS_POR_VENCER, type EstadoKpi, type ProyectoEnCurso, type SituacionCosto, metricasExec } from "@/lib/tableros";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/tiempo";
import { cx } from "@/lib/cliente";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const clp = (n: number) => fmt.format(n);
const compacto = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : clp(n);
const dias = (n: number) => `${n} día${n === 1 ? "" : "s"}`;

// Estados: color de estado reservado + ícono + texto (nunca solo color).
const ESTADO: Record<EstadoKpi, { texto: string; clase: string; barra: string; Icono: typeof CircleCheck }> = {
  en_meta: { texto: "En meta", clase: "bg-ok-fondo text-ok-tinta", barra: "bg-ok", Icono: CircleCheck },
  en_riesgo: { texto: "En riesgo", clase: "bg-alerta-fondo text-alerta-tinta", barra: "bg-alerta", Icono: AlertTriangle },
  fuera: { texto: "Fuera de meta", clase: "bg-error-fondo text-error-tinta", barra: "bg-error", Icono: CircleX },
  sin_datos: { texto: "Sin datos", clase: "bg-suave text-tinta-3", barra: "bg-tinta-3", Icono: Minus },
};
const KPI_COSTO: Record<SituacionCosto, EstadoKpi> = { dentro: "en_meta", en_riesgo: "en_riesgo", fuera: "fuera", sin_estimacion: "sin_datos" };

// Etapas: rampa ordinal de un solo tono (concepto claro → pruebas oscuro), validada contra la superficie.
// La pausa no es una etapa del avance: gris con trama.
const ETAPA_COLOR: Record<keyof DiasPorEtapa, string> = {
  concepto: "#9a98f5",
  prototipado: "#615ef0",
  pruebas: "#3a36b8",
  pausado: "repeating-linear-gradient(135deg, #a9acbe 0 3px, #dcdde7 3px 6px)",
};
const ORDEN_ETAPAS: (keyof DiasPorEtapa)[] = ["concepto", "prototipado", "pruebas", "pausado"];

function Chip({ e, texto }: { e: EstadoKpi; texto?: string }) {
  const { texto: t, clase, Icono } = ESTADO[e];
  return (
    <span className={cx("chip shrink-0", clase)}>
      <Icono size={13} aria-hidden /> {texto ?? t}
    </span>
  );
}

function Variacion({ delta, texto }: { delta: number; texto: string }) {
  const Icono = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-tinta-2">
      <Icono size={13} aria-hidden /> {texto}
    </span>
  );
}

function Muestra({ etapa }: { etapa: keyof DiasPorEtapa | "restante" }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]", etapa === "restante" && "bg-indigo-suave ring-1 ring-indigo/20")}
      style={etapa === "restante" ? undefined : { background: ETAPA_COLOR[etapa] }}
    />
  );
}

/**
 * Barra de etapas: días en cada etapa, apilados (2px de separación), sobre la duración estimada del proyecto.
 * El resto hasta la fecha estimada va como pista clara; si ya se pasó, una marca indica la fecha estimada.
 */
function BarraEtapas({ d, estimados, etiqueta }: { d: DiasPorEtapa; estimados?: number; etiqueta: string }) {
  const usados = ORDEN_ETAPAS.reduce((s, k) => s + d[k], 0);
  const escala = Math.max(usados, estimados ?? 0, 1);
  const restante = estimados !== undefined ? Math.max(0, estimados - usados) : 0;
  const marca = estimados !== undefined && usados > estimados ? (estimados / escala) * 100 : null;
  return (
    <div className="relative mt-2" role="img" aria-label={etiqueta}>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {ORDEN_ETAPAS.filter((k) => d[k] > 0).map((k) => (
          <div key={k} title={`${NOMBRE_ESTADO[k]}: ${dias(d[k])}`} style={{ flexGrow: d[k], flexBasis: 0, background: ETAPA_COLOR[k] }} />
        ))}
        {restante > 0 && <div title={`Restante hasta la fecha estimada: ${dias(restante)}`} className="bg-indigo-suave" style={{ flexGrow: restante, flexBasis: 0 }} />}
        {usados === 0 && restante === 0 && <div className="flex-1 bg-indigo-suave" />}
      </div>
      {marca !== null && (
        <div className="absolute -top-1 h-[18px] w-[3px] rounded-full bg-tinta ring-2 ring-white" style={{ left: `calc(${marca}% - 1.5px)` }} title="Fecha estimada de entrega" aria-hidden />
      )}
    </div>
  );
}

/** Leyenda con los días de cada etapa (también sirve de vista en texto de la barra). */
function DiasEtapas({ d }: { d: DiasPorEtapa }) {
  const visibles = ORDEN_ETAPAS.filter((k) => d[k] > 0 || k !== "pausado");
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-tinta-2">
      {visibles.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <Muestra etapa={k} /> {NOMBRE_ESTADO[k]} <b className="font-semibold text-tinta">{dias(d[k])}</b>
        </li>
      ))}
    </ul>
  );
}

/** Medidor de costo: relleno con el color del estado, pista del mismo color más clara, marca en el 100% del BOM. */
function Medidor({ pct, max = 100, estado, marca, titulo }: { pct: number; max?: number; estado: EstadoKpi; marca?: number; titulo: string }) {
  const { barra } = ESTADO[estado];
  return (
    <div className="relative mt-1.5 h-2.5 rounded-full" title={titulo}>
      <div className={cx("absolute inset-0 rounded-full opacity-20", barra)} />
      <div className={cx("absolute inset-y-0 left-0 rounded-full", barra)} style={{ width: `${Math.min(100, (Math.max(pct, 0) / max) * 100)}%`, minWidth: pct > 0 ? 6 : 0 }} />
      {marca !== undefined && (
        <div className="absolute -top-1 h-[18px] w-[3px] rounded-full bg-tinta ring-2 ring-white" style={{ left: `calc(${(marca / max) * 100}% - 1.5px)` }} aria-hidden />
      )}
    </div>
  );
}

function Kpi({
  id,
  n,
  titulo,
  icono: Icono,
  tono,
  estado,
  valor,
  unidad,
  filas,
  children,
  nota,
}: {
  id: string;
  n: number;
  titulo: string;
  icono: typeof CircleCheck;
  tono: string;
  estado: EstadoKpi;
  valor: string;
  unidad: string;
  filas: [string, React.ReactNode][];
  children?: React.ReactNode;
  nota?: React.ReactNode;
}) {
  return (
    <section id={id} className="tarjeta flex min-w-0 scroll-mt-24 flex-col p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tono)}>
          <Icono size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-tinta-3">Indicador {n}</p>
            <Chip e={estado} />
          </div>
          <h2 className="text-lg font-semibold leading-snug text-tinta">{titulo}</h2>
        </div>
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="whitespace-nowrap text-4xl font-bold tracking-tight text-tinta">{valor}</span>
        <span className="text-sm text-tinta-3">{unidad}</span>
      </p>
      <dl className="mt-4 grid grid-cols-1 rounded-2xl bg-suave p-4 text-sm sm:grid-cols-[6.5rem_1fr] sm:gap-x-3 sm:gap-y-1.5 [&>div:last-child>dd]:mb-0">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-xs font-medium text-tinta-3 sm:text-sm sm:font-normal">{k}</dt>
            <dd className="mb-2 text-tinta-2 sm:mb-0">{v}</dd>
          </div>
        ))}
      </dl>
      {children && <div className="mt-5">{children}</div>}
      {nota && <p className="mt-4 text-sm leading-relaxed text-tinta-3">{nota}</p>}
    </section>
  );
}

export default async function Exec({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
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
  const { costo, tiempo, pipeline, entregados, metas, periodo } = m;

  const anio = hoy.slice(0, 4);
  const fecha = (f: string) => fechaCorta(f).replace(/^\S+ /, "") + (f.slice(0, 4) !== anio ? ` ${f.slice(0, 4)}` : ""); // "3 oct" / "29 ene 2027"
  const periodoTxt = `${fecha(periodo.desde)} – ${fecha(periodo.hasta)}`;
  const anteriorTxt = `${fecha(periodo.anterior_desde)} – ${fecha(periodo.anterior_hasta)}`;
  const cargadas = pipeline.etapas.filter((e) => e.saturada);
  const listaCargadas = cargadas.map((e) => `${e.nombre} (${e.proyectos.length})`).join(" y ");
  const enMeta = [costo.estado, tiempo.estado].filter((e) => e === "en_meta").length;

  const plazoTexto = (p: ProyectoEnCurso) =>
    p.situacion === "atrasado" ? (
      <span className="inline-flex items-center gap-1 font-semibold text-error-tinta">
        <CircleX size={13} aria-hidden /> {dias(-p.dias_restantes)} de atraso
      </span>
    ) : p.situacion === "por_vencer" ? (
      <span className="inline-flex items-center gap-1 font-medium text-alerta-tinta">
        <AlertTriangle size={13} aria-hidden /> entrega {fecha(p.fecha_entrega_estimada)} · faltan {dias(p.dias_restantes)}
      </span>
    ) : (
      <span className="text-tinta-3">
        entrega {fecha(p.fecha_entrega_estimada)} · faltan {dias(p.dias_restantes)}
      </span>
    );

  const resumen = [
    {
      id: "costo",
      nombre: "Costo dentro de la estimación BOM",
      chip: <Chip e={costo.estado} />,
      valor: costo.con_estimacion ? `${costo.dentro}/${costo.con_estimacion}` : "—",
      icono: Wallet,
      tono: "bg-pastel-durazno text-alerta-tinta",
    },
    {
      id: "tiempo",
      nombre: "En su fecha estimada de entrega",
      chip: <Chip e={tiempo.estado} />,
      valor: tiempo.en_desarrollo ? `${tiempo.en_plazo}/${tiempo.en_desarrollo}` : "—",
      icono: Clock,
      tono: "bg-pastel-azul text-indigo",
    },
    {
      id: "pipeline",
      nombre: "Proyectos en desarrollo",
      chip: cargadas.length ? (
        <Chip e="en_riesgo" texto="Etapa cargada" />
      ) : (
        <span className="chip bg-suave text-tinta-3">Sin etapas cargadas</span>
      ),
      valor: `${pipeline.en_desarrollo}`,
      icono: Workflow,
      tono: "bg-pastel-lila text-indigo-tinta",
    },
  ];

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
                  href={`/exec?empresa=${e.clave}`}
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

      <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        {/* Resumen */}
        <section aria-label="Resumen" className="mb-6">
          <div className="mb-4">
            <h1 className="text-2xl font-semibold text-tinta">
              {pipeline.en_desarrollo} proyecto{pipeline.en_desarrollo === 1 ? "" : "s"} en desarrollo
            </h1>
            <p className="text-sm text-tinta-3">
              {pipeline.etapas.map((e) => `${e.nombre} ${e.proyectos.length}`).join(" · ")}
              {pipeline.pausados.length > 0 && ` · ${pipeline.pausados.length} en pausa`} · costo y plazo: {enMeta} de 2 en meta · corte: hoy, {fechaCorta(hoy)}
            </p>
          </div>

          {cargadas.length > 0 && (
            <div role="alert" className="mb-4 flex items-start gap-3 rounded-3xl bg-alerta-fondo p-5 text-alerta-tinta">
              <AlertTriangle size={22} className="mt-0.5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Pipeline cargado: {listaCargadas}</p>
                <p className="mt-1 text-sm leading-relaxed">
                  Hay más de {pipeline.aviso_por_etapa} proyectos en la misma etapa. Sumar proyectos nuevos ahora retrasa la entrega de los
                  que ya están en curso: antes de pedir uno nuevo, conviene esperar a que alguno avance de etapa o se entregue.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {resumen.map((k) => (
              <a key={k.id} href={`#${k.id}`} className="tarjeta flex items-center gap-3 p-4 transition hover:-translate-y-0.5 sm:flex-col sm:items-stretch sm:p-5">
                <span className="flex items-center justify-between gap-2">
                  <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", k.tono)}>
                    <k.icono size={20} />
                  </span>
                  <span className="hidden sm:inline-flex">{k.chip}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2xl font-bold text-tinta sm:text-3xl">{k.valor}</span>
                  <span className="block text-sm text-tinta-3">{k.nombre}</span>
                </span>
                <span className="sm:hidden">{k.chip}</span>
              </a>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 1. Costo vs estimación BOM */}
          <Kpi
            id="costo"
            n={1}
            titulo="Costo acumulado vs estimación BOM"
            icono={Wallet}
            tono="bg-pastel-durazno text-alerta-tinta"
            estado={costo.estado}
            valor={costo.con_estimacion ? `${costo.dentro} de ${costo.con_estimacion}` : "—"}
            unidad="proyectos dentro de su estimación BOM"
            filas={[
              ["Meta", `Costo acumulado de cada proyecto ≤ su estimación BOM (tolerancia +${metas.tolerancia_costo_pct}%: «en riesgo»; más: «fuera de meta»)`],
              ["Alcance", "Proyectos no entregados (los en pausa, si ya tienen compras)"],
              ["Acumulado", `${compacto(costo.total_clp)} de ${compacto(costo.estimado_clp)} estimados${costo.por_validar_clp ? ` · incluye ${compacto(costo.por_validar_clp)} por validar` : ""}`],
              [
                "Periodo",
                <Variacion
                  key="v"
                  delta={costo.periodo_clp - costo.periodo_anterior_clp}
                  texto={`${compacto(costo.periodo_clp)} agregados ${periodoTxt} (${anteriorTxt}: ${compacto(costo.periodo_anterior_clp)})`}
                />,
              ],
            ]}
            nota="Costo acumulado = compras aprobadas y por validar, envío incluido (las rechazadas no cuentan). Una compra de varios proyectos se reparte en partes iguales. La estimación BOM es la que se registra en Proyectos antes de comenzar."
          >
            <ul className="space-y-4">
              {costo.proyectos.map((p) => {
                const e = KPI_COSTO[p.situacion];
                const max = Math.max(100 + metas.tolerancia_costo_pct, p.pct ?? 0);
                return (
                  <li key={p.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-tinta">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span> {p.nombre}
                        {p.estado === "pausado" && <span className="text-tinta-3"> · en pausa</span>}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-tinta">
                        {clp(p.total_clp)}
                        <span className="font-normal text-tinta-3">
                          {p.pct === null ? " · sin estimación" : ` · ${p.pct === 0 && p.total_clp > 0 ? "<1" : p.pct}%`}
                        </span>
                      </span>
                    </div>
                    {p.pct !== null && (
                      <Medidor
                        pct={p.pct}
                        max={max}
                        marca={100}
                        estado={e}
                        titulo={`${clp(p.total_clp)} de ${clp(p.estimado_clp)} estimados (${p.pct}%) · ${p.compras} compra${p.compras === 1 ? "" : "s"}`}
                      />
                    )}
                  </li>
                );
              })}
              {costo.proyectos.length === 0 && <li className="text-sm text-tinta-3">Sin proyectos en curso.</li>}
            </ul>
            <p className="mt-3 text-xs text-tinta-3">Barra: costo acumulado; la marca es el 100% de la estimación BOM.</p>
          </Kpi>

          {/* 2. Concepto → cliente */}
          <Kpi
            id="tiempo"
            n={2}
            titulo="Tiempo de concepto a cliente"
            icono={Clock}
            tono="bg-pastel-azul text-indigo"
            estado={tiempo.estado}
            valor={tiempo.en_desarrollo ? `${tiempo.en_plazo} de ${tiempo.en_desarrollo}` : "—"}
            unidad="proyectos en desarrollo dentro de su fecha estimada de entrega"
            filas={[
              ["Qué mide", "Días desde el inicio del proyecto (concepto) hasta la entrega al cliente, y en qué etapa se fueron"],
              ["Meta", "Entregar cada proyecto en la fecha estimada que registró la jefatura al crearlo"],
              ["Corte", `hoy, ${fechaCorta(hoy)}`],
              ["Detalle", `${tiempo.atrasados} atrasado${tiempo.atrasados === 1 ? "" : "s"} · ${tiempo.por_vencer} vence${tiempo.por_vencer === 1 ? "" : "n"} en ≤ ${DIAS_POR_VENCER} días`],
            ]}
            nota="La planificación detallada de hitos se gestiona en la carta Gantt. Los proyectos entregados se ven al final, cada uno con sus propios indicadores."
          >
            <ul className="space-y-5">
              {tiempo.proyectos.map((p) => (
                <li key={p.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="min-w-0 text-tinta">
                      <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span> {p.nombre}
                    </span>
                    <span className="text-xs">{plazoTexto(p)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-tinta-3">
                    {NOMBRE_ESTADO[p.estado]} hace {dias(p.dias_en_etapa)} · día {p.dias_transcurridos} de {p.dias_estimados} estimados
                  </p>
                  <BarraEtapas
                    d={p.dias_por_etapa}
                    estimados={p.dias_estimados}
                    etiqueta={`${p.codigo}: ${ORDEN_ETAPAS.filter((k) => p.dias_por_etapa[k] > 0).map((k) => `${NOMBRE_ESTADO[k]} ${dias(p.dias_por_etapa[k])}`).join(", ")}; ${p.dias_estimados} días estimados`}
                  />
                </li>
              ))}
              {tiempo.proyectos.length === 0 && <li className="text-sm text-tinta-3">Sin proyectos en desarrollo.</li>}
            </ul>
            <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-tinta-3">
              {ORDEN_ETAPAS.map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <Muestra etapa={k} /> {NOMBRE_ESTADO[k]}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <Muestra etapa="restante" /> Restante hasta la fecha estimada
              </li>
            </ul>
            <p className="mt-1 text-xs text-tinta-3">Si un proyecto pasó su fecha estimada, una marca indica dónde estaba.</p>
          </Kpi>
        </div>

        {/* 3. Pipeline */}
        <section id="pipeline" className="tarjeta mt-6 scroll-mt-24 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pastel-lila text-indigo-tinta">
              <Workflow size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-tinta-3">Indicador 3</p>
                {cargadas.length ? <Chip e="en_riesgo" texto="Etapa cargada" /> : <span className="chip bg-suave text-tinta-3">Sin etapas cargadas</span>}
              </div>
              <h2 className="text-lg font-semibold leading-snug text-tinta">Pipeline de desarrollo</h2>
              <p className="mt-1 text-sm text-tinta-3">
                Proyectos que aún no se entregan, por etapa. Con más de {pipeline.aviso_por_etapa} proyectos en una misma etapa aparece un aviso: no
                es un tope, es una señal para no sumar carga.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {pipeline.etapas.map((e) => (
              <div key={e.estado} className={cx("rounded-3xl p-4", e.saturada ? "bg-alerta-fondo/60 ring-1 ring-alerta/40" : "bg-suave")}>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-tinta">
                  <Muestra etapa={e.estado} /> {e.nombre}
                  <span className="ml-auto rounded-full bg-superficie px-2.5 py-0.5 text-xs font-bold tabular-nums text-tinta">{e.proyectos.length}</span>
                </h3>
                {e.saturada && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl bg-superficie px-3 py-2.5 text-xs leading-relaxed text-alerta-tinta">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      <b className="font-semibold">{e.proyectos.length} proyectos en {e.nombre.toLowerCase()}.</b> Evita sumar proyectos nuevos hasta que
                      alguno avance: cada uno más retrasa a los demás.
                    </span>
                  </p>
                )}
                <ul className="mt-3 space-y-2">
                  {e.proyectos.map((p) => (
                    <li key={p.id} className="rounded-2xl bg-superficie p-3 text-sm">
                      <p className="text-tinta">
                        <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span> {p.nombre}
                      </p>
                      <p className="mt-1 text-xs text-tinta-2">
                        <b className="font-semibold text-tinta">{dias(p.dias_en_etapa)}</b> en esta etapa · {dias(p.dias_transcurridos)} desde el inicio
                      </p>
                      <p className="mt-0.5 text-xs">{plazoTexto(p)}</p>
                      {p.pct_costo !== null && (
                        <p className="mt-0.5 text-xs text-tinta-3">
                          Costo: {p.pct_costo === 0 && p.costo_clp > 0 ? "<1" : p.pct_costo}% del BOM
                          {p.situacion_costo === "fuera" && <span className="font-semibold text-error-tinta"> · sobre la estimación</span>}
                        </p>
                      )}
                    </li>
                  ))}
                  {e.proyectos.length === 0 && <li className="px-1 text-xs text-tinta-3">Sin proyectos.</li>}
                </ul>
              </div>
            ))}
          </div>

          {pipeline.pausados.length > 0 && (
            <div className="mt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-tinta-2">
                <PauseCircle size={16} aria-hidden /> En pausa ({pipeline.pausados.length}) · no cuentan en el pipeline
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {pipeline.pausados.map((p) => (
                  <li key={p.id} className="rounded-2xl bg-suave px-3 py-2 text-xs text-tinta-2">
                    <span className="font-mono font-semibold text-indigo-tinta">{p.codigo}</span> {p.nombre} · en pausa hace {dias(p.dias_en_etapa)} · entrega
                    estimada {fecha(p.fecha_entrega_estimada)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Entregados */}
        <section aria-labelledby="t-entregados" className="mt-6">
          <h2 id="t-entregados" className="mb-1 flex items-center gap-2 text-lg font-semibold text-tinta">
            <PackageCheck size={20} className="text-ok-tinta" aria-hidden /> Proyectos entregados ({entregados.length})
          </h2>
          <p className="mb-4 text-sm text-tinta-3">
            No cuentan en los indicadores de arriba. Abre cada uno para ver sus indicadores: tiempo real de concepto a cliente, entrega frente a la
            fecha estimada y costo final frente a la estimación BOM.
          </p>
          {entregados.length === 0 ? (
            <p className="tarjeta px-6 py-8 text-center text-sm text-tinta-3">Aún no hay proyectos entregados.</p>
          ) : (
            <div className="space-y-3">
              {entregados.map((p) => {
                const plazoChip =
                  p.desvio_dias === null ? (
                    <Chip e="sin_datos" texto="Sin fecha de entrega" />
                  ) : p.desvio_dias <= 0 ? (
                    <Chip e="en_meta" texto="A tiempo" />
                  ) : (
                    <Chip e="fuera" texto={`${dias(p.desvio_dias)} de atraso`} />
                  );
                const costoTexto =
                  p.situacion_costo === "sin_estimacion" ? "Sin estimación BOM" : p.situacion_costo === "dentro" ? "Dentro del BOM" : `${p.pct_costo}% del BOM`;
                return (
                  <details key={p.id} className="tarjeta group overflow-hidden">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 p-5 [&::-webkit-details-marker]:hidden">
                      <span className="w-full min-w-0 sm:w-auto sm:flex-1">
                        <span className="block text-sm text-tinta">
                          <span className="whitespace-nowrap font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span> <span className="font-semibold">{p.nombre}</span>
                        </span>
                        <span className="block text-xs text-tinta-3">
                          {p.fecha_entregado ? `Entregado el ${fecha(p.fecha_entregado)} · ${dias(p.dias_concepto_cliente ?? 0)} de concepto a cliente` : "Fecha de entrega sin registrar"}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {plazoChip}
                        <Chip e={p.costo} texto={costoTexto} />
                      </span>
                      <span className="boton-suave ml-auto px-3 py-1 text-xs group-open:hidden">Ver indicadores</span>
                      <span className="boton-suave ml-auto hidden px-3 py-1 text-xs group-open:inline-flex">Cerrar</span>
                    </summary>
                    <div className="grid gap-3 border-t border-linea p-5 md:grid-cols-3">
                      <div className="rounded-2xl bg-suave p-4">
                        <p className="text-xs font-medium text-tinta-3">Concepto → cliente</p>
                        <p className="mt-1 text-2xl font-bold text-tinta">{p.dias_concepto_cliente === null ? "—" : dias(p.dias_concepto_cliente)}</p>
                        <p className="text-xs text-tinta-3">
                          {fecha(p.fecha_inicio)} → {p.fecha_entregado ? fecha(p.fecha_entregado) : "sin fecha"}
                        </p>
                        <BarraEtapas
                          d={p.dias_por_etapa}
                          etiqueta={`${p.codigo}: ${ORDEN_ETAPAS.filter((k) => p.dias_por_etapa[k] > 0).map((k) => `${NOMBRE_ESTADO[k]} ${dias(p.dias_por_etapa[k])}`).join(", ")}`}
                        />
                        <DiasEtapas d={p.dias_por_etapa} />
                      </div>
                      <div className="rounded-2xl bg-suave p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-tinta-3">Entrega vs fecha estimada</p>
                          {plazoChip}
                        </div>
                        <p className="mt-1 text-2xl font-bold text-tinta">
                          {p.desvio_dias === null ? "—" : p.desvio_dias === 0 ? "En la fecha" : p.desvio_dias < 0 ? `${dias(-p.desvio_dias)} antes` : `${dias(p.desvio_dias)} después`}
                        </p>
                        <p className="text-xs text-tinta-3">
                          Meta: entregar el {fecha(p.fecha_entrega_estimada)} ({dias(p.dias_estimados)} desde el inicio)
                        </p>
                        {p.fecha_entregado === null && (
                          <p className="mt-2 text-xs text-tinta-2">La jefatura puede registrar la fecha real en Proyectos → Etapas.</p>
                        )}
                      </div>
                      <div className="rounded-2xl bg-suave p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-tinta-3">Costo final vs estimación BOM</p>
                          <Chip e={p.costo} />
                        </div>
                        <p className="mt-1 text-2xl font-bold text-tinta">{p.pct_costo === null ? "—" : `${p.pct_costo}%`}</p>
                        <p className="text-xs text-tinta-3">
                          {clp(p.costo_clp)} de {clp(p.estimado_clp)} estimados · {p.compras} compra{p.compras === 1 ? "" : "s"}
                        </p>
                        {p.pct_costo !== null && (
                          <Medidor
                            pct={p.pct_costo}
                            max={Math.max(100 + metas.tolerancia_costo_pct, p.pct_costo)}
                            marca={100}
                            estado={p.costo}
                            titulo={`${clp(p.costo_clp)} de ${clp(p.estimado_clp)} (${p.pct_costo}%)`}
                          />
                        )}
                        <p className="mt-2 text-xs text-tinta-3">Meta: ≤ 100% (hasta +{metas.tolerancia_costo_pct}% «en riesgo»).</p>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-6">
          {u.rol === "admin" ? (
            <EditorMetas empresa={empresa.clave} metas={metas} defecto={METAS_DEFECTO} />
          ) : (
            <p className="text-center text-sm text-tinta-3">La tolerancia de costo la define la jefatura. Las fechas estimadas y la estimación BOM se registran al crear cada proyecto.</p>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-tinta-3">
          Datos de {empresa.nombre} · {m.personas_activas} integrantes activos
        </p>
      </main>
    </div>
  );
}
