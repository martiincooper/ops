import { notFound } from "next/navigation";
import AccesoDenegado from "@/components/gerencia/AccesoDenegado";
import SalaChat from "@/components/gerencia/SalaChat";
import { requirePagina } from "@/lib/auth";
import { moduloPorClave, puedeUsarPortal } from "@/lib/chat/modulos";
import { salaActiva } from "@/lib/chat/repos";

export const dynamic = "force-dynamic";

export default async function Sala({ params }: { params: Promise<{ modulo: string }> }) {
  const u = await requirePagina(["executive", "admin", "team"]);
  if (!puedeUsarPortal(u)) return <AccesoDenegado email={u.email} />;
  const m = moduloPorClave((await params).modulo);
  // Las salas sin repositorio de GitHub asignado no están disponibles
  if (!m || !salaActiva(m.clave)) notFound();
  return <SalaChat key={m.clave} modulo={m} nombre={u.nombre} email={u.email} esAdmin={u.rol === "admin"} />;
}
