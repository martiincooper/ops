import { NextResponse } from "next/server";
import { z } from "zod";
import { leerJson, manejar } from "@/lib/http";
import { responder } from "@/lib/chat/ia";
import { enSala, lineas, moduloDe, requireGerencia, vistaConversacion } from "@/lib/chat/servicio";
import { agregarMensaje, exigirActiva, tocar } from "@/lib/chat/salas";

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
  tocar(db, id);

  const texto = cuerpo.accion === "mensaje" ? cuerpo.texto : "";
  const turno = await responder(moduloDe(c), p, lineas(db, id), cuerpo.accion, texto);

  // La respuesta de la persona y la del robot se guardan juntas: si la IA falla, no queda un mensaje sin respuesta.
  db.transaction(() => {
    enSala(() => exigirActiva(db, id, p));
    if (cuerpo.accion === "mensaje") agregarMensaje(db, id, "usuario", texto);
    else agregarMensaje(db, id, "sistema", TEXTO_BOTON[cuerpo.accion]);
    agregarMensaje(db, id, "robot", turno.mensaje, {
      ...turno.meta,
      completitud: turno.completitud,
      faltantes: turno.faltantes,
      sala_sugerida: turno.sala_sugerida,
      listo: turno.listo_para_generar,
    });
    db.prepare("UPDATE chat_conversaciones SET completitud = ? WHERE id = ?").run(turno.completitud, id);
    tocar(db, id);
  })();
  return NextResponse.json(vistaConversacion(db, id));
});
