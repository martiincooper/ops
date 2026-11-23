// Configuración de GitHub para el portal gerencial (desde las variables de entorno). El cliente HTTP, con reintentos y
// sin duplicados, está en ./githubApi; el envío con reintentos automáticos programados, en ./envio.
import "server-only";
import { configDesdeEntorno } from "./githubApi";
import type { ConfigCuenta } from "./seguimiento";

export function githubConfigurado(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/** Cuenta de DataSHEQ con que se crean y siguen los Issues (null sin token). */
export function configGithub(): ConfigCuenta | null {
  return configDesdeEntorno();
}
