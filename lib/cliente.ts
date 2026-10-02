// Utilidades para componentes cliente.

export class ErrorApi extends Error {
  constructor(public status: number, message: string, public datos: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...resto } = init;
  const res = await fetch(url, {
    ...resto,
    headers: json !== undefined ? { "Content-Type": "application/json", ...resto.headers } : resto.headers,
    body: json !== undefined ? JSON.stringify(json) : resto.body,
    credentials: "same-origin",
  });
  const datos = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    window.location.href = "/login";
  }
  if (res.status === 403 && datos?.debe_cambiar_pin) {
    window.location.href = "/cambiar-pin";
  }
  if (!res.ok) throw new ErrorApi(res.status, datos?.error ?? `Error ${res.status}`, datos);
  return datos as T;
}

const fmtClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
export const clp = (n: number) => fmtClp.format(n);

const fmtMiles = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
export const miles = (n: number) => fmtMiles.format(n);

const fmtHora = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago" });
export const horaDe = (iso: string) => fmtHora.format(new Date(iso));

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
