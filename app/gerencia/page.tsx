import AccesoDenegado from "@/components/gerencia/AccesoDenegado";
import { CabeceraPortal } from "@/components/gerencia/comun";
import Portal from "@/components/gerencia/Portal";
import { requirePagina } from "@/lib/auth";
import { esDominioGerencia } from "@/lib/chat/modulos";
import { fechaLarga, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  "sin-admin": "Tu cuenta no tiene permisos de administrador. Puedes seguir usando el portal con normalidad.",
};

export default async function Gerencia({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const u = await requirePagina(["executive", "admin", "team"]);
  if (!esDominioGerencia(u.email)) return <AccesoDenegado email={u.email} />;
  const { aviso } = await searchParams;
  return (
    <div className="min-h-dvh">
      <CabeceraPortal nombre={u.nombre} subtitulo={`${u.nombre} · ${fechaLarga(hoyLocal())}`} esAdmin={u.rol === "admin"} />
      <Portal nombre={u.nombre} aviso={aviso ? AVISOS[aviso] : undefined} />
    </div>
  );
}
