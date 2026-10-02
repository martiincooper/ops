import { requirePagina } from "@/lib/auth";
import CambiarPin from "@/components/CambiarPin";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const u = await requirePagina(["team", "admin", "executive"], { permitirCambioPendiente: true });
  return <CambiarPin obligatorio={u.debe_cambiar_pin === 1} nombre={u.nombre} />;
}
