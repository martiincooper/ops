import AccesoDenegado from "@/components/gerencia/AccesoDenegado";
import { CabeceraPortal } from "@/components/gerencia/comun";
import Portal from "@/components/gerencia/Portal";
import { requirePagina } from "@/lib/auth";
import { esDominioGerencia } from "@/lib/chat/modulos";
import { fechaLarga, hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export default async function Gerencia() {
  const u = await requirePagina(["executive", "admin"]);
  if (!esDominioGerencia(u.email)) return <AccesoDenegado email={u.email} />;
  return (
    <div className="min-h-dvh">
      <CabeceraPortal nombre={u.nombre} subtitulo={`${u.nombre} · ${fechaLarga(hoyLocal())}`} />
      <Portal nombre={u.nombre} />
    </div>
  );
}
