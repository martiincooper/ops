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
  // v2 — portal gerencial: conversaciones con el robot, mensajes y bloqueo de salas (una persona por módulo)
  `
  CREATE TABLE chat_conversaciones (
    id TEXT PRIMARY KEY,
    modulo TEXT NOT NULL,
    usuario_id TEXT NOT NULL,                        -- id en su base (control.db o la de su empresa)
    usuario_rol TEXT NOT NULL,
    usuario_email TEXT NOT NULL,
    usuario_nombre TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activa'
      CHECK (estado IN ('activa', 'generada', 'finalizada', 'expirada')),
    completitud INTEGER NOT NULL DEFAULT 0 CHECK (completitud BETWEEN 0 AND 100),
    iniciada_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    ultima_actividad TEXT NOT NULL DEFAULT ${ISO_AHORA},
    terminada_en TEXT,
    ticket INTEGER UNIQUE,                           -- número correlativo al generar el requerimiento (GER-0001)
    titulo TEXT,
    prioridad TEXT CHECK (prioridad IN ('critica', 'alta', 'media', 'baja')),
    clasificacion TEXT,
    requerimiento_json TEXT,                         -- resumen estructurado que redactó la IA
    issue_numero INTEGER,
    issue_url TEXT,
    issue_error TEXT                                 -- por qué no se pudo crear el Issue (se reintenta desde /admin)
  );
  CREATE INDEX idx_chat_conv_inicio ON chat_conversaciones (iniciada_en);
  CREATE INDEX idx_chat_conv_usuario ON chat_conversaciones (usuario_email, estado);

  CREATE TABLE chat_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id TEXT NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
    autor TEXT NOT NULL CHECK (autor IN ('robot', 'usuario', 'sistema')),
    texto TEXT NOT NULL,
    meta_json TEXT,                                  -- datos del robot: completitud, faltantes, sala sugerida
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );
  CREATE INDEX idx_chat_mensajes_conv ON chat_mensajes (conversacion_id, id);

  -- Una fila por sala ocupada. La clave primaria garantiza una sola persona por módulo.
  CREATE TABLE chat_salas (
    modulo TEXT PRIMARY KEY,
    conversacion_id TEXT NOT NULL UNIQUE REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
    usuario_email TEXT NOT NULL,
    desde TEXT NOT NULL DEFAULT ${ISO_AHORA}
  );
  `,
  // v3 — consumo de tokens del asistente por conversación (límites de uso, #4)
  `
  ALTER TABLE chat_conversaciones ADD COLUMN tokens_entrada INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE chat_conversaciones ADD COLUMN tokens_salida INTEGER NOT NULL DEFAULT 0;
  `,
  // v4 — seguimiento del Issue en GitHub (#6): estado, motivo de cierre, persona asignada y última consulta
  `
  ALTER TABLE chat_conversaciones ADD COLUMN issue_estado TEXT CHECK (issue_estado IN ('open', 'closed'));
  ALTER TABLE chat_conversaciones ADD COLUMN issue_motivo TEXT;
  ALTER TABLE chat_conversaciones ADD COLUMN issue_asignado TEXT;
  ALTER TABLE chat_conversaciones ADD COLUMN issue_actualizado_en TEXT;
  `,
  // v5 — reintentos automáticos del envío a GitHub: intentos fallidos transitorios y próximo reintento
  `
  ALTER TABLE chat_conversaciones ADD COLUMN issue_intentos INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE chat_conversaciones ADD COLUMN issue_proximo_intento TEXT;
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

  // v6 — registros heredados: al eliminar definitivamente a una persona con jornadas o compras, sus registros pasan a
  //      un administrador. Como los administradores viven en control.db, cada uno tiene aquí una fila propia (sin acceso:
  //      inactiva y con email interno) marcada con admin_id, que es la dueña de esos registros.
  `
  ALTER TABLE usuarios ADD COLUMN admin_id TEXT;
  CREATE UNIQUE INDEX ux_usuarios_admin ON usuarios (admin_id) WHERE admin_id IS NOT NULL;
  `,

  // v7 — compras: impuesto extra opcional (p. ej. aduana), tipo de costo (único o recurrente diario/mensual/anual;
  //      solo una etiqueta), quién la editó por última vez y si la registró la jefatura (a nombre de su fila de
  //      registros, aprobada de inmediato). monto_clp sigue siendo el TOTAL pagado
  //      (compra + envío + impuesto), así el costo por proyecto y los indicadores no cambian. Las compras
  //      existentes quedan con impuesto 0 y tipo 'unico'.
  `
  ALTER TABLE gastos ADD COLUMN impuesto_clp INTEGER NOT NULL DEFAULT 0 CHECK (impuesto_clp >= 0);
  ALTER TABLE gastos ADD COLUMN tipo_costo TEXT NOT NULL DEFAULT 'unico' CHECK (tipo_costo IN ('unico', 'diario', 'mensual', 'anual'));
  ALTER TABLE gastos ADD COLUMN editado_en TEXT;
  ALTER TABLE gastos ADD COLUMN editado_por_nombre TEXT;
  ALTER TABLE gastos ADD COLUMN de_jefatura INTEGER NOT NULL DEFAULT 0;
  `,

  // v8 — tareas asignadas: pendientes que no son objetivos del día (p. ej. «pedirle a X la información»). No
  //      dependen de una jornada: quedan en el tablero de la persona hasta marcarlas hechas. Las agrega la persona o
  //      su jefatura (desde el standup). No cuentan para el Say-Do.
  `
  CREATE TABLE tareas_asignadas (
    id TEXT PRIMARY KEY,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    descripcion TEXT NOT NULL,
    creado_por TEXT NOT NULL,
    creado_por_nombre TEXT NOT NULL,
    creado_en TEXT NOT NULL DEFAULT ${ISO_AHORA},
    completada_en TEXT,
    completada_por_nombre TEXT
  );
  CREATE INDEX idx_tareas_asignadas ON tareas_asignadas (usuario_id, completada_en);
  `,

  // v9 — estado de pago de cada compra, aparte de la validación: por enviar a pago (se enviará a procesar más
  //      adelante), esperando pago (ya enviada, falta el pago) o comprada (ya pagada). Lo marca quien registra la
  //      compra y lo puede cambiar después (la persona o la jefatura). Las compras existentes quedan como compradas.
  `
  ALTER TABLE gastos ADD COLUMN estado_pago TEXT NOT NULL DEFAULT 'comprada'
    CHECK (estado_pago IN ('por_enviar', 'esperando_pago', 'comprada'));
  `,

  // v10 — montos en dólares: la compra, el envío y el impuesto se pueden ingresar en USD. Se convierten a pesos con el
  //       dólar del día al guardar (no es dinámico: se vuelve a convertir solo al editar los montos) y los montos en
  //       pesos siguen siendo los únicos que usan los tableros. *_usd guarda el valor original en dólares (NULL = ese
  //       monto se ingresó en pesos); tipo_cambio, los pesos por dólar usados, y tipo_cambio_fecha, la fecha de ese dólar.
  `
  ALTER TABLE gastos ADD COLUMN monto_usd REAL CHECK (monto_usd IS NULL OR monto_usd > 0);
  ALTER TABLE gastos ADD COLUMN envio_usd REAL CHECK (envio_usd IS NULL OR envio_usd >= 0);
  ALTER TABLE gastos ADD COLUMN impuesto_usd REAL CHECK (impuesto_usd IS NULL OR impuesto_usd >= 0);
  ALTER TABLE gastos ADD COLUMN tipo_cambio REAL CHECK (tipo_cambio IS NULL OR tipo_cambio > 0);
  ALTER TABLE gastos ADD COLUMN tipo_cambio_fecha TEXT;
  `,
];
