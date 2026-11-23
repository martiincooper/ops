// Markdown a HTML seguro para los documentos de un módulo propuesto (especificaciones, CONTEXT.md, ADRs). Todo el texto
// se escapa primero: el HTML en bruto nunca llega a la página y solo los enlaces http(s) se vuelven enlaces.
// Sin "server-only": lo usan el panel (cliente) y scripts/test-logica.ts.

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Párrafo en línea: `código`, **negrita**, *cursiva* y [texto](https://…). */
function enLinea(texto: string): string {
  const codigos: string[] = [];
  let s = escapar(texto).replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codigos.push(`<code>${c}</code>`) - 1}\u0000`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t: string, url: string) =>
    /^https?:\/\//i.test(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${t}</a>` : t,
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codigos[Number(i)]);
}

export function markdownAHtml(md: string): string {
  const lineas = md.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(l)) {
      const cod: string[] = [];
      i++;
      while (i < lineas.length && !/^```/.test(lineas[i])) cod.push(lineas[i++]);
      i++;
      html.push(`<pre><code>${escapar(cod.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      html.push(`<h${h[1].length}>${enLinea(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      html.push("<hr>");
      i++;
      continue;
    }
    const lista = /^\s*([-*+]|\d+[.)])\s+/.exec(l);
    if (lista) {
      const ordenada = /\d/.test(lista[1]);
      const items: string[] = [];
      while (i < lineas.length && /^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) items.push(`<li>${enLinea(lineas[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ""))}</li>`);
      html.push(`<${ordenada ? "ol" : "ul"}>${items.join("")}</${ordenada ? "ol" : "ul"}>`);
      continue;
    }
    if (/^>/.test(l)) {
      const q: string[] = [];
      while (i < lineas.length && /^>/.test(lineas[i])) q.push(lineas[i++].replace(/^>\s?/, ""));
      html.push(`<blockquote>${enLinea(q.join(" "))}</blockquote>`);
      continue;
    }
    const p: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(```|#{1,6}\s|>|\s*([-*+]|\d+[.)])\s+)/.test(lineas[i])) p.push(lineas[i++]);
    html.push(`<p>${p.map(enLinea).join("<br>")}</p>`);
  }
  return html.join("\n");
}
