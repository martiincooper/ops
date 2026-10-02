// Migraciones versionadas con PRAGMA user_version. Solo se agregan entradas al final.

const ISO_AHORA = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

export const MIGRACIONES: string[] = [
  // v1 — esquema corregido (ver docs/REVISION.md §3)
  `
  CREATE TABLE usuarios (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    rol TEXT NOT NULL CHECK (rol IN ('team', 'admin', 'executive')),
    avatar_url TEXT,
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    pin_hash TEXT,                                   -- NULL => código inicial (PIN_INICIAL)
    debe_cambiar_pin INTEGER NOT NULL DEFAULT 1 CHECK (debe_cambiar_pin IN (0, 1)),
    version_sesion INTEGER NOT NULL DEFAULT 0,       -- se incrementa para revocar sesiones
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta TEXT,
    ultimo_acceso TEXT,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );

  CREATE TABLE proyectos (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    presupuesto_clp INTEGER NOT NULL CHECK (presupuesto_clp >= 0),
    fecha_inicio TEXT NOT NULL,
    fecha_entrega_objetivo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'concepto'
      CHECK (estado IN ('concepto', 'prototipado', 'pruebas', 'entregado', 'pausado')),
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    CHECK (fecha_entrega_objetivo >= fecha_inicio)
  );

  CREATE TABLE bitacoras (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    fecha TEXT NOT NULL,                             -- fecha local de negocio YYYY-MM-DD
    checkin_manana TEXT NOT NULL,                    -- ISO UTC
    checkout_tarde TEXT,                             -- ISO UTC
    bloqueos TEXT,
    bloqueo_resuelto_en TEXT,
    bloqueo_resuelto_por TEXT REFERENCES usuarios(id),
    UNIQUE (usuario_id, fecha)
  );

  CREATE TABLE tareas_diarias (
    id TEXT PRIMARY KEY,
    bitacora_id TEXT NOT NULL REFERENCES bitacoras(id) ON DELETE CASCADE,
    proyecto_id TEXT NOT NULL REFERENCES proyectos(id),
    orden INTEGER NOT NULL DEFAULT 0,
    descripcion TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (estado IN ('pendiente', 'completado', 'postergado_ooo')),
    motivo_pendiente TEXT,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    actualizado_en TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );

  CREATE TABLE gastos (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    proyecto_id TEXT NOT NULL REFERENCES proyectos(id),
    bitacora_id TEXT REFERENCES bitacoras(id) ON DELETE SET NULL,
    fecha_documento TEXT NOT NULL,
    item TEXT NOT NULL,
    -- factura: montos netos (como aparecen en las líneas); boleta/extranjero: montos pagados
    monto_item_clp INTEGER NOT NULL CHECK (monto_item_clp >= 0),
    monto_envio_clp INTEGER NOT NULL DEFAULT 0 CHECK (monto_envio_clp >= 0),
    iva_clp INTEGER NOT NULL DEFAULT 0 CHECK (iva_clp >= 0),   -- IVA crédito fiscal (solo factura)
    tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('factura', 'boleta', 'extranjero')),
    rut_emisor TEXT,
    folio_documento TEXT NOT NULL,
    comprobante_archivo TEXT NOT NULL,               -- nombre generado por el servidor
    comprobante_mime TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
    validado_por TEXT REFERENCES usuarios(id),
    validado_en TEXT,
    observacion TEXT,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    CHECK (tipo_documento <> 'factura' OR rut_emisor IS NOT NULL),
    CHECK (monto_item_clp + monto_envio_clp > 0)
  );

  CREATE TABLE ausencias_ooo (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fecha TEXT NOT NULL,
    dia_completo INTEGER NOT NULL DEFAULT 1 CHECK (dia_completo IN (0, 1)),
    hora_inicio TEXT,
    hora_fin TEXT,
    motivo TEXT,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    CHECK (
      (dia_completo = 1 AND hora_inicio IS NULL AND hora_fin IS NULL) OR
      (dia_completo = 0 AND hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_inicio < hora_fin)
    )
  );

  CREATE TABLE feriados (
    fecha TEXT PRIMARY KEY,
    nombre TEXT NOT NULL
  );

  CREATE INDEX idx_bitacora_fecha ON bitacoras (fecha);
  CREATE INDEX idx_tareas_bitacora ON tareas_diarias (bitacora_id);
  CREATE INDEX idx_gastos_proyecto ON gastos (proyecto_id);
  CREATE INDEX idx_gastos_usuario ON gastos (usuario_id, creado_en);
  CREATE UNIQUE INDEX ux_gastos_documento
    ON gastos (rut_emisor, tipo_documento, folio_documento) WHERE rut_emisor IS NOT NULL;
  CREATE INDEX idx_ooo_lookup ON ausencias_ooo (usuario_id, fecha);
  CREATE UNIQUE INDEX ux_ooo_dia_completo ON ausencias_ooo (usuario_id, fecha) WHERE dia_completo = 1;

  -- Feriados nacionales Chile 2026 (fuente: feriados.cl). Agregar 2027 antes de enero.
  INSERT INTO feriados (fecha, nombre) VALUES
    ('2026-01-01', 'Año Nuevo'),
    ('2026-04-03', 'Viernes Santo'),
    ('2026-04-04', 'Sábado Santo'),
    ('2026-05-01', 'Día Nacional del Trabajo'),
    ('2026-05-21', 'Día de las Glorias Navales'),
    ('2026-06-21', 'Día Nacional de los Pueblos Indígenas'),
    ('2026-06-29', 'San Pedro y San Pablo'),
    ('2026-07-16', 'Día de la Virgen del Carmen'),
    ('2026-08-15', 'Asunción de la Virgen'),
    ('2026-09-18', 'Independencia Nacional'),
    ('2026-09-19', 'Día de las Glorias del Ejército'),
    ('2026-10-12', 'Encuentro de Dos Mundos'),
    ('2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes'),
    ('2026-11-01', 'Día de Todos los Santos'),
    ('2026-12-08', 'Inmaculada Concepción'),
    ('2026-12-25', 'Navidad');
  `,
];
