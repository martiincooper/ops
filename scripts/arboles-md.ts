// Genera docs/arboles-de-decision.md desde lib/chat/arboles.ts (documento para que la gerencia revise los árboles).
// Uso: npm run arboles:doc        (scripts/test-logica.ts verifica que el documento esté al día)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARBOLES, type Arbol, FIN, MAX_PREGUNTAS, type Nodo, largos } from "../lib/chat/arboles";
import { MODULOS, NOMBRE_CLASIFICACION, NOMBRE_PRIORIDAD, moduloPorClave } from "../lib/chat/modulos";

export const RUTA_DOC = "docs/arboles-de-decision.md";

const TIPO: Record<Nodo["tipo"], string> = {
  opciones: "Opciones (una)",
  multiple: "Opciones (varias)",
  si_no: "Sí / No",
  texto: "Texto libre",
  fecha: "Fecha",
};

const esComun = (id: string) => id.startsWith("comun.");
const mid = (id: string) => (id === FIN ? "FIN" : esComun(id) ? "COMUN" : id.replace(/[^A-Za-z0-9]/g, "_"));
const comillas = (s: string) => s.replace(/"/g, "#quot;");
const corto = (s: string, n = 72) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const celda = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const rango = (l: { min: number; max: number }) => (l.min === l.max ? `${l.min}` : `de ${l.min} a ${l.max}`);

function destino(id: string): string {
  if (id === FIN) return "fin";
  if (esComun(id)) return "cierre común";
  return `\`${id}\``;
}

function diagrama(a: Arbol): string {
  const l = ["```mermaid", "flowchart TD"];
  for (const n of a.nodos.filter((x) => !esComun(x.id))) {
    l.push(`  ${mid(n.id)}["${comillas(corto(n.pregunta))}"]`);
  }
  l.push(`  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]`);
  for (const n of a.nodos.filter((x) => !esComun(x.id))) {
    // Respuestas agrupadas por destino: una flecha por destino (sin etiqueta si todas van al mismo lugar)
    const grupos = new Map<string, string[]>();
    for (const o of n.opciones ?? []) {
      const d = o.siguiente ?? n.siguiente;
      if (d) grupos.set(d, [...(grupos.get(d) ?? []), o.etiqueta]);
    }
    const vistos = new Set<string>();
    for (const [d, etiquetas] of grupos) {
      const rotulo = grupos.size > 1 && n.tipo !== "multiple" ? `|"${comillas(corto(etiquetas.join(" / "), 64))}"|` : "";
      l.push(`  ${mid(n.id)} -->${rotulo} ${mid(d)}`);
      vistos.add(d);
    }
    if ((!n.opciones?.length || n.otra) && n.siguiente && !vistos.has(n.siguiente)) {
      l.push(`  ${mid(n.id)} -->${n.otra ? '|"Otra"|' : ""} ${mid(n.siguiente)}`);
    }
  }
  const sugeridas = a.nodos.flatMap((n) => (n.opciones ?? []).filter((o) => o.sala_sugerida).map((o) => ({ n, o })));
  for (const { n, o } of sugeridas) {
    const s = `SUG_${mid(n.id)}_${o.valor.replace(/[^A-Za-z0-9]/g, "_")}`;
    l.push(`  ${s}(["Sugiere ${moduloPorClave(o.sala_sugerida)?.nombre}"])`);
    l.push(`  ${mid(n.id)} -.->|"${comillas(corto(o.etiqueta, 30))}"| ${s}`);
  }
  l.push("```");
  return l.join("\n");
}

function tabla(nodos: Nodo[]): string {
  const filas = ["| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |", "|---|---|---|---|"];
  for (const n of nodos) {
    const resp: string[] = [];
    for (const o of n.opciones ?? []) {
      const extras = [
        n.tipo !== "multiple" && (o.siguiente ?? n.siguiente) ? `→ ${destino((o.siguiente ?? n.siguiente) as string)}` : "",
        o.sala_sugerida ? `**sugiere ${moduloPorClave(o.sala_sugerida)?.nombre}**` : "",
        o.prioridad ? `prioridad mínima **${NOMBRE_PRIORIDAD[o.prioridad].toLowerCase()}**` : "",
        o.clasificacion ? `tipo **${NOMBRE_CLASIFICACION[o.clasificacion].toLowerCase()}**` : "",
      ].filter(Boolean);
      resp.push(`«${o.etiqueta}»${extras.length ? ` ${extras.join(", ")}` : ""}`);
    }
    if (n.otra) resp.push("«Otra» (respuesta escrita)");
    if (n.tipo === "multiple" || n.otra || !n.opciones?.length) {
      if (n.siguiente) resp.push(`${n.opciones?.length ? "luego " : ""}→ ${destino(n.siguiente)}`);
    }
    if (n.minimo) resp.push(`mínimo ${n.minimo} caracteres; si no, repregunta una vez`);
    filas.push(
      `| \`${n.id}\`<br>${celda(n.pregunta)} | ${TIPO[n.tipo]} | ${n.obligatorio ? "Sí" : "No (se puede saltar)"} | ${celda(resp.join("<br>"))} |`,
    );
  }
  return filas.join("\n");
}

export function documento(): string {
  const comunes = ARBOLES[0].nodos.filter((n) => esComun(n.id));
  const partes: string[] = [
    "# Árboles de decisión de las salas — BORRADOR para revisión",
    "",
    "> Generado desde `lib/chat/arboles.ts` con `npm run arboles:doc`; no editar a mano. Issue #17.",
    "",
    "Cada sala entrevista con preguntas definidas de antemano, sin IA: las respuestas eligen la rama siguiente.",
    "Para revisar, comenta directamente en las líneas de este archivo en el pull request (redacción de una",
    "pregunta, opciones que faltan o sobran, ramas, qué es obligatorio y qué no).",
    "",
    "**Estructura de cada entrevista**",
    "",
    "1. **Inicio** (todas las salas): «¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas.»",
    "   (texto, obligatorio, mínimo 25 caracteres).",
    "2. **Rama del módulo**: preguntas propias de la sala; algunas respuestas llevan a otra rama o sugieren otra sala.",
    "3. **Cierre común** (todas las salas): tipo de solicitud, urgencia, plazo, interesados, resultado esperado y comentario.",
    "",
    `Botones durante la entrevista: «Pasar a la siguiente pregunta» salta solo preguntas **no obligatorias**;`,
    "«Agregar más detalles» amplía la respuesta actual. Al terminar el cierre común se habilita «Finalizar y generar",
    `requerimiento». Ningún recorrido supera ${MAX_PREGUNTAS} preguntas.`,
    "",
    "**Prioridad del requerimiento**: la de la pregunta de urgencia del cierre común; algunas respuestas de la rama",
    "fijan una prioridad **mínima** (por ejemplo, una fiscalización programada → al menos alta). Se usa la más alta.",
    "",
    "| Sala | Preguntas | Recorrido | Ramas | Sugiere otra sala |",
    "|---|---|---|---|---|",
  ];
  for (const a of ARBOLES) {
    const m = MODULOS.find((x) => x.clave === a.modulo)!;
    const l = largos(a);
    const ramas = a.nodos.filter((n) => new Set((n.opciones ?? []).map((o) => o.siguiente).filter(Boolean)).size > 1).length;
    const sug = [...new Set(a.nodos.flatMap((n) => (n.opciones ?? []).map((o) => o.sala_sugerida).filter(Boolean)))]
      .map((s) => moduloPorClave(s)?.nombre)
      .join(", ");
    partes.push(`| [${m.nombre}](#${m.nombre.toLowerCase()}) | ${a.nodos.length - comunes.length} propias (con la de inicio) + 6 comunes | ${rango(l)} | ${ramas} | ${sug || "—"} |`);
  }
  for (const a of ARBOLES) {
    const m = MODULOS.find((x) => x.clave === a.modulo)!;
    const l = largos(a);
    partes.push(
      "",
      `## ${m.nombre}`,
      "",
      `**${m.area}.** ${m.descripcion}`,
      "",
      `Recorrido: ${rango(l)} preguntas.`,
      "",
      diagrama(a),
      "",
      tabla(a.nodos.filter((n) => !esComun(n.id))),
    );
  }
  partes.push("", "## Cierre común (todas las salas)", "", tabla(comunes), "");
  return partes.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(RUTA_DOC, documento());
  console.log(`Escrito ${RUTA_DOC}`);
}
