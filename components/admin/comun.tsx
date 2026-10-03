"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErrorApi, api, cx } from "@/lib/cliente";

export interface EmpresaPublica {
  clave: string;
  nombre: string;
  dominios: string[];
}

export interface Yo {
  id: string;
  nombre: string;
  email: string;
}

export type Alcance = "mios" | "todos";

export function conEmpresa(ruta: string, empresa: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ empresa, ...extra });
  return `${ruta}${ruta.includes("?") ? "&" : "?"}${q.toString()}`;
}

/** Carga JSON de la API y permite recargar. Cambiar `url` vuelve a cargar. */
export function useDatos<T>(url: string) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await api<T>(url));
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }, [url]);
  useEffect(() => {
    recargar();
  }, [recargar]);
  return { datos, error, cargando, recargar };
}

export type AvisoTipo = { tipo: "ok" | "error"; texto: string } | null;

export function Aviso({ aviso }: { aviso: AvisoTipo }) {
  if (!aviso) return null;
  return (
    <p
      role="status"
      className={cx(
        "mb-4 rounded-2xl px-4 py-3 text-sm",
        aviso.tipo === "ok" ? "bg-ok-fondo text-ok-tinta" : "bg-error-fondo text-error-tinta",
      )}
    >
      {aviso.texto}
    </p>
  );
}

export function Cargando({ cargando, error }: { cargando: boolean; error: string | null }) {
  if (error) return <p className="rounded-2xl bg-error-fondo px-4 py-3 text-sm text-error-tinta">{error}</p>;
  if (!cargando) return null;
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-tinta-3">
      <LoaderCircle size={16} className="animate-spin" /> Cargando…
    </p>
  );
}

/** Mensaje de lista vacía dentro de una tarjeta. */
export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="tarjeta px-6 py-10 text-center text-sm text-tinta-3">{children}</p>;
}

/** Ejecuta una acción con estado ocupado + aviso. */
export function useAccion() {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoTipo>(null);
  const ejecutar = useCallback(async (clave: string, fn: () => Promise<string | void>) => {
    setOcupado(clave);
    setAviso(null);
    try {
      const t = await fn();
      if (t) setAviso({ tipo: "ok", texto: t });
      return true;
    } catch (e) {
      setAviso({ tipo: "error", texto: (e as ErrorApi).message });
      return false;
    } finally {
      setOcupado(null);
    }
  }, []);
  return { ocupado, aviso, setAviso, ejecutar };
}

const fmtFechaHora = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Santiago",
});
export const fechaHora = (iso: string | null) => (iso ? fmtFechaHora.format(new Date(iso)) : "—");

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function diaCorto(f: string) {
  const [y, m, d] = f.split("-").map(Number);
  return { dia: DIAS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()], num: d, mes: MESES[m - 1] };
}
