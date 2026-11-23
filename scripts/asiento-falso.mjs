// Asiento de entrevista simulado (sin Claude real) para el CI y las pruebas e2e. Cumple el contrato del asiento:
// GET /api/interview/health, POST /api/interview/turn y POST /api/interview/close, con `Authorization: Bearer <token>`.
// Guion: hace dos preguntas y, en el tercer turno, informa `done` con un resumen. Al cerrar devuelve un título y una
// especificación fijos. Un turno con una foto la menciona (así se comprueba que viajó en base64).
// Control para las pruebas (sin token): POST /control {"falla": 503|0, "fallaCierre": 503|0, "demora": ms} · GET /control (turnos recibidos).
// Uso: INTERVIEW_TOKEN=... node scripts/asiento-falso.mjs [archivo-del-puerto]
import fs from "node:fs";
import http from "node:http";

const TOKEN = process.env.INTERVIEW_TOKEN ?? "token-asiento";
let falla = 0;
let demora = 0;
let fallaCierre = 0;
const cierres = [];
const turnos = [];

// Salas propuestas (`kind: "propuesta"`): mismo guion, y se guardan los cuerpos recibidos (GET /control → turnos[].cuerpo)
function turno(json, responder) {
  const hechas = json.messages.filter((m) => m.role === "asistente").length;
  const fotos = json.messages.reduce((n, m) => n + m.photos.length, 0);
  turnos.push({ requestId: json.requestId, repo: json.repo, kind: json.kind, session: json.session, mensajes: json.messages.length, fotos, cuerpo: json.kind === "propuesta" ? json : undefined });
  const sesion = json.session ?? `sesion-${json.requestId}`;
  if (hechas === 0) return responder(200, { session: sesion, message: `¿Qué necesitan resolver exactamente?${fotos ? ` (recibí ${fotos} foto${fotos > 1 ? "s" : ""})` : ""}`, done: false, summary: null });
  if (hechas === 1) return responder(200, { session: sesion, message: "¿Quién usaría esto y cada cuánto?", done: false, summary: null });
  return responder(200, { session: sesion, message: "Entendido todo. Este es el resumen.", done: true, summary: "Resumen de prueba del requerimiento." });
}

const servidor = http.createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://x");
  const responder = (status, json = {}) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    const json = cuerpo ? JSON.parse(cuerpo) : {};
    if (pathname === "/control") {
      if (req.method === "POST") {
        falla = Number(json.falla) || 0;
        demora = Number(json.demora) || 0;
        fallaCierre = Number(json.fallaCierre) || 0;
      }
      return responder(200, { falla, demora, fallaCierre, turnos, cierres });
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return responder(401, { error: "token inválido" });
    if (pathname === "/api/interview/health") return responder(200, { ok: true });
    if (pathname === "/api/interview/turn" && req.method === "POST") {
      if (falla) return responder(falla, { error: "falla simulada" });
      return setTimeout(() => turno(json, responder), demora);
    }
    if (pathname === "/api/interview/close" && req.method === "POST") {
      cierres.push({ requestId: json.requestId, kind: json.kind, session: json.session, mensajes: json.messages.length, fotos: json.messages.reduce((n, m) => n + m.photos.length, 0), cuerpo: json.kind === "propuesta" ? json : undefined });
      if (fallaCierre) return responder(fallaCierre, { error: "falla simulada" });
      if (json.kind === "propuesta") {
        return responder(200, {
          session: json.session,
          title: "Módulo propuesto de prueba",
          spec: "## Decisiones del negocio\n\nEspecificación de prueba de un módulo propuesto",
          context: "# Módulo propuesto\n\nGlosario de prueba.",
          adrs: [{ file: "0001-decision-de-prueba.md", title: "Decisión de prueba", content: "# Decisión de prueba\n\nSe decidió algo." }],
        });
      }
      return responder(200, { session: json.session, title: "Requerimiento de prueba", spec: "## Decisiones del negocio\n\nEspecificación de prueba" });
    }
    responder(404, { error: "no existe" });
  });
});
servidor.listen(Number(process.env.ASIENTO_FALSO_PORT ?? 0), process.env.ASIENTO_FALSO_HOST ?? "127.0.0.1", () => {
  const { port } = servidor.address();
  if (process.argv[2]) fs.writeFileSync(process.argv[2], String(port));
  console.log(`Asiento de entrevista simulado en http://127.0.0.1:${port}`);
});
