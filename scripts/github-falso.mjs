// GitHub simulado para las pruebas e2e: sin token real. Responde como la cuenta datasheq-creator.
// GITHUB_FALSO_HOST cambia la interfaz (por defecto solo 127.0.0.1; el CI con docker usa 0.0.0.0).
// Uso: node scripts/github-falso.mjs [archivo-del-puerto]    (escucha en un puerto libre; lo escribe en el archivo)
// GET /repos/{dueño}/{repo}: el nombre del repo elige el caso — «no-existe» (404), «solo-lectura» (sin escritura),
// «sin-issues» (Issues desactivados); cualquier otro es un repositorio sano.
import fs from "node:fs";
import http from "node:http";

const servidor = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://x");
  const responder = (status, json = {}) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
  req.resume();
  const repo = pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
  if (pathname === "/user") return responder(200, { login: "datasheq-creator" });
  if (repo) {
    const nombre = repo[2];
    if (nombre.includes("no-existe")) return responder(404, { message: "Not Found" });
    return responder(200, { full_name: `${repo[1]}/${nombre}`, permissions: { push: !nombre.includes("solo-lectura") }, has_issues: !nombre.includes("sin-issues") });
  }
  if (req.method === "POST" && /\/issues$/.test(pathname)) return responder(201, { number: 1, html_url: `http://github.falso${pathname}/1` });
  if (req.method === "POST" && /\/labels$/.test(pathname)) return responder(201, {});
  if (/\/labels\//.test(pathname)) return responder(200, {});
  responder(404, { message: "Not Found" });
});
servidor.listen(Number(process.env.GITHUB_FALSO_PORT ?? 0), process.env.GITHUB_FALSO_HOST ?? "127.0.0.1", () => {
  const { port } = servidor.address();
  if (process.argv[2]) fs.writeFileSync(process.argv[2], String(port));
  console.log(`GitHub simulado en http://127.0.0.1:${port}`);
});
