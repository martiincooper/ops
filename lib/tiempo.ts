// Fechas de negocio en la zona horaria de la empresa (por defecto America/Santiago).
// Nunca usar toISOString().split("T")[0] para "hoy": eso es la fecha UTC.

import { VENTANAS_DEFECTO, leerVentana, type Ventanas } from "./jornada";

export const TZ_NEGOCIO = process.env.TZ_NEGOCIO || "America/Santiago";

/** Ventanas de la bitácora (hora de Chile). Configurables con VENTANA_MANANA / VENTANA_TARDE = "HH:MM-HH:MM". */
export const VENTANAS: Ventanas = {
  manana: leerVentana(process.env.VENTANA_MANANA, VENTANAS_DEFECTO.manana),
  tarde: leerVentana(process.env.VENTANA_TARDE, VENTANAS_DEFECTO.tarde),
};

/** Hora límite de cierre para que el día cuente en la racha: fin de la ventana de la tarde. */
export const HORA_LIMITE_RACHA = VENTANAS.tarde.fin;
/** Cumplimiento mínimo (%) para que el día cuente en la racha. */
export const UMBRAL_RACHA = 75;

const fmtFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_NEGOCIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ_NEGOCIO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Instante actual como ISO-8601 UTC (con Z). */
export function ahoraIso(): string {
  return new Date().toISOString();
}

/** Fecha local (YYYY-MM-DD) de un instante. */
export function fechaLocal(instante: Date | string = new Date()): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return fmtFecha.format(d);
}

/** Hora local (HH:MM) de un instante. */
export function horaLocal(instante: Date | string): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return fmtHora.format(d);
}

export function hoyLocal(): string {
  return fechaLocal(new Date());
}

/** Suma (o resta) días a una fecha YYYY-MM-DD, sin depender de la zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export function esFinDeSemana(fecha: string): boolean {
  const d = diaSemana(fecha);
  return d === 0 || d === 6;
}

export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Jueves, 1 de octubre" */
export function fechaLarga(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS[diaSemana(fecha)]}, ${d} de ${MESES[m - 1]}`;
}

/** "jue 1 oct" */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS[diaSemana(fecha)].slice(0, 3).toLowerCase()} ${d} ${MESES[m - 1].slice(0, 3)}`;
}
