// Reglas de horario de la jornada, compartidas por servidor y cliente (sin dependencias de Node).
//
// En la ventana de la mañana, si aún no hay objetivos, la bitácora de la mañana es obligatoria.
// En la ventana de la tarde, si la jornada no está cerrada, el cierre es obligatorio.
// Fuera de esas ventanas (o con la encuesta ya hecha) se muestra el tablero personal.

export interface Ventana {
  inicio: string; // HH:MM
  fin: string; // HH:MM
}

export interface Ventanas {
  manana: Ventana;
  tarde: Ventana;
}

export const VENTANAS_DEFECTO: Ventanas = {
  manana: { inicio: "08:30", fin: "10:30" },
  tarde: { inicio: "17:00", fin: "19:30" },
};

/** Lee "HH:MM-HH:MM"; si no es válido devuelve el valor por defecto. */
export function leerVentana(texto: string | undefined, defecto: Ventana): Ventana {
  const m = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.exec(texto ?? "");
  if (!m) return defecto;
  const inicio = `${m[1]}:${m[2]}`;
  const fin = `${m[3]}:${m[4]}`;
  return inicio < fin ? { inicio, fin } : defecto;
}

export type Momento = "antes" | "manana" | "dia" | "tarde" | "despues";

/** Dónde cae una hora local (HH:MM) respecto de las ventanas. Los extremos se incluyen. */
export function momentoDe(hora: string, v: Ventanas): Momento {
  if (hora < v.manana.inicio) return "antes";
  if (hora <= v.manana.fin) return "manana";
  if (hora < v.tarde.inicio) return "dia";
  if (hora <= v.tarde.fin) return "tarde";
  return "despues";
}

export type Fase = "ooo_completo" | "pendiente_manana" | "pendiente_tarde" | "cerrado";
export type Vista = "encuesta_manana" | "encuesta_tarde" | "tablero";

/** Qué ve el integrante: la encuesta solo es obligatoria dentro de su ventana y si aún no la hizo. */
export function vistaPara(fase: Fase, momento: Momento, laborable: boolean): Vista {
  if (!laborable) return "tablero";
  if (fase === "pendiente_manana" && momento === "manana") return "encuesta_manana";
  if (fase === "pendiente_tarde" && momento === "tarde") return "encuesta_tarde";
  return "tablero";
}

/** Hora local HH:MM en una zona horaria (funciona igual en el navegador y en Node). */
export function horaEn(tz: string, d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Fecha local YYYY-MM-DD en una zona horaria. */
export function fechaEn(tz: string, d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
