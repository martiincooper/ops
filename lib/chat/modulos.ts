// Portal gerencial: el modelo de una sala (los datos viven en la tabla chat_modulos; ver ./catalogo) y quién puede usarlo.
// Sin "server-only": lo usan también los componentes cliente (tarjetas de sala, login del portal).

export const EMPRESA_GERENCIA = "datasheq";
export const MENSAJE_ACCESO_DENEGADO = "El portal gerencial es solo para gerencia de Datasheq";

/** Clave de una sala: el «slug» de su nombre al crearla; nunca cambia. */
export type ClaveModulo = string;

export interface Modulo {
  clave: ClaveModulo;
  /** Nombre corto y etiqueta del Issue en GitHub, p. ej. «C-Legal». */
  nombre: string;
  area: string;
  descripcion: string;
  /** Color de la etiqueta en GitHub (hex sin #). */
  color: string;
  orden: number;
  /** dueño/repositorio; null: sin repositorio. */
  repo: string | null;
  repo_verificado_en: string | null;
  autonomia: Autonomia;
  archivado: boolean;
  /** propuesto: sala creada por gerentes, abierta sin repositorio; activo: sala normal (necesita repositorio verificado). */
  estado_modulo: EstadoModulo;
  /** Email de quien creó la sala (null: la creó el administrador). */
  creado_por: string | null;
}

export type EstadoModulo = "propuesto" | "activo";

export type Autonomia = "revisar" | "automatico";

/**
 * Una sala activa se abre solo con un repositorio verificado; sin él es «Próximamente» (gris, cerrada). Un módulo
 * propuesto está abierto desde el principio, sin repositorio.
 */
export const salaAbierta = (m: Pick<Modulo, "repo" | "repo_verificado_en" | "estado_modulo">) =>
  m.estado_modulo === "propuesto" || (!!m.repo && !!m.repo_verificado_en);

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
