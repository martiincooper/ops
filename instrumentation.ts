// Se ejecuta una vez al arrancar el servidor: falla rápido sin JWT_SECRET y aplica migraciones/crea el admin inicial.
// La condición envuelve el import (en vez de un return anticipado) para que `next dev` no empaquete SQLite para Edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "production" && (process.env.JWT_SECRET ?? "").length < 32) {
      console.error("[aether-ops] JWT_SECRET no definido o con menos de 32 caracteres. Genera uno con: openssl rand -hex 32");
      process.exit(1);
    }
    const { abrirTodas } = await import("./lib/db");
    abrirTodas();
  }
}
