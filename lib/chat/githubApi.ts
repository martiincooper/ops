// Cliente de la API de GitHub para los Issues del portal gerencial: crea el Issue con sus etiquetas, reintenta los
// errores transitorios (red, tiempo de espera, 5xx, 429) y evita duplicados al reintentar. La configuración llega por
// parámetro; sin "server-only" para poder probarlo contra un GitHub simulado (scripts/test-logica.ts).
import type { Requerimiento } from "./flujo";
import { NOMBRE_CLASIFICACION, NOMBRE_PRIORIDAD, codigoTicket, type Modulo } from "./modulos";
import { ETIQUETA_ISSUES, type ConfigGithub } from "./seguimiento";

/** GITHUB_TOKEN, GITHUB_REPO (por defecto martiincooper/ops) y GITHUB_API_URL (GitHub Enterprise o pruebas). */
export function configDesdeEntorno(env: NodeJS.ProcessEnv = process.env): ConfigGithub | null {
  const token = env.GITHUB_TOKEN;
  if (!token) return null;
  return {
    api: (env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, ""),
    repo: env.GITHUB_REPO || "martiincooper/ops",
    token,
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
  const intentos = op.intentos ?? 3;
  const esperas = op.esperas ?? [500, 1500];
  const dormir = op.dormir ?? dormirReal;
  let ultimo = "";
  let espera = 0;
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await dormir(espera);
    espera = esperas[Math.min(i, esperas.length - 1)] ?? 0;
    try {
      const res = await fetch(`${cfg.api}/repos/${cfg.repo}${ruta}`, {
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

const PRIORIDAD_COLOR: Record<string, string> = { critica: "b60205", alta: "d93f0b", media: "fbca04", baja: "0e8a16" };

const etiquetasListas = new Set<string>(); // etiquetas que ya existen (cache del proceso, por repositorio)

/** Solo para pruebas. */
export function olvidarEtiquetas() {
  etiquetasListas.clear();
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
const lista = (xs: string[], vacio = "_No se indicó._") => (xs.length ? xs.map((x) => `- ${sinMenciones(x)}`).join("\n") : vacio);

export interface DatosIssue {
  ticket: number;
  modulo: Modulo;
  requerimiento: Requerimiento;
  solicitante: { nombre: string; email: string };
  conversacionId: string;
  fecha: string;
  transcripcion: { autor: string; texto: string }[];
}

/** Título del Issue: empieza con el ticket, que es lo que se busca para no duplicarlo. */
export const tituloIssue = (d: DatosIssue) =>
  `[${codigoTicket(d.ticket)}][${d.modulo.nombre}] ${d.requerimiento.titulo}`.slice(0, 250);

export function cuerpoIssue(d: DatosIssue): string {
  const r = d.requerimiento;
  const t = codigoTicket(d.ticket);
  const transcripcion = d.transcripcion
    .map((l) => `**${l.autor}:** ${sinMenciones(l.texto).replace(/\n/g, "  \n")}`)
    .join("\n\n");
  return `## Requerimiento ${t} · ${d.modulo.nombre}

| Campo | Valor |
|---|---|
| Ticket | **${t}** |
| Módulo | ${d.modulo.nombre} (${d.modulo.area}) |
| Prioridad | ${NOMBRE_PRIORIDAD[r.prioridad]} |
| Clasificación | ${NOMBRE_CLASIFICACION[r.clasificacion]} |
| Solicitado por | ${d.solicitante.nombre} (${d.solicitante.email}) |
| Fecha | ${d.fecha} |
| Plazo indicado | ${r.plazo ? sinMenciones(r.plazo) : "—"} |

### Resumen
${sinMenciones(r.resumen)}

### Contexto
${sinMenciones(r.contexto) || "_No se indicó._"}

### Necesidad
${sinMenciones(r.necesidad) || "_No se indicó._"}

### Alcance
${lista(r.alcance)}

### Criterios de aceptación
${r.criterios_aceptacion.length ? r.criterios_aceptacion.map((c) => `- [ ] ${sinMenciones(c)}`).join("\n") : "_No se indicaron._"}

### Interesados
${lista(r.interesados)}

### Prioridad
${sinMenciones(r.justificacion_prioridad)}

<details>
<summary>Transcripción de la entrevista</summary>

${transcripcion}

</details>

---
_Creado automáticamente por el portal gerencial de DataSheq · conversación \`${d.conversacionId}\`._`;
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

/** Crea el Issue con sus etiquetas. Con `comprobarDuplicado`, primero busca uno existente con el mismo ticket. */
export async function crearIssueEn(
  cfg: ConfigGithub,
  d: DatosIssue,
  op: OpcionesPeticion & { comprobarDuplicado?: boolean } = {},
): Promise<{ numero: number; url: string; existente?: true }> {
  if (op.comprobarDuplicado) {
    const ya = await buscarIssuePorTicket(cfg, d.ticket, op);
    if (ya) return { ...ya, existente: true };
  }
  const r = d.requerimiento;
  const etiquetas: [string, string, string][] = [
    [d.modulo.nombre, d.modulo.color, `${d.modulo.area}: ${d.modulo.descripcion}`],
    [`prioridad: ${NOMBRE_PRIORIDAD[r.prioridad].toLowerCase()}`, PRIORIDAD_COLOR[r.prioridad], "Prioridad asignada en el portal gerencial"],
    [`tipo: ${NOMBRE_CLASIFICACION[r.clasificacion].toLowerCase()}`, "c5def5", "Clasificación del requerimiento"],
    [ETIQUETA_ISSUES, "6f42c1", "Requerimiento levantado por gerencia en el portal"],
  ];
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
