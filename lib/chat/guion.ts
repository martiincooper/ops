// Tipos del robot y entrevista guiada sin IA: se usa cuando no hay ANTHROPIC_API_KEY (desarrollo, pruebas,
// servidores sin salida a internet) y como respaldo si la API no responde. Mismo contrato que la IA.
import {
  type Clasificacion,
  type ClaveModulo,
  MODULOS,
  type Modulo,
  type Prioridad,
} from "./modulos";
import type { Autor } from "./salas";

export type Accion = "mensaje" | "siguiente" | "mas_detalles";

export interface Linea {
  autor: Autor;
  texto: string;
  meta?: Record<string, unknown> | null;
}

export interface TurnoRobot {
  mensaje: string;
  /** 0 a 100: cuánto de lo necesario para el requerimiento ya se conoce. */
  completitud: number;
  faltantes: string[];
  /** Otra sala, si el tema corresponde a otro módulo. */
  sala_sugerida: ClaveModulo | null;
  listo_para_generar: boolean;
}

export interface Requerimiento {
  titulo: string;
  resumen: string;
  clasificacion: Clasificacion;
  prioridad: Prioridad;
  justificacion_prioridad: string;
  contexto: string;
  necesidad: string;
  alcance: string[];
  criterios_aceptacion: string[];
  interesados: string[];
  plazo: string | null;
}

const MINIMO_RESPUESTA = 25; // caracteres: menos que esto se considera una respuesta incompleta

/** Tema en curso según el último mensaje del robot (0 = la pregunta abierta del saludo). */
function temaActual(lineas: Linea[]): { tema: number; repreguntado: boolean } {
  const ultimo = [...lineas].reverse().find((l) => l.autor === "robot");
  return {
    tema: Number(ultimo?.meta?.tema ?? 0),
    repreguntado: ultimo?.meta?.repregunta === true,
  };
}

function pregunta(m: Modulo, tema: number): string {
  const t = m.temas[tema - 1];
  return `¿Me podrías contar ${t.charAt(0).toLowerCase()}${t.slice(1)}?`;
}

/** Turno del robot sin IA: una pregunta por tema; repregunta una vez si la respuesta es muy breve. */
export function turnoGuiado(m: Modulo, lineas: Linea[], accion: Accion, texto: string): TurnoRobot & { meta: Record<string, unknown> } {
  const total = m.temas.length + 1;
  const { tema, repreguntado } = temaActual(lineas);
  const avance = (t: number) => Math.min(100, Math.round((t / total) * 100));
  const faltantes = (desde: number) => m.temas.slice(Math.max(0, desde - 1));

  if (accion === "mas_detalles") {
    const sobre = tema === 0 ? "tu necesidad" : m.temas[tema - 1].toLowerCase();
    return {
      mensaje: `Por supuesto, con gusto. Cuéntame todo lo que quieras agregar sobre ${sobre}: ejemplos, cifras, áreas involucradas o cualquier detalle que te parezca relevante.`,
      completitud: avance(tema),
      faltantes: faltantes(tema + 1),
      sala_sugerida: null,
      listo_para_generar: tema >= total - 1,
      meta: { tema, repregunta: true },
    };
  }

  const breve = accion === "mensaje" && texto.trim().length < MINIMO_RESPUESTA;
  if (breve && !repreguntado) {
    return {
      mensaje:
        "Gracias por tu respuesta. Para dejar el requerimiento bien claro, ¿podrías darme un poco más de detalle? " +
        "Por ejemplo, a qué área o proceso afecta y qué resultado esperas.",
      completitud: avance(tema),
      faltantes: faltantes(tema === 0 ? 1 : tema),
      sala_sugerida: null,
      listo_para_generar: false,
      meta: { tema, repregunta: true },
    };
  }

  const siguiente = tema + 1;
  if (siguiente >= total) {
    return {
      mensaje:
        "Muchas gracias, ya tengo la información necesaria. Si quieres, puedes agregar más detalles; cuando estés " +
        "conforme, presiona «Finalizar y generar requerimiento» y lo enviaré al equipo de desarrollo.",
      completitud: 100,
      faltantes: [],
      sala_sugerida: null,
      listo_para_generar: true,
      meta: { tema: total - 1 },
    };
  }
  const intro = accion === "siguiente" ? "Perfecto, avancemos. " : "Muchas gracias, queda registrado. ";
  return {
    mensaje: intro + pregunta(m, siguiente),
    completitud: avance(siguiente),
    faltantes: faltantes(siguiente),
    sala_sugerida: null,
    listo_para_generar: false,
    meta: { tema: siguiente },
  };
}

const URGENTE = /urgent|cr[ií]tic|fiscaliz|accidente|multa|sanci[oó]n|inmediat|grave/i;

/** Requerimiento sin IA: el primer relato como título y las respuestas, en orden, como detalle. */
export function requerimientoGuiado(m: Modulo, lineas: Linea[]): Requerimiento {
  const respuestas = lineas.filter((l) => l.autor === "usuario").map((l) => l.texto.trim()).filter(Boolean);
  const todo = respuestas.join(" ");
  const primera = respuestas[0] ?? `Requerimiento para ${m.nombre}`;
  const titulo = primera.length > 80 ? `${primera.slice(0, 77).trimEnd()}…` : primera;
  return {
    titulo,
    resumen: respuestas.join("\n\n") || "Sin detalle.",
    clasificacion: /error|falla|no funciona|bug/i.test(todo) ? "error" : "mejora",
    prioridad: URGENTE.test(todo) ? "alta" : "media",
    justificacion_prioridad: URGENTE.test(todo)
      ? "La conversación menciona urgencia, fiscalización o un incidente."
      : "Prioridad por defecto (sin señales de urgencia en la conversación).",
    contexto: `Solicitud levantada en la sala ${m.nombre} (${m.area}).`,
    necesidad: primera,
    alcance: respuestas.slice(1),
    criterios_aceptacion: ["La gerencia valida que la solución responde a lo descrito en este requerimiento."],
    interesados: [],
    plazo: null,
  };
}

/** Módulos en texto, para el prompt de la IA. */
export function diccionarioModulos(): string {
  return MODULOS.map(
    (m) => `- ${m.nombre} (${m.area}) [clave: ${m.clave}]: ${m.descripcion}\n  Temas a cubrir: ${m.temas.join("; ")}.`,
  ).join("\n");
}
