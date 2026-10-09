// Motor de la entrevista guiada por árbol de decisión (#17): sin IA. Avanza por los nodos de lib/chat/arboles.ts
// según las respuestas, repregunta textos breves, salta preguntas opcionales y arma el requerimiento con reglas
// fijas. El estado vive en los mensajes (meta_json): el robot guarda el nodo en curso y la persona, a qué nodo
// respondió y qué opciones eligió. Sin "server-only": lo prueba scripts/test-logica.ts.
import { esFechaValida } from "../tiempo";
import { type Arbol, FIN, type Nodo, salidas } from "./arboles";
import {
  type Clasificacion,
  type ClaveModulo,
  type Modulo,
  NOMBRE_PRIORIDAD,
  type Prioridad,
  moduloPorClave,
} from "./modulos";
import type { Autor } from "./salas";

export type Accion = "mensaje" | "siguiente" | "mas_detalles";

export interface Linea {
  autor: Autor;
  texto: string;
  meta?: Record<string, unknown> | null;
}

export interface Entrada {
  accion: Accion;
  texto?: string;
  /** Valores de las opciones elegidas (botones de respuesta). */
  valores?: string[];
}

export interface TurnoRobot {
  mensaje: string;
  /** 0 a 100: preguntas obligatorias respondidas sobre las del recorrido. */
  completitud: number;
  faltantes: string[];
  /** Otra sala, si una respuesta indica que el tema corresponde a otro módulo. */
  sala_sugerida: ClaveModulo | null;
  listo_para_generar: boolean;
}

export interface ResultadoTurno extends TurnoRobot {
  /** Meta del mensaje del robot (estado del flujo). */
  meta: Record<string, unknown>;
  /** Lo que se guarda como mensaje de la persona (null para los botones de control). */
  usuario: { texto: string; meta: Record<string, unknown> } | null;
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

/** Pregunta del nodo en curso para la interfaz (botones de respuesta). */
export interface PreguntaVista {
  id: string;
  tipo: Nodo["tipo"];
  obligatorio: boolean;
  otra: boolean;
  opciones: { valor: string; etiqueta: string }[];
}

interface RespuestaNodo {
  valores: string[];
  textos: string[];
}

interface Estado {
  /** Nodo en curso (o FIN). */
  nodo: string;
  repreguntado: boolean;
  /** «Agregar más detalles»: el próximo texto se suma a la respuesta de este nodo. */
  ampliar: string | null;
  respuestas: Map<string, RespuestaNodo>;
  /** Nodos respondidos, en orden. */
  orden: string[];
}

const RANGO: Record<Prioridad, number> = { baja: 0, media: 1, alta: 2, critica: 3 };
const ACUSES = ["Gracias.", "Perfecto.", "Entendido.", "Muy bien.", "Anotado."];
const FINAL =
  "Muchas gracias, ya tengo la información necesaria. Cuando estés conforme, presiona «Finalizar y generar requerimiento» y lo enviaré al equipo de desarrollo. Si quieres agregar algo más, escríbelo y lo sumaré.";

const indice = (a: Arbol) => new Map(a.nodos.map((n) => [n.id, n]));

/** Reconstruye el estado del flujo a partir de los mensajes. */
export function estadoFlujo(a: Arbol, lineas: Linea[]): Estado {
  const ultimo = [...lineas].reverse().find((l) => l.autor === "robot" && typeof l.meta?.nodo === "string");
  const respuestas = new Map<string, RespuestaNodo>();
  const orden: string[] = [];
  for (const l of lineas) {
    if (l.autor !== "usuario" || typeof l.meta?.nodo !== "string" || l.meta.invalida) continue;
    const id = l.meta.nodo;
    const r = respuestas.get(id) ?? { valores: [], textos: [] };
    const valores = Array.isArray(l.meta.valores) ? (l.meta.valores as string[]) : [];
    r.valores.push(...valores);
    const libre = typeof l.meta.libre === "string" ? l.meta.libre : valores.length ? "" : l.texto;
    if (libre) r.textos.push(libre);
    if (!respuestas.has(id) && id !== FIN) orden.push(id);
    respuestas.set(id, r);
  }
  return {
    nodo: (ultimo?.meta?.nodo as string) ?? a.raiz,
    repreguntado: ultimo?.meta?.repregunta === true,
    ampliar: typeof ultimo?.meta?.ampliar === "string" ? (ultimo.meta.ampliar as string) : null,
    respuestas,
    orden,
  };
}

/** Pregunta en curso para la interfaz; null al final del recorrido o mientras se amplía una respuesta. */
export function preguntaActual(a: Arbol, lineas: Linea[]): PreguntaVista | null {
  const e = estadoFlujo(a, lineas);
  const n = indice(a).get(e.nodo);
  if (!n || e.ampliar) return null;
  return {
    id: n.id,
    tipo: n.tipo,
    obligatorio: n.obligatorio,
    otra: !!n.otra,
    opciones: (n.opciones ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
  };
}

/** Preguntas obligatorias del camino más corto desde `id` hasta el final. */
function obligatoriasRestantes(a: Arbol, id: string): Nodo[] {
  const porId = indice(a);
  const memo = new Map<string, Nodo[]>();
  const camino = (x: string): Nodo[] => {
    if (x === FIN) return [];
    const guardado = memo.get(x);
    if (guardado) return guardado;
    const n = porId.get(x) as Nodo;
    let mejor: Nodo[] | null = null;
    for (const s of salidas(n)) {
      const c = camino(s);
      if (!mejor || c.length < mejor.length) mejor = c;
    }
    const r = [...(n.obligatorio ? [n] : []), ...(mejor ?? [])];
    memo.set(x, r);
    return r;
  };
  return camino(id);
}

/** «¿Qué ley…? (por ejemplo, DS 594)» → «Qué ley…»: la primera pregunta, sin ejemplos, para listas y el requerimiento. */
const resumen = (p: string) =>
  p.split("?")[0].replace(/\s*\([^)]*\)/g, "").replace(/^¿/, "").replace(/\.$/, "").trim();

function avance(a: Arbol, respondidos: Set<string>, destino: string) {
  const porId = indice(a);
  const hechas = [...respondidos].filter((id) => porId.get(id)?.obligatorio).length;
  const faltan = obligatoriasRestantes(a, destino);
  const total = hechas + faltan.length;
  return {
    completitud: destino === FIN || total === 0 ? 100 : Math.round((hechas / total) * 100),
    faltantes: faltan.slice(0, 6).map((n) => resumen(n.pregunta)),
  };
}

/** Siguiente turno del robot. Lanza Error con un mensaje para la persona si la entrada no es válida. */
export function avanzar(a: Arbol, lineas: Linea[], entrada: Entrada): ResultadoTurno {
  const porId = indice(a);
  const e = estadoFlujo(a, lineas);
  const n = porId.get(e.nodo) ?? null; // null = al final del recorrido
  const respondidos = new Set(e.orden);
  const acuse = ACUSES[e.orden.length % ACUSES.length];

  const quedarse = (mensaje: string, usuario: ResultadoTurno["usuario"], extra: Record<string, unknown> = {}): ResultadoTurno => {
    const av = avance(a, respondidos, e.nodo);
    return {
      mensaje,
      ...av,
      sala_sugerida: null,
      listo_para_generar: e.nodo === FIN,
      meta: { nodo: e.nodo, ...extra },
      usuario,
    };
  };

  const ir = (destino: string, prefijo: string, usuario: ResultadoTurno["usuario"], sala: ClaveModulo | null): ResultadoTurno => {
    if (usuario?.meta.nodo && !usuario.meta.invalida) respondidos.add(usuario.meta.nodo as string);
    const av = avance(a, respondidos, destino);
    const m = sala ? moduloPorClave(sala) : null;
    const sugerencia = m
      ? `Este tema también podría corresponder a la sala ${m.nombre} (${m.area}). Si prefieres, puedes ir allá con el botón de abajo; si no, seguimos aquí. `
      : "";
    const siguiente = destino === FIN ? FINAL : (porId.get(destino) as Nodo).pregunta;
    return {
      mensaje: `${prefijo} ${sugerencia}${siguiente}`.trim(),
      ...av,
      sala_sugerida: sala,
      listo_para_generar: destino === FIN,
      meta: { nodo: destino },
      usuario,
    };
  };

  if (entrada.accion === "mas_detalles") {
    const objetivo = e.orden.at(-1) ?? (n ? n.id : null);
    const sobre = objetivo && porId.get(objetivo) ? `«${resumen((porId.get(objetivo) as Nodo).pregunta)}»` : "tu solicitud";
    return quedarse(`Por supuesto. Cuéntame qué quieres agregar sobre ${sobre}; lo sumaré a tu respuesta.`, null, {
      ampliar: objetivo ?? FIN,
    });
  }

  if (entrada.accion === "siguiente") {
    if (!n) return quedarse(FINAL, null);
    if (n.obligatorio) {
      return quedarse(`Esta pregunta es necesaria para el requerimiento, así que no la puedo saltar. ${n.pregunta}`, null);
    }
    return ir(n.siguiente as string, "Perfecto, avancemos.", null, null);
  }

  // ── Respuesta de la persona
  const texto = (entrada.texto ?? "").trim();
  const valores = [...new Set(entrada.valores ?? [])];

  if (e.ampliar) {
    if (!texto) throw new Error("Escribe lo que quieres agregar.");
    const usuario = { texto, meta: { nodo: e.ampliar, ampliacion: true } };
    const volver = n ? `Volviendo a la pregunta: ${n.pregunta}` : "Cuando quieras, presiona «Finalizar y generar requerimiento».";
    return quedarse(`Gracias, lo agregué. ${volver}`, usuario);
  }

  if (!n) {
    if (!texto) throw new Error("Escribe lo que quieres agregar.");
    return quedarse("Lo agregué al requerimiento. Cuando quieras, presiona «Finalizar y generar requerimiento».", {
      texto,
      meta: { nodo: FIN, ampliacion: true },
    });
  }

  const invalida = (mensaje: string) => quedarse(mensaje, texto ? { texto, meta: { nodo: n.id, invalida: true } } : null);
  // Botones de una pregunta anterior (pantalla desactualizada): se rechazan en vez de ignorarlos
  if (valores.length && !n.opciones?.length) throw new Error("Esa opción no corresponde a esta pregunta.");

  if (n.tipo === "texto") {
    if (!texto) throw new Error("Escribe tu respuesta.");
    const usuario = { texto, meta: { nodo: n.id } };
    if (n.minimo && texto.length < n.minimo && !e.repreguntado) {
      respondidos.add(n.id);
      return quedarse(n.repregunta ?? "¿Podrías darme un poco más de detalle?", usuario, { repregunta: true });
    }
    return ir(n.siguiente as string, acuse, usuario, null);
  }

  if (n.tipo === "fecha") {
    if (!esFechaValida(texto)) return invalida("Indica la fecha con el selector de fecha, por favor.");
    return ir(n.siguiente as string, acuse, { texto: fechaLegible(texto), meta: { nodo: n.id, libre: texto } }, null);
  }

  // Opciones (una o varias), sí/no
  const opciones = n.opciones ?? [];
  const elegidas = valores.map((v) => opciones.find((o) => o.valor === v));
  if (elegidas.some((o) => !o)) throw new Error("Esa opción no corresponde a esta pregunta.");
  const ok = elegidas as NonNullable<(typeof elegidas)[number]>[];
  const libre = n.otra ? texto : "";
  const varias = n.tipo === "multiple";
  if ((!varias && ok.length > 1) || (ok.length === 0 && !libre)) {
    return invalida(
      varias
        ? `Elige una o más opciones${n.otra ? " o escribe otra respuesta" : ""}, por favor.`
        : `Elige una de las opciones${n.otra ? " o escribe otra respuesta" : ""}, por favor.`,
    );
  }
  if (!varias && ok.length === 1 && libre) {
    return invalida("Elige una opción o escribe otra respuesta, pero no ambas.");
  }
  const etiquetas = [...ok.map((o) => o.etiqueta), ...(libre ? [libre] : [])];
  const usuario = { texto: etiquetas.join(", "), meta: { nodo: n.id, valores: ok.map((o) => o.valor), ...(libre ? { libre } : {}) } };
  const destino = !varias && ok[0]?.siguiente ? ok[0].siguiente : (n.siguiente as string);
  const sala = ok.find((o) => o.sala_sugerida)?.sala_sugerida ?? null;
  return ir(destino, acuse, usuario, sala);
}

const fmtFecha = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-12-15" → "15 de diciembre de 2026" */
const fechaLegible = (f: string) => fmtFecha.format(new Date(`${f}T12:00:00Z`));

/** Requerimiento armado con reglas fijas a partir de las respuestas del recorrido. */
export function requerimientoDesdeFlujo(a: Arbol, m: Modulo, lineas: Linea[]): Requerimiento {
  const porId = indice(a);
  const e = estadoFlujo(a, lineas);
  const respuestaDe = (id: string): string => {
    const r = e.respuestas.get(id);
    if (!r) return "";
    const n = porId.get(id);
    const etiquetas = r.valores.map((v) => n?.opciones?.find((o) => o.valor === v)?.etiqueta ?? v);
    const textos = n?.tipo === "fecha" ? r.textos.filter(esFechaValida).map(fechaLegible) : r.textos;
    return [...etiquetas, ...textos].join(". ").trim();
  };
  const porCampo = (campo: Nodo["campo"]) =>
    e.orden
      .map((id) => porId.get(id))
      .filter((n): n is Nodo => !!n && n.campo === campo)
      .map((n) => ({ n, r: respuestaDe(n.id) }))
      .filter((x) => x.r);
  const pr = (x: { n: Nodo; r: string }) => `${resumen(x.n.pregunta)}: ${x.r}`;

  const primeraLinea = lineas.find((l) => l.autor === "usuario")?.texto ?? "";
  const necesidad = porCampo("necesidad").map((x) => x.r).join(". ") || primeraLinea || `Requerimiento para ${m.nombre}`;
  const oracion = necesidad.split(/(?<=[.!?])\s|\n/)[0].trim().replace(/[.!]+$/, "");
  const titulo = oracion.length > 80 ? `${oracion.slice(0, 79).trimEnd()}…` : oracion;

  // Clasificación: la que elige la persona; prioridad: la urgencia indicada, subida por los mínimos de otras respuestas
  let clasificacion: Clasificacion = "mejora";
  let prioridad: Prioridad | null = null;
  let urgencia = "";
  const minimos: string[] = [];
  for (const id of e.orden) {
    const n = porId.get(id);
    const r = e.respuestas.get(id);
    if (!n || !r) continue;
    for (const v of r.valores) {
      const o = n.opciones?.find((x) => x.valor === v);
      if (!o) continue;
      if (o.clasificacion) clasificacion = o.clasificacion;
      if (!o.prioridad) continue;
      if (n.campo === "urgencia") urgencia = o.etiqueta;
      else minimos.push(`«${resumen(n.pregunta)}: ${o.etiqueta}» fija una prioridad mínima ${NOMBRE_PRIORIDAD[o.prioridad].toLowerCase()}`);
      if (!prioridad || RANGO[o.prioridad] > RANGO[prioridad]) prioridad = o.prioridad;
    }
  }
  const justificacion =
    [urgencia ? `Urgencia indicada: «${urgencia}».` : "Sin urgencia indicada: prioridad media por defecto.", ...minimos.map((x) => `Además, ${x}.`)]
      .join(" ");

  const resultado = porCampo("resultado").map((x) => x.r);
  const comentarios = [...porCampo("comentario").map((x) => x.r), ...(e.respuestas.get(FIN)?.textos ?? [])];
  const plazos = porCampo("plazo")
    .flatMap((x) => e.respuestas.get(x.n.id)?.textos ?? [])
    .filter(esFechaValida)
    .sort();
  return {
    titulo,
    resumen: [necesidad, ...(resultado.length ? [`Resultado esperado: ${resultado.join(". ")}`] : [])].join("\n\n"),
    clasificacion,
    prioridad: prioridad ?? "media",
    justificacion_prioridad: justificacion,
    contexto: [
      `Solicitud levantada en la sala ${m.nombre} (${m.area}).`,
      ...porCampo("contexto").map(pr),
      ...(comentarios.length ? [`Comentario adicional: ${comentarios.join(". ")}`] : []),
    ].join("\n"),
    necesidad,
    alcance: porCampo("alcance").map(pr),
    criterios_aceptacion: [
      ...resultado,
      "La gerencia valida que la solución responde a lo descrito en este requerimiento.",
    ],
    interesados: porCampo("interesados").map((x) => x.r),
    plazo: plazos.length ? fechaLegible(plazos[0]) : null,
  };
}
