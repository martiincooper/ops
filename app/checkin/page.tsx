import Checkin from "@/components/Checkin";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { estadoDia } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const u = await requirePagina(["team"]);
  const empresa = empresaDe(u);
  return <Checkin inicial={estadoDia(getDbEmpresa(empresa.clave), u, empresa)} nombre={u.nombre} />;
}
