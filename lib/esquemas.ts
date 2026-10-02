import { z } from "zod";
import { esFechaValida } from "./tiempo";

const texto = (max: number) => z.string().trim().min(1, "Requerido").max(max, `Máximo ${max} caracteres`);
const fecha = z.string().refine(esFechaValida, "Fecha inválida (YYYY-MM-DD)");
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");
const pin = z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos");

export const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
  pin,
});

export const esquemaCambioPin = z.object({
  pin_actual: pin.optional(),
  pin_nuevo: pin,
});

export const esquemaManana = z.object({
  tareas: z
    .array(
      z.object({
        proyecto_id: z.string().min(1, "Selecciona un proyecto"),
        descripcion: texto(280),
      }),
    )
    .min(2, "Define al menos 2 objetivos")
    .max(4, "Máximo 4 objetivos"),
});

export const esquemaTarde = z.object({
  tareas: z
    .array(
      z.object({
        id: z.string().min(1),
        estado: z.enum(["completado", "pendiente", "postergado_ooo"]),
        motivo_pendiente: z.string().trim().max(280).optional().nullable(),
      }),
    )
    .min(1),
  bloqueo: z.string().trim().max(500).optional().nullable(),
});

export const esquemaOoo = z
  .object({
    fecha,
    dia_completo: z.boolean(),
    hora_inicio: hora.optional().nullable(),
    hora_fin: hora.optional().nullable(),
    motivo: z.string().trim().max(200).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.dia_completo) {
      if (!v.hora_inicio || !v.hora_fin) {
        ctx.addIssue({ code: "custom", message: "Indica hora de inicio y término", path: ["hora_inicio"] });
      } else if (v.hora_inicio >= v.hora_fin) {
        ctx.addIssue({ code: "custom", message: "La hora de término debe ser posterior al inicio", path: ["hora_fin"] });
      }
    }
  });

const montoClp = z.coerce
  .number({ error: "Monto inválido" })
  .int("Los montos en CLP no llevan decimales")
  .min(0, "Monto inválido")
  .max(1_000_000_000, "Monto fuera de rango");

export const esquemaGasto = z
  .object({
    proyecto_id: z.string().min(1, "Selecciona un proyecto"),
    item: texto(200),
    monto_item_clp: montoClp,
    monto_envio_clp: montoClp.default(0),
    tipo_documento: z.enum(["factura", "boleta", "extranjero"]),
    rut_emisor: z.string().trim().max(15).optional().nullable(),
    folio_documento: z.string().trim().min(1, "Folio requerido").max(40),
    fecha_documento: fecha,
  })
  .refine((v) => v.monto_item_clp + v.monto_envio_clp > 0, {
    message: "El monto total debe ser mayor a 0",
    path: ["monto_item_clp"],
  });

export const esquemaUsuarioNuevo = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
  nombre: texto(80),
  rol: z.enum(["team", "admin", "executive"]),
});

export const esquemaUsuarioCambio = z.object({
  nombre: texto(80).optional(),
  rol: z.enum(["team", "admin", "executive"]).optional(),
  activo: z.boolean().optional(),
  resetear_pin: z.literal(true).optional(),
});

const estadoProyecto = z.enum(["concepto", "prototipado", "pruebas", "entregado", "pausado"]);

export const esquemaProyectoNuevo = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,23}$/, "Código: letras, números y guiones (ej. AETH-SEN-01)"),
    nombre: texto(120),
    presupuesto_clp: montoClp,
    fecha_inicio: fecha,
    fecha_entrega_objetivo: fecha,
    estado: estadoProyecto.default("concepto"),
  })
  .refine((v) => v.fecha_entrega_objetivo >= v.fecha_inicio, {
    message: "La entrega objetivo no puede ser anterior al inicio",
    path: ["fecha_entrega_objetivo"],
  });

export const esquemaProyectoCambio = z.object({
  nombre: texto(120).optional(),
  presupuesto_clp: montoClp.optional(),
  fecha_entrega_objetivo: fecha.optional(),
  estado: estadoProyecto.optional(),
});
