import { z } from "zod";
import { ErrorModulo } from "@/lib/chat/catalogo";
import { HttpError } from "@/lib/http";

/** Campos editables de una sala (la clave nunca). La validación fina la hace `validarDatos`. */
export const esquemaDatosSala = z.object({
  nombre: z.string().optional(),
  area: z.string().optional(),
  descripcion: z.string().optional(),
  color: z.string().optional(),
  orden: z.number().optional(),
  autonomia: z.enum(["revisar", "automatico"]).optional(),
});

/** Convierte los errores del catálogo de salas en errores HTTP. */
export function enModulo<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ErrorModulo) throw new HttpError(e.status, e.message);
    throw e;
  }
}
