import Jornada from "@/components/equipo/Jornada";
import { empresaDe, requirePagina } from "@/lib/auth";
import { getDbEmpresa } from "@/lib/db";
import { estadoDia } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const u = await requirePagina(["team"]);
  const empresa = empresaDe(u);
  return <Jornada inicial={estadoDia(getDbEmpresa(empresa.clave), u, empresa)} nombre={u.nombre} />;
}
