import { notFound } from "next/navigation";
import AccesoDenegado from "@/components/gerencia/AccesoDenegado";
import SalaChat from "@/components/gerencia/SalaChat";
import { requirePagina } from "@/lib/auth";
import { moduloPorClave } from "@/lib/chat/catalogo";
import { puedeUsarPortal, salaAbierta } from "@/lib/chat/modulos";
import { getDbControl } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Sala({ params }: { params: Promise<{ modulo: string }> }) {
  const u = await requirePagina(["executive", "admin", "team"]);
  if (!puedeUsarPortal(u)) return <AccesoDenegado email={u.email} />;
  const m = moduloPorClave(getDbControl(), (await params).modulo);
  // Archivadas o «Próximamente» (sin repositorio verificado): no se abren
  if (!m || m.archivado || !salaAbierta(m)) notFound();
  return <SalaChat key={m.clave} modulo={m} nombre={u.nombre} email={u.email} esAdmin={u.rol === "admin"} />;
}
