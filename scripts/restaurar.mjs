// Restaura en DATA_DIR (por defecto ./data) un respaldo hecho con scripts/backup.mjs, p. ej. el de producción.
// Uso (con el servidor DETENIDO):  node scripts/restaurar.mjs <carpeta-del-respaldo>
//   <carpeta-del-respaldo> = la carpeta AAAAMMDD-HHMMSS con control.db y empresas/<clave>.db
// Los datos actuales no se borran: se mueven a <DATA_DIR>-anterior-<fecha>.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const origen = process.argv[2] && path.resolve(process.argv[2]);
const dataDir = path.resolve(process.env.DATA_DIR || "./data");

if (!origen || !fs.existsSync(path.join(origen, "control.db"))) {
  console.error("Uso: node scripts/restaurar.mjs <carpeta-del-respaldo>   (debe contener control.db y empresas/<clave>.db)");
  process.exit(1);
}

// Valida todo antes de tocar nada
const bases = [{ desde: path.join(origen, "control.db"), hacia: path.join(dataDir, "control.db") }];
const dirEmpresas = path.join(origen, "empresas");
if (fs.existsSync(dirEmpresas)) {
  for (const f of fs.readdirSync(dirEmpresas).filter((f) => f.endsWith(".db"))) {
    bases.push({ desde: path.join(dirEmpresas, f), hacia: path.join(dataDir, "empresas", f.slice(0, -3), "app.db") });
  }
}
for (const b of bases) {
  const db = new Database(b.desde, { readonly: true, fileMustExist: true });
  const integridad = db.pragma("integrity_check", { simple: true });
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM usuarios").get();
  db.close();
  if (integridad !== "ok") {
    console.error(`✗ ${b.desde}: integrity_check = ${integridad}. No se restauró nada.`);
    process.exit(1);
  }
  console.log(`✓ ${path.relative(origen, b.desde)}: ${n} cuenta${n === 1 ? "" : "s"}`);
}

// Si el servidor está corriendo, la base está abierta: mejor no moverla.
if (fs.existsSync(dataDir)) {
  const control = path.join(dataDir, "control.db");
  if (fs.existsSync(control)) {
    const db = new Database(control);
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.exec("BEGIN EXCLUSIVE; COMMIT;");
    } catch {
      console.error("La base actual está en uso. Detén el servidor (npm run dev / npm start) y vuelve a intentar.");
      process.exit(1);
    } finally {
      db.close();
    }
  }
  const marca = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const anterior = `${dataDir}-anterior-${marca}`;
  try {
    fs.renameSync(dataDir, anterior);
  } catch {
    console.error(`No se pudo mover ${dataDir} (¿el servidor sigue corriendo?). Detenlo y vuelve a intentar; no se cambió nada.`);
    process.exit(1);
  }
  console.log(`Datos actuales movidos a ${anterior}`);
}

for (const b of bases) {
  fs.mkdirSync(path.dirname(b.hacia), { recursive: true });
  fs.copyFileSync(b.desde, b.hacia);
}
console.log(`Respaldo restaurado en ${dataDir}. Las migraciones pendientes se aplican al iniciar el servidor.`);
