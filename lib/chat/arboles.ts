// Árboles de decisión de las salas del portal gerencial (#17): la entrevista sin IA.
// BORRADOR para revisión de la gerencia de Datasheq. Documento legible: docs/arboles-de-decision.md
// (se genera con `npm run arboles:doc`). Sin "server-only": lo usan el motor, las pruebas y el generador.
//
// Cada sala: una pregunta inicial (lo que se necesita), una rama propia del módulo y un cierre común
// (tipo de solicitud, urgencia, plazo, interesados, resultado esperado y comentario final).
import type { Clasificacion, ClaveModulo, Prioridad } from "./modulos";

export type TipoNodo = "opciones" | "multiple" | "si_no" | "texto" | "fecha";

/** Dónde va la respuesta en el requerimiento (y en el Issue). */
export type Campo =
  | "necesidad"
  | "contexto"
  | "alcance"
  | "interesados"
  | "plazo"
  | "resultado"
  | "comentario"
  | "clasificacion"
  | "urgencia";

/** Marca de fin de recorrido: después de este nodo se habilita «Finalizar y generar requerimiento». */
export const FIN = "fin";

export interface Opcion {
  valor: string;
  etiqueta: string;
  /** Nodo siguiente si se elige esta opción (si falta, el `siguiente` del nodo). */
  siguiente?: string;
  /** El tema corresponde a otra sala: el asistente lo sugiere (la entrevista puede seguir aquí). */
  sala_sugerida?: ClaveModulo;
  /** Prioridad mínima que implica esta respuesta. */
  prioridad?: Prioridad;
  clasificacion?: Clasificacion;
}

export interface Nodo {
  id: string;
  pregunta: string;
  tipo: TipoNodo;
  campo: Campo;
  obligatorio: boolean;
  opciones?: Opcion[];
  /** Nodo siguiente por defecto (o FIN). */
  siguiente?: string;
  /** Texto: mínimo de caracteres; con menos, se repregunta una vez. */
  minimo?: number;
  repregunta?: string;
  /** Opciones: admite además una respuesta escrita («Otra»). */
  otra?: boolean;
}

export interface Arbol {
  modulo: ClaveModulo;
  raiz: string;
  nodos: Nodo[];
}

// ── Cierre común a todas las salas
const COMUN = "comun.tipo";

function cierreComun(): Nodo[] {
  return [
    {
      id: "comun.tipo",
      pregunta: "¿Qué tipo de solicitud es?",
      tipo: "opciones",
      campo: "clasificacion",
      obligatorio: true,
      siguiente: "comun.urgencia",
      opciones: [
        { valor: "nueva", etiqueta: "Algo nuevo que hoy no existe", clasificacion: "nueva_funcionalidad" },
        { valor: "mejora", etiqueta: "Mejorar algo que ya existe", clasificacion: "mejora" },
        { valor: "error", etiqueta: "Algo no funciona como debería", clasificacion: "error" },
        { valor: "consulta", etiqueta: "Es una consulta", clasificacion: "consulta" },
      ],
    },
    {
      id: "comun.urgencia",
      pregunta: "¿Qué tan urgente es?",
      tipo: "opciones",
      campo: "urgencia",
      obligatorio: true,
      siguiente: "comun.plazo",
      opciones: [
        { valor: "riesgo", etiqueta: "Hay riesgo para las personas", prioridad: "critica" },
        { valor: "legal", etiqueta: "Hay una fiscalización o un plazo legal próximo", prioridad: "alta" },
        { valor: "operacion", etiqueta: "Afecta el trabajo diario", prioridad: "media" },
        { valor: "deseable", etiqueta: "Es una mejora deseable, sin apuro", prioridad: "baja" },
      ],
    },
    {
      id: "comun.plazo",
      pregunta: "¿Hay una fecha límite? Si no la hay, puedes pasar a la siguiente pregunta.",
      tipo: "fecha",
      campo: "plazo",
      obligatorio: false,
      siguiente: "comun.interesados",
    },
    {
      id: "comun.interesados",
      pregunta: "¿Quiénes usarán el resultado o deben estar al tanto? (cargos, áreas o personas)",
      tipo: "texto",
      campo: "interesados",
      obligatorio: false,
      siguiente: "comun.resultado",
    },
    {
      id: "comun.resultado",
      pregunta: "¿Cómo sabremos que quedó bien? Describe el resultado que esperas.",
      tipo: "texto",
      campo: "resultado",
      obligatorio: true,
      minimo: 20,
      repregunta: "Para que el equipo pueda validarlo, ¿podrías describir un poco más qué debería poder hacerse cuando esté listo?",
      siguiente: "comun.cierre",
    },
    {
      id: "comun.cierre",
      pregunta: "¿Algo más que quieras agregar antes de generar el requerimiento?",
      tipo: "texto",
      campo: "comentario",
      obligatorio: false,
      siguiente: FIN,
    },
  ];
}

/** Pregunta inicial (responde al saludo «¿En qué te puedo colaborar hoy?»). */
function inicio(siguiente: string): Nodo {
  return {
    id: "inicio",
    pregunta: "¿En qué te puedo colaborar hoy? Cuéntame brevemente qué necesitas.",
    tipo: "texto",
    campo: "necesidad",
    obligatorio: true,
    minimo: 25,
    repregunta: "Gracias. Para dejarlo bien claro, ¿podrías darme un poco más de detalle? Por ejemplo, a qué área o proceso afecta.",
    siguiente,
  };
}

const arbol = (modulo: ClaveModulo, primero: string, rama: Nodo[]): Arbol => ({
  modulo,
  raiz: "inicio",
  nodos: [inicio(primero), ...rama, ...cierreComun()],
});

// ── C-Legal (Cumplimiento Legal)
const LEGAL = arbol("c-legal", "legal.ambito", [
  {
    id: "legal.ambito",
    pregunta: "¿Qué necesitas en materia de cumplimiento legal?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    opciones: [
      { valor: "identificar", etiqueta: "Identificar la normativa que aplica", siguiente: "legal.operacion" },
      { valor: "evaluar", etiqueta: "Evaluar el cumplimiento de una norma", siguiente: "legal.norma" },
      { valor: "informe", etiqueta: "Generar o ajustar un informe en PDF", siguiente: "legal.informe" },
      { valor: "incidente", etiqueta: "Ocurrió un incidente o accidente", sala_sugerida: "c-investiga", siguiente: "legal.norma" },
    ],
  },
  {
    id: "legal.norma",
    pregunta: "¿Qué ley, decreto o norma está involucrada? (por ejemplo, DS 594 o Ley 16.744)",
    tipo: "texto",
    campo: "contexto",
    obligatorio: true,
    minimo: 3,
    siguiente: "legal.operacion",
  },
  {
    id: "legal.informe",
    pregunta: "¿Qué necesitas del informe?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    siguiente: "legal.operacion",
    opciones: [
      { valor: "nuevo", etiqueta: "Un informe nuevo" },
      { valor: "ajuste", etiqueta: "Cambiar el formato o contenido de uno existente" },
      { valor: "periodico", etiqueta: "Recibirlo en forma periódica" },
    ],
  },
  {
    id: "legal.operacion",
    pregunta: "¿En qué faena, operación o área aplica?",
    tipo: "texto",
    campo: "contexto",
    obligatorio: true,
    minimo: 3,
    siguiente: "legal.fiscalizacion",
  },
  {
    id: "legal.fiscalizacion",
    pregunta: "¿Hay una fiscalización o auditoría programada?",
    tipo: "si_no",
    campo: "contexto",
    obligatorio: true,
    opciones: [
      { valor: "si", etiqueta: "Sí", siguiente: "legal.fiscalizacion_fecha", prioridad: "alta" },
      { valor: "no", etiqueta: "No", siguiente: COMUN },
    ],
  },
  {
    id: "legal.fiscalizacion_fecha",
    pregunta: "¿Para qué fecha está programada?",
    tipo: "fecha",
    campo: "plazo",
    obligatorio: true,
    siguiente: COMUN,
  },
]);

// ── C-Controla (Control Documental)
const CONTROLA = arbol("c-controla", "controla.documento", [
  {
    id: "controla.documento",
    pregunta: "¿Qué tipo de documentos están involucrados?",
    tipo: "multiple",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "controla.problema",
    opciones: [
      { valor: "procedimientos", etiqueta: "Procedimientos" },
      { valor: "registros", etiqueta: "Registros" },
      { valor: "instructivos", etiqueta: "Instructivos o formularios" },
      { valor: "preventivos", etiqueta: "Matrices de riesgo, PTS o planes de emergencia", sala_sugerida: "c-previene" },
    ],
  },
  {
    id: "controla.problema",
    pregunta: "¿Qué es lo que hoy no funciona bien?",
    tipo: "opciones",
    campo: "contexto",
    obligatorio: true,
    opciones: [
      { valor: "versiones", etiqueta: "El control de versiones", siguiente: "controla.versiones" },
      { valor: "aprobacion", etiqueta: "El flujo de aprobación", siguiente: "controla.aprobadores" },
      { valor: "vigencias", etiqueta: "Los vencimientos y vigencias", siguiente: "controla.vigencia" },
    ],
  },
  {
    id: "controla.versiones",
    pregunta: "¿Qué pasa hoy con las versiones? (por ejemplo, se usan copias antiguas o no se sabe cuál es la vigente)",
    tipo: "texto",
    campo: "contexto",
    obligatorio: true,
    minimo: 15,
    siguiente: "controla.notificar",
  },
  {
    id: "controla.aprobadores",
    pregunta: "¿Quiénes deben aprobar y en qué orden?",
    tipo: "texto",
    campo: "alcance",
    obligatorio: true,
    minimo: 10,
    siguiente: "controla.notificar",
  },
  {
    id: "controla.vigencia",
    pregunta: "¿Cada cuánto deben revisarse los documentos?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "controla.notificar",
    opciones: [
      { valor: "anual", etiqueta: "Una vez al año" },
      { valor: "semestral", etiqueta: "Cada seis meses" },
      { valor: "variable", etiqueta: "Depende de cada documento" },
    ],
  },
  {
    id: "controla.notificar",
    pregunta: "¿Quiénes deben recibir aviso de los cambios o vencimientos?",
    tipo: "texto",
    campo: "interesados",
    obligatorio: false,
    siguiente: COMUN,
  },
]);

// ── C-Previene (Gestor Documental)
const PREVIENE = arbol("c-previene", "previene.documento", [
  {
    id: "previene.documento",
    pregunta: "¿Qué documentación preventiva está involucrada?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "previene.faena",
    opciones: [
      { valor: "matriz", etiqueta: "Matrices de riesgo", siguiente: "previene.faena" },
      { valor: "pts", etiqueta: "Procedimientos de trabajo seguro (PTS)", siguiente: "previene.faena" },
      { valor: "emergencia", etiqueta: "Planes de emergencia", siguiente: "previene.simulacro" },
      { valor: "incidente", etiqueta: "El reporte de un incidente", sala_sugerida: "c-investiga", siguiente: "previene.faena" },
    ],
  },
  {
    id: "previene.simulacro",
    pregunta: "¿También se necesita registrar los simulacros de emergencia?",
    tipo: "si_no",
    campo: "alcance",
    obligatorio: true,
    siguiente: "previene.faena",
    opciones: [
      { valor: "si", etiqueta: "Sí" },
      { valor: "no", etiqueta: "No" },
    ],
  },
  {
    id: "previene.faena",
    pregunta: "¿A qué faenas, áreas o procesos aplica?",
    tipo: "texto",
    campo: "contexto",
    obligatorio: true,
    minimo: 3,
    siguiente: "previene.accion",
  },
  {
    id: "previene.accion",
    pregunta: "¿Qué se necesita hacer con esa documentación?",
    tipo: "multiple",
    campo: "alcance",
    obligatorio: true,
    siguiente: "previene.acceso",
    opciones: [
      { valor: "centralizar", etiqueta: "Centralizar lo que hoy está disperso" },
      { valor: "actualizar", etiqueta: "Crear o actualizar contenido" },
      { valor: "lectura", etiqueta: "Controlar que los trabajadores la lean" },
    ],
  },
  {
    id: "previene.acceso",
    pregunta: "¿Quiénes deben poder consultarla? (por ejemplo, prevencionistas, supervisores, trabajadores)",
    tipo: "texto",
    campo: "interesados",
    obligatorio: false,
    siguiente: COMUN,
  },
]);

// ── C-Lidera (Programas de Liderazgo)
const LIDERA = arbol("c-lidera", "lidera.actividad", [
  {
    id: "lidera.actividad",
    pregunta: "¿Qué actividad de liderazgo en seguridad está involucrada?",
    tipo: "multiple",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "lidera.participantes",
    opciones: [
      { valor: "caminatas", etiqueta: "Caminatas de seguridad" },
      { valor: "observaciones", etiqueta: "Observaciones de conducta" },
      { valor: "compromisos", etiqueta: "Compromisos de la línea de mando" },
      { valor: "formacion", etiqueta: "Formación de los líderes", sala_sugerida: "c-capacita" },
    ],
  },
  {
    id: "lidera.participantes",
    pregunta: "¿Qué cargos de la línea de mando participan?",
    tipo: "texto",
    campo: "interesados",
    obligatorio: true,
    minimo: 5,
    siguiente: "lidera.necesidad",
  },
  {
    id: "lidera.necesidad",
    pregunta: "¿Qué necesitas resolver?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    opciones: [
      { valor: "planificar", etiqueta: "Planificar el calendario de actividades", siguiente: "lidera.frecuencia" },
      { valor: "terreno", etiqueta: "Registrarlas en terreno desde el celular", siguiente: "lidera.sin_conexion" },
      { valor: "medir", etiqueta: "Medir el cumplimiento y reportarlo", siguiente: "lidera.metas" },
    ],
  },
  {
    id: "lidera.frecuencia",
    pregunta: "¿Con qué frecuencia deben realizarse?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "lidera.metas",
    opciones: [
      { valor: "semanal", etiqueta: "Semanal" },
      { valor: "mensual", etiqueta: "Mensual" },
      { valor: "trimestral", etiqueta: "Trimestral" },
    ],
  },
  {
    id: "lidera.sin_conexion",
    pregunta: "¿Se necesita registrar sin conexión a internet?",
    tipo: "si_no",
    campo: "alcance",
    obligatorio: true,
    siguiente: "lidera.metas",
    opciones: [
      { valor: "si", etiqueta: "Sí" },
      { valor: "no", etiqueta: "No" },
    ],
  },
  {
    id: "lidera.metas",
    pregunta: "¿Hay metas de cumplimiento? (por ejemplo, 4 caminatas al mes por gerente)",
    tipo: "texto",
    campo: "resultado",
    obligatorio: false,
    siguiente: COMUN,
  },
]);

// ── C-Acredita (Gestión del personal)
const ACREDITA = arbol("c-acredita", "acredita.quienes", [
  {
    id: "acredita.quienes",
    pregunta: "¿A quiénes aplica la acreditación?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    opciones: [
      { valor: "propios", etiqueta: "Trabajadores propios", siguiente: "acredita.requisito" },
      { valor: "contratistas", etiqueta: "Contratistas", siguiente: "acredita.empresas" },
      { valor: "ambos", etiqueta: "Ambos", siguiente: "acredita.empresas" },
    ],
  },
  {
    id: "acredita.empresas",
    pregunta: "¿Cuántas empresas contratistas y cuántas personas, aproximadamente?",
    tipo: "texto",
    campo: "contexto",
    obligatorio: false,
    siguiente: "acredita.requisito",
  },
  {
    id: "acredita.requisito",
    pregunta: "¿Qué requisitos de acreditación están involucrados?",
    tipo: "multiple",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "acredita.problema",
    opciones: [
      { valor: "documentos", etiqueta: "Documentos (contrato, seguros, etc.)" },
      { valor: "examenes", etiqueta: "Exámenes ocupacionales" },
      { valor: "cursos", etiqueta: "Cursos obligatorios" },
      { valor: "capacitacion", etiqueta: "Organizar la capacitación en sí", sala_sugerida: "c-capacita" },
    ],
  },
  {
    id: "acredita.problema",
    pregunta: "¿Cuál es el problema principal hoy?",
    tipo: "opciones",
    campo: "contexto",
    obligatorio: true,
    opciones: [
      { valor: "vencimientos", etiqueta: "Se vencen sin aviso", siguiente: "acredita.anticipacion" },
      { valor: "planillas", etiqueta: "Se controla en planillas", siguiente: COMUN },
      { valor: "ingreso", etiqueta: "Entran a faena personas con requisitos vencidos", siguiente: "acredita.bloqueo", prioridad: "alta" },
    ],
  },
  {
    id: "acredita.anticipacion",
    pregunta: "¿Con cuánta anticipación se debe avisar antes de un vencimiento?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: COMUN,
    opciones: [
      { valor: "7", etiqueta: "7 días" },
      { valor: "15", etiqueta: "15 días" },
      { valor: "30", etiqueta: "30 días" },
    ],
  },
  {
    id: "acredita.bloqueo",
    pregunta: "¿Se debe bloquear el ingreso a faena si un requisito está vencido?",
    tipo: "si_no",
    campo: "alcance",
    obligatorio: true,
    siguiente: COMUN,
    opciones: [
      { valor: "si", etiqueta: "Sí" },
      { valor: "no", etiqueta: "No, solo avisar" },
    ],
  },
]);

// ── C-Capacita (Gestor del conocimiento)
const CAPACITA = arbol("c-capacita", "capacita.necesidad", [
  {
    id: "capacita.necesidad",
    pregunta: "¿Qué necesitas en capacitación y conocimiento?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    opciones: [
      { valor: "programar", etiqueta: "Programar capacitaciones", siguiente: "capacita.publico" },
      { valor: "evaluar", etiqueta: "Evaluar lo aprendido", siguiente: "capacita.evaluacion" },
      { valor: "certificados", etiqueta: "Emitir certificados", siguiente: "capacita.certificado" },
      { valor: "biblioteca", etiqueta: "Ordenar el conocimiento de la organización", siguiente: "capacita.publico" },
      { valor: "acreditacion", etiqueta: "Cursos exigidos para acreditar contratistas", sala_sugerida: "c-acredita", siguiente: "capacita.publico" },
    ],
  },
  {
    id: "capacita.evaluacion",
    pregunta: "¿Cómo se debe evaluar?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "capacita.publico",
    opciones: [
      { valor: "prueba", etiqueta: "Una prueba al final" },
      { valor: "nota", etiqueta: "Con nota mínima para aprobar" },
      { valor: "practica", etiqueta: "Evaluación práctica en terreno" },
    ],
  },
  {
    id: "capacita.certificado",
    pregunta: "¿El certificado debe emitirse automáticamente al aprobar?",
    tipo: "si_no",
    campo: "alcance",
    obligatorio: true,
    siguiente: "capacita.publico",
    opciones: [
      { valor: "si", etiqueta: "Sí" },
      { valor: "no", etiqueta: "No, lo aprueba alguien antes" },
    ],
  },
  {
    id: "capacita.publico",
    pregunta: "¿A quiénes está dirigido y cuántas personas, aproximadamente?",
    tipo: "texto",
    campo: "interesados",
    obligatorio: true,
    minimo: 5,
    siguiente: "capacita.asistencia",
  },
  {
    id: "capacita.asistencia",
    pregunta: "¿Cómo se registra hoy la asistencia?",
    tipo: "opciones",
    campo: "contexto",
    obligatorio: false,
    siguiente: COMUN,
    opciones: [
      { valor: "papel", etiqueta: "Firma en papel" },
      { valor: "digital", etiqueta: "Registro digital" },
      { valor: "no", etiqueta: "No se registra" },
    ],
  },
]);

// ── C-Investiga (Reportabilidad e Incidentes)
const INVESTIGA = arbol("c-investiga", "investiga.necesidad", [
  {
    id: "investiga.necesidad",
    pregunta: "¿En qué parte del proceso de incidentes necesitas apoyo?",
    tipo: "opciones",
    campo: "alcance",
    obligatorio: true,
    opciones: [
      { valor: "reporte", etiqueta: "Reportar desde terreno", siguiente: "investiga.terreno" },
      { valor: "causas", etiqueta: "Investigar las causas", siguiente: "investiga.metodo" },
      { valor: "acciones", etiqueta: "Seguir las acciones correctivas", siguiente: "investiga.acciones" },
      { valor: "legal", etiqueta: "Evaluar el cumplimiento legal tras un incidente", sala_sugerida: "c-legal", siguiente: "investiga.tipo" },
    ],
  },
  {
    id: "investiga.terreno",
    pregunta: "¿Qué debe permitir el reporte en terreno?",
    tipo: "multiple",
    campo: "alcance",
    obligatorio: true,
    otra: true,
    siguiente: "investiga.tipo",
    opciones: [
      { valor: "fotos", etiqueta: "Adjuntar fotos" },
      { valor: "sin_conexion", etiqueta: "Funcionar sin conexión" },
      { valor: "ubicacion", etiqueta: "Registrar la ubicación" },
    ],
  },
  {
    id: "investiga.metodo",
    pregunta: "¿Qué método de investigación usan?",
    tipo: "opciones",
    campo: "contexto",
    obligatorio: true,
    otra: true,
    siguiente: "investiga.tipo",
    opciones: [
      { valor: "arbol", etiqueta: "Árbol de causas" },
      { valor: "porques", etiqueta: "5 porqués" },
      { valor: "icam", etiqueta: "ICAM" },
    ],
  },
  {
    id: "investiga.acciones",
    pregunta: "¿Cada acción correctiva debe tener responsable, plazo y aviso de vencimiento?",
    tipo: "si_no",
    campo: "alcance",
    obligatorio: true,
    siguiente: "investiga.tipo",
    opciones: [
      { valor: "si", etiqueta: "Sí" },
      { valor: "no", etiqueta: "No" },
    ],
  },
  {
    id: "investiga.tipo",
    pregunta: "¿Qué tipo de eventos abarca?",
    tipo: "multiple",
    campo: "contexto",
    obligatorio: true,
    siguiente: COMUN,
    opciones: [
      { valor: "accidentes", etiqueta: "Accidentes con lesión", prioridad: "alta" },
      { valor: "incidentes", etiqueta: "Incidentes sin lesión" },
      { valor: "cuasi", etiqueta: "Cuasi accidentes" },
    ],
  },
]);

export const ARBOLES: Arbol[] = [LEGAL, CONTROLA, PREVIENE, LIDERA, ACREDITA, CAPACITA, INVESTIGA];

export function arbolDe(modulo: string): Arbol | undefined {
  return ARBOLES.find((a) => a.modulo === modulo);
}

// ── Validación (la usan las pruebas; un árbol inválido no debe llegar a producción)
export const MAX_PREGUNTAS = 12;

/** Destinos posibles desde un nodo: el de cada opción (o el del nodo) y, sin opciones o con «Otra», el del nodo. */
export function salidas(n: Nodo): string[] {
  const d = new Set<string>();
  for (const o of n.opciones ?? []) {
    const s = o.siguiente ?? n.siguiente;
    if (s) d.add(s);
  }
  if ((!n.opciones?.length || n.otra) && n.siguiente) d.add(n.siguiente);
  return [...d];
}

/** Errores del árbol (vacío si es válido). */
export function validarArbol(a: Arbol): string[] {
  const e: string[] = [];
  const porId = new Map<string, Nodo>();
  for (const n of a.nodos) {
    if (porId.has(n.id)) e.push(`id repetido: ${n.id}`);
    porId.set(n.id, n);
  }
  if (!porId.has(a.raiz)) e.push(`raíz inexistente: ${a.raiz}`);
  for (const n of a.nodos) {
    const conOpciones = n.tipo === "opciones" || n.tipo === "multiple" || n.tipo === "si_no";
    if (conOpciones && !n.opciones?.length) e.push(`${n.id}: sin opciones`);
    if (!conOpciones && n.opciones?.length) e.push(`${n.id}: un nodo de ${n.tipo} no lleva opciones`);
    if (n.tipo === "multiple" && n.opciones?.some((o) => o.siguiente)) e.push(`${n.id}: en selección múltiple la rama es del nodo, no de cada opción`);
    if (n.opciones?.some((o) => !o.siguiente) && !n.siguiente) e.push(`${n.id}: una opción no tiene destino`);
    if (!n.opciones && !n.siguiente) e.push(`${n.id}: sin destino`);
    if (n.otra && !n.siguiente) e.push(`${n.id}: la respuesta escrita («Otra») necesita un destino por defecto`);
    if (!n.obligatorio && !n.siguiente) e.push(`${n.id}: una pregunta opcional necesita un destino por defecto (para saltarla)`);
    for (const o of n.opciones ?? []) if (o.sala_sugerida === a.modulo) e.push(`${n.id}: sugiere su propia sala`);
    const valores = (n.opciones ?? []).map((o) => o.valor);
    if (new Set(valores).size !== valores.length) e.push(`${n.id}: valores de opción repetidos`);
    for (const s of salidas(n)) if (s !== FIN && !porId.has(s)) e.push(`${n.id}: destino inexistente ${s}`);
    if (n.minimo !== undefined && n.tipo !== "texto") e.push(`${n.id}: mínimo de caracteres solo en texto`);
  }
  if (e.length) return e;

  // Recorridos: sin ciclos, todo nodo alcanzable, todo recorrido termina en FIN y no excede MAX_PREGUNTAS
  const alcanzados = new Set<string>();
  let maxLargo = 0;
  const recorrer = (id: string, camino: string[]) => {
    if (id === FIN) {
      maxLargo = Math.max(maxLargo, camino.length);
      return;
    }
    if (camino.includes(id)) {
      e.push(`ciclo: ${[...camino, id].join(" → ")}`);
      return;
    }
    alcanzados.add(id);
    for (const s of salidas(porId.get(id) as Nodo)) recorrer(s, [...camino, id]);
  };
  recorrer(a.raiz, []);
  for (const n of a.nodos) if (!alcanzados.has(n.id)) e.push(`${n.id}: no se alcanza desde la raíz`);
  if (maxLargo > MAX_PREGUNTAS) e.push(`el recorrido más largo tiene ${maxLargo} preguntas (máximo ${MAX_PREGUNTAS})`);
  if (!a.nodos.some((n) => new Set((n.opciones ?? []).map((o) => o.siguiente).filter(Boolean)).size > 1)) {
    e.push("no tiene ninguna rama condicional");
  }
  return e;
}

/** Largo (en preguntas) del recorrido más corto y del más largo. */
export function largos(a: Arbol): { min: number; max: number } {
  const porId = new Map(a.nodos.map((n) => [n.id, n]));
  let min = Infinity;
  let max = 0;
  const recorrer = (id: string, largo: number) => {
    if (id === FIN) {
      min = Math.min(min, largo);
      max = Math.max(max, largo);
      return;
    }
    for (const s of salidas(porId.get(id) as Nodo)) recorrer(s, largo + 1);
  };
  recorrer(a.raiz, 0);
  return { min, max };
}
