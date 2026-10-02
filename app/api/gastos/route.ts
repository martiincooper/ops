import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { MAX_COMPROBANTE_BYTES, borrarComprobante, detectarTipo, guardarComprobante } from "@/lib/archivos";
import { contexto } from "@/lib/auth";
import { bitacoraDe, gastosRecientes, ivaRecuperable, proyectosActivos } from "@/lib/dominio";
import { esquemaGasto } from "@/lib/esquemas";
import { HttpError, manejar } from "@/lib/http";
import { normalizarRut } from "@/lib/rut";
import { hoyLocal } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export const GET = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);
  return NextResponse.json({ gastos: gastosRecientes(db, u.id) });
});

export const POST = manejar(async (req: NextRequest) => {
  const { u, db, empresa } = await contexto(req, ["team"]);

  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_COMPROBANTE_BYTES + 256 * 1024) throw new HttpError(413, "El comprobante supera 10 MB");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Formulario inválido (se espera multipart/form-data)");
  }
  const campo = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const g = esquemaGasto.parse({
    proyecto_id: campo("proyecto_id"),
    item: campo("item"),
    monto_item_clp: campo("monto_item_clp"),
    monto_envio_clp: campo("monto_envio_clp") || 0,
    tipo_documento: campo("tipo_documento"),
    rut_emisor: campo("rut_emisor") || null,
    folio_documento: campo("folio_documento"),
    fecha_documento: campo("fecha_documento"),
  });

  const hoy = hoyLocal();
  if (g.fecha_documento > hoy) throw new HttpError(400, "La fecha del documento no puede ser futura");

  let rut: string | null = null;
  if (g.rut_emisor) {
    rut = normalizarRut(g.rut_emisor);
    if (!rut) throw new HttpError(400, "RUT del emisor inválido (revisa el dígito verificador)");
  } else if (g.tipo_documento === "factura") {
    throw new HttpError(400, "El RUT del emisor es obligatorio para facturas");
  }

  const archivo = form.get("comprobante");
  if (!(archivo instanceof File) || archivo.size === 0) throw new HttpError(400, "Adjunta la foto o PDF del comprobante");
  if (archivo.size > MAX_COMPROBANTE_BYTES) throw new HttpError(413, "El comprobante supera 10 MB");
  const datos = Buffer.from(await archivo.arrayBuffer());
  const tipo = detectarTipo(datos);
  if (!tipo) throw new HttpError(415, "Formato no admitido: usa JPG, PNG, WEBP, HEIC o PDF");
  if (!proyectosActivos(db).some((p) => p.id === g.proyecto_id)) {
    throw new HttpError(400, "Proyecto inexistente o no activo");
  }
  if (
    rut &&
    db
      .prepare("SELECT 1 FROM gastos WHERE rut_emisor = ? AND tipo_documento = ? AND folio_documento = ?")
      .get(rut, g.tipo_documento, g.folio_documento)
  ) {
    throw new HttpError(409, `Ese documento (${g.tipo_documento} ${g.folio_documento}, RUT ${rut}) ya fue rendido`);
  }

  const id = randomUUID();
  const rel = await guardarComprobante(empresa.clave, id, datos, tipo);
  try {
    db.prepare(
      `INSERT INTO gastos (id, usuario_id, proyecto_id, bitacora_id, fecha_documento, item,
                           monto_item_clp, monto_envio_clp, iva_clp, tipo_documento, rut_emisor,
                           folio_documento, comprobante_archivo, comprobante_mime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      u.id,
      g.proyecto_id,
      bitacoraDe(db, u.id, hoy)?.id ?? null,
      g.fecha_documento,
      g.item,
      g.monto_item_clp,
      g.monto_envio_clp,
      ivaRecuperable(g.tipo_documento, g.monto_item_clp, g.monto_envio_clp),
      g.tipo_documento,
      rut,
      g.folio_documento,
      rel,
      tipo.mime,
    );
  } catch (e) {
    await borrarComprobante(empresa.clave, rel);
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "Ese documento ya fue rendido");
    }
    throw e;
  }

  return NextResponse.json({ id, gastos: gastosRecientes(db, u.id) }, { status: 201 });
});
