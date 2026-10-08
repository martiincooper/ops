"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { api, cx } from "@/lib/cliente";

const CLASE = "boton-suave bg-superficie";

/**
 * «Acceso Administrador»: un administrador va directo al panel del portal (/admin → Portal gerencial).
 * El resto cierra su sesión y vuelve a ingresar con credenciales de administrador (@datasheq.com); si está en
 * una sala, primero confirma, porque al cerrar sesión su conversación termina y la sala queda libre.
 */
export default function BotonAccesoAdmin({ esAdmin, enSala = false, className }: { esAdmin: boolean; enSala?: boolean; className?: string }) {
  const contenido = (
    <>
      <ShieldCheck size={16} aria-hidden /> <span className="hidden sm:inline">Acceso Administrador</span>
    </>
  );
  if (esAdmin) {
    return (
      <Link href="/admin?vista=chat" title="Acceso Administrador" aria-label="Acceso Administrador" className={cx(CLASE, className)}>
        {contenido}
      </Link>
    );
  }
  return (
    <button
      type="button"
      title="Acceso Administrador"
      aria-label="Acceso Administrador"
      onClick={async () => {
        if (
          enSala &&
          !window.confirm(
            "Para entrar como administrador se cerrará tu sesión y la conversación de esta sala terminará (la sala quedará libre). ¿Continuar?",
          )
        ) {
          return;
        }
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login?portal=admin";
      }}
      className={cx(CLASE, className)}
    >
      {contenido}
    </button>
  );
}
