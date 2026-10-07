import { NextResponse } from "next/server";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { manejar } from "@/lib/http";
import { githubConfigurado, repositorioIssues } from "@/lib/chat/github";
import { iaActiva } from "@/lib/chat/ia";
import { codigoTicket } from "@/lib/chat/modulos";
import { INACTIVIDAD_MIN, estadoSalas } from "@/lib/chat/salas";

/** Panel del administrador: estado de las salas e historial de conversaciones con su Issue. */
export const GET = manejar(async (req) => {
  await requireAdminPortal(req);
  const db = getDbControl();
  const filas = db
    .prepare(
      `SELECT c.id, c.modulo, c.usuario_nombre, c.usuario_email, c.estado, c.completitud, c.iniciada_en, c.terminada_en,
              c.ticket, c.titulo, c.prioridad, c.clasificacion, c.issue_numero, c.issue_url, c.issue_error,
              (SELECT COUNT(*) FROM chat_mensajes m WHERE m.conversacion_id = c.id AND m.autor = 'usuario') AS respuestas
         FROM chat_conversaciones c
        ORDER BY c.iniciada_en DESC
        LIMIT 300`,
    )
    .all() as { ticket: number | null }[];
  return NextResponse.json({
    salas: estadoSalas(db, null, true),
    historial: filas.map((f) => ({ ...f, ticket: f.ticket ? codigoTicket(f.ticket) : null })),
    config: { github: githubConfigurado(), repositorio: repositorioIssues(), ia: iaActiva(), inactividad_min: INACTIVIDAD_MIN },
  });
});
