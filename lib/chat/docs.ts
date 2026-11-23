// Documentos iniciales de un módulo activado: CONTEXT.md, los ADR, CLAUDE.md y la configuración de la flota se escriben
// en el repositorio nuevo con la cuenta de DataSHEQ (API de contenidos y de datos de git de GitHub). Repositorio vacío:
// los archivos son el primer commit de «main». Si no: rama «modulo/docs-iniciales» con un commit y un pull request que
// enlaza las especificaciones. Reutiliza la rama y el PR si ya existen. El resultado queda en los campos docs_* de la
// sala; los errores transitorios se reintentan con las esperas del envío de Issues (./envio). Sin "server-only": lo
// prueba scripts/test-logica.ts con un GitHub simulado.
import type Database from "better-sqlite3";
import { ESPERAS_MIN, MAX_REINTENTOS } from "./envio";
import { ErrorGithub, type OpcionesPeticion, peticion, verificarCuenta } from "./githubApi";
import { moduloPorClave } from "./catalogo";
import { type Modulo, codigoTicket } from "./modulos";
import { nombreArchivo } from "./propuestos";
import { type ConfigCuenta, type ConfigGithub, paraRepo } from "./seguimiento";

type DB = Database.Database;

export const RAMA_DOCS = "modulo/docs-iniciales";
export const LINEA_DISENO = "Design system: follow martiincooper/ui-guidelines";
export const tituloPrDocs = (nombre: string) => `Documentación inicial del módulo ${nombre}`;

export interface EstadoDocs {
  /** Enlace al PR (o al primer commit si el repositorio estaba vacío); null mientras no se haya escrito. */
  url: string | null;
  /** Número del PR; null cuando fue el primer commit. */
  numero: number | null;
  error: string | null;
  reintento_en: string | null;
}

export interface ArchivoInicial {
  ruta: string;
  contenido: string;
}

interface EspecPublicada {
  ticket: string;
  titulo: string;
  url: string | null;
}

/** Las especificaciones guardadas en la sala propuesta y publicadas al activarla, de la más antigua a la más nueva. */
function especificaciones(db: DB, clave: string): EspecPublicada[] {
  return (
    db.prepare("SELECT ticket, titulo, issue_url FROM chat_solicitudes WHERE sala = ? AND modulo_nuevo = 1 ORDER BY ticket").all(clave) as {
      ticket: number;
      titulo: string | null;
      issue_url: string | null;
    }[]
  ).map((f) => ({ ticket: codigoTicket(f.ticket), titulo: f.titulo ?? "", url: f.issue_url }));
}

const enlace = (e: EspecPublicada) => (e.url ? `- [${e.ticket}](${e.url}): ${e.titulo}` : `- ${e.ticket}: ${e.titulo} (aún sin publicar)`);

export function claudeMd(m: Pick<Modulo, "nombre" | "descripcion">, specs: EspecPublicada[]): string {
  const lista = specs.length ? specs.map(enlace).join("\n") : "- (sin especificaciones guardadas)";
  return [
    `# ${m.nombre}`,
    "",
    m.descripcion,
    "",
    "El vocabulario del dominio está en [CONTEXT.md](CONTEXT.md) y las decisiones de diseño en [docs/adr](docs/adr).",
    "",
    "## Especificaciones",
    "",
    lista,
    "",
    LINEA_DISENO,
    "",
  ].join("\n");
}

/** Los archivos que se escriben en el repositorio, a partir de la sala. */
export function archivosIniciales(db: DB, clave: string): ArchivoInicial[] {
  const m = moduloPorClave(db, clave) as Modulo;
  const doc = db.prepare("SELECT contexto, adrs FROM chat_modulos WHERE clave = ?").get(clave) as { contexto: string; adrs: string };
  const adrs = JSON.parse(doc.adrs) as { archivo: string; contenido: string }[];
  const json = (o: object) => `${JSON.stringify(o, null, 2)}\n`;
  return [
    { ruta: "CONTEXT.md", contenido: doc.contexto },
    ...adrs.map((a) => ({ ruta: `docs/adr/${nombreArchivo(a.archivo)}`, contenido: a.contenido })),
    { ruta: "CLAUDE.md", contenido: claudeMd(m, especificaciones(db, clave)) },
    { ruta: ".claude/implement-all.json", contenido: json({ permissions: "skip", chrome: false, review: true }) },
    { ruta: ".claude/implement-all.cloud.json", contenido: json({ chrome: false }) },
  ];
}

export function cuerpoPrDocs(db: DB, clave: string): string {
  const specs = especificaciones(db, clave);
  return [
    "Documentos iniciales del módulo, generados desde su sala del portal: `CONTEXT.md`, los ADR, `CLAUDE.md` y la configuración de la flota.",
    "",
    "## Especificaciones",
    "",
    specs.length ? specs.map(enlace).join("\n") : "- (sin especificaciones guardadas)",
  ].join("\n");
}

export function estadoDocs(db: DB, clave: string): EstadoDocs {
  const f = db.prepare("SELECT docs_url, docs_numero, docs_error, docs_reintento_en FROM chat_modulos WHERE clave = ?").get(clave) as {
    docs_url: string | null;
    docs_numero: number | null;
    docs_error: string | null;
    docs_reintento_en: string | null;
  };
  return { url: f.docs_url, numero: f.docs_numero, error: f.docs_error, reintento_en: f.docs_reintento_en };
}

async function exigir(res: Response, que: string): Promise<Response> {
  if (res.ok) return res;
  const detalle = ((await res.json().catch(() => ({}))) as { message?: string }).message;
  throw new ErrorGithub(`${que}: GitHub respondió HTTP ${res.status}${detalle ? `: ${detalle}` : ""}`, res.status >= 500, res.status);
}

const json = (cuerpo: object): RequestInit => ({ method: "POST", body: JSON.stringify(cuerpo) });

/** Blobs → árbol → commit con todos los archivos; `base`: commit padre (sin él, un commit raíz). */
async function commitDeArchivos(cfg: ConfigGithub, archivos: ArchivoInicial[], base: { commit: string; arbol: string } | null, op: OpcionesPeticion) {
  const entradas: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const a of archivos) {
    const r = await exigir(await peticion(cfg, "/git/blobs", json({ content: a.contenido, encoding: "utf-8" }), op), `No se pudo crear ${a.ruta}`);
    entradas.push({ path: a.ruta, mode: "100644", type: "blob", sha: ((await r.json()) as { sha: string }).sha });
  }
  const arbol = (await (await exigir(await peticion(cfg, "/git/trees", json({ tree: entradas, ...(base ? { base_tree: base.arbol } : {}) }), op), "No se pudo crear el árbol")).json()) as { sha: string };
  const commit = (await (
    await exigir(
      await peticion(cfg, "/git/commits", json({ message: "Documentación inicial del módulo", tree: arbol.sha, parents: base ? [base.commit] : [] }), op),
      "No se pudo crear el commit",
    )
  ).json()) as { sha: string; html_url?: string };
  return { sha: commit.sha, url: commit.html_url ?? `https://github.com/${cfg.repo}/commit/${commit.sha}` };
}

async function refDe(cfg: ConfigGithub, rama: string, op: OpcionesPeticion): Promise<string | null> {
  const res = await peticion(cfg, `/git/ref/heads/${rama}`, {}, op);
  if (res.status === 404) return null;
  await exigir(res, `No se pudo consultar la rama ${rama}`);
  return ((await res.json()) as { object: { sha: string } }).object.sha;
}

async function prAbierto(cfg: ConfigGithub, rama: string, op: OpcionesPeticion): Promise<{ numero: number; url: string } | null> {
  const q = new URLSearchParams({ head: `${cfg.repo.split("/")[0]}:${rama}`, state: "open" });
  const lista = (await (await exigir(await peticion(cfg, `/pulls?${q}`, {}, op), "No se pudo consultar los pull requests")).json()) as { number: number; html_url: string; head?: { ref?: string } }[];
  const pr = lista.find((p) => !p.head?.ref || p.head.ref === rama);
  return pr ? { numero: pr.number, url: pr.html_url } : null;
}

/** Repositorio vacío: el primer commit de «main» con todos los archivos (un solo commit raíz). */
async function primerCommit(cfg: ConfigGithub, archivos: ArchivoInicial[], op: OpcionesPeticion): Promise<{ url: string }> {
  // La API de datos de git no acepta repositorios vacíos: un archivo por la API de contenidos crea «main» y luego el
  // commit raíz con todos los archivos la reemplaza (queda un solo commit).
  const [primero] = archivos;
  await exigir(
    await peticion(cfg, `/contents/${primero.ruta}`, { method: "PUT", body: JSON.stringify({ message: "Documentación inicial del módulo", content: Buffer.from(primero.contenido).toString("base64"), branch: "main" }) }, op),
    "No se pudo crear el primer commit",
  );
  const c = await commitDeArchivos(cfg, archivos, null, op);
  await exigir(await peticion(cfg, "/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: c.sha, force: true }) }, op), "No se pudo actualizar main");
  return { url: c.url };
}

/** Repositorio con commits: rama desde la predeterminada + un commit + PR; reutiliza lo que ya exista. */
async function ramaYPr(cfg: ConfigGithub, archivos: ArchivoInicial[], titulo: string, cuerpo: string, op: OpcionesPeticion) {
  const existente = await prAbierto(cfg, RAMA_DOCS, op);
  if (existente) return existente;
  const predeterminada = ((await (await exigir(await peticion(cfg, "", {}, op), "No se pudo consultar el repositorio")).json()) as { default_branch?: string }).default_branch ?? "main";
  if (!(await refDe(cfg, RAMA_DOCS, op))) {
    const padre = await refDe(cfg, predeterminada, op);
    if (!padre) throw new ErrorGithub(`No se encontró la rama ${predeterminada}`, false, 404);
    const arbol = ((await (await exigir(await peticion(cfg, `/git/commits/${padre}`, {}, op), "No se pudo leer el commit base")).json()) as { tree: { sha: string } }).tree.sha;
    const c = await commitDeArchivos(cfg, archivos, { commit: padre, arbol }, op);
    await exigir(await peticion(cfg, "/git/refs", json({ ref: `refs/heads/${RAMA_DOCS}`, sha: c.sha }), op), "No se pudo crear la rama");
  }
  const res = await peticion(cfg, "/pulls", json({ title: titulo, head: RAMA_DOCS, base: predeterminada, body: cuerpo }), op);
  if (res.status === 422) {
    // pudo haberse creado en paralelo: se vuelve a buscar antes de rendirse
    const ya = await prAbierto(cfg, RAMA_DOCS, op);
    if (ya) return ya;
  }
  const pr = (await (await exigir(res, "No se pudo crear el pull request")).json()) as { number: number; html_url: string };
  return { numero: pr.number, url: pr.html_url };
}

const enCurso = new Set<string>();

export interface ResultadoDocs extends EstadoDocs {
  ok: boolean;
}

/**
 * Escribe los documentos iniciales en el repositorio de la sala y guarda el resultado en sus campos docs_*. Un error
 * transitorio programa el siguiente reintento (1, 2, 5, 15, 30, 60 min); uno definitivo queda para mostrarse.
 * No hace nada si ya se escribieron. Nunca lanza por errores de GitHub.
 */
export async function publicarDocs(db: DB, cuenta: ConfigCuenta | null, clave: string, op: OpcionesPeticion & { ahora?: () => Date } = {}): Promise<ResultadoDocs> {
  const ahora = op.ahora ?? (() => new Date());
  const m = moduloPorClave(db, clave);
  if (!m || m.estado_modulo !== "activo" || !m.repo) throw new Error("La sala no está activa con un repositorio");
  const previo = estadoDocs(db, clave);
  if (previo.url) return { ok: true, ...previo };
  if (enCurso.has(clave)) return { ok: false, ...previo, error: "Los documentos ya se están escribiendo en GitHub" };
  enCurso.add(clave);
  try {
    if (!cuenta) throw new ErrorGithub("GITHUB_TOKEN no está configurado en el servidor", false);
    await verificarCuenta(cuenta, op);
    const cfg = paraRepo(cuenta, m.repo);
    const archivos = archivosIniciales(db, clave);
    const vacio = await peticion(cfg, "/commits?per_page=1", {}, op);
    let resultado: { url: string; numero: number | null };
    if (vacio.status === 409) resultado = { ...(await primerCommit(cfg, archivos, op)), numero: null };
    else {
      await exigir(vacio, "No se pudo consultar el repositorio");
      resultado = await ramaYPr(cfg, archivos, tituloPrDocs(m.nombre), cuerpoPrDocs(db, clave), op);
    }
    db.prepare("UPDATE chat_modulos SET docs_url = ?, docs_numero = ?, docs_error = NULL, docs_reintento_en = NULL WHERE clave = ?").run(resultado.url, resultado.numero, clave);
    return { ok: true, ...estadoDocs(db, clave) };
  } catch (e) {
    const transitorio = e instanceof ErrorGithub ? e.transitorio : false;
    const error = e instanceof ErrorGithub ? e.message : "Error inesperado al escribir los documentos iniciales";
    if (!(e instanceof ErrorGithub)) console.error("[chat-docs]", e);
    const intentos = (db.prepare("SELECT docs_intentos FROM chat_modulos WHERE clave = ?").get(clave) as { docs_intentos: number }).docs_intentos;
    const proximo = transitorio && intentos < MAX_REINTENTOS ? new Date(ahora().getTime() + ESPERAS_MIN[intentos] * 60_000).toISOString() : null;
    db.prepare("UPDATE chat_modulos SET docs_error = ?, docs_intentos = ?, docs_reintento_en = ? WHERE clave = ?").run(error, transitorio ? intentos + 1 : intentos, proximo, clave);
    return { ok: false, ...estadoDocs(db, clave) };
  } finally {
    enCurso.delete(clave);
  }
}

/** Salas con un reintento automático de sus documentos vencido. */
export function docsPendientes(db: DB, ahora = new Date()): string[] {
  return (
    db.prepare("SELECT clave FROM chat_modulos WHERE estado_modulo = 'activo' AND docs_url IS NULL AND docs_reintento_en IS NOT NULL AND docs_reintento_en <= ?").all(ahora.toISOString()) as { clave: string }[]
  ).map((f) => f.clave);
}

/** Reintenta los documentos vencidos, de a uno. Devuelve cuántos se escribieron. */
export async function procesarDocs(db: DB, cuenta: ConfigCuenta | null, op: OpcionesPeticion & { ahora?: () => Date } = {}): Promise<number> {
  if (!cuenta) return 0;
  let n = 0;
  for (const clave of docsPendientes(db, (op.ahora ?? (() => new Date()))())) if ((await publicarDocs(db, cuenta, clave, op)).ok) n++;
  return n;
}
