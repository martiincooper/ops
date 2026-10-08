import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { responder } from "@/lib/chat/ia";
import { enSala, lineas, moduloDe, requireGerencia, vistaConversacion } from "@/lib/chat/servicio";
import { agregarMensaje, exigirActiva, tocar } from "@/lib/chat/salas";
import { AVISO_TOPE, MENSAJE_CUPO, MENSAJE_TOPE, TURNOS_MAX, consumirCupo, sumarConsumo, turnosDelAsistente } from "@/lib/chat/uso";

type Ctx = { params: Promise<{ id: string }> };

const esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("mensaje"), texto: z.string().trim().min(1, "Escribe un mensaje").max(4000, "Máximo 4000 caracteres") }),
  z.object({ accion: z.literal("siguiente") }),
  z.object({ accion: z.literal("mas_detalles") }),
]);

const TEXTO_BOTON = { siguiente: "Pasar a la siguiente pregunta", mas_detalles: "Agregar más detalles" } as const;

/** Un turno de la entrevista: la respuesta de la persona (o un botón) y la respuesta del robot. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { id } = await params;
  const cuerpo = await leerJson(req, esquema);
  const c = enSala(() => exigirActiva(db, id, p));
  // Cada turno es una llamada a la IA: tope por conversación y cupo por minuto de la cuenta (#4)
  if (turnosDelAsistente(db, id) >= TURNOS_MAX) throw new HttpError(409, MENSAJE_TOPE);
  if (!consumirCupo(p.email, "mensaje")) throw new HttpError(429, MENSAJE_CUPO);
  tocar(db, id);

  const texto = cuerpo.accion === "mensaje" ? cuerpo.texto : "";
  const turno = await responder(moduloDe(c), p, lineas(db, id), cuerpo.accion, texto);
  sumarConsumo(db, id, turno.consumo); // lo gastado cuenta aunque el turno no se guarde

  // La respuesta de la persona y la del robot se guardan juntas: si la IA falla, no queda un mensaje sin respuesta.
  db.transaction(() => {
    enSala(() => exigirActiva(db, id, p));
    const turnos = turnosDelAsistente(db, id);
    if (turnos >= TURNOS_MAX) throw new HttpError(409, MENSAJE_TOPE); // otra pestaña llegó primero al tope
    const alTope = turnos + 1 >= TURNOS_MAX;
    if (cuerpo.accion === "mensaje") agregarMensaje(db, id, "usuario", texto);
    else agregarMensaje(db, id, "sistema", TEXTO_BOTON[cuerpo.accion]);
    agregarMensaje(db, id, "robot", alTope ? `${turno.mensaje}\n\n${AVISO_TOPE}` : turno.mensaje, {
      ...turno.meta,
      completitud: turno.completitud,
      faltantes: turno.faltantes,
      sala_sugerida: turno.sala_sugerida,
      listo: turno.listo_para_generar || alTope,
      ...(alTope ? { tope: true } : {}),
    });
    db.prepare("UPDATE chat_conversaciones SET completitud = ? WHERE id = ?").run(turno.completitud, id);
    tocar(db, id);
  })();
  return NextResponse.json(vistaConversacion(db, id));
});
