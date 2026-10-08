// Crea el Issue del requerimiento en GitHub (REST API). Crea las etiquetas que falten (módulo, prioridad, tipo,
// «gerencia»): no hay que configurar nada en el repositorio. Requiere GITHUB_TOKEN con permiso «Issues: write»
// sobre GITHUB_REPO (por defecto martiincooper/ops).
import "server-only";
import type { Requerimiento } from "./guion";
import type { ConfigGithub } from "./seguimiento";
import { NOMBRE_CLASIFICACION, NOMBRE_PRIORIDAD, codigoTicket, type Modulo } from "./modulos";

// GITHUB_API_URL: para GitHub Enterprise o un GitHub simulado en pruebas.
const API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
const REPO = process.env.GITHUB_REPO || "martiincooper/ops";

export function githubConfigurado(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/** Configuración para el seguimiento de Issues (null sin token). */
export function configGithub(): ConfigGithub | null {
  const token = process.env.GITHUB_TOKEN;
  return token ? { api: API, repo: REPO, token } : null;
}

export const repositorioIssues = () => REPO;

export class ErrorGithub extends Error {}

async function gh(ruta: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}/repos/${REPO}${ruta}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "aether-ops",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
}

const PRIORIDAD_COLOR: Record<string, string> = { critica: "b60205", alta: "d93f0b", media: "fbca04", baja: "0e8a16" };

const listas = new Set<string>(); // etiquetas que ya existen (cache del proceso)

async function asegurarEtiqueta(nombre: string, color: string, descripcion: string) {
  if (listas.has(nombre)) return;
  const res = await gh("/labels", { method: "POST", body: JSON.stringify({ name: nombre, color, description: descripcion.slice(0, 100) }) });
  // 422 = ya existe
  if (!res.ok && res.status !== 422) throw new ErrorGithub(`No se pudo crear la etiqueta «${nombre}» (HTTP ${res.status})`);
  listas.add(nombre);
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

/** Crea el Issue con sus etiquetas. Lanza ErrorGithub con un mensaje legible si algo falla. */
export async function crearIssue(d: DatosIssue): Promise<{ numero: number; url: string }> {
  if (!githubConfigurado()) throw new ErrorGithub("GITHUB_TOKEN no está configurado en el servidor");
  const r = d.requerimiento;
  const etiquetas: [string, string, string][] = [
    [d.modulo.nombre, d.modulo.color, `${d.modulo.area}: ${d.modulo.descripcion}`],
    [`prioridad: ${NOMBRE_PRIORIDAD[r.prioridad].toLowerCase()}`, PRIORIDAD_COLOR[r.prioridad], "Prioridad asignada en el portal gerencial"],
    [`tipo: ${NOMBRE_CLASIFICACION[r.clasificacion].toLowerCase()}`, "c5def5", "Clasificación del requerimiento"],
    ["gerencia", "6f42c1", "Requerimiento levantado por gerencia en el portal"],
  ];
  try {
    for (const [nombre, color, descripcion] of etiquetas) await asegurarEtiqueta(nombre, color, descripcion);
    const res = await gh("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: `[${codigoTicket(d.ticket)}][${d.modulo.nombre}] ${r.titulo}`.slice(0, 250),
        body: cuerpoIssue(d),
        labels: etiquetas.map(([n]) => n),
      }),
    });
    if (!res.ok) {
      const detalle = ((await res.json().catch(() => ({}))) as { message?: string }).message;
      throw new ErrorGithub(`GitHub respondió HTTP ${res.status}${detalle ? `: ${detalle}` : ""}`);
    }
    const issue = (await res.json()) as { number: number; html_url: string };
    return { numero: issue.number, url: issue.html_url };
  } catch (e) {
    if (e instanceof ErrorGithub) throw e;
    throw new ErrorGithub(`No se pudo conectar con GitHub: ${(e as Error).message}`);
  }
}
