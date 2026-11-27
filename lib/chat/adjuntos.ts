// Fotos y PDF adjuntos a los mensajes de una sala: validación por contenido (no por nombre ni tipo declarado) y guardado en
// DATA_DIR/adjuntos/<solicitud>/<n>.<ext>. Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import fs from "node:fs";
import path from "node:path";

export const FOTO_MAX_BYTES = 5 * 1024 * 1024;
export const FOTOS_MAX_POR_SOLICITUD = 6;

export const MSG_FOTO_GRANDE = "Cada archivo debe pesar como máximo 5 MB";
export const MSG_FOTO_TIPO = "Solo se aceptan fotos JPG, PNG o WEBP y documentos PDF";
export const MSG_FOTOS_LIMITE = `Una solicitud admite como máximo ${FOTOS_MAX_POR_SOLICITUD} archivos`;

export type TipoFoto = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
const EXT: Record<TipoFoto, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export interface FotoEntrada {
  nombre: string;
  datos: Buffer;
}

export interface Adjunto {
  id: number;
  mensaje_id: number;
  nombre: string;
  tipo: TipoFoto;
  tamano: number;
}

/** Carpeta de las fotos (misma raíz de datos que lib/db.ts). */
export const dirAdjuntos = (dataDir = process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? "/data" : "./data")) =>
  path.resolve(dataDir, "adjuntos");

/** Tipo según los primeros bytes (JPG, PNG, WEBP o PDF); null si es otra cosa. */
export function detectarTipo(b: Buffer): TipoFoto | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && b.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export const extensionDe = (t: TipoFoto) => EXT[t];

/** Nombre de archivo para mostrar: sin carpetas ni caracteres de control, acotado. */
export function nombreSeguro(n: string): string {
  const base = n.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "archivo";
}
