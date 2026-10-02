import Checkin from "@/components/Checkin";
import { requirePagina } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { estadoDia } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const u = await requirePagina(["team", "admin"]);
  return <Checkin inicial={estadoDia(getDb(), u)} nombre={u.nombre} />;
}
