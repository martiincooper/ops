import { AlertTriangle, ArrowDown, ArrowUp, Building2, CircleCheck, CircleX, KeyRound, Minus } from "lucide-react";
import Link from "next/link";
import BotonSalir from "@/components/BotonSalir";
import EditorMetas from "@/components/EditorMetas";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { EMPRESAS } from "@/lib/empresas";
import { METAS_DEFECTO } from "@/lib/metas";
import { DIAS_POR_VENCER, type EstadoKpi, metricasExec } from "@/lib/tableros";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const clp = (n: number) => fmt.format(n);
const compacto = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M` : clp(n);
const corta = (f: string) => fechaCorta(f).replace(/^\S+ /, ""); // "sáb 3 oct" → "3 oct"

// Estados: color de estado reservado + ícono + texto (nunca solo color).
const ESTADO: Record<EstadoKpi, { texto: string; clase: string; barra: string; Icono: typeof CircleCheck }> = {
  en_meta: { texto: "En meta", clase: "border-aether-success/30 bg-aether-success/10 text-aether-success", barra: "bg-aether-success", Icono: CircleCheck },
  en_riesgo: { texto: "En riesgo", clase: "border-aether-warning/30 bg-aether-warning/10 text-aether-warning", barra: "bg-aether-warning", Icono: AlertTriangle },
  fuera: { texto: "Fuera de meta", clase: "border-aether-danger/30 bg-aether-danger/10 text-aether-danger", barra: "bg-aether-danger", Icono: CircleX },
  sin_datos: { texto: "Sin datos", clase: "border-aether-border bg-white/5 text-slate-400", barra: "bg-slate-500", Icono: Minus },
};

function Estado({ e }: { e: EstadoKpi }) {
  const { texto, clase, Icono } = ESTADO[e];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${clase}`}>
      <Icono size={12} /> {texto}
    </span>
  );
}

/** Variación vs periodo anterior. `bueno` = sube es bueno; null = neutra (solo informa). */
function Variacion({ delta, texto, bueno }: { delta: number | null; texto: string; bueno: boolean | null }) {
  if (delta === null) return <span className="text-slate-500">{texto}</span>;
  const Icono = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const color =
    bueno === null || delta === 0 ? "text-slate-300" : (delta > 0) === bueno ? "text-aether-success" : "text-aether-danger";
  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      <Icono size={12} /> {texto}
    </span>
  );
}

function Kpi({
  id,
  n,
  titulo,
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
  estado: EstadoKpi;
  valor: string;
  unidad: string;
  filas: [string, React.ReactNode][];
  children?: React.ReactNode;
  nota?: React.ReactNode;
}) {
  return (
    <section id={id} className="tarjeta mb-4 scroll-mt-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Indicador {n}</p>
          <h2 className="text-sm font-bold text-white">{titulo}</h2>
        </div>
        <Estado e={estado} />
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="whitespace-nowrap text-3xl font-bold text-white">{valor}</span>
        <span className="text-xs text-slate-400">{unidad}</span>
      </p>
      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 text-[11px]">
        {filas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-300">{v}</dd>
          </div>
        ))}
      </dl>
      {children && <div className="mt-4 border-t border-aether-border pt-3">{children}</div>}
      {nota && <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{nota}</p>}
    </section>
  );
}

/** Medidor: relleno con el color del estado, pista con un tono más claro del mismo color. */
function Medidor({ pct, max = 100, estado, marca, titulo }: { pct: number; max?: number; estado: EstadoKpi; marca?: number; titulo: string }) {
  const { barra } = ESTADO[estado];
  return (
    <div className="relative mt-1 h-2 rounded-full" title={titulo}>
      <div className={`absolute inset-0 rounded-full opacity-20 ${barra}`} />
      <div className={`absolute inset-y-0 left-0 rounded-full ${barra}`} style={{ width: `${Math.min(100, (Math.max(pct, 0) / max) * 100)}%`, minWidth: pct > 0 ? 4 : 0 }} />
      {marca !== undefined && (
        <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-white/70" style={{ left: `calc(${(marca / max) * 100}% - 1px)` }} aria-hidden />
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

  const kpis: [string, string, EstadoKpi][] = [
    ["plazo", "Plazo", plazo.estado],
    ["costo", "Costo", costo.estado],
    ["equipo", "Equipo", equipo.estado],
    ["bloqueos", "Bloqueos", bloqueos.estado],
  ];
  const enMeta = kpis.filter(([, , e]) => e === "en_meta").length;
  const deltaEquipo = equipo.pct !== null && equipo.pct_anterior !== null ? equipo.pct - equipo.pct_anterior : null;

  return (
    <main className="mx-auto min-h-dvh max-w-md border-x border-aether-border px-4 pb-16 pt-[env(safe-area-inset-top)] md:max-w-2xl">
      <header className="mb-4 flex items-center justify-between border-b border-aether-border py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aether-muted">{empresa.nombre}</p>
          <p className="text-base font-bold text-white">Gerencia General</p>
          <p className="text-[11px] text-slate-500">{fechaLarga(hoy)}</p>
        </div>
        <div className="flex items-center gap-3">
          {u.rol === "admin" && (
            <Link href={`/admin?empresa=${empresa.clave}`} className="text-xs text-slate-400 hover:text-white">Jefatura</Link>
          )}
          <Link href="/cambiar-pin" aria-label="Cambiar código" className="text-slate-400 hover:text-white">
            <KeyRound size={16} />
          </Link>
          <BotonSalir conTexto={false} />
        </div>
      </header>

      {u.rol === "admin" && (
        <nav aria-label="Empresa" className="mb-4 flex items-center gap-1 rounded-xl border border-aether-border bg-aether-card p-1">
          <Building2 size={14} className="mx-1.5 text-slate-500" />
          {EMPRESAS.map((e) => (
            <Link
              key={e.clave}
              href={`/exec?empresa=${e.clave}`}
              aria-current={e.clave === empresa.clave ? "page" : undefined}
              className={`flex-1 rounded-lg px-3 py-1.5 text-center text-xs font-bold ${
                e.clave === empresa.clave ? "bg-aether-accent text-white" : "text-slate-400"
              }`}
            >
              {e.nombre}
            </Link>
          ))}
        </nav>
      )}

      {/* Resumen */}
      <section className="tarjeta mb-4 p-4" aria-label="Resumen">
        <p className="text-sm font-bold text-white">
          {enMeta} de {kpis.length} indicadores en meta
        </p>
        <p className="text-[11px] text-slate-500">
          Corte: hoy, {fechaCorta(hoy)} · periodo {periodoTxt} (vs {anteriorTxt})
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kpis.map(([id, nombre, e]) => {
            const { Icono, clase } = ESTADO[e];
            return (
              <a key={id} href={`#${id}`} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${clase}`}>
                <Icono size={13} /> {nombre}
                <span className="sr-only">: {ESTADO[e].texto}</span>
              </a>
            );
          })}
        </div>
      </section>

      {/* 1. Plazo */}
      <Kpi
        id="plazo"
        n={1}
        titulo="Proyectos en plazo"
        estado={plazo.estado}
        valor={plazo.activos ? `${plazo.en_plazo} de ${plazo.activos}` : "—"}
        unidad="proyectos activos sin pasar su fecha de entrega"
        filas={[
          ["Meta", "100 % de los proyectos activos antes de su fecha de entrega comprometida"],
          ["Corte", `hoy, ${fechaCorta(hoy)}`],
          ["Detalle", `${plazo.atrasados} atrasado${plazo.atrasados === 1 ? "" : "s"} · ${plazo.por_vencer} vence${plazo.por_vencer === 1 ? "" : "n"} en ≤ ${DIAS_POR_VENCER} días`],
        ]}
        nota="Fechas de inicio y entrega registradas en Proyectos. La planificación detallada de hitos se gestiona en la carta Gantt."
      >
        <ul className="space-y-3">
          {plazo.proyectos.map((p) => {
            const cerrado = p.situacion === "entregado" || p.situacion === "pausado";
            const e: EstadoKpi = p.situacion === "atrasado" ? "fuera" : p.situacion === "por_vencer" ? "en_riesgo" : "en_meta";
            return (
              <li key={p.id} className={cerrado ? "opacity-60" : ""}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-200">
                    <span className="font-mono text-[10px] text-slate-400">{p.codigo}</span> {p.nombre}
                  </span>
                  <span className={`shrink-0 tabular-nums ${p.situacion === "atrasado" ? "font-semibold text-aether-danger" : "text-slate-400"}`}>
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
                    titulo={`Día ${p.dias_transcurridos} de ${p.dias_comprometidos} (${p.pct_plazo} % del plazo) · ${p.estado}`}
                  />
                )}
              </li>
            );
          })}
          {plazo.proyectos.length === 0 && <li className="text-xs text-slate-500">Sin proyectos.</li>}
        </ul>
        <p className="mt-2 text-[10px] text-slate-500">Barra: % del plazo transcurrido (inicio → entrega).</p>
      </Kpi>

      {/* 2. Costo vs estimación BOM */}
      <Kpi
        id="costo"
        n={2}
        titulo="Costo acumulado vs estimación BOM"
        estado={costo.estado}
        valor={costo.con_estimacion ? `${costo.dentro} de ${costo.con_estimacion}` : "—"}
        unidad="proyectos dentro de su estimación BOM"
        filas={[
          ["Meta", `Costo acumulado de cada proyecto ≤ su estimación BOM (tolerancia +${metas.tolerancia_costo_pct} %: «en riesgo»; más: «fuera de meta»)`],
          ["Acumulado", `${compacto(costo.total_clp)} de ${compacto(costo.estimado_clp)} estimados${costo.por_validar_clp ? ` · incluye ${compacto(costo.por_validar_clp)} por validar` : ""}`],
          ["Periodo", `${compacto(costo.periodo_clp)} agregados ${periodoTxt} (${anteriorTxt}: ${compacto(costo.periodo_anterior_clp)})`],
        ]}
        nota="Costo acumulado = compras aprobadas y por validar (las rechazadas no cuentan). Una compra de varios proyectos se reparte en partes iguales. La estimación BOM es la que se registra en Proyectos antes de comenzar."
      >
        <ul className="space-y-3">
          {costo.proyectos.map((p) => {
            const e: EstadoKpi = p.situacion === "fuera" ? "fuera" : p.situacion === "en_riesgo" ? "en_riesgo" : p.situacion === "dentro" ? "en_meta" : "sin_datos";
            const max = Math.max(100 + metas.tolerancia_costo_pct, p.pct ?? 0);
            return (
              <li key={p.id}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-200">
                    <span className="font-mono text-[10px] text-slate-400">{p.codigo}</span> {p.nombre}
                  </span>
                  <span className="shrink-0 text-slate-300">
                    {clp(p.total_clp)}
                    <span className="text-slate-500">
                      {p.pct === null ? " · sin estimación" : ` · ${p.pct === 0 && p.total_clp > 0 ? "<1" : p.pct} %`}
                    </span>
                  </span>
                </div>
                {p.pct !== null && (
                  <Medidor
                    pct={p.pct}
                    max={max}
                    marca={100}
                    estado={e}
                    titulo={`${clp(p.total_clp)} de ${clp(p.estimado_clp)} estimados (${p.pct} %) · ${p.compras} compra${p.compras === 1 ? "" : "s"}`}
                  />
                )}
              </li>
            );
          })}
          {costo.proyectos.length === 0 && <li className="text-xs text-slate-500">Sin proyectos.</li>}
        </ul>
        <p className="mt-2 text-[10px] text-slate-500">Barra: costo acumulado; la marca blanca es el 100 % de la estimación BOM.</p>
      </Kpi>

      {/* 3. Objetivos diarios del equipo */}
      <Kpi
        id="equipo"
        n={3}
        titulo="Cumplimiento de objetivos diarios del equipo"
        estado={equipo.estado}
        valor={equipo.pct === null ? "—" : `${equipo.pct} %`}
        unidad={`${equipo.completadas} de ${equipo.comprometidas} objetivos diarios logrados`}
        filas={[
          ["Meta", `≥ ${metas.objetivos_diarios_pct} % (bajo ${metas.objetivos_diarios_pct - 10} %: «fuera de meta»)`],
          ["Periodo", `${periodoTxt} · ${equipo.jornadas} jornadas · ${equipo.personas_con_jornadas} de ${equipo.personas} integrantes`],
          [
            "Comparación",
            <Variacion
              key="v"
              delta={deltaEquipo}
              bueno
              texto={
                deltaEquipo === null
                  ? `sin datos de ${anteriorTxt}`
                  : `${deltaEquipo > 0 ? "+" : ""}${deltaEquipo} pp vs ${anteriorTxt} (${equipo.pct_anterior} %)`
              }
            />,
          ],
        ]}
        nota={
          <>
            <b className="font-semibold text-slate-400">Qué mide:</b> de los objetivos que cada integrante se propone al
            comenzar su jornada, cuántos marca como logrados al terminarla (las jornadas en curso aún no cuentan). Es la
            ejecución del día a día del equipo; <b className="font-semibold text-slate-400">no</b> mide el avance de los hitos de
            cada proyecto, que se planifican y siguen en la carta Gantt.
          </>
        }
      >
        <Medidor
          pct={equipo.pct ?? 0}
          marca={metas.objetivos_diarios_pct}
          estado={equipo.estado}
          titulo={`${equipo.pct ?? "—"} % logrado · meta ${metas.objetivos_diarios_pct} %`}
        />
        <p className="mt-2 text-[10px] text-slate-500">Barra: % logrado; la marca blanca es la meta.</p>
      </Kpi>

      {/* 4. Bloqueos */}
      <Kpi
        id="bloqueos"
        n={4}
        titulo="Bloqueos sin resolver"
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
          <p className="text-xs text-slate-500">Sin bloqueos abiertos.</p>
        ) : (
          <ul className="space-y-2">
            {bloqueos.lista.map((b) => (
              <li key={b.bitacora_id} className="text-xs">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-200">{b.persona}</span>
                  <span className={b.dias > metas.bloqueo_max_dias ? "font-semibold text-aether-danger" : "text-slate-400"}>
                    {b.dias === 0 ? "hoy" : `hace ${b.dias} día${b.dias === 1 ? "" : "s"}`}
                  </span>
                </p>
                <p className="text-slate-300">{b.texto}</p>
                {b.proyectos.length > 0 && <p className="font-mono text-[10px] text-slate-500">{b.proyectos.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Kpi>

      {u.rol === "admin" ? (
        <EditorMetas empresa={empresa.clave} metas={metas} defecto={METAS_DEFECTO} />
      ) : (
        <p className="mb-4 text-center text-[10px] text-slate-600">Las metas las define la jefatura.</p>
      )}

      <p className="text-center text-[10px] text-slate-600">
        Datos de {empresa.nombre} · {m.personas_activas} integrantes activos
      </p>
    </main>
  );
}
