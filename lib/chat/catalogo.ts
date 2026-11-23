// Catálogo de salas del portal gerencial: la tabla chat_modulos, administrada desde el panel. La clave es el «slug»
// del nombre al crear la sala y nunca cambia. Una sala no se borra: se archiva (desaparece del portal, se conserva
// su historial) y se puede restaurar. Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import type Database from "better-sqlite3";
import { type Autonomia, type Modulo, salaAbierta } from "./modulos";

type DB = Database.Database;

export class ErrorModulo extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DatosModulo {
  nombre: string;
  area: string;
  descripcion: string;
  /** Hex de 6 dígitos, con o sin #. */
  color: string;
  orden: number;
  autonomia: Autonomia;
}

export const COLOR_POR_DEFECTO = "5b4fd6";
const COLUMNAS = "clave, nombre, area, descripcion, color, orden, repo, repo_verificado_en, autonomia, archivado";

interface Fila extends Omit<Modulo, "archivado"> {
  archivado: number;
}
const aModulo = (f: Fila): Modulo => ({ ...f, archivado: f.archivado === 1 });

/** «C-Legal» → «c-legal»; «Gestión de Riesgos» → «gestion-de-riesgos». */
export function slugSala(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Valida y normaliza los datos de una sala (texto recortado, color sin # en minúsculas). */
export function validarDatos(d: Partial<DatosModulo>, base?: Modulo): DatosModulo {
  const nombre = (d.nombre ?? base?.nombre ?? "").trim();
  if (!nombre) throw new ErrorModulo(400, "Escribe el nombre de la sala");
  if (nombre.length > 60) throw new ErrorModulo(400, "El nombre admite hasta 60 caracteres");
  const area = (d.area ?? base?.area ?? "").trim();
  if (area.length > 80) throw new ErrorModulo(400, "El área admite hasta 80 caracteres");
  const descripcion = (d.descripcion ?? base?.descripcion ?? "").trim();
  if (descripcion.length > 500) throw new ErrorModulo(400, "La descripción admite hasta 500 caracteres");
  const color = (d.color ?? base?.color ?? COLOR_POR_DEFECTO).trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(color)) throw new ErrorModulo(400, "El color debe ser un hex de 6 dígitos, p. ej. #5b4fd6");
  const orden = d.orden ?? base?.orden ?? 0;
  if (!Number.isInteger(orden) || orden < 0 || orden > 9999) throw new ErrorModulo(400, "El orden es un número entero entre 0 y 9999");
  const autonomia = d.autonomia ?? base?.autonomia ?? "revisar";
  if (autonomia !== "revisar" && autonomia !== "automatico") throw new ErrorModulo(400, "La autonomía es «revisar» o «automático»");
  return { nombre, area, descripcion, color, orden, autonomia };
}

export function moduloPorClave(db: DB, clave: string | null | undefined): Modulo | undefined {
  if (!clave) return undefined;
  const f = db.prepare(`SELECT ${COLUMNAS} FROM chat_modulos WHERE clave = ?`).get(clave) as Fila | undefined;
  return f && aModulo(f);
}

/** Salas activas (o las archivadas), por orden y nombre. */
export function listarModulos(db: DB, archivadas = false): Modulo[] {
  return (db.prepare(`SELECT ${COLUMNAS} FROM chat_modulos WHERE archivado = ? ORDER BY orden, nombre COLLATE NOCASE, clave`).all(archivadas ? 1 : 0) as Fila[]).map(aModulo);
}

/** Todas las salas, activas y archivadas (nombres del historial en el panel). */
export function todosLosModulos(db: DB): Modulo[] {
  return (db.prepare(`SELECT ${COLUMNAS} FROM chat_modulos ORDER BY archivado, orden, nombre COLLATE NOCASE, clave`).all() as Fila[]).map(aModulo);
}

/** Repositorio verificado de la sala (null: sin repositorio o sin verificar). */
export function repoDe(db: DB, clave: string): string | null {
  const m = moduloPorClave(db, clave);
  return m && salaAbierta(m) ? m.repo : null;
}

/** Crea una sala; su clave es el slug del nombre. Sin orden, va al final. */
export function crearModulo(db: DB, d: Partial<DatosModulo>): Modulo {
  const v = validarDatos({ ...d, orden: d.orden ?? undefined });
  const clave = slugSala(v.nombre);
  if (!clave) throw new ErrorModulo(400, "El nombre debe llevar letras o números");
  if (moduloPorClave(db, clave)) throw new ErrorModulo(409, `Ya existe una sala con la clave «${clave}»`);
  const orden = d.orden ?? (db.prepare("SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM chat_modulos").get() as { n: number }).n;
  db.prepare("INSERT INTO chat_modulos (clave, nombre, area, descripcion, color, orden, autonomia) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    clave,
    v.nombre,
    v.area,
    v.descripcion,
    v.color,
    orden,
    v.autonomia,
  );
  return moduloPorClave(db, clave) as Modulo;
}

/** Edita nombre, área, descripción, color, orden y autonomía. La clave nunca cambia. */
export function editarModulo(db: DB, clave: string, d: Partial<DatosModulo>): Modulo {
  const m = moduloPorClave(db, clave);
  if (!m) throw new ErrorModulo(404, "Sala no encontrada");
  const v = validarDatos(d, m);
  db.prepare(
    "UPDATE chat_modulos SET nombre = ?, area = ?, descripcion = ?, color = ?, orden = ?, autonomia = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE clave = ?",
  ).run(v.nombre, v.area, v.descripcion, v.color, v.orden, v.autonomia, clave);
  return moduloPorClave(db, clave) as Modulo;
}

/** Archiva (true) o restaura (false) una sala; su historial se conserva. */
export function archivarModulo(db: DB, clave: string, archivar: boolean): Modulo {
  if (!moduloPorClave(db, clave)) throw new ErrorModulo(404, "Sala no encontrada");
  db.prepare("UPDATE chat_modulos SET archivado = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE clave = ?").run(archivar ? 1 : 0, clave);
  return moduloPorClave(db, clave) as Modulo;
}
