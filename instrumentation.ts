// Se ejecuta una vez al arrancar el servidor: falla rápido sin JWT_SECRET o con un árbol de preguntas inválido, aplica
// migraciones/crea el admin inicial e inicia los reintentos automáticos del envío de requerimientos a GitHub.
// La condición envuelve el import (en vez de un return anticipado) para que `next dev` no empaquete SQLite para Edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const produccion = process.env.NODE_ENV === "production";
    if (produccion && (process.env.JWT_SECRET ?? "").length < 32) {
      console.error("[aether-ops] JWT_SECRET no definido o con menos de 32 caracteres. Genera uno con: openssl rand -hex 32");
      process.exit(1);
    }

    // Árboles de las salas del portal gerencial (#17): esquema y estructura
    const { ARBOLES, validarArbol } = await import("./lib/chat/arboles");
    const errores = ARBOLES.flatMap((a) => validarArbol(a).map((e) => `${a.modulo}: ${e}`));
    if (errores.length) {
      console.error(`[aether-ops] Árboles de preguntas inválidos:\n${errores.map((e) => `  - ${e}`).join("\n")}`);
      if (produccion) process.exit(1);
    }

    const { abrirTodas, getDbControl } = await import("./lib/db");
    abrirTodas();

    const { iniciarReintentos } = await import("./lib/chat/envio");
    const { configDesdeEntorno } = await import("./lib/chat/githubApi");
    iniciarReintentos(getDbControl, () => configDesdeEntorno());
  }
}
