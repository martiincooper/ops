// Arranque del contenedor (CMD del Dockerfile).
//
// El contenedor inicia como root solo para preparar la carpeta de datos: los volúmenes de algunas plataformas
// (Railway, por ejemplo) se montan a nombre de root. Este script deja /data a nombre del usuario "aether"
// (uid 1001) y baja a ese usuario antes de cargar el servidor, así la aplicación nunca corre como root.
// Es el mismo patrón que usan las imágenes oficiales de Postgres o Redis.
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

fs.mkdirSync(DATA_DIR, { recursive: true });

if (typeof process.getuid === "function" && process.getuid() === 0) {
  try {
    chownRecursivo(DATA_DIR);
    process.setgroups([]);
    process.setgid(GID);
    process.setuid(UID);
    log(`Datos en ${DATA_DIR}; la aplicación corre como uid ${UID}.`);
  } catch (e) {
    // Plataformas que no permiten cambiar dueño o usuario: se sigue como root antes que no arrancar.
    console.warn(`[aether-ops] AVISO: no se pudo bajar a uid ${UID} (${e.code || e.message}); se sigue como root.`);
  }
}

try {
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch {
  console.error(
    `[aether-ops] No se puede escribir en ${DATA_DIR}: el contenedor corre como uid ${process.getuid?.()} y la carpeta ` +
      "pertenece a otro usuario. No fuerces otro usuario (docker run --user / RAILWAY_RUN_UID distinto de 0), " +
      "o en Docker ejecuta: sudo chown -R 1001:1001 <carpeta del anfitrión>",
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
