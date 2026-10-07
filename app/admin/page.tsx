import AdminPanel, { type Vista } from "@/components/admin/AdminPanel";
import { empresaDe, requirePagina } from "@/lib/auth";
import { empresasPublicas } from "@/lib/empresas";
import { hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

const VISTAS: Vista[] = ["standup", "capacidad", "compras", "equipo", "proyectos", "admins", "chat"];

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePagina(["admin"]);
  const q = await searchParams;
  let empresa: string;
  try {
    empresa = empresaDe(u, q.empresa).clave;
  } catch {
    empresa = empresaDe(u).clave;
  }
  const vista = VISTAS.includes(q.vista as Vista) ? (q.vista as Vista) : "standup";
  return (
    <AdminPanel
      yo={{ id: u.id, nombre: u.nombre, email: u.email }}
      empresas={empresasPublicas()}
      inicial={{ empresa, vista, alcance: q.alcance === "todos" ? "todos" : "mios" }}
      hoy={hoyLocal()}
    />
  );
}
