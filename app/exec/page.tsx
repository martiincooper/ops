import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, CircleCheck, CircleX, KeyRound, LayoutList, LifeBuoy, ListChecks, Minus, Wallet } from "lucide-react";
import Link from "next/link";
import BotonSalir from "@/components/BotonSalir";
import EditorMetas from "@/components/EditorMetas";
import Marca from "@/components/Marca";
import { Avatar } from "@/components/ui";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { EMPRESAS } from "@/lib/empresas";
import { METAS_DEFECTO } from "@/lib/metas";
import { DIAS_POR_VENCER, type EstadoKpi, metricasExec } from "@/lib/tableros";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/tiempo";
import { cx } from "@/lib/cliente";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const clp = (n: number) => fmt.format(n);
const compacto = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : clp(n);
const corta = (f: string) => fechaCorta(f).replace(/^\S+ /, ""); // "sáb 3 oct" → "3 oct"

// Estados: color de estado reservado + ícono + texto (nunca solo color).
const ESTADO: Record<EstadoKpi, { texto: string; clase: string; barra: string; Icono: typeof CircleCheck }> = {
  en_meta: { texto: "En meta", clase: "bg-ok-fondo text-ok-tinta", barra: "bg-ok", Icono: CircleCheck },
  en_riesgo: { texto: "En riesgo", clase: "bg-alerta-fondo text-alerta-tinta", barra: "bg-alerta", Icono: AlertTriangle },
  fuera: { texto: "Fuera de meta", clase: "bg-error-fondo text-error-tinta", barra: "bg-error", Icono: CircleX },
  sin_datos: { texto: "Sin datos", clase: "bg-suave text-tinta-3", barra: "bg-tinta-3", Icono: Minus },
};

function Estado({ e }: { e: EstadoKpi }) {
  const { texto, clase, Icono } = ESTADO[e];
  return (
    <span className={cx("chip shrink-0", clase)}>
      <Icono size={13} /> {texto}
    </span>
  );
}

/** Variación vs periodo anterior. `bueno` = sube es bueno; null = neutra (solo informa). */
function Variacion({ delta, texto, bueno }: { delta: number | null; texto: string; bueno: boolean | null }) {
  if (delta === null) return <span className="text-tinta-3">{texto}</span>;
  const Icono = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const color = bueno === null || delta === 0 ? "text-tinta-2" : (delta > 0) === bueno ? "text-ok-tinta" : "text-error-tinta";
  return (
    <span className={cx("inline-flex items-center gap-1 font-medium", color)}>
      <Icono size={13} /> {texto}
    </span>
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
    <section id={id} className="tarjeta flex scroll-mt-24 flex-col p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className={cx("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tono)}>
          <Icono size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-tinta-3">Indicador {n}</p>
            <Estado e={estado} />
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

/** Medidor: relleno con el color del estado, pista con un tono más claro del mismo color. */
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
  const { plazo, costo, equipo, bloqueos, metas, periodo } = m;
  const periodoTxt = `${corta(periodo.desde)} – ${corta(periodo.hasta)}`;
  const anteriorTxt = `${corta(periodo.anterior_desde)} – ${corta(periodo.anterior_hasta)}`;
  const deltaEquipo = equipo.pct !== null && equipo.pct_anterior !== null ? equipo.pct - equipo.pct_anterior : null;

  const kpis: { id: string; nombre: string; estado: EstadoKpi; valor: string; icono: typeof CircleCheck; tono: string }[] = [
    { id: "plazo", nombre: "Proyectos en plazo", estado: plazo.estado, valor: plazo.activos ? `${plazo.en_plazo}/${plazo.activos}` : "—", icono: CalendarClock, tono: "bg-pastel-azul text-indigo" },
    { id: "costo", nombre: "Dentro de estimación BOM", estado: costo.estado, valor: costo.con_estimacion ? `${costo.dentro}/${costo.con_estimacion}` : "—", icono: Wallet, tono: "bg-pastel-durazno text-alerta-tinta" },
    { id: "equipo", nombre: "Objetivos diarios logrados", estado: equipo.estado, valor: equipo.pct === null ? "—" : `${equipo.pct}%`, icono: ListChecks, tono: "bg-pastel-lila text-indigo-tinta" },
    { id: "bloqueos", nombre: "Bloqueos sin resolver", estado: bloqueos.estado, valor: `${bloqueos.abiertos}`, icono: LifeBuoy, tono: "bg-pastel-rosa text-error-tinta" },
  ];
  const enMeta = kpis.filter((k) => k.estado === "en_meta").length;

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
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold text-tinta">
                {enMeta} de {kpis.length} indicadores en meta
              </h1>
              <p className="text-sm text-tinta-3">
                Corte: hoy, {fechaCorta(hoy)} · periodo {periodoTxt} (vs {anteriorTxt})
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map((k) => (
              <a key={k.id} href={`#${k.id}`} className="tarjeta flex flex-col gap-3 p-5 transition hover:-translate-y-0.5">
                <span className="flex items-center justify-between">
                  <span className={cx("flex h-11 w-11 items-center justify-center rounded-2xl", k.tono)}>
                    <k.icono size={20} />
                  </span>
                  <Estado e={k.estado} />
                </span>
                <span>
                  <span className="block text-3xl font-bold text-tinta">{k.valor}</span>
                  <span className="block text-sm text-tinta-3">{k.nombre}</span>
                </span>
              </a>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 1. Plazo */}
          <Kpi
            id="plazo"
            n={1}
            titulo="Proyectos en plazo"
            icono={CalendarClock}
            tono="bg-pastel-azul text-indigo"
            estado={plazo.estado}
            valor={plazo.activos ? `${plazo.en_plazo} de ${plazo.activos}` : "—"}
            unidad="proyectos activos sin pasar su fecha de entrega"
            filas={[
              ["Meta", "100% de los proyectos activos antes de su fecha de entrega comprometida"],
              ["Corte", `hoy, ${fechaCorta(hoy)}`],
              ["Detalle", `${plazo.atrasados} atrasado${plazo.atrasados === 1 ? "" : "s"} · ${plazo.por_vencer} vence${plazo.por_vencer === 1 ? "" : "n"} en ≤ ${DIAS_POR_VENCER} días`],
            ]}
            nota="Fechas de inicio y entrega registradas en Proyectos. La planificación detallada de hitos se gestiona en la carta Gantt."
          >
            <ul className="space-y-4">
              {plazo.proyectos.map((p) => {
                const cerrado = p.situacion === "entregado" || p.situacion === "pausado";
                const e: EstadoKpi = p.situacion === "atrasado" ? "fuera" : p.situacion === "por_vencer" ? "en_riesgo" : "en_meta";
                return (
                  <li key={p.id} className={cerrado ? "opacity-60" : ""}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-tinta">
                        <span className="font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span> {p.nombre}
                      </span>
                      <span className={cx("shrink-0", p.situacion === "atrasado" ? "font-semibold text-error-tinta" : "text-tinta-3")}>
                        {p.situacion === "atrasado"
                          ? `${-p.dias_restantes} días de atraso`
                          : cerrado
                            ? p.situacion
                            : `entrega ${corta(p.fecha_entrega_objetivo)} · ${p.dias_restantes} d`}
                      </span>
                    </div>
                    {!cerrado && (
                      <Medidor
                        pct={p.pct_plazo}
                        estado={e}
                        titulo={`Día ${p.dias_transcurridos} de ${p.dias_comprometidos} (${p.pct_plazo}% del plazo) · ${p.estado}`}
                      />
                    )}
                  </li>
                );
              })}
              {plazo.proyectos.length === 0 && <li className="text-sm text-tinta-3">Sin proyectos.</li>}
            </ul>
            <p className="mt-3 text-xs text-tinta-3">Barra: % del plazo transcurrido (inicio → entrega).</p>
          </Kpi>

          {/* 2. Costo vs estimación BOM */}
          <Kpi
            id="costo"
            n={2}
            titulo="Costo acumulado vs estimación BOM"
            icono={Wallet}
            tono="bg-pastel-durazno text-alerta-tinta"
            estado={costo.estado}
            valor={costo.con_estimacion ? `${costo.dentro} de ${costo.con_estimacion}` : "—"}
            unidad="proyectos dentro de su estimación BOM"
            filas={[
              ["Meta", `Costo acumulado de cada proyecto ≤ su estimación BOM (tolerancia +${metas.tolerancia_costo_pct}%: «en riesgo»; más: «fuera de meta»)`],
              ["Acumulado", `${compacto(costo.total_clp)} de ${compacto(costo.estimado_clp)} estimados${costo.por_validar_clp ? ` · incluye ${compacto(costo.por_validar_clp)} por validar` : ""}`],
              ["Periodo", `${compacto(costo.periodo_clp)} agregados ${periodoTxt} (${anteriorTxt}: ${compacto(costo.periodo_anterior_clp)})`],
            ]}
            nota="Costo acumulado = compras aprobadas y por validar (las rechazadas no cuentan). Una compra de varios proyectos se reparte en partes iguales. La estimación BOM es la que se registra en Proyectos antes de comenzar."
          >
            <ul className="space-y-4">
              {costo.proyectos.map((p) => {
                const e: EstadoKpi = p.situacion === "fuera" ? "fuera" : p.situacion === "en_riesgo" ? "en_riesgo" : p.situacion === "dentro" ? "en_meta" : "sin_datos";
                const max = Math.max(100 + metas.tolerancia_costo_pct, p.pct ?? 0);
                return (
                  <li key={p.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-tinta">
                        <span className="font-mono text-xs font-semibold text-indigo-tinta">{p.codigo}</span> {p.nombre}
                      </span>
                      <span className="shrink-0 font-medium text-tinta">
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
              {costo.proyectos.length === 0 && <li className="text-sm text-tinta-3">Sin proyectos.</li>}
            </ul>
            <p className="mt-3 text-xs text-tinta-3">Barra: costo acumulado; la marca es el 100% de la estimación BOM.</p>
          </Kpi>

          {/* 3. Objetivos diarios del equipo */}
          <Kpi
            id="equipo"
            n={3}
            titulo="Cumplimiento de objetivos diarios del equipo"
            icono={ListChecks}
            tono="bg-pastel-lila text-indigo-tinta"
            estado={equipo.estado}
            valor={equipo.pct === null ? "—" : `${equipo.pct}%`}
            unidad={`${equipo.completadas} de ${equipo.comprometidas} objetivos diarios logrados`}
            filas={[
              ["Meta", `≥ ${metas.objetivos_diarios_pct}% (bajo ${metas.objetivos_diarios_pct - 10}%: «fuera de meta»)`],
              ["Periodo", `${periodoTxt} · ${equipo.jornadas} jornadas · ${equipo.personas_con_jornadas} de ${equipo.personas} integrantes`],
              [
                "Comparación",
                <Variacion
                  key="v"
                  delta={deltaEquipo}
                  bueno
                  texto={deltaEquipo === null ? `sin datos de ${anteriorTxt}` : `${deltaEquipo > 0 ? "+" : ""}${deltaEquipo} pp vs ${anteriorTxt} (${equipo.pct_anterior}%)`}
                />,
              ],
            ]}
            nota={
              <>
                <b className="font-semibold text-tinta-2">Qué mide:</b> de los objetivos que cada integrante se propone al comenzar su
                jornada, cuántos marca como logrados al terminarla (las jornadas en curso aún no cuentan). Es la ejecución del día a
                día del equipo; <b className="font-semibold text-tinta-2">no</b> mide el avance de los hitos de cada proyecto, que se
                planifican y siguen en la carta Gantt.
              </>
            }
          >
            <Medidor pct={equipo.pct ?? 0} marca={metas.objetivos_diarios_pct} estado={equipo.estado} titulo={`${equipo.pct ?? "—"}% logrado · meta ${metas.objetivos_diarios_pct}%`} />
            <p className="mt-3 text-xs text-tinta-3">Barra: % logrado; la marca es la meta.</p>
          </Kpi>

          {/* 4. Bloqueos */}
          <Kpi
            id="bloqueos"
            n={4}
            titulo="Bloqueos sin resolver"
            icono={LifeBuoy}
            tono="bg-pastel-rosa text-error-tinta"
            estado={bloqueos.estado}
            valor={`${bloqueos.abiertos}`}
            unidad={`abierto${bloqueos.abiertos === 1 ? "" : "s"} · ${bloqueos.vencidos} con más de ${metas.bloqueo_max_dias} día${metas.bloqueo_max_dias === 1 ? "" : "s"}`}
            filas={[
              ["Meta", `0 bloqueos con más de ${metas.bloqueo_max_dias} día${metas.bloqueo_max_dias === 1 ? "" : "s"} sin resolver`],
              ["Corte", `hoy, ${fechaCorta(hoy)}`],
              [
                "Comparación",
                <Variacion
                  key="v"
                  delta={bloqueos.nuevos_periodo - bloqueos.nuevos_periodo_anterior}
                  bueno={false}
                  texto={`${bloqueos.nuevos_periodo} reportados ${periodoTxt} (antes: ${bloqueos.nuevos_periodo_anterior})`}
                />,
              ],
            ]}
            nota="Los reporta el equipo al terminar su jornada; la jefatura los marca como resueltos en el standup."
          >
            {bloqueos.lista.length === 0 ? (
              <p className="text-sm text-tinta-3">Sin bloqueos abiertos.</p>
            ) : (
              <ul className="space-y-2">
                {bloqueos.lista.map((b) => (
                  <li key={b.bitacora_id} className="flex items-start gap-3 rounded-2xl bg-pastel-rosa/70 p-3">
                    <Avatar nombre={b.persona} tamano={34} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-tinta">{b.persona}</span>
                        <span className={b.dias > metas.bloqueo_max_dias ? "font-semibold text-error-tinta" : "text-tinta-3"}>
                          {b.dias === 0 ? "hoy" : `hace ${b.dias} día${b.dias === 1 ? "" : "s"}`}
                        </span>
                      </p>
                      <p className="text-tinta-2">{b.texto}</p>
                      {b.proyectos.length > 0 && <p className="font-mono text-xs text-indigo-tinta">{b.proyectos.join(" · ")}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Kpi>
        </div>

        <div className="mt-6">
          {u.rol === "admin" ? (
            <EditorMetas empresa={empresa.clave} metas={metas} defecto={METAS_DEFECTO} />
          ) : (
            <p className="text-center text-sm text-tinta-3">Las metas las define la jefatura.</p>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-tinta-3">
          Datos de {empresa.nombre} · {m.personas_activas} integrantes activos
        </p>
      </main>
    </div>
  );
}
