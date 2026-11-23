// GitHub simulado para las pruebas e2e: sin token real. Responde como la cuenta datasheq-creator.
// GITHUB_FALSO_HOST cambia la interfaz (por defecto solo 127.0.0.1; el CI con docker usa 0.0.0.0).
// Uso: node scripts/github-falso.mjs [archivo-del-puerto]    (escucha en un puerto libre; lo escribe en el archivo)
// GET /repos/{dueño}/{repo}: el nombre del repo elige el caso — «no-existe» (404), «solo-lectura» (sin escritura),
// «sin-issues» (Issues desactivados); un nombre con «vacio» es un repositorio sin commits (ver github-git-falso.mjs); cualquier otro es un repositorio sano.
import fs from "node:fs";
import http from "node:http";
import { crearGitFalso } from "./github-git-falso.mjs";

const git = crearGitFalso();

// Issues creados (para las pruebas): GET /control/issues los lista; GET /repos/{dueño}/{repo}/issues los devuelve como GitHub.
const issues = [];
const servidor = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://x");
  const responder = (status, json = {}) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => atender(pathname, cuerpo, responder, req));
});
function atender(pathname, cuerpo, responder, req) {
  const g = git.atender(req.method ?? "GET", pathname, new URL(req.url ?? "/", "http://x").search, cuerpo);
  if (g) return responder(g.status, g.json);
  const repo = pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
  if (pathname === "/user") return responder(200, { login: "datasheq-creator" });
  if (repo) {
    const nombre = repo[2];
    if (nombre.includes("no-existe")) return responder(404, { message: "Not Found" });
    return responder(200, { full_name: `${repo[1]}/${nombre}`, permissions: { push: !nombre.includes("solo-lectura") }, has_issues: !nombre.includes("sin-issues"), default_branch: "main" });
  }
  if (pathname === "/control/issues") return responder(200, issues);
  if (req.method === "GET" && /^\/repos\/[^/]+\/[^/]+\/issues$/.test(pathname)) {
    const repoDe = pathname.replace(/^\/repos\//, "").replace(/\/issues$/, "");
    return responder(200, issues.filter((i) => i.repo === repoDe).map((i) => ({ number: i.number, html_url: i.url, title: i.title, state: "open", assignees: [] })).reverse());
  }
  if (req.method === "POST" && /\/issues$/.test(pathname)) {
    const datos = JSON.parse(cuerpo || "{}");
    const repo = pathname.replace(/^\/repos\//, "").replace(/\/issues$/, "");
    const numero = issues.filter((i) => i.repo === repo).length + 1;
    const url = `http://github.falso${pathname}/${numero}`;
    issues.push({ repo, number: numero, url, title: datos.title, body: datos.body, labels: datos.labels });
    return responder(201, { number: numero, html_url: url });
  }
  if (req.method === "POST" && /\/labels$/.test(pathname)) return responder(201, {});
  if (/\/labels\//.test(pathname)) return responder(200, {});
  responder(404, { message: "Not Found" });
}
servidor.listen(Number(process.env.GITHUB_FALSO_PORT ?? 0), process.env.GITHUB_FALSO_HOST ?? "127.0.0.1", () => {
  const { port } = servidor.address();
  if (process.argv[2]) fs.writeFileSync(process.argv[2], String(port));
  console.log(`GitHub simulado en http://127.0.0.1:${port}`);
});
