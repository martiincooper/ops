// Empresas que comparten el sitio. Cada una tiene su propia base SQLite y carpeta de comprobantes.
// Las cuentas de equipo y gerencia pertenecen a la empresa del dominio de su email.
//
// Configurable con EMPRESAS="clave|Nombre|dominio1,dominio2;clave2|Nombre 2|dominio3"

export interface Empresa {
  clave: string; // carpeta de datos: /data/empresas/<clave>
  nombre: string;
  dominios: string[];
}

const DEFECTO = "aether-tech|Aether Tech|aether-tech.dev;datasheq|Datasheq|datasheq.cl";

function leer(config: string): Empresa[] {
  const lista = config
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [clave, nombre, dominios] = s.split("|").map((x) => x?.trim() ?? "");
      if (!/^[a-z0-9-]{2,40}$/.test(clave) || !nombre || !dominios) {
        throw new Error(`EMPRESAS mal definida en "${s}" (formato: clave|Nombre|dominio1,dominio2)`);
      }
      return {
        clave,
        nombre,
        dominios: dominios.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
      };
    });
  const todos = lista.flatMap((e) => e.dominios);
  if (new Set(todos).size !== todos.length) throw new Error("EMPRESAS: un dominio aparece en dos empresas");
  if (new Set(lista.map((e) => e.clave)).size !== lista.length) throw new Error("EMPRESAS: clave repetida");
  if (!lista.length) throw new Error("EMPRESAS vacía");
  return lista;
}

export const EMPRESAS: Empresa[] = leer(process.env.EMPRESAS || DEFECTO);

export function empresaPorClave(clave: string | null | undefined): Empresa | undefined {
  return clave ? EMPRESAS.find((e) => e.clave === clave) : undefined;
}

export function dominioDe(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function empresaPorEmail(email: string): Empresa | undefined {
  const d = dominioDe(email);
  return EMPRESAS.find((e) => e.dominios.includes(d));
}

/** Datos públicos para componentes cliente. */
export function empresasPublicas() {
  return EMPRESAS.map(({ clave, nombre, dominios }) => ({ clave, nombre, dominios }));
}
