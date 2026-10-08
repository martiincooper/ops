import { NextResponse } from "next/server";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { manejar } from "@/lib/http";
import { configGithub, githubConfigurado, repositorioIssues } from "@/lib/chat/github";
import { iaActiva } from "@/lib/chat/ia";
import { codigoTicket } from "@/lib/chat/modulos";
import { INACTIVIDAD_MIN, estadoSalas } from "@/lib/chat/salas";
import { estadoVisible, sincronizar } from "@/lib/chat/seguimiento";
import { TURNOS_MAX, consumoDelMes } from "@/lib/chat/uso";

interface Fila {
  ticket: number | null;
  issue_numero: number | null;
  issue_estado: string | null;
  issue_motivo: string | null;
  issue_asignado: string | null;
}

/**
 * Panel del administrador: estado de las salas e historial de conversaciones con su Issue.
 * Trae el estado de los Issues de GitHub como máximo cada 10 minutos; ?actualizar=1 (botón), cada minuto.
 */
export const GET = manejar(async (req) => {
  await requireAdminPortal(req);
  const db = getDbControl();
  const seguimiento = await sincronizar(db, configGithub(), { forzar: req.nextUrl.searchParams.get("actualizar") === "1" });
  const filas = db
    .prepare(
      `SELECT c.id, c.modulo, c.usuario_nombre, c.usuario_email, c.estado, c.completitud, c.iniciada_en, c.terminada_en,
              c.ticket, c.titulo, c.prioridad, c.clasificacion, c.issue_numero, c.issue_url, c.issue_error,
              c.issue_estado, c.issue_motivo, c.issue_asignado, c.issue_actualizado_en,
              (SELECT COUNT(*) FROM chat_mensajes m WHERE m.conversacion_id = c.id AND m.autor = 'usuario') AS respuestas
         FROM chat_conversaciones c
        ORDER BY c.iniciada_en DESC
        LIMIT 300`,
    )
    .all() as Fila[];
  return NextResponse.json({
    salas: estadoSalas(db, null, true),
    historial: filas.map((f) => ({
      ...f,
      ticket: f.ticket ? codigoTicket(f.ticket) : null,
      estado_issue: f.ticket ? estadoVisible(f) : null,
    })),
    consumo: consumoDelMes(db),
    seguimiento,
    config: {
      github: githubConfigurado(),
      repositorio: repositorioIssues(),
      ia: iaActiva(),
      inactividad_min: INACTIVIDAD_MIN,
      turnos_max: TURNOS_MAX,
    },
  });
});
