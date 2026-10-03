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

/** Uno o más proyectos. Acepta también `proyecto_id` (un solo proyecto) por compatibilidad. */
const proyectosDe = (max: number) =>
  z
    .array(z.string().min(1))
    .min(1, "Elige al menos un proyecto")
    .max(max, `Máximo ${max} proyectos`)
    .transform((ids) => [...new Set(ids)]);

const conProyectoUnico = (v: unknown) => {
  if (v && typeof v === "object" && !("proyecto_ids" in v) && "proyecto_id" in v) {
    const { proyecto_id, ...resto } = v as Record<string, unknown>;
    return { ...resto, proyecto_ids: [proyecto_id] };
  }
  return v;
};

export const esquemaManana = z.object({
  tareas: z
    .array(
      z.preprocess(
        conProyectoUnico,
        z.object({
          proyecto_ids: proyectosDe(5),
          descripcion: texto(280),
        }),
      ),
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

/** Compra: uno o más proyectos, nombre, descripción (opcional) y monto total pagado en CLP. */
export const esquemaGasto = z.preprocess(
  conProyectoUnico,
  z.object({
    proyecto_ids: proyectosDe(10),
    item: texto(120),
    descripcion: z.string().trim().max(500, "Máximo 500 caracteres").optional().nullable(),
    monto_clp: montoClp.refine((n) => n > 0, "El monto debe ser mayor a 0"),
  }),
);

const emailNormalizado = z.string().trim().toLowerCase().pipe(z.email("Email inválido"));
const listaIds = z.array(z.string().min(1)).max(20);

/** Cuenta de una empresa: equipo o gerencia. Los supervisores (administradores) aplican al equipo. */
export const esquemaUsuarioNuevo = z.object({
  email: emailNormalizado,
  nombre: texto(80),
  rol: z.enum(["team", "executive"]),
  supervisores: listaIds.optional(),
});

export const esquemaUsuarioCambio = z.object({
  nombre: texto(80).optional(),
  rol: z.enum(["team", "executive"]).optional(),
  activo: z.boolean().optional(),
  resetear_pin: z.literal(true).optional(),
  supervisores: listaIds.optional(),
});

/** Administrador (jefatura intermedia): email de cualquier dominio, ve todas las empresas. */
export const esquemaAdminNuevo = z.object({
  email: emailNormalizado,
  nombre: texto(80),
});

export const esquemaAdminCambio = z.object({
  nombre: texto(80).optional(),
  activo: z.boolean().optional(),
  resetear_pin: z.literal(true).optional(),
});

export const esquemaValidacionGasto = z
  .object({
    estado: z.enum(["aprobado", "rechazado", "pendiente"]),
    observacion: z.string().trim().max(300).optional().nullable(),
  })
  .refine((v) => v.estado !== "rechazado" || !!v.observacion, {
    message: "Indica el motivo del rechazo",
    path: ["observacion"],
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
