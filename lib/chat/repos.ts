// Repositorio de GitHub de cada módulo: los requerimientos de una sala se envían al repositorio de su módulo. Una sala
// sin repositorio asignado no se muestra en el portal ni admite entrevistas nuevas.
//
// Por defecto solo C-Legal tiene repositorio. GITHUB_REPOS asigna o cambia los demás:
//   GITHUB_REPOS="c-acredita=datasheq-creator/cacredita-railway,c-legal=datasheq-creator/clegal-railway"
// Un valor vacío o «-» deja la sala sin repositorio («c-controla=-»).
// Sin "server-only": lo usan el servidor, las pruebas y la configuración de arranque.
import { type ClaveModulo, MODULOS, moduloPorClave } from "./modulos";

export const REPOS_POR_DEFECTO: Partial<Record<ClaveModulo, string>> = {
  "c-legal": "datasheq-creator/clegal-railway",
};

/** Variables de entorno (process.env u otras, en las pruebas). */
export type Entorno = Record<string, string | undefined>;

const FORMATO_REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

/** Repositorio asignado a cada módulo (null: sin repositorio). Las entradas inválidas se ignoran con un aviso. */
export function reposDeModulos(env: Entorno = process.env): Record<ClaveModulo, string | null> {
  const r = Object.fromEntries(MODULOS.map((m) => [m.clave, REPOS_POR_DEFECTO[m.clave] ?? null])) as Record<ClaveModulo, string | null>;
  for (const parte of (env.GITHUB_REPOS ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
    const [clave, valor = ""] = parte.split("=").map((s) => s.trim());
    const m = moduloPorClave(clave.toLowerCase());
    if (!m) {
      console.warn(`[aether-ops] GITHUB_REPOS: módulo desconocido «${clave}»`);
      continue;
    }
    if (valor === "" || valor === "-") r[m.clave] = null;
    else if (FORMATO_REPO.test(valor)) r[m.clave] = valor;
    else console.warn(`[aether-ops] GITHUB_REPOS: repositorio inválido para ${m.nombre}: «${valor}» (formato dueño/repositorio)`);
  }
  return r;
}

export function repoDe(clave: string, env: Entorno = process.env): string | null {
  const m = moduloPorClave(clave);
  return m ? reposDeModulos(env)[m.clave] : null;
}

/** ¿La sala está disponible en el portal? Solo si su módulo tiene repositorio. */
export function salaActiva(clave: string, env: Entorno = process.env): boolean {
  return repoDe(clave, env) !== null;
}

export function modulosActivos(env: Entorno = process.env): ClaveModulo[] {
  const r = reposDeModulos(env);
  return MODULOS.filter((m) => r[m.clave]).map((m) => m.clave);
}
