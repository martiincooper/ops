// «Módulos propuestos» en el panel: salas propuestas con sus especificaciones guardadas, CONTEXT.md y ADRs, y los
// documentos tal como irán al repositorio. Sin "server-only" para poder probarlo con scripts/test-logica.ts.
import type Database from "better-sqlite3";
import { crearZip } from "../zip";
import { moduloPorClave } from "./catalogo";
import { type Modulo, codigoTicket } from "./modulos";
import { type Mensaje, type Participante, mensajes, participantes } from "./salas";

type DB = Database.Database;

export interface ResumenPropuesto {
  clave: string;
  nombre: string;
  descripcion: string;
  creado_por: string | null;
  /** Solicitudes terminadas con su especificación guardada. */
  guardadas: number;
  abierta: boolean;
  /** Último mensaje, cierre o inicio de solicitud (o la creación de la sala). */
  ultima_actividad: string;
}

/** Salas propuestas no archivadas, la de actividad más reciente primero. */
export function listarPropuestos(db: DB): ResumenPropuesto[] {
  return db
    .prepare(
      `SELECT m.clave, m.nombre, m.descripcion, m.creado_por,
              (SELECT COUNT(*) FROM chat_solicitudes s WHERE s.sala = m.clave AND s.estado = 'terminada' AND s.spec IS NOT NULL) AS guardadas,
              EXISTS (SELECT 1 FROM chat_solicitudes s WHERE s.sala = m.clave AND s.estado = 'abierta') AS abierta,
              MAX(m.creado_en,
                  COALESCE((SELECT MAX(MAX(s.iniciada_en, COALESCE(s.terminada_en, ''))) FROM chat_solicitudes s WHERE s.sala = m.clave), ''),
                  COALESCE((SELECT MAX(x.creado_en) FROM chat_mensajes x JOIN chat_solicitudes s ON s.id = x.solicitud_id WHERE s.sala = m.clave), '')) AS ultima_actividad
         FROM chat_modulos m
        WHERE m.estado_modulo = 'propuesto' AND m.archivado = 0
        ORDER BY ultima_actividad DESC, m.nombre COLLATE NOCASE`,
    )
    .all()
    .map((f) => ({ ...(f as Omit<ResumenPropuesto, "abierta">), abierta: !!(f as { abierta: number }).abierta }));
}

export interface SpecPropuesta {
  id: string;
  ticket: string;
  titulo: string;
  spec: string;
  fecha: string;
  participantes: Participante[];
  mensajes: Mensaje[];
}

export interface DetallePropuesto {
  modulo: Modulo;
  abierta: boolean;
  specs: SpecPropuesta[];
  context: string;
  adrs: { archivo: string; titulo: string; contenido: string }[];
  /** Solicitudes abiertas o cerradas sin guardar, solo con su transcripción. */
  otras: { id: string; ticket: string; estado: string; iniciada_en: string; participantes: Participante[]; mensajes: Mensaje[] }[];
}

/** La sala propuesta (activa o archivada) con todo lo que gerencia dejó; undefined si no existe o no es propuesta. */
export function detallePropuesto(db: DB, clave: string): DetallePropuesto | undefined {
  const modulo = moduloPorClave(db, clave);
  if (!modulo || modulo.estado_modulo !== "propuesto") return undefined;
  const doc = db.prepare("SELECT contexto, adrs FROM chat_modulos WHERE clave = ?").get(clave) as { contexto: string; adrs: string };
  const filas = db
    .prepare("SELECT id, ticket, estado, titulo, spec, iniciada_en, terminada_en FROM chat_solicitudes WHERE sala = ? ORDER BY ticket")
    .all(clave) as { id: string; ticket: number; estado: string; titulo: string | null; spec: string | null; iniciada_en: string; terminada_en: string | null }[];
  const specs: SpecPropuesta[] = [];
  const otras: DetallePropuesto["otras"] = [];
  for (const f of filas) {
    const comunes = { id: f.id, ticket: codigoTicket(f.ticket), participantes: participantes(db, f.id), mensajes: mensajes(db, f.id) };
    if (f.estado === "terminada" && f.spec) specs.push({ ...comunes, titulo: f.titulo ?? "", spec: f.spec, fecha: f.terminada_en ?? f.iniciada_en });
    else otras.push({ ...comunes, estado: f.estado, iniciada_en: f.iniciada_en });
  }
  return { modulo, abierta: filas.some((f) => f.estado === "abierta"), specs, context: doc.contexto, adrs: JSON.parse(doc.adrs), otras };
}

export interface DocumentoDescarga {
  /** Ruta en el repositorio: «CONTEXT.md», «docs/adr/…», «specs/GER-0001.md». */
  ruta: string;
  contenido: string;
}

/** Los documentos de la sala con la disposición que tendrán en el repositorio. */
export function documentosPropuesto(d: DetallePropuesto): DocumentoDescarga[] {
  return [
    { ruta: "CONTEXT.md", contenido: d.context },
    ...d.adrs.map((a) => ({ ruta: `docs/adr/${nombreArchivo(a.archivo)}`, contenido: a.contenido })),
    ...d.specs.map((s) => ({ ruta: `specs/${s.ticket}.md`, contenido: s.spec })),
  ];
}

/** Solo el nombre, sin carpetas ni caracteres raros (los ADR vienen del asiento). */
export function nombreArchivo(n: string): string {
  const base = (n.split(/[\\/]/).pop() ?? "").replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").trim();
  return base ? (/\.md$/i.test(base) ? base : `${base}.md`) : "adr.md";
}

export const zipPropuesto = (d: DetallePropuesto) => crearZip(documentosPropuesto(d).map((x) => ({ ruta: x.ruta, contenido: x.contenido })));
