import fs from "node:fs/promises";
import { rutaAbsoluta } from "@/lib/archivos";
import { contexto } from "@/lib/auth";
import { HttpError, manejar } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

// Equipo: solo sus propios comprobantes. Gerencia: los de su empresa. Administradores: los de la empresa elegida.
// Cada empresa tiene su base y su carpeta: un id de otra empresa simplemente no existe aquí (404).
export const GET = manejar<Ctx>(async (req, { params }) => {
  const { u, empresa, db } = await contexto(req);
  const { id } = await params;
  const g = db
    .prepare("SELECT usuario_id, comprobante_archivo, comprobante_mime FROM gastos WHERE id = ?")
    .get(id) as { usuario_id: string; comprobante_archivo: string; comprobante_mime: string } | undefined;
  if (!g || (u.rol === "team" && g.usuario_id !== u.id)) throw new HttpError(404, "No encontrado");

  let datos: Buffer;
  try {
    datos = await fs.readFile(rutaAbsoluta(empresa.clave, g.comprobante_archivo));
  } catch {
    throw new HttpError(404, "Archivo no disponible");
  }
  return new Response(new Uint8Array(datos), {
    headers: {
      "Content-Type": g.comprobante_mime,
      "Content-Length": String(datos.length),
      "Content-Disposition": `inline; filename="comprobante-${id}.${g.comprobante_archivo.split(".").pop()}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // El visor PDF de Chrome no se carga en documentos con CSP "sandbox": solo se aplica a imágenes.
      ...(g.comprobante_mime === "application/pdf"
        ? {}
        : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
});
