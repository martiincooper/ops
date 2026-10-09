import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { avanzar } from "@/lib/chat/flujo";
import { arbolDeConversacion, enSala, lineas, requireGerencia, vistaConversacion } from "@/lib/chat/servicio";
import { agregarMensaje, exigirActiva, tocar } from "@/lib/chat/salas";
import { AVISO_TOPE, MENSAJE_CUPO, MENSAJE_TOPE, TURNOS_MAX, consumirCupo, turnosDelAsistente } from "@/lib/chat/uso";

type Ctx = { params: Promise<{ id: string }> };

const esquema = z.discriminatedUnion("accion", [
  z
    .object({
      accion: z.literal("mensaje"),
      texto: z.string().trim().max(4000, "Máximo 4000 caracteres").optional(),
      // Botones de respuesta: valores de las opciones elegidas
      valores: z.array(z.string().max(60)).max(20).optional(),
    })
    .refine((x) => !!x.texto || !!x.valores?.length, { message: "Escribe un mensaje o elige una opción" }),
  z.object({ accion: z.literal("siguiente") }),
  z.object({ accion: z.literal("mas_detalles") }),
]);

const TEXTO_BOTON = { siguiente: "Pasar a la siguiente pregunta", mas_detalles: "Agregar más detalles" } as const;

/** Un turno de la entrevista guiada por el árbol de la sala (#17): la respuesta de la persona y la del robot. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { id } = await params;
  const cuerpo = await leerJson(req, esquema);
  const c = enSala(() => exigirActiva(db, id, p));
  if (!consumirCupo(p.email, "mensaje")) throw new HttpError(429, MENSAJE_CUPO);

  // El motor no llama a servicios externos: el turno completo se calcula y guarda en una sola transacción.
  db.transaction(() => {
    const turnos = turnosDelAsistente(db, id);
    if (turnos >= TURNOS_MAX) throw new HttpError(409, MENSAJE_TOPE);
    let turno;
    try {
      turno = avanzar(arbolDeConversacion(c), lineas(db, id), cuerpo);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, (e as Error).message);
    }
    const alTope = turnos + 1 >= TURNOS_MAX;
    if (turno.usuario) agregarMensaje(db, id, "usuario", turno.usuario.texto, turno.usuario.meta);
    else if (cuerpo.accion !== "mensaje") agregarMensaje(db, id, "sistema", TEXTO_BOTON[cuerpo.accion]);
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
