// Parte «git» del GitHub simulado: repositorios con commits, ramas, árboles, blobs, contenidos y pull requests en memoria.
// Un repositorio cuyo nombre incluye «vacio» empieza sin commits (como uno recién creado): ahí la API de datos de git
// responde 409 y el primer commit solo se crea con la API de contenidos, igual que GitHub. Los demás nacen con un
// commit (README.md) en «main». Lo usan scripts/github-falso.mjs (e2e) y scripts/test-logica.ts.
import { createHash } from "node:crypto";

const CUENTA_URL = "http://github.falso";

export function crearGitFalso() {
  const repos = new Map(); // «dueño/repo» → { commits: Map(sha → {tree, parents, message}), refs: Map(rama → sha), prs: [] }
  const blobs = new Map(); // sha → contenido
  const arboles = new Map(); // sha → { ruta → contenido }
  let n = 0;
  const sha = (...partes) => createHash("sha1").update(`${++n}|${partes.join("|")}`).digest("hex");

  const repoDe = (clave) => {
    let r = repos.get(clave);
    if (!r) {
      r = { commits: new Map(), refs: new Map(), prs: [] };
      if (!clave.split("/")[1].includes("vacio")) {
        const t = sha("tree");
        arboles.set(t, { "README.md": "# repo" });
        const c = sha("commit");
        r.commits.set(c, { tree: t, parents: [], message: "Initial commit" });
        r.refs.set("main", c);
      }
      repos.set(clave, r);
    }
    return r;
  };
  const vacio = (r) => r.commits.size === 0;
  const urlCommit = (clave, s) => `${CUENTA_URL}/${clave}/commit/${s}`;
  const commitar = (clave, r, { tree, parents, message }) => {
    const s = sha("commit", tree);
    r.commits.set(s, { tree, parents, message });
    return s;
  };

  /** Atiende `/repos/{dueño}/{repo}/…` (y `/control/repos/…`); null si la ruta no es de esta parte. */
  function atender(metodo, pathname, search, cuerpo) {
    const ctl = pathname.match(/^\/control\/repos\/([^/]+\/[^/]+)$/);
    if (ctl) {
      const r = repoDe(ctl[1]);
      return {
        status: 200,
        json: {
          commits: [...r.commits].map(([s, c]) => ({ sha: s, message: c.message, parents: c.parents, files: arboles.get(c.tree) })),
          refs: Object.fromEntries(r.refs),
          prs: r.prs,
        },
      };
    }
    const m = pathname.match(/^\/repos\/([^/]+\/[^/]+)\/(commits|git\/.+|contents\/.+|pulls)$/);
    if (!m) return null;
    const [, clave, ruta] = m;
    const r = repoDe(clave);
    const datos = cuerpo ? JSON.parse(cuerpo) : {};
    const vacioMsg = { status: 409, json: { message: "Git Repository is empty." } };
    if (metodo === "GET" && ruta === "commits") return vacio(r) ? vacioMsg : { status: 200, json: [{ sha: r.refs.get("main") }] };
    let x;
    if (metodo === "GET" && (x = ruta.match(/^git\/ref\/heads\/(.+)$/))) {
      if (vacio(r)) return vacioMsg;
      const s = r.refs.get(decodeURIComponent(x[1]));
      return s ? { status: 200, json: { ref: `refs/heads/${x[1]}`, object: { sha: s } } } : { status: 404, json: { message: "Not Found" } };
    }
    if (metodo === "GET" && (x = ruta.match(/^git\/commits\/(.+)$/))) {
      const c = r.commits.get(x[1]);
      return c ? { status: 200, json: { sha: x[1], tree: { sha: c.tree } } } : { status: 404, json: { message: "Not Found" } };
    }
    if (metodo === "POST" && ruta === "git/blobs") {
      if (vacio(r)) return vacioMsg;
      const s = sha("blob");
      blobs.set(s, datos.encoding === "base64" ? Buffer.from(datos.content, "base64").toString("utf8") : datos.content);
      return { status: 201, json: { sha: s } };
    }
    if (metodo === "POST" && ruta === "git/trees") {
      if (vacio(r)) return vacioMsg;
      const archivos = { ...(datos.base_tree ? arboles.get(datos.base_tree) : {}) };
      for (const e of datos.tree ?? []) {
        if (!blobs.has(e.sha)) return { status: 422, json: { message: "GitRPC::BadObjectState" } };
        archivos[e.path] = blobs.get(e.sha);
      }
      const s = sha("tree");
      arboles.set(s, archivos);
      return { status: 201, json: { sha: s } };
    }
    if (metodo === "POST" && ruta === "git/commits") {
      if (vacio(r) && (datos.parents ?? []).length) return vacioMsg;
      const s = commitar(clave, r, { tree: datos.tree, parents: datos.parents ?? [], message: datos.message });
      return { status: 201, json: { sha: s, html_url: urlCommit(clave, s) } };
    }
    if (metodo === "POST" && ruta === "git/refs") {
      const rama = String(datos.ref).replace(/^refs\/heads\//, "");
      if (r.refs.has(rama)) return { status: 422, json: { message: "Reference already exists" } };
      r.refs.set(rama, datos.sha);
      return { status: 201, json: { ref: datos.ref, object: { sha: datos.sha } } };
    }
    if (metodo === "PATCH" && (x = ruta.match(/^git\/refs\/heads\/(.+)$/))) {
      if (!r.refs.has(x[1])) return { status: 404, json: { message: "Not Found" } };
      r.refs.set(x[1], datos.sha);
      return { status: 200, json: { object: { sha: datos.sha } } };
    }
    if (metodo === "PUT" && (x = ruta.match(/^contents\/(.+)$/))) {
      const rama = datos.branch ?? "main";
      const previo = r.refs.get(rama);
      const base = previo ? { ...arboles.get(r.commits.get(previo).tree) } : {};
      base[decodeURIComponent(x[1])] = Buffer.from(datos.content, "base64").toString("utf8");
      const t = sha("tree");
      arboles.set(t, base);
      const s = commitar(clave, r, { tree: t, parents: previo ? [previo] : [], message: datos.message });
      r.refs.set(rama, s);
      return { status: 201, json: { content: { path: x[1] }, commit: { sha: s, html_url: urlCommit(clave, s) } } };
    }
    if (metodo === "GET" && ruta === "pulls") {
      const q = new URLSearchParams(search);
      const head = (q.get("head") ?? "").replace(/^[^:]*:/, "");
      return { status: 200, json: r.prs.filter((p) => p.state === "open" && (!head || p.head.ref === head)) };
    }
    if (metodo === "POST" && ruta === "pulls") {
      if (!r.refs.has(datos.head) || !r.refs.has(datos.base)) return { status: 422, json: { message: "Validation Failed" } };
      const pr = { number: r.prs.length + 1, html_url: `${CUENTA_URL}/${clave}/pull/${r.prs.length + 1}`, state: "open", title: datos.title, body: datos.body, head: { ref: datos.head }, base: { ref: datos.base } };
      r.prs.push(pr);
      return { status: 201, json: pr };
    }
    return { status: 404, json: { message: "Not Found" } };
  }
  return { atender };
}
