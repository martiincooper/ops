// Arranque del contenedor (CMD del Dockerfile).
//
// La imagen corre como el usuario "aether" (uid 1001). Algunas plataformas montan el volumen de datos como
// root (Railway, por ejemplo): ahí el servicio se inicia como root con RAILWAY_RUN_UID=0, este script deja la
// carpeta de datos a nombre de aether y baja a ese usuario antes de iniciar el servidor. Así la aplicación
// nunca corre como root.
const fs = require("node:fs");
const path = require("node:path");

const UID = 1001;
const GID = 1001;
const DATA_DIR = path.resolve(process.env.DATA_DIR || "/data");
const log = (m) => console.log(`[aether-ops] ${m}`);

function chownRecursivo(ruta) {
  fs.lchownSync(ruta, UID, GID);
  if (fs.lstatSync(ruta).isDirectory()) {
    for (const nombre of fs.readdirSync(ruta)) chownRecursivo(path.join(ruta, nombre));
  }
}

if (typeof process.getuid === "function" && process.getuid() === 0) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  chownRecursivo(DATA_DIR);
  process.setgroups([]);
  process.setgid(GID);
  process.setuid(UID);
  log(`Permisos de ${DATA_DIR} ajustados; la aplicación corre como uid ${UID}.`);
}

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch {
  console.error(
    `[aether-ops] No se puede escribir en ${DATA_DIR}. El volumen pertenece a otro usuario.\n` +
      "  - Railway: agrega la variable RAILWAY_RUN_UID=0 (el contenedor ajusta los permisos y baja a un usuario sin privilegios).\n" +
      "  - Docker: sudo chown -R 1001:1001 <carpeta del anfitrión>",
  );
  process.exit(1);
}

if (process.env.RAILWAY_ENVIRONMENT_NAME !== undefined) {
  const montaje = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!montaje) {
    console.warn(`[aether-ops] AVISO: no hay volumen en Railway. Los datos se borran en cada despliegue: agrega un volumen montado en ${DATA_DIR}.`);
  } else if (path.resolve(montaje) !== DATA_DIR) {
    console.warn(`[aether-ops] AVISO: el volumen está montado en ${montaje} pero los datos se guardan en ${DATA_DIR}. Monta el volumen en ${DATA_DIR}.`);
  }
}

require(path.join(__dirname, "..", "server.js"));
