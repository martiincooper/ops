import { NextResponse } from "next/server";
import { requireAdminPortal } from "@/lib/chat/servicio";
import { getDbControl } from "@/lib/db";
import { manejar } from "@/lib/http";
import { configGithub, githubConfigurado } from "@/lib/chat/github";
import { CUENTA_DATASHEQ, saludToken } from "@/lib/chat/githubApi";
import { codigoTicket } from "@/lib/chat/modulos";
import { listarModulos, todosLosModulos } from "@/lib/chat/catalogo";
import { estadoSalas } from "@/lib/chat/salas";
import { estadoVisible, sincronizar } from "@/lib/chat/seguimiento";
import { asientoDesdeEntorno, saludAsiento } from "@/lib/chat/asistente";
import { MAX_REINTENTOS } from "@/lib/chat/envio";

interface Fila {
  ticket: number;
  estado: string;
  issue_numero: number | null;
  issue_estado: string | null;
  issue_motivo: string | null;
  issue_asignado: string | null;
  participantes: string | null;
}

/**
 * Panel del administrador: estado de las salas e historial de solicitudes con su Issue.
 * Trae el estado de los Issues de GitHub como máximo cada 10 minutos; ?actualizar=1 (botón), cada minuto.
 */
export const GET = manejar(async (req) => {
  await requireAdminPortal(req);
  const db = getDbControl();
  const seguimiento = await sincronizar(db, configGithub(), { forzar: req.nextUrl.searchParams.get("actualizar") === "1" });
  const filas = db
    .prepare(
      `SELECT s.id, s.sala, s.estado, s.iniciada_en, s.terminada_en, s.ticket, s.titulo,
              s.issue_numero, s.issue_url, s.issue_repo, s.issue_error, s.issue_estado, s.issue_motivo, s.issue_asignado,
              s.issue_actualizado_en, s.issue_intentos, s.issue_proximo_intento,
              (SELECT COUNT(*) FROM chat_mensajes m WHERE m.solicitud_id = s.id) AS mensajes,
              (SELECT group_concat(p.nombre, ', ') FROM chat_participantes p WHERE p.solicitud_id = s.id) AS participantes
         FROM chat_solicitudes s
        ORDER BY s.ticket DESC
        LIMIT 300`,
    )
    .all() as Fila[];
  return NextResponse.json({
    salas: estadoSalas(db, true),
    archivadas: listarModulos(db, true),
    nombres: Object.fromEntries(todosLosModulos(db).map((m) => [m.clave, m.nombre])),
    historial: filas.map((f) => ({
      ...f,
      ticket: codigoTicket(f.ticket),
      estado_issue: f.estado === "terminada" ? estadoVisible(f) : null,
    })),
    seguimiento,
    config: {
      github: githubConfigurado(),
      token: await saludToken(configGithub()),
      cuenta: configGithub()?.cuenta ?? (process.env.GITHUB_CUENTA || CUENTA_DATASHEQ),
      reintentos_max: MAX_REINTENTOS,
      asiento: await saludAsiento(asientoDesdeEntorno()),
    },
  });
});
