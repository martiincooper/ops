import { z } from "zod";
import { esFechaValida } from "./tiempo";

const texto = (max: number) => z.string().trim().min(1, "Requerido").max(max, `Máximo ${max} caracteres`);
const fecha = z.string().refine(esFechaValida, "Fecha inválida (YYYY-MM-DD)");
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

export const MAX_OBJETIVOS = 4;

const objetivoNuevo = z.preprocess(
  conProyectoUnico,
  z.object({
    proyecto_ids: proyectosDe(5),
    descripcion: texto(280),
  }),
);

/** Comenzar jornada: es solo el evento. Se aceptan objetivos opcionales (hasta 4); se agregan después en el tablero. */
export const esquemaComienzo = z.object({
  tareas: z.array(objetivoNuevo).max(MAX_OBJETIVOS, `Máximo ${MAX_OBJETIVOS} objetivos`).default([]),
});

export const esquemaObjetivoNuevo = objetivoNuevo;

/** Edición de un objetivo de la jornada editable: solo cambian los campos enviados. */
export const esquemaObjetivoCambio = z
  .object({
    completada: z.boolean().optional(),
    descripcion: texto(280).optional(),
    proyecto_ids: proyectosDe(5).optional(),
    motivo_pendiente: z.string().trim().max(280).optional().nullable(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nada que cambiar");

/** Bloqueo de la última jornada terminada (editable hasta comenzar la siguiente). */
export const esquemaBloqueo = z.object({ bloqueo: z.string().trim().max(500).nullable() });

export const esquemaTermino = z.object({
  tareas: z
    .array(
      z.object({
        id: z.string().min(1),
        estado: z.enum(["completado", "pendiente", "postergado_ooo"]),
        motivo_pendiente: z.string().trim().max(280).optional().nullable(),
      }),
    )
    .max(20),
  bloqueo: z.string().trim().max(500).optional().nullable(),
});

/** Día no disponible (día completo). Campos de versiones anteriores (dia_completo, horas) se ignoran. */
export const esquemaNoDisponible = z.object({
  fecha,
  motivo: z.string().trim().max(200).optional().nullable(),
});

const montoClp = z.coerce
  .number({ error: "Monto inválido" })
  .int("Los montos en CLP no llevan decimales")
  .min(0, "Monto inválido")
  .max(1_000_000_000, "Monto fuera de rango");

/**
 * Compra: uno o más proyectos, nombre, descripción (opcional), monto de la compra en CLP y, opcional, el costo
 * de envío en CLP. Se guarda el total (compra + envío) y el envío por separado.
 */
export const esquemaGasto = z.preprocess(
  conProyectoUnico,
  z
    .object({
      proyecto_ids: proyectosDe(10),
      item: texto(120),
      descripcion: z.string().trim().max(500, "Máximo 500 caracteres").optional().nullable(),
      monto_clp: montoClp.refine((n) => n > 0, "El monto debe ser mayor a 0"),
      envio_clp: montoClp.optional().nullable(),
    })
    .refine((g) => g.monto_clp + (g.envio_clp ?? 0) <= 1_000_000_000, { message: "Monto fuera de rango", path: ["envio_clp"] }),
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

const codigoProyecto = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,23}$/, "Código: letras, números y guiones (ej. AETH-SEN-01)");

export const esquemaProyectoNuevo = z
  .object({
    codigo: codigoProyecto,
    nombre: texto(120),
    presupuesto_clp: montoClp,
    fecha_inicio: fecha,
    fecha_entrega_objetivo: fecha,
    estado: estadoProyecto.default("concepto"),
  })
  .refine((v) => v.fecha_entrega_objetivo >= v.fecha_inicio, {
    message: "La entrega estimada no puede ser anterior al inicio",
    path: ["fecha_entrega_objetivo"],
  });

/** Corrección de las fechas del historial de etapas: todas las filas del proyecto, en su orden actual. */
export const esquemaEtapas = z.object({
  etapas: z
    .array(z.object({ id: z.number().int().positive(), desde: fecha }))
    .min(1, "Sin etapas")
    .max(100),
});

/** Edición de un proyecto: solo los campos enviados cambian. */
export const esquemaProyectoCambio = z.object({
  codigo: codigoProyecto.optional(),
  nombre: texto(120).optional(),
  presupuesto_clp: montoClp.optional(),
  fecha_inicio: fecha.optional(),
  fecha_entrega_objetivo: fecha.optional(),
  estado: estadoProyecto.optional(),
});
