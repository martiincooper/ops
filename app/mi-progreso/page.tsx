import { ArrowLeft, CalendarOff, KeyRound } from "lucide-react";
import Link from "next/link";
import Anillo from "@/components/Anillo";
import BotonSalir from "@/components/BotonSalir";
import MisCompras from "@/components/equipo/MisCompras";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { ausenciasDesde, gastosRecientes, proyectosActivos } from "@/lib/dominio";
import { calcularProgreso, type DiaResumen } from "@/lib/metricas";
import { fechaCorta, fechaLocal, hoyLocal } from "@/lib/tiempo";
import { cx } from "@/lib/cliente";

export const dynamic = "force-dynamic";

function Dia({ d, hoy }: { d: DiaResumen; hoy: string }) {
  let detalle: string;
  let horario: string | null = null;
  let activo = false;
  if (d.registro === "cerrado") {
    detalle = `${d.completadas} de ${d.comprometidas} logrados`;
    horario = `${d.inicio_local}–${d.cierre_local}`;
    activo = true;
  } else if (d.registro === "abierto") {
    detalle = d.fecha === hoy ? `En curso desde las ${d.inicio_local}` : "Sin terminar";
    activo = true;
  } else if (d.tipo === "ooo") detalle = "No disponible";
  else if (d.tipo === "feriado") detalle = "Feriado";
  else if (d.tipo === "fin_de_semana") detalle = "Fin de semana";
  else detalle = "Sin jornada";
  return (
    <li className={cx("flex items-center gap-3 rounded-2xl px-4 py-3", activo ? "bg-suave" : "")}>
      <span className={cx("w-24 shrink-0 text-sm capitalize", activo ? "font-semibold text-tinta" : "text-tinta-3")}>{fechaCorta(d.fecha)}</span>
      <span className={cx("min-w-0 flex-1 text-sm", d.registro === "abierto" ? "text-indigo-tinta" : activo ? "text-tinta-2" : "text-tinta-3")}>
        {detalle}
        {horario && <span className="block text-xs tabular-nums text-tinta-3">{horario}</span>}
      </span>
      {d.saydo !== null && d.registro === "cerrado" && <span className="shrink-0 text-sm font-semibold text-tinta">{d.saydo}%</span>}
    </li>
  );
}

export default async function MiProgreso() {
  const u = await requirePagina(["team"]);
  const empresa = empresaDe(u);
  const db = getDbEmpresa(empresa.clave);
  const hoy = hoyLocal();
  const p = calcularProgreso(db, u.id, hoy, fechaLocal(u.creado_en));
  const gastos = gastosRecientes(db, u.id, 15);
  const ausencias = ausenciasDesde(db, u.id, hoy);

  return (
    <main className="mx-auto min-h-dvh max-w-lg space-y-4 px-4 pb-16 pt-[max(env(safe-area-inset-top),1rem)]">
      <header className="tarjeta flex items-center gap-3 px-4 py-3">
        <Link href="/checkin" aria-label="Volver a mi jornada" className="boton-icono">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-tinta">Mi progreso</p>
          <p className="text-xs text-tinta-3">{empresa.nombre}</p>
        </div>
        <BotonSalir conTexto={false} />
      </header>

      <section className="tarjeta flex items-center gap-5 p-5">
        <Anillo valor={p.saydo_14d} tamano={112} grosor={14} />
        <div>
          <p className="text-base font-semibold text-tinta">Objetivos logrados</p>
          <p className="text-sm text-tinta-3">últimos 14 días</p>
          <p className="mt-2 text-sm text-tinta-2">
            {p.completadas_14d} de {p.comprometidas_14d} objetivos · {p.jornadas_14d} jornada{p.jornadas_14d === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-tinta-3">La jornada en curso cuenta al terminarla.</p>
        </div>
      </section>

      <section className="tarjeta p-5">
        <h2 className="titulo-seccion mb-3">Últimos 14 días</h2>
        <ul className="space-y-1">
          {p.historial.map((d) => (
            <Dia key={d.fecha} d={d} hoy={hoy} />
          ))}
        </ul>
      </section>

      {ausencias.length > 0 && (
        <section className="tarjeta p-5">
          <h2 className="titulo-seccion mb-3 flex items-center gap-2">
            <CalendarOff size={18} className="text-indigo" /> Próximos días no disponibles
          </h2>
          <ul className="space-y-2">
            {ausencias.map((a) => (
              <li key={a.id} className="flex justify-between rounded-2xl bg-pastel-azul px-4 py-2.5 text-sm">
                <span className="font-semibold capitalize text-tinta">{a.fecha === hoy ? "Hoy" : fechaCorta(a.fecha)}</span>
                <span className="text-tinta-2">{a.motivo ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta p-5">
        <h2 className="titulo-seccion mb-3">Mis compras</h2>
        {gastos.length === 0 ? (
          <p className="text-sm text-tinta-3">Aún no registras compras.</p>
        ) : (
          <MisCompras gastos={gastos} proyectos={proyectosActivos(db)} />
        )}
      </section>

      <Link href="/cambiar-pin" className="tarjeta flex items-center gap-3 px-5 py-4 text-sm font-semibold text-tinta hover:bg-suave">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-suave text-indigo-tinta">
          <KeyRound size={18} />
        </span>
        Cambiar mi código de acceso
      </Link>
      <p className="text-center text-xs text-tinta-3">{u.email}</p>
    </main>
  );
}
