import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { FOTOS_MAX_POR_SOLICITUD, FOTO_MAX_BYTES, MSG_FOTOS_LIMITE, MSG_FOTO_GRANDE, type FotoEntrada } from "@/lib/chat/adjuntos";
import { enSala, requireGerencia } from "@/lib/chat/servicio";
import { TEXTO_MAX, enviarMensaje } from "@/lib/chat/salas";
import { MENSAJE_CUPO, consumirCupo } from "@/lib/chat/uso";

type Ctx = { params: Promise<{ modulo: string }> };

const esquema = z.object({ texto: z.string().trim().min(1, "Escribe un mensaje").max(TEXTO_MAX, `Máximo ${TEXTO_MAX} caracteres`) });

/** Máximo de bytes de un envío (las fotos máximas más el texto): corta antes de leer cuerpos enormes. */
const CUERPO_MAX = (FOTOS_MAX_POR_SOLICITUD + 1) * FOTO_MAX_BYTES;

/** Texto y fotos de un envío: multipart (campos `texto` y `fotos`) o JSON solo con texto. */
async function leerEnvio(req: Parameters<Parameters<typeof manejar>[0]>[0]): Promise<{ texto: string; fotos: FotoEntrada[] }> {
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return { texto: (await leerJson(req, esquema)).texto, fotos: [] };
  }
  if (Number(req.headers.get("content-length") ?? 0) > CUERPO_MAX) throw new HttpError(413, MSG_FOTO_GRANDE);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Envío inválido");
  }
  const archivos = form.getAll("fotos").filter((f): f is File => typeof f !== "string");
  if (archivos.length > FOTOS_MAX_POR_SOLICITUD) throw new HttpError(400, MSG_FOTOS_LIMITE);
  const fotos = await Promise.all(archivos.map(async (f) => ({ nombre: f.name, datos: Buffer.from(await f.arrayBuffer()) })));
  const texto = form.get("texto");
  return { texto: typeof texto === "string" ? texto : "", fotos };
}

/** Guarda el mensaje (texto y/o fotos) y responde de inmediato; si la sala no tiene una solicitud abierta, abre una. */
export const POST = manejar<Ctx>(async (req, { params }) => {
  const { p, db } = await requireGerencia(req);
  const { modulo } = await params;
  const { texto, fotos } = await leerEnvio(req);
  if (!consumirCupo(p.email, "mensaje")) throw new HttpError(429, MENSAJE_CUPO);
  const { mensaje, solicitud, nueva } = enSala(() => enviarMensaje(db, modulo, p, texto, new Date(), process.env, fotos));
  return NextResponse.json({ mensaje, solicitud: { id: solicitud.id, ticket: solicitud.ticket, estado: solicitud.estado }, nueva });
});
