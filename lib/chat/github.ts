// Configuración de GitHub para el portal gerencial (desde las variables de entorno). El cliente HTTP, con reintentos y
// sin duplicados, está en ./githubApi; el envío con reintentos automáticos programados, en ./envio.
import "server-only";
import { configDesdeEntorno } from "./githubApi";
import type { ConfigGithub } from "./seguimiento";

export function githubConfigurado(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/** Configuración para crear y seguir Issues (null sin token). */
export function configGithub(): ConfigGithub | null {
  return configDesdeEntorno();
}

export const repositorioIssues = () => process.env.GITHUB_REPO || "martiincooper/ops";
