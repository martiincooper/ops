// Portal gerencial: las 7 salas (lista fija hasta el ticket de salas administradas) y el dominio permitido.
// Sin "server-only": lo usan también los componentes cliente (tarjetas de sala, login del portal).

export const EMPRESA_GERENCIA = "datasheq";
export const MENSAJE_ACCESO_DENEGADO = "El portal gerencial es solo para gerencia de Datasheq";

/** Clave de una sala: texto simple (la lista de salas vendrá de la base de datos). */
export type ClaveModulo = string;

export interface Modulo {
  clave: ClaveModulo;
  /** Nombre corto y etiqueta del Issue en GitHub, p. ej. «C-Legal». */
  nombre: string;
  area: string;
  descripcion: string;
  /** Color de la etiqueta en GitHub (hex sin #). */
  color: string;
}

export const MODULOS: Modulo[] = [
  {
    clave: "c-legal",
    nombre: "C-Legal",
    area: "Cumplimiento Legal",
    descripcion:
      "Identifica la normativa aplicable a la operación, evalúa su cumplimiento artículo por artículo y genera informes en PDF.",
    color: "5b4fd6",
  },
  {
    clave: "c-controla",
    nombre: "C-Controla",
    area: "Control Documental",
    descripcion: "Controla versiones, aprobaciones y vigencias de procedimientos, registros y documentos críticos.",
    color: "1f7a8c",
  },
  {
    clave: "c-previene",
    nombre: "C-Previene",
    area: "Gestor Documental",
    descripcion:
      "Centraliza la documentación preventiva: matrices de riesgo, procedimientos de trabajo seguro (PTS) y planes de emergencia.",
    color: "c2410c",
  },
  {
    clave: "c-lidera",
    nombre: "C-Lidera",
    area: "Programas de Liderazgo",
    descripcion:
      "Planifica y da seguimiento a programas de liderazgo en seguridad: caminatas, observaciones y compromisos de la línea de mando.",
    color: "15803d",
  },
  {
    clave: "c-acredita",
    nombre: "C-Acredita",
    area: "Gestión del personal",
    descripcion:
      "Gestiona la acreditación de trabajadores y contratistas: documentos, exámenes, cursos y vencimientos en un solo lugar.",
    color: "0e7490",
  },
  {
    clave: "c-capacita",
    nombre: "C-Capacita",
    area: "Gestor del conocimiento",
    descripcion:
      "Organiza capacitaciones, evaluaciones y el conocimiento de la organización, con registro de asistencia y certificados.",
    color: "a21caf",
  },
  {
    clave: "c-investiga",
    nombre: "C-Investiga",
    area: "Reportabilidad e Incidentes",
    descripcion:
      "Reporta incidentes desde terreno, investiga sus causas y realiza seguimiento a las acciones correctivas.",
    color: "b91c1c",
  },
];

export function moduloPorClave(clave: string | null | undefined): Modulo | undefined {
  return MODULOS.find((m) => m.clave === clave);
}

/** Portal gerencial: gerentes (executive) de la empresa Datasheq, o cualquier administrador (sin empresa, cualquier dominio). */
export function puedeUsarPortal(u: { rol: string; empresa: string | null }): boolean {
  return u.rol === "admin" || (u.rol === "executive" && u.empresa === EMPRESA_GERENCIA);
}

/** Panel del portal en /admin: cualquier administrador. */
export function puedeAdministrarPortal(u: { rol: string }): boolean {
  return u.rol === "admin";
}

/** «GER-0007» */
export const codigoTicket = (n: number) => `GER-${String(n).padStart(4, "0")}`;
