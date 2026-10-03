"use client";

import { PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";

export interface Mensaje {
  id: number;
  titulo: string;
  detalle?: string;
}

/** Aviso breve arriba de la pantalla que acompaña al confeti. */
export default function Celebracion({ mensaje }: { mensaje: Mensaje | null }) {
  const [visible, setVisible] = useState<Mensaje | null>(null);
  useEffect(() => {
    if (!mensaje) return;
    setVisible(mensaje);
    const t = setTimeout(() => setVisible(null), 3800);
    return () => clearTimeout(t);
  }, [mensaje]);
  if (!visible) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <div className="animate-caer flex max-w-sm items-center gap-3 rounded-2xl border border-aether-success/30 bg-[#0d1f1a]/95 px-4 py-3 shadow-2xl backdrop-blur">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-aether-success/15 text-aether-success">
          <PartyPopper size={18} />
        </span>
        <div>
          <p className="text-sm font-bold text-white">{visible.titulo}</p>
          {visible.detalle && <p className="text-xs text-slate-300">{visible.detalle}</p>}
        </div>
      </div>
    </div>
  );
}
