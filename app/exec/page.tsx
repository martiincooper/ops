import { TrendingUp } from "lucide-react";
import Link from "next/link";
import BotonSalir from "@/components/BotonSalir";
import { requirePagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Exec() {
  const u = await requirePagina(["executive", "admin"]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <TrendingUp size={32} className="mb-3 text-aether-accent-soft" />
      <h1 className="text-lg font-bold text-white">Vista Gerencia</h1>
      <p className="mt-2 text-sm text-slate-400">
        Gasto por solución, recuperación de IVA, lead time y Say-Do global llegan en la siguiente etapa.
      </p>
      {u.rol === "admin" && (
        <Link href="/admin" className="mt-6 text-xs font-semibold text-aether-accent-soft">Ir a Administración</Link>
      )}
      <div className="mt-8 flex gap-6">
        <Link href="/cambiar-pin" className="text-xs text-slate-400">Cambiar código</Link>
        <BotonSalir />
      </div>
    </main>
  );
}
