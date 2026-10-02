"use client";

import { LogOut } from "lucide-react";
import { api, cx } from "@/lib/cliente";

export default function BotonSalir({ className, conTexto = true }: { className?: string; conTexto?: boolean }) {
  return (
    <button
      type="button"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login";
      }}
      className={cx("flex items-center gap-1.5 text-xs text-slate-400 hover:text-white", className)}
    >
      <LogOut size={14} />
      {conTexto && <span>Cerrar sesión</span>}
    </button>
  );
}
