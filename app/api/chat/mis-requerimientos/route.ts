import { NextResponse } from "next/server";
import { manejar } from "@/lib/http";
import { configGithub } from "@/lib/chat/github";
import { codigoTicket } from "@/lib/chat/modulos";
import { estadoVisible, sincronizar } from "@/lib/chat/seguimiento";
import { requireGerencia } from "@/lib/chat/servicio";

interface Fila {
  id: string;
  sala: string;
  ticket: number;
  estado: "abierta" | "terminada" | "cerrada";
  titulo: string | null;
  iniciada_en: string;
  issue_numero: number | null;
  issue_url: string | null;
  issue_estado: string | null;
  issue_motivo: string | null;
  issue_asignado: string | null;
  issue_actualizado_en: string | null;
}

/**
 * «Mis requerimientos» (#6): las solicitudes en que la cuenta escribió, con su estado y el de su Issue.
 * El enlace al Issue solo va para administradores (el resto puede no tener acceso al repositorio).
 */
export const GET = manejar(async (req) => {
  const { u, db } = await requireGerencia(req);
  const seguimiento = await sincronizar(db, configGithub());
  const filas = db
    .prepare(
      `SELECT s.id, s.sala, s.ticket, s.estado, s.titulo, s.iniciada_en, s.issue_numero, s.issue_url,
              s.issue_estado, s.issue_motivo, s.issue_asignado, s.issue_actualizado_en
         FROM chat_solicitudes s JOIN chat_participantes p ON p.solicitud_id = s.id
        WHERE p.email = ? COLLATE NOCASE
        ORDER BY s.ticket DESC
        LIMIT 100`,
    )
    .all(u.email) as Fila[];
  return NextResponse.json({
    requerimientos: filas.map((f) => ({
      id: f.id,
      ticket: codigoTicket(f.ticket),
      sala: f.sala,
      titulo: f.titulo,
      fecha: f.iniciada_en,
      estado_solicitud: f.estado,
      /** Estado del Issue; solo una solicitud terminada tiene Issue. */
      estado: f.estado === "terminada" ? estadoVisible(f) : null,
      estado_al: f.issue_actualizado_en,
      issue_numero: f.issue_numero,
      issue_url: u.rol === "admin" ? f.issue_url : null,
    })),
    seguimiento,
  });
});
