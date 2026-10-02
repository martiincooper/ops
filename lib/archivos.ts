import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DIR_COMPROBANTES } from "./db";

export const MAX_COMPROBANTE_BYTES = 10 * 1024 * 1024;

export interface TipoArchivo {
  mime: string;
  ext: string;
}

/** Identifica el tipo por los bytes iniciales (no por el nombre ni por el Content-Type del cliente). */
export function detectarTipo(b: Buffer): TipoArchivo | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  if (b.toString("ascii", 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b.toString("ascii", 4, 8) === "ftyp") {
    const marca = b.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(marca)) {
      return { mime: "image/heic", ext: "heic" };
    }
  }
  return null;
}

/** Guarda en comprobantes/AAAA/MM/<id>.<ext> y devuelve la ruta relativa. */
export async function guardarComprobante(id: string, datos: Buffer, tipo: TipoArchivo): Promise<string> {
  const ahora = new Date();
  const rel = path.posix.join(
    String(ahora.getUTCFullYear()),
    String(ahora.getUTCMonth() + 1).padStart(2, "0"),
    `${id}.${tipo.ext}`,
  );
  const abs = rutaAbsoluta(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, datos, { flag: "wx" });
  return rel;
}

export function rutaAbsoluta(rel: string): string {
  const abs = path.resolve(DIR_COMPROBANTES, rel);
  if (!abs.startsWith(DIR_COMPROBANTES + path.sep)) throw new Error("Ruta de comprobante fuera del directorio");
  return abs;
}

export async function borrarComprobante(rel: string) {
  await fs.rm(rutaAbsoluta(rel), { force: true });
}
