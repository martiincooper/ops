"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { api, cx } from "@/lib/cliente";

const CLASE = "boton-suave bg-superficie";

/**
 * «Acceso Administrador»: un administrador va directo al panel del portal (/admin → Portal gerencial).
 * El resto cierra su sesión y vuelve a ingresar con credenciales de administrador (@datasheq.com).
 */
export default function BotonAccesoAdmin({ esAdmin, className }: { esAdmin: boolean; className?: string }) {
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
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login?portal=admin";
      }}
      className={cx(CLASE, className)}
    >
      {contenido}
    </button>
  );
}
