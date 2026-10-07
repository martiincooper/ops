import { notFound } from "next/navigation";
import AccesoDenegado from "@/components/gerencia/AccesoDenegado";
import SalaChat from "@/components/gerencia/SalaChat";
import { requirePagina } from "@/lib/auth";
import { esDominioGerencia, moduloPorClave } from "@/lib/chat/modulos";

export const dynamic = "force-dynamic";

export default async function Sala({ params }: { params: Promise<{ modulo: string }> }) {
  const u = await requirePagina(["executive", "admin", "team"]);
  if (!esDominioGerencia(u.email)) return <AccesoDenegado email={u.email} />;
  const m = moduloPorClave((await params).modulo);
  if (!m) notFound();
  return <SalaChat key={m.clave} modulo={m} nombre={u.nombre} esAdmin={u.rol === "admin"} />;
}
