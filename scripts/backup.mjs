// Respaldo en caliente de TODAS las bases (control + una por empresa) con la API de backup de SQLite:
// consistente aunque haya escrituras en curso y archivos WAL.
// Uso dentro del contenedor:  node scripts/backup.mjs [/data/respaldos]
// Deja respaldos/AAAAMMDD-HHMMSS/{control.db, empresas/<clave>.db} y conserva los últimos 30.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.DATA_DIR || "/data";

// Ejecutado como root (p. ej. docker exec): trabaja como el dueño de la carpeta de datos, para no dejar
// respaldos a nombre de root.
if (process.getuid?.() === 0 && fs.existsSync(dataDir)) {
  const { uid, gid } = fs.statSync(dataDir);
  if (uid !== 0) {
    process.setgroups([]);
    process.setgid(gid);
    process.setuid(uid);
  }
}
const raiz = path.resolve(process.argv[2] || path.join(dataDir, "respaldos"));
const marca = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const destino = path.join(raiz, marca);

const bases = [{ origen: path.join(dataDir, "control.db"), nombre: "control.db" }];
const dirEmpresas = path.join(dataDir, "empresas");
if (fs.existsSync(dirEmpresas)) {
  for (const clave of fs.readdirSync(dirEmpresas)) {
    const f = path.join(dirEmpresas, clave, "app.db");
    if (fs.existsSync(f)) bases.push({ origen: f, nombre: path.join("empresas", `${clave}.db`) });
  }
}

let errores = 0;
for (const b of bases) {
  if (!fs.existsSync(b.origen)) continue;
  const archivo = path.join(destino, b.nombre);
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new Database(b.origen, { readonly: true, fileMustExist: true });
  await db.backup(archivo);
  db.close();
  // La copia queda como un único archivo autocontenido (sin -wal/-shm)
  const check = new Database(archivo);
  check.pragma("journal_mode = DELETE");
  const integridad = check.pragma("integrity_check", { simple: true });
  check.close();
  if (integridad !== "ok") {
    console.error(`✗ ${b.nombre}: integrity_check = ${integridad}`);
    errores++;
  } else {
    console.log(`✓ ${b.nombre} (${(fs.statSync(archivo).size / 1024).toFixed(0)} KB)`);
  }
}

const antiguos = fs.readdirSync(raiz).filter((f) => /^\d{8}-\d{6}$/.test(f)).sort().slice(0, -30);
for (const f of antiguos) fs.rmSync(path.join(raiz, f), { recursive: true, force: true });

if (errores) process.exit(1);
console.log(`Respaldo OK en ${destino}`);
