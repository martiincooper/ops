"use client";

import { LogOut } from "lucide-react";
import { api, cx } from "@/lib/cliente";

export default function BotonSalir({ className, conTexto = true }: { className?: string; conTexto?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login";
      }}
      className={cx(conTexto ? "boton-texto" : "boton-icono", className)}
    >
      <LogOut size={18} />
      {conTexto && <span>Cerrar sesión</span>}
    </button>
  );
}
