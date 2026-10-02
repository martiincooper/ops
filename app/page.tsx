import { redirect } from "next/navigation";
import { usuarioPagina } from "@/lib/auth";
import { inicioPorRol } from "@/lib/jwt";

export default async function Inicio() {
  const u = await usuarioPagina();
  if (!u) redirect("/login");
  redirect(u.debe_cambiar_pin ? "/cambiar-pin" : inicioPorRol(u.rol));
}
