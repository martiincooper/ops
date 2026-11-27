// Cliente de la API de GitHub para los Issues del portal gerencial: crea el Issue con sus etiquetas, reintenta los
// errores transitorios (red, tiempo de espera, 5xx, 429) y evita duplicados al reintentar. La configuración llega por
// parámetro; sin "server-only" para poder probarlo contra un GitHub simulado (scripts/test-logica.ts).
import { codigoTicket, type Modulo } from "./modulos";
import { type ConfigCuenta, type ConfigGithub, ETIQUETA_ISSUES, paraRepo } from "./seguimiento";

/** Cuenta de GitHub de DataSHEQ por defecto: los envíos solo salen con un token de esta cuenta. */
export const CUENTA_DATASHEQ = "datasheq-creator";

/** Etiqueta que llevan todos los Issues nuevos del portal: listos para que una persona los revise. */
export const ETIQUETA_REVISION = "ready-for-human";

/** Etiqueta de los Issues que son una especificación completa (no un ticket suelto). */
export const ETIQUETA_SPEC = "spec";

/** Etiqueta extra de los Issues que salen de las especificaciones guardadas en una sala propuesta al activarse. */
export const ETIQUETA_MODULO_NUEVO = "modulo-nuevo";

/**
 * GITHUB_TOKEN (de la cuenta de DataSHEQ), GITHUB_CUENTA (su login, por defecto datasheq-creator) y GITHUB_API_URL
 * (GitHub Enterprise o pruebas). El repositorio de cada módulo se elige al enviar (./repos).
 */
export function configDesdeEntorno(env: Record<string, string | undefined> = process.env): ConfigCuenta | null {
  const token = env.GITHUB_TOKEN;
  if (!token) return null;
  return {
    api: (env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, ""),
    token,
    cuenta: (env.GITHUB_CUENTA || CUENTA_DATASHEQ).trim(),
  };
}

/** Error al hablar con GitHub. `transitorio`: vale la pena reintentar más tarde (red, 5xx, límite de uso). */
export class ErrorGithub extends Error {
  constructor(
    message: string,
    public transitorio: boolean,
    public status?: number,
  ) {
    super(message);
  }
}

export interface OpcionesPeticion {
  /** Intentos dentro de la misma petición (por defecto 3). */
  intentos?: number;
  /** Espera entre intentos, en ms (crece: 0,5 s y 1,5 s por defecto). */
  esperas?: number[];
  /** Para pruebas: reemplaza la espera real. */
  dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const ESPERA_MAX_MS = 10_000; // nunca esperar más de esto dentro de una petición (Retry-After incluido)

/** ¿La respuesta indica un problema pasajero? 5xx, 429 y el límite secundario de GitHub (403 con límite agotado). */
function respuestaTransitoria(res: Response): boolean {
  if (res.status >= 500 || res.status === 429) return true;
  return res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after"));
}

/**
 * Petición a la API de GitHub con reintentos para errores transitorios. Devuelve la respuesta (también si es un
 * error definitivo, para que quien llama lo interprete); lanza ErrorGithub transitorio si agota los intentos.
 */
export async function peticion(cfg: ConfigGithub, ruta: string, init: RequestInit = {}, op: OpcionesPeticion = {}): Promise<Response> {
  return peticionApi(cfg, `/repos/${cfg.repo}${ruta}`, init, op);
}

/** Como `peticion`, con una ruta absoluta de la API (p. ej. `/user`). */
async function peticionApi(
  cfg: { api: string; token: string },
  ruta: string,
  init: RequestInit = {},
  op: OpcionesPeticion = {},
): Promise<Response> {
  const intentos = op.intentos ?? 3;
  const esperas = op.esperas ?? [500, 1500];
  const dormir = op.dormir ?? dormirReal;
  let ultimo = "";
  let espera = 0;
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await dormir(espera);
    espera = esperas[Math.min(i, esperas.length - 1)] ?? 0;
    try {
      const res = await fetch(`${cfg.api}${ruta}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${cfg.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "aether-ops",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!respuestaTransitoria(res)) return res;
      ultimo = `GitHub respondió HTTP ${res.status}`;
      // Retry-After (segundos) manda sobre la espera propia, con tope
      const ra = Number(res.headers.get("retry-after"));
      if (res.headers.has("retry-after") && Number.isFinite(ra) && ra >= 0) espera = Math.min(ra * 1000, ESPERA_MAX_MS);
    } catch (e) {
      ultimo = `No se pudo conectar con GitHub: ${(e as Error).message}`;
    }
  }
  throw new ErrorGithub(ultimo || "No se pudo conectar con GitHub", true);
}

const etiquetasListas = new Set<string>(); // etiquetas que ya existen (cache del proceso, por repositorio)

const cuentasVerificadas = new Map<string, string>(); // token → login (cache del proceso)

/** Solo para pruebas. */
export function olvidarEtiquetas() {
  etiquetasListas.clear();
  cuentasVerificadas.clear();
}

/**
 * Confirma con GitHub que el token pertenece a la cuenta de DataSHEQ configurada. Si es de otra cuenta (por ejemplo,
 * un token personal), lanza un error definitivo: el portal no envía requerimientos con credenciales ajenas.
 */
export async function verificarCuenta(c: ConfigCuenta, op: OpcionesPeticion = {}): Promise<string> {
  let login = cuentasVerificadas.get(c.token);
  if (!login) {
    const res = await peticionApi(c, "/user", {}, op);
    if (res.status === 401) throw new ErrorGithub("El token de GitHub no es válido o expiró", false, 401);
    if (!res.ok) throw new ErrorGithub(`No se pudo verificar la cuenta de GitHub (HTTP ${res.status})`, false, res.status);
    login = ((await res.json()) as { login?: string }).login ?? "";
    cuentasVerificadas.set(c.token, login);
  }
  if (login.toLowerCase() !== c.cuenta.toLowerCase()) {
    throw new ErrorGithub(`El token de GitHub es de «${login}», no de la cuenta de DataSHEQ «${c.cuenta}»`, false, 403);
  }
  return login;
}

export interface SaludToken {
  ok: boolean;
  /** Login dueño del token, si GitHub lo dijo. */
  login?: string;
  /** Por qué no está sano. */
  motivo?: string;
}

/** Salud del token para el panel: consulta GitHub en vivo (sin la caché de `verificarCuenta`) y no lanza. */
export async function saludToken(c: ConfigCuenta | null, op: OpcionesPeticion = { intentos: 1 }): Promise<SaludToken> {
  if (!c) return { ok: false, motivo: "GITHUB_TOKEN no está configurado en el servidor" };
  try {
    const res = await peticionApi(c, "/user", {}, op);
    if (res.status === 401) return { ok: false, motivo: "El token de GitHub no es válido o expiró" };
    if (!res.ok) return { ok: false, motivo: `GitHub respondió HTTP ${res.status}` };
    const login = ((await res.json()) as { login?: string }).login ?? "";
    if (login.toLowerCase() !== c.cuenta.toLowerCase()) return { ok: false, login, motivo: `El token es de «${login}», no de ${c.cuenta}` };
    return { ok: true, login };
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
}

async function asegurarEtiqueta(cfg: ConfigGithub, nombre: string, color: string, descripcion: string, op: OpcionesPeticion) {
  const clave = `${cfg.api}|${cfg.repo}|${nombre}`;
  if (etiquetasListas.has(clave)) return;
  const res = await peticion(cfg, "/labels", { method: "POST", body: JSON.stringify({ name: nombre, color, description: descripcion.slice(0, 100) }) }, op);
  // 422 = ya existe
  if (!res.ok && res.status !== 422) {
    throw new ErrorGithub(`No se pudo crear la etiqueta «${nombre}» (HTTP ${res.status})`, false, res.status);
  }
  etiquetasListas.add(clave);
}

/** Evita que un «@usuario» escrito en la conversación notifique a alguien en GitHub. */
const sinMenciones = (s: string) => s.replace(/(^|[^\w.])@(?=\w)/g, "$1@​");

export interface DatosIssue {
  ticket: number;
  modulo: Modulo;
  /** Título que devolvió el asiento al cerrar. */
  titulo: string;
  /** Especificación (markdown) que devolvió el asiento al cerrar. */
  spec: string;
  /** Fotos de la solicitud, con su enlace protegido por el login de ops. */
  fotos: { nombre: string; url: string }[];
  /** PDF de la solicitud, con su enlace protegido. */
  documentos: { nombre: string; url: string }[];
  /** Quienes escribieron en la solicitud. */
  solicitantes: { nombre: string; email: string }[];
  /** Guardada mientras la sala era un módulo propuesto: lleva además la etiqueta «modulo-nuevo». */
  moduloNuevo?: boolean;
}

/** Título del Issue: empieza con el ticket, que es lo que se busca para no duplicarlo. */
export const tituloIssue = (d: DatosIssue) => `[${codigoTicket(d.ticket)}][${d.modulo.nombre}] ${d.titulo}`.slice(0, 250);

/** Cuerpo del Issue: la especificación, las secciones «Fotos» y «Documentos» (si hay) y quién lo envió. */
export function cuerpoIssue(d: DatosIssue): string {
  const documentos = d.documentos.length ? `\n\n## Documentos\n\n${d.documentos.map((f) => `- [${f.nombre}](${f.url})`).join("\n")}` : "";
  const fotos = d.fotos.length ? `\n\n## Fotos\n\n${d.fotos.map((f) => `- [${f.nombre}](${f.url})`).join("\n")}` : "";
  const por = d.solicitantes.map((x) => x.nombre).join(", ") || "—";
  return `${sinMenciones(d.spec.trim())}${fotos}${documentos}\n\n---\nEnviado desde el portal gerencial por ${sinMenciones(por)}`;
}

/**
 * Issue ya creado para este ticket (los más recientes con la etiqueta «gerencia»). Se consulta antes de reintentar:
 * si un intento anterior llegó a GitHub pero se perdió la respuesta, no se crea un duplicado.
 */
export async function buscarIssuePorTicket(cfg: ConfigGithub, ticket: number, op: OpcionesPeticion = {}): Promise<{ numero: number; url: string } | null> {
  const q = new URLSearchParams({ labels: ETIQUETA_ISSUES, state: "all", per_page: "100", sort: "created", direction: "desc" });
  const res = await peticion(cfg, `/issues?${q}`, {}, op);
  if (!res.ok) throw new ErrorGithub(`No se pudo consultar los Issues (HTTP ${res.status})`, res.status >= 500, res.status);
  const prefijo = `[${codigoTicket(ticket)}]`;
  const lista = (await res.json()) as { number: number; html_url: string; title: string; pull_request?: unknown }[];
  const hallado = lista.find((i) => !i.pull_request && i.title.startsWith(prefijo));
  return hallado ? { numero: hallado.number, url: hallado.html_url } : null;
}

/**
 * Crea el Issue en el repositorio del módulo, con la cuenta de DataSHEQ (verificada antes de enviar) y sus etiquetas.
 * Con `comprobarDuplicado`, primero busca uno existente con el mismo ticket.
 */
export async function crearIssueEn(
  cuenta: ConfigCuenta,
  repo: string,
  d: DatosIssue,
  op: OpcionesPeticion & { comprobarDuplicado?: boolean } = {},
): Promise<{ numero: number; url: string; existente?: true }> {
  await verificarCuenta(cuenta, op);
  const cfg = paraRepo(cuenta, repo);
  if (op.comprobarDuplicado) {
    const ya = await buscarIssuePorTicket(cfg, d.ticket, op);
    if (ya) return { ...ya, existente: true };
  }
  const etiquetas: [string, string, string][] = [
    [d.modulo.nombre, d.modulo.color, `${d.modulo.area}: ${d.modulo.descripcion}`],
    [ETIQUETA_ISSUES, "6f42c1", "Requerimiento levantado por gerencia en el portal"],
    [ETIQUETA_SPEC, "1d76db", "Especificación completa lista para revisar"],
    [ETIQUETA_REVISION, "0e8a16", "Listo para que una persona lo revise"],
  ];
  if (d.moduloNuevo) etiquetas.push([ETIQUETA_MODULO_NUEVO, "fbca04", "Especificación de un módulo propuesto, publicada al activarlo"]);
  for (const [nombre, color, descripcion] of etiquetas) await asegurarEtiqueta(cfg, nombre, color, descripcion, op);
  const res = await peticion(
    cfg,
    "/issues",
    { method: "POST", body: JSON.stringify({ title: tituloIssue(d), body: cuerpoIssue(d), labels: etiquetas.map(([n]) => n) }) },
    op,
  );
  if (!res.ok) {
    const detalle = ((await res.json().catch(() => ({}))) as { message?: string }).message;
    // 401/403/404/422: token, permisos, repositorio o datos inválidos; reintentar no lo arregla
    throw new ErrorGithub(`GitHub respondió HTTP ${res.status}${detalle ? `: ${detalle}` : ""}`, false, res.status);
  }
  const issue = (await res.json()) as { number: number; html_url: string };
  return { numero: issue.number, url: issue.html_url };
}
