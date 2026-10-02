import "server-only";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MIGRACIONES } from "./migraciones";

export type DB = Database.Database;

export const DATA_DIR = path.resolve(
  process.env.DATA_DIR || (process.env.NODE_ENV === "production" ? "/data" : "./data"),
);
export const DIR_COMPROBANTES = path.join(DATA_DIR, "comprobantes");

const globalConDb = globalThis as unknown as { __aetherDb?: DB };

function abrir(): DB {
  fs.mkdirSync(DIR_COMPROBANTES, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"));

  // Los PRAGMA foreign_keys / busy_timeout son por conexión: se fijan aquí, en la única conexión del proceso.
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");

  migrar(db);
  crearAdminInicial(db);
  return db;
}

function migrar(db: DB) {
  const actual = db.pragma("user_version", { simple: true }) as number;
  for (let v = actual; v < MIGRACIONES.length; v++) {
    db.transaction(() => {
      db.exec(MIGRACIONES[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function crearAdminInicial(db: DB) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number };
  if (n > 0) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.warn("[aether-ops] Tabla usuarios vacía y ADMIN_EMAIL no definido: nadie puede ingresar.");
    return;
  }
  db.prepare(
    "INSERT INTO usuarios (id, nombre, email, rol) VALUES (?, ?, ?, 'admin')",
  ).run(randomUUID(), process.env.ADMIN_NOMBRE?.trim() || "Administrador", email);
  console.info(`[aether-ops] Administrador inicial creado: ${email} (código inicial, cambio obligatorio).`);
}

export function getDb(): DB {
  if (!globalConDb.__aetherDb) globalConDb.__aetherDb = abrir();
  return globalConDb.__aetherDb;
}
