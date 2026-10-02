import "server-only";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EMPRESAS, empresaPorClave } from "./empresas";
import { MIGRACIONES_CONTROL, MIGRACIONES_EMPRESA } from "./migraciones";

export type DB = Database.Database;

// Estructura en disco:
//   DATA_DIR/control.db                         administradores y supervisión
//   DATA_DIR/empresas/<clave>/app.db            datos de cada empresa
//   DATA_DIR/empresas/<clave>/comprobantes/     fotos y PDF de compras de esa empresa
export const DATA_DIR = path.resolve(
  process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? "/data" : "./data"),
);

export function dirEmpresa(clave: string): string {
  if (!empresaPorClave(clave)) throw new Error(`Empresa desconocida: ${clave}`);
  return path.join(DATA_DIR, "empresas", clave);
}

export function dirComprobantes(clave: string): string {
  return path.join(dirEmpresa(clave), "comprobantes");
}

const cache = globalThis as unknown as { __aetherDbs?: Map<string, DB> };
const conexiones = (cache.__aetherDbs ??= new Map());

function abrir(archivo: string, migraciones: string[]): DB {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new Database(archivo);
  // foreign_keys / busy_timeout son por conexión: se fijan en la única conexión por archivo del proceso.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  const actual = db.pragma("user_version", { simple: true }) as number;
  for (let v = actual; v < migraciones.length; v++) {
    db.transaction(() => {
      db.exec(migraciones[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return db;
}

export function getDbControl(): DB {
  let db = conexiones.get("control");
  if (!db) {
    if (fs.existsSync(path.join(DATA_DIR, "app.db"))) {
      console.warn(
        `[aether-ops] ${path.join(DATA_DIR, "app.db")} es del formato anterior (una sola empresa) y no se usa. ` +
          "Los datos viven ahora en control.db y empresas/<clave>/app.db.",
      );
    }
    db = abrir(path.join(DATA_DIR, "control.db"), MIGRACIONES_CONTROL);
    crearAdminInicial(db);
    conexiones.set("control", db);
  }
  return db;
}

export function getDbEmpresa(clave: string): DB {
  let db = conexiones.get(`empresa:${clave}`);
  if (!db) {
    db = abrir(path.join(dirEmpresa(clave), "app.db"), MIGRACIONES_EMPRESA);
    fs.mkdirSync(dirComprobantes(clave), { recursive: true });
    conexiones.set(`empresa:${clave}`, db);
  }
  return db;
}

/** Abre (y migra) todas las bases. Se llama al arrancar el servidor. */
export function abrirTodas() {
  getDbControl();
  for (const e of EMPRESAS) getDbEmpresa(e.clave);
}

function crearAdminInicial(db: DB) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number };
  if (n > 0) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.warn("[aether-ops] No hay administradores y ADMIN_EMAIL no está definido: nadie puede ingresar.");
    return;
  }
  db.prepare("INSERT INTO usuarios (id, nombre, email) VALUES (?, ?, ?)").run(
    randomUUID(),
    process.env.ADMIN_NOMBRE?.trim() || "Administrador",
    email,
  );
  console.info(`[aether-ops] Administrador inicial creado: ${email} (código inicial, cambio obligatorio).`);
}
