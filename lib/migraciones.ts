// Migraciones versionadas con PRAGMA user_version. Solo se agregan entradas al final de cada lista.
//
// Dos tipos de base:
//  - control.db        → administradores (jefatura intermedia, email de cualquier dominio) y supervisión
//  - empresas/<clave>  → una base por empresa: equipo, gerencia, proyectos, bitácoras, compras, ausencias

const ISO_AHORA = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

export const MIGRACIONES_CONTROL: string[] = [
  `
  CREATE TABLE usuarios (                            -- administradores; mismas columnas de acceso que en las empresas
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    rol TEXT NOT NULL DEFAULT 'admin' CHECK (rol = 'admin'),
    activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    pin_hash TEXT,
    debe_cambiar_pin INTEGER NOT NULL DEFAULT 1 CHECK (debe_cambiar_pin IN (0, 1)),
    version_sesion INTEGER NOT NULL DEFAULT 0,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta TEXT,
    ultimo_acceso TEXT,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );

  -- Qué administrador supervisa a qué integrante (muchos a muchos; el integrante vive en la base de su empresa)
  CREATE TABLE supervision (
    admin_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    empresa TEXT NOT NULL,
    usuario_id TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    PRIMARY KEY (admin_id, empresa, usuario_id)
  );
  CREATE INDEX idx_supervision_usuario ON supervision (empresa, usuario_id);
  `,
];

export const MIGRACIONES_EMPRESA: string[] = [
  // v1 — esquema corregido (ver docs/REVISION.md §3) + separación por empresa
  `
  CREATE TABLE usuarios (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    rol TEXT NOT NULL CHECK (rol IN ('team', 'executive')),
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
    bloqueo_resuelto_por TEXT,                       -- id del administrador (control.db)
    bloqueo_resuelto_por_nombre TEXT,
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
    validado_por TEXT,                               -- id del administrador (control.db)
    validado_por_nombre TEXT,
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
  // v2 — (1) compras simplificadas: nombre, descripción y monto total pagado; pueden repartirse entre varios
  //          proyectos (gasto_proyectos). Se quitan RUT, folio, tipo de documento, envío, IVA, fecha y comprobante.
  //          Las compras existentes conservan su total (ítem + envío + IVA) y un resumen del documento.
  //      (2) cada objetivo diario puede pertenecer a varios proyectos (tarea_proyectos).
  //      Orden: se copia a tablas nuevas, se borra la vieja y recién entonces se crean las tablas puente,
  //      para que el DROP no borre en cascada sus filas.
  `
  CREATE TABLE _mig_gasto_proyecto AS
    SELECT id AS gasto_id, proyecto_id, monto_item_clp + monto_envio_clp + iva_clp AS monto_clp FROM gastos;
  CREATE TABLE gastos_v2 (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    bitacora_id TEXT REFERENCES bitacoras(id) ON DELETE SET NULL,
    item TEXT NOT NULL,                              -- nombre de la compra
    descripcion TEXT,
    monto_clp INTEGER NOT NULL CHECK (monto_clp > 0), -- total pagado
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
    validado_por TEXT,
    validado_por_nombre TEXT,
    validado_en TEXT,
    observacion TEXT,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );
  INSERT INTO gastos_v2 (id, usuario_id, bitacora_id, item, descripcion, monto_clp,
                         estado, validado_por, validado_por_nombre, validado_en, observacion, creado_en)
    SELECT id, usuario_id, bitacora_id, item,
           CASE tipo_documento WHEN 'factura' THEN 'Factura' WHEN 'boleta' THEN 'Boleta' ELSE 'Compra en el extranjero' END
             || ' ' || folio_documento
             || CASE WHEN rut_emisor IS NOT NULL THEN ' · RUT ' || rut_emisor ELSE '' END
             || CASE WHEN monto_envio_clp > 0 THEN ' · incluye envío $' || monto_envio_clp ELSE '' END,
           monto_item_clp + monto_envio_clp + iva_clp,
           estado, validado_por, validado_por_nombre, validado_en, observacion, creado_en
      FROM gastos;
  DROP TABLE gastos;
  ALTER TABLE gastos_v2 RENAME TO gastos;
  CREATE INDEX idx_gastos_usuario ON gastos (usuario_id, creado_en);

  -- Reparto de cada compra entre proyectos (la suma de monto_clp = monto de la compra)
  CREATE TABLE gasto_proyectos (
    gasto_id TEXT NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
    proyecto_id TEXT NOT NULL REFERENCES proyectos(id),
    monto_clp INTEGER NOT NULL CHECK (monto_clp >= 0),
    PRIMARY KEY (gasto_id, proyecto_id)
  );
  INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_clp) SELECT gasto_id, proyecto_id, monto_clp FROM _mig_gasto_proyecto;
  DROP TABLE _mig_gasto_proyecto;
  CREATE INDEX idx_gasto_proyectos_proyecto ON gasto_proyectos (proyecto_id);

  -- Objetivos: sin proyecto único; proyectos en tarea_proyectos
  CREATE TABLE _mig_tarea_proyecto AS SELECT id AS tarea_id, proyecto_id FROM tareas_diarias;
  CREATE TABLE tareas_v2 (
    id TEXT PRIMARY KEY,
    bitacora_id TEXT NOT NULL REFERENCES bitacoras(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL DEFAULT 0,
    descripcion TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (estado IN ('pendiente', 'completado', 'postergado_ooo')),
    motivo_pendiente TEXT,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    actualizado_en TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );
  INSERT INTO tareas_v2 (id, bitacora_id, orden, descripcion, estado, motivo_pendiente, creado_en, actualizado_en)
    SELECT id, bitacora_id, orden, descripcion, estado, motivo_pendiente, creado_en, actualizado_en FROM tareas_diarias;
  DROP TABLE tareas_diarias;
  ALTER TABLE tareas_v2 RENAME TO tareas_diarias;
  CREATE INDEX idx_tareas_bitacora ON tareas_diarias (bitacora_id);

  CREATE TABLE tarea_proyectos (
    tarea_id TEXT NOT NULL REFERENCES tareas_diarias(id) ON DELETE CASCADE,
    proyecto_id TEXT NOT NULL REFERENCES proyectos(id),
    PRIMARY KEY (tarea_id, proyecto_id)
  );
  INSERT INTO tarea_proyectos (tarea_id, proyecto_id) SELECT tarea_id, proyecto_id FROM _mig_tarea_proyecto;
  DROP TABLE _mig_tarea_proyecto;
  CREATE INDEX idx_tarea_proyectos_proyecto ON tarea_proyectos (proyecto_id);
  `,

  // v3 — metas de los indicadores de gerencia (las define la jefatura; sin fila = valor por defecto)
  `
  CREATE TABLE metas (
    clave TEXT PRIMARY KEY,
    valor INTEGER NOT NULL,
    actualizado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    actualizado_por TEXT
  );
  `,

  // v4 — envío opcional de una compra. gastos.monto_clp sigue siendo el TOTAL pagado (compra + envío), así el
  //      costo por proyecto y los indicadores no cambian; envio_clp es la parte del total que fue despacho
  //      (0 = sin envío). Las compras existentes quedan con envío 0.
  `
  ALTER TABLE gastos ADD COLUMN envio_clp INTEGER NOT NULL DEFAULT 0 CHECK (envio_clp >= 0 AND envio_clp < monto_clp);
  `,

  // v5 — historial de etapas de cada proyecto (concepto → prototipado → pruebas → entregado, y pausas), para medir
  //      el tiempo de concepto a cliente y cuánto lleva cada proyecto en su etapa. `desde` es la fecha local en que
  //      el proyecto entró a esa etapa. Se registra al crear el proyecto y en cada cambio de estado.
  //      Proyectos existentes: concepto desde su fecha de inicio y, si ya avanzaron, su estado actual desde hoy
  //      (la jefatura puede corregir esas fechas en Proyectos → Etapas).
  `
  CREATE TABLE proyecto_etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proyecto_id TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
    estado TEXT NOT NULL CHECK (estado IN ('concepto', 'prototipado', 'pruebas', 'entregado', 'pausado')),
    desde TEXT NOT NULL,
    registrado_en TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );
  CREATE INDEX idx_proyecto_etapas ON proyecto_etapas (proyecto_id, desde, id);
  INSERT INTO proyecto_etapas (proyecto_id, estado, desde) SELECT id, 'concepto', fecha_inicio FROM proyectos ORDER BY creado_en;
  INSERT INTO proyecto_etapas (proyecto_id, estado, desde)
    SELECT id, estado, MAX(fecha_inicio, date('now', '-4 hours')) FROM proyectos WHERE estado <> 'concepto' ORDER BY creado_en;
  `,
];
