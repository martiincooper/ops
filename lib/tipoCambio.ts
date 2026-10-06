// Dólar del día (pesos chilenos por 1 USD) para convertir los montos en dólares de las compras al guardarlas.
// Fuente: dólar observado del Banco Central (mindicador.cl); si no responde, open.er-api.com. Se guarda en memoria
// una hora. TIPO_CAMBIO_USD (p. ej. "950") fija el valor: pruebas o servidores sin salida a internet.
import "server-only";
import type { TipoCambio } from "./gastos";
import { fechaLocal, hoyLocal } from "./tiempo";

const VIGENCIA_MS = 60 * 60 * 1000;
let cache: { tc: TipoCambio; hasta: number } | null = null;

async function pedir(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const valido = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 100 && n < 10_000;

async function deMindicador(): Promise<TipoCambio> {
  const d = (await pedir("https://mindicador.cl/api/dolar")) as { serie?: { fecha: string; valor: number }[] };
  const ultimo = d.serie?.[0];
  if (!ultimo || !valido(ultimo.valor)) throw new Error("mindicador: sin valor");
  return { valor: ultimo.valor, fecha: fechaLocal(ultimo.fecha) };
}

async function deErApi(): Promise<TipoCambio> {
  const d = (await pedir("https://open.er-api.com/v6/latest/USD")) as { rates?: { CLP?: number }; time_last_update_unix?: number };
  const valor = d.rates?.CLP;
  if (!valido(valor)) throw new Error("er-api: sin valor");
  const fecha = d.time_last_update_unix ? fechaLocal(new Date(d.time_last_update_unix * 1000).toISOString()) : hoyLocal();
  return { valor: Math.round(valor * 100) / 100, fecha };
}

/** Dólar del día, o null si ninguna fuente responde (la compra en dólares no se puede guardar en ese momento). */
export async function tipoCambioHoy(): Promise<TipoCambio | null> {
  const fijo = Number(process.env.TIPO_CAMBIO_USD);
  if (valido(fijo)) return { valor: fijo, fecha: hoyLocal() };
  if (cache && cache.hasta > Date.now()) return cache.tc;
  for (const fuente of [deMindicador, deErApi]) {
    try {
      const tc = await fuente();
      cache = { tc, hasta: Date.now() + VIGENCIA_MS };
      return tc;
    } catch (e) {
      console.warn("[tipo-cambio]", (e as Error).message);
    }
  }
  return null;
}
