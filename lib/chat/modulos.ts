// Portal gerencial (chatbot): las 7 salas, su propósito y el dominio permitido.
// Sin "server-only": lo usan también los componentes cliente (tarjetas de sala, login del portal).

export const DOMINIO_GERENCIA = "datasheq.com";
export const MENSAJE_ACCESO_DENEGADO = "Acceso denegado: Este sistema es de uso exclusivo para personal de @datasheq.com";
export const MENSAJE_SALA_OCUPADA = "El módulo se encuentra en uso por otro usuario. Por favor intenta más tarde";

export type ClaveModulo =
  | "c-legal"
  | "c-controla"
  | "c-previene"
  | "c-lidera"
  | "c-acredita"
  | "c-capacita"
  | "c-investiga";

export interface Modulo {
  clave: ClaveModulo;
  /** Nombre corto y etiqueta del Issue en GitHub, p. ej. «C-Legal». */
  nombre: string;
  area: string;
  descripcion: string;
  /** Color de la etiqueta en GitHub (hex sin #). */
  color: string;
  /** Temas que la entrevista debe cubrir (guía para la IA y guion sin IA). */
  temas: string[];
}

export const MODULOS: Modulo[] = [
  {
    clave: "c-legal",
    nombre: "C-Legal",
    area: "Cumplimiento Legal",
    descripcion:
      "Identifica la normativa aplicable a la operación, evalúa su cumplimiento artículo por artículo y genera informes en PDF.",
    color: "5b4fd6",
    temas: [
      "Qué normativa, ley o decreto está involucrado y en qué operación o faena aplica",
      "Qué se necesita: identificar normativa, evaluar cumplimiento, generar o ajustar un informe",
      "Quiénes usarán el resultado y con qué frecuencia",
      "Plazo o fiscalización que motiva la solicitud",
    ],
  },
  {
    clave: "c-controla",
    nombre: "C-Controla",
    area: "Control Documental",
    descripcion: "Controla versiones, aprobaciones y vigencias de procedimientos, registros y documentos críticos.",
    color: "1f7a8c",
    temas: [
      "Qué documentos o registros están involucrados",
      "Qué problema hay hoy con versiones, aprobaciones o vigencias",
      "Quiénes aprueban y quiénes deben ser notificados",
      "Resultado esperado y plazo",
    ],
  },
  {
    clave: "c-previene",
    nombre: "C-Previene",
    area: "Gestor Documental",
    descripcion:
      "Centraliza la documentación preventiva: matrices de riesgo, procedimientos de trabajo seguro (PTS) y planes de emergencia.",
    color: "c2410c",
    temas: [
      "Qué documentación preventiva está involucrada (matriz de riesgo, PTS, plan de emergencia)",
      "Faena, área o proceso al que aplica",
      "Qué se necesita centralizar, cambiar o agregar",
      "Quiénes deben acceder y resultado esperado",
    ],
  },
  {
    clave: "c-lidera",
    nombre: "C-Lidera",
    area: "Programas de Liderazgo",
    descripcion:
      "Planifica y da seguimiento a programas de liderazgo en seguridad: caminatas, observaciones y compromisos de la línea de mando.",
    color: "15803d",
    temas: [
      "Qué actividad de liderazgo está involucrada (caminatas, observaciones, compromisos)",
      "Quiénes de la línea de mando participan",
      "Qué se necesita planificar, medir o reportar",
      "Frecuencia, metas y plazo",
    ],
  },
  {
    clave: "c-acredita",
    nombre: "C-Acredita",
    area: "Gestión del personal",
    descripcion:
      "Gestiona la acreditación de trabajadores y contratistas: documentos, exámenes, cursos y vencimientos en un solo lugar.",
    color: "0e7490",
    temas: [
      "A quiénes aplica (trabajadores propios, contratistas, una faena)",
      "Qué requisitos de acreditación están involucrados (documentos, exámenes, cursos)",
      "Qué problema hay hoy con vencimientos o control",
      "Resultado esperado y plazo",
    ],
  },
  {
    clave: "c-capacita",
    nombre: "C-Capacita",
    area: "Gestor del conocimiento",
    descripcion:
      "Organiza capacitaciones, evaluaciones y el conocimiento de la organización, con registro de asistencia y certificados.",
    color: "a21caf",
    temas: [
      "Qué capacitación, evaluación o conocimiento está involucrado",
      "A quiénes está dirigido y cuántas personas",
      "Qué se necesita: asistencia, evaluaciones, certificados, biblioteca de conocimiento",
      "Plazo y forma de medir el resultado",
    ],
  },
  {
    clave: "c-investiga",
    nombre: "C-Investiga",
    area: "Reportabilidad e Incidentes",
    descripcion:
      "Reporta incidentes desde terreno, investiga sus causas y realiza seguimiento a las acciones correctivas.",
    color: "b91c1c",
    temas: [
      "Qué tipo de incidente o proceso de reporte está involucrado",
      "Dónde ocurre y quiénes reportan o investigan",
      "Qué se necesita: reporte en terreno, investigación de causas, seguimiento de acciones",
      "Urgencia y resultado esperado",
    ],
  },
];

export function moduloPorClave(clave: string | null | undefined): Modulo | undefined {
  return MODULOS.find((m) => m.clave === clave);
}

export function esDominioGerencia(email: string): boolean {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase() === DOMINIO_GERENCIA;
}

export type Prioridad = "critica" | "alta" | "media" | "baja";
export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { critica: "Crítica", alta: "Alta", media: "Media", baja: "Baja" };

export type Clasificacion = "nueva_funcionalidad" | "mejora" | "error" | "consulta" | "otro";
export const NOMBRE_CLASIFICACION: Record<Clasificacion, string> = {
  nueva_funcionalidad: "Nueva funcionalidad",
  mejora: "Mejora",
  error: "Error",
  consulta: "Consulta",
  otro: "Otro",
};

/** «GER-0007» */
export const codigoTicket = (n: number) => `GER-${String(n).padStart(4, "0")}`;
