"use client";

import { ArrowRight, Lock, LockOpen, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MODULOS } from "@/lib/chat/modulos";
import type { EstadoSala } from "@/lib/chat/salas";
import { api, cx } from "@/lib/cliente";
import { IconoModulo } from "./comun";
import MisRequerimientos from "./MisRequerimientos";

const REFRESCO_MS = 15_000;

/** Las 7 salas con su estado (libre, en uso, tuya), actualizado cada 15 segundos. */
export default function Portal({ nombre, aviso }: { nombre: string; aviso?: string }) {
  const [salas, setSalas] = useState<EstadoSala[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ salas: EstadoSala[] }>("/api/chat/salas");
      setSalas(r.salas);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const primerNombre = nombre.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <section className="tarjeta mb-6 flex items-start gap-4 p-5 sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo text-white shadow-boton">
          <MessagesSquare size={24} aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-tinta sm:text-2xl">Hola, {primerNombre}. Es un gusto saludarte.</h1>
          <p className="mt-1 text-justify text-sm text-tinta-2 hyphens-auto sm:text-base">
            Elige la sala del módulo sobre el que quieres levantar un requerimiento. Nuestro asistente te hará algunas
            preguntas y, al finalizar, enviará el requerimiento al equipo de desarrollo.
          </p>
        </div>
      </section>

      {aviso && (
        <p role="alert" className="mb-5 flex items-center gap-2 rounded-2xl bg-alerta-fondo px-4 py-3 text-sm text-alerta-tinta">
          <Lock size={16} aria-hidden /> {aviso}
        </p>
      )}
      {error && <p className="mb-5 rounded-2xl bg-error-fondo px-4 py-3 text-sm text-error-tinta">{error}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULOS.map((m) => {
          const s = salas?.find((x) => x.clave === m.clave);
          const ocupadaPorOtro = !!s?.ocupada && !s.propia;
          return (
            <li key={m.clave} className="tarjeta flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <IconoModulo clave={m.clave} color={m.color} />
                {!s ? (
                  <span className="chip bg-suave text-tinta-3">…</span>
                ) : s.propia ? (
                  <span className="chip bg-indigo-suave text-indigo-tinta">
                    <MessagesSquare size={13} aria-hidden /> Tu conversación
                  </span>
                ) : s.ocupada ? (
                  <span className="chip bg-alerta-fondo text-alerta-tinta">
                    <Lock size={13} aria-hidden /> En uso
                  </span>
                ) : (
                  <span className="chip bg-ok-fondo text-ok-tinta">
                    <LockOpen size={13} aria-hidden /> Disponible
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-tinta">{m.nombre}</h2>
              <p className="text-sm font-medium text-tinta-2">{m.area}</p>
              <p className="mt-2 flex-1 text-sm text-tinta-3">{m.descripcion}</p>
              {ocupadaPorOtro ? (
                <p className="mt-4 rounded-2xl bg-suave px-3 py-2 text-xs text-tinta-3">
                  El módulo se encuentra en uso por otro usuario. Por favor intenta más tarde.
                </p>
              ) : (
                <Link href={`/gerencia/${m.clave}`} className={cx("boton mt-4 self-start", s?.propia && "bg-indigo-hondo")}>
                  {s?.propia ? "Continuar conversación" : "Entrar a la sala"} <ArrowRight size={16} aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <MisRequerimientos />
    </main>
  );
}
