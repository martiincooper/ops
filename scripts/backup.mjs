// Respaldo en caliente de SQLite con la API de backup (consistente aunque haya escrituras en curso y WAL).
// Uso dentro del contenedor:  node scripts/backup.mjs [/data/respaldos]
// Deja app-AAAAMMDD-HHMMSS.db y conserva los últimos 30.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR || "/data";
const destino = path.resolve(process.argv[2] || path.join(dataDir, "respaldos"));
fs.mkdirSync(destino, { recursive: true });

const marca = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const archivo = path.join(destino, `app-${marca}.db`);

const db = new Database(path.join(dataDir, "app.db"), { readonly: true, fileMustExist: true });
await db.backup(archivo);
db.close();

const check = new Database(archivo, { readonly: true });
const integridad = check.pragma("integrity_check", { simple: true });
check.close();
if (integridad !== "ok") {
  console.error(`Respaldo ${archivo} falló integrity_check: ${integridad}`);
  process.exit(1);
}

const antiguos = fs.readdirSync(destino).filter((f) => /^app-\d{8}-\d{6}\.db$/.test(f)).sort().slice(0, -30);
for (const f of antiguos) fs.rmSync(path.join(destino, f));
console.log(`Respaldo OK: ${archivo} (${(fs.statSync(archivo).size / 1024).toFixed(0)} KB)`);
