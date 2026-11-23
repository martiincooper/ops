"use client";

import { ArrowRight, Clock, Lock, MessagesSquare, Plus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EstadoSala } from "@/lib/chat/salas";
import { api, cx } from "@/lib/cliente";
import { IconoModulo } from "./comun";
import MisRequerimientos from "./MisRequerimientos";

const REFRESCO_MS = 15_000;

/**
 * Las salas activas que creó el administrador, en orden, y si tienen una solicitud abierta (actualizado cada 15
 * segundos). Las que aún no tienen un repositorio verificado salen en gris, «Próximamente», y no se pueden abrir.
 */
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

  const [form, setForm] = useState<{ nombre: string; descripcion: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const crear = async () => {
    if (!form) return;
    setCreando(true);
    setErrorForm(null);
    try {
      const r = await api<{ sala: EstadoSala }>("/api/chat/salas", { method: "POST", json: form });
      await cargar();
      window.location.href = `/gerencia/${r.sala.clave}`;
    } catch (e) {
      setErrorForm((e as Error).message);
      setCreando(false);
    }
  };

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
            Elige la sala del módulo sobre el que quieres levantar un requerimiento. Cada sala es un chat compartido:
            todos los gerentes que entren ven la conversación completa y pueden escribir al mismo tiempo.
          </p>
        </div>
      </section>

      {aviso && (
        <p role="alert" className="mb-5 flex items-center gap-2 rounded-2xl bg-alerta-fondo px-4 py-3 text-sm text-alerta-tinta">
          <Lock size={16} aria-hidden /> {aviso}
        </p>
      )}
      {error && <p className="mb-5 rounded-2xl bg-error-fondo px-4 py-3 text-sm text-error-tinta">{error}</p>}

      <div className="mb-5">
        {!form ? (
          <button type="button" data-nuevo-modulo onClick={() => setForm({ nombre: "", descripcion: "" })} className="boton">
            <Plus size={16} aria-hidden /> Nuevo módulo
          </button>
        ) : (
          <form
            data-form-modulo
            className="tarjeta grid gap-3 p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              crear();
            }}
          >
            <div className="flex items-center justify-between sm:col-span-2">
              <h2 className="font-semibold text-tinta">Nuevo módulo</h2>
              <button type="button" onClick={() => setForm(null)} className="boton-texto" aria-label="Cancelar">
                <X size={15} aria-hidden /> Cancelar
              </button>
            </div>
            <label className="etiqueta">
              Nombre (p. ej. C-Compras)
              <input className="campo" value={form.nombre} maxLength={60} required onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </label>
            <label className="etiqueta">
              Descripción en una línea
              <input className="campo" value={form.descripcion} maxLength={500} required onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </label>
            {errorForm && (
              <p role="alert" data-error-modulo className="text-sm font-medium text-alerta-tinta sm:col-span-2">
                {errorForm}
              </p>
            )}
            <div className="sm:col-span-2">
              <button type="submit" disabled={creando} className="boton">
                Crear sala
              </button>
            </div>
          </form>
        )}
      </div>

      {!salas && !error && <p className="mb-5 text-sm text-tinta-3">Cargando las salas…</p>}
      {salas && !salas.length && (
        <p className="mb-5 rounded-2xl bg-suave px-4 py-3 text-sm text-tinta-3">
          Por ahora no hay salas disponibles. Vuelve a intentarlo más tarde.
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(salas ?? []).map((s) => (
          <li key={s.clave} data-sala={s.clave} className={cx("tarjeta flex flex-col p-5", !s.disponible && "bg-suave")}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <IconoModulo clave={s.clave} color={s.disponible ? s.color : "7a7f8a"} />
              {!s.disponible ? (
                <span className="chip bg-suave text-tinta-2">
                  <Clock size={13} aria-hidden /> Próximamente
                </span>
              ) : s.estado_modulo === "propuesto" ? (
                <span className="chip bg-pastel-azul text-indigo-tinta">Propuesto</span>
              ) : (
                s.abierta && (
                  <span className="chip bg-indigo-suave text-indigo-tinta">
                    <MessagesSquare size={13} aria-hidden /> Conversación abierta
                  </span>
                )
              )}
            </div>
            <h2 className={cx("text-lg font-semibold", s.disponible ? "text-tinta" : "text-tinta-2")}>{s.nombre}</h2>
            <p className="text-sm font-medium text-tinta-2">{s.area}</p>
            <p className="mt-2 flex-1 text-sm text-tinta-3">{s.descripcion}</p>
            {s.disponible ? (
              <Link href={`/gerencia/${s.clave}`} className="boton mt-4 self-start">
                {s.abierta ? "Unirse a la conversación" : "Entrar a la sala"} <ArrowRight size={16} aria-hidden />
              </Link>
            ) : (
              <button type="button" disabled className="boton mt-4 self-start">
                Aún no disponible
              </button>
            )}
          </li>
        ))}
      </ul>

      <MisRequerimientos />
    </main>
  );
}
