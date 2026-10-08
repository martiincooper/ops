import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { configGithub } from "@/lib/chat/github";
import { codigoTicket } from "@/lib/chat/modulos";
import { estadoVisible, sincronizar } from "@/lib/chat/seguimiento";
import { requireGerencia } from "@/lib/chat/servicio";

interface Fila {
  id: string;
  modulo: string;
  ticket: number;
  titulo: string | null;
  prioridad: string | null;
  terminada_en: string | null;
  issue_numero: number | null;
  issue_url: string | null;
  issue_estado: string | null;
  issue_motivo: string | null;
  issue_asignado: string | null;
  issue_actualizado_en: string | null;
}

/**
 * «Mis requerimientos» (#6): los requerimientos generados por la cuenta, con el estado de su Issue.
 * El enlace al Issue solo va para administradores (el resto puede no tener acceso al repositorio).
 */
export const GET = manejar(async (req) => {
  const { u, db } = await requireGerencia(req);
  const seguimiento = await sincronizar(db, configGithub());
  const filas = db
    .prepare(
      `SELECT id, modulo, ticket, titulo, prioridad, terminada_en, issue_numero, issue_url,
              issue_estado, issue_motivo, issue_asignado, issue_actualizado_en
         FROM chat_conversaciones
        WHERE usuario_email = ? COLLATE NOCASE AND estado = 'generada' AND ticket IS NOT NULL
        ORDER BY ticket DESC
        LIMIT 100`,
    )
    .all(u.email) as Fila[];
  return NextResponse.json({
    requerimientos: filas.map((f) => ({
      id: f.id,
      ticket: codigoTicket(f.ticket),
      modulo: f.modulo,
      titulo: f.titulo,
      prioridad: f.prioridad,
      fecha: f.terminada_en,
      estado: estadoVisible(f),
      estado_al: f.issue_actualizado_en,
      issue_numero: f.issue_numero,
      issue_url: u.rol === "admin" ? f.issue_url : null,
    })),
    seguimiento,
  });
});
