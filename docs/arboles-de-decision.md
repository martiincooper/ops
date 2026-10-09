# Árboles de decisión de las salas — BORRADOR para revisión

> Generado desde `lib/chat/arboles.ts` con `npm run arboles:doc`; no editar a mano. Issue #17.

Cada sala entrevista con preguntas definidas de antemano, sin IA: las respuestas eligen la rama siguiente.
Para revisar, comenta directamente en las líneas de este archivo en el pull request (redacción de una
pregunta, opciones que faltan o sobran, ramas, qué es obligatorio y qué no).

**Estructura de cada entrevista**

1. **Inicio** (todas las salas): «¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas.»
   (texto, obligatorio, mínimo 25 caracteres).
2. **Rama del módulo**: preguntas propias de la sala; algunas respuestas llevan a otra rama o sugieren otra sala.
3. **Cierre común** (todas las salas): tipo de solicitud, urgencia, plazo, interesados, resultado esperado y comentario.

Botones durante la entrevista: «Pasar a la siguiente pregunta» salta solo preguntas **no obligatorias**;
«Agregar más detalles» amplía la respuesta actual. Al terminar el cierre común se habilita «Finalizar y generar
requerimiento». Ningún recorrido supera 12 preguntas.

**Prioridad del requerimiento**: la de la pregunta de urgencia del cierre común; algunas respuestas de la rama
fijan una prioridad **mínima** (por ejemplo, una fiscalización programada → al menos alta). Se usa la más alta.

| Sala | Preguntas | Recorrido | Ramas | Sugiere otra sala |
|---|---|---|---|---|
| [C-Legal](#c-legal) | 7 propias (con la de inicio) + 6 comunes | de 10 a 12 | 2 | C-Investiga |
| [C-Controla](#c-controla) | 7 propias (con la de inicio) + 6 comunes | 11 | 1 | C-Previene |
| [C-Previene](#c-previene) | 6 propias (con la de inicio) + 6 comunes | de 11 a 12 | 1 | C-Investiga |
| [C-Lidera](#c-lidera) | 7 propias (con la de inicio) + 6 comunes | de 11 a 12 | 1 | C-Capacita |
| [C-Acredita](#c-acredita) | 7 propias (con la de inicio) + 6 comunes | de 10 a 12 | 2 | C-Capacita |
| [C-Capacita](#c-capacita) | 6 propias (con la de inicio) + 6 comunes | de 10 a 11 | 1 | C-Acredita |
| [C-Investiga](#c-investiga) | 6 propias (con la de inicio) + 6 comunes | de 9 a 10 | 1 | C-Legal |

## C-Legal

**Cumplimiento Legal.** Identifica la normativa aplicable a la operación, evalúa su cumplimiento artículo por artículo y genera informes en PDF.

Recorrido: de 10 a 12 preguntas.

```mermaid
flowchart TD
  inicio["¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas."]
  legal_ambito["¿Qué necesitas en materia de cumplimiento legal?"]
  legal_norma["¿Qué ley, decreto o norma está involucrada? (por ejemplo, DS 594 o Ley…"]
  legal_informe["¿Qué necesitas del informe?"]
  legal_operacion["¿En qué faena, operación o área aplica?"]
  legal_fiscalizacion["¿Hay una fiscalización o auditoría programada?"]
  legal_fiscalizacion_fecha["¿Para qué fecha está programada?"]
  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]
  inicio --> legal_ambito
  legal_ambito -->|"Identificar la normativa que aplica"| legal_operacion
  legal_ambito -->|"Evaluar el cumplimiento de una norma / Ocurrió un incidente o a…"| legal_norma
  legal_ambito -->|"Generar o ajustar un informe en PDF"| legal_informe
  legal_norma --> legal_operacion
  legal_informe --> legal_operacion
  legal_operacion --> legal_fiscalizacion
  legal_fiscalizacion -->|"Sí"| legal_fiscalizacion_fecha
  legal_fiscalizacion -->|"No"| COMUN
  legal_fiscalizacion_fecha --> COMUN
  SUG_legal_ambito_incidente(["Sugiere C-Investiga"])
  legal_ambito -.->|"Ocurrió un incidente o accide…"| SUG_legal_ambito_incidente
```

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `inicio`<br>¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas. | Texto libre | Sí | → `legal.ambito`<br>mínimo 25 caracteres; si no, repregunta una vez |
| `legal.ambito`<br>¿Qué necesitas en materia de cumplimiento legal? | Opciones (una) | Sí | «Identificar la normativa que aplica» → `legal.operacion`<br>«Evaluar el cumplimiento de una norma» → `legal.norma`<br>«Generar o ajustar un informe en PDF» → `legal.informe`<br>«Ocurrió un incidente o accidente» → `legal.norma`, **sugiere C-Investiga** |
| `legal.norma`<br>¿Qué ley, decreto o norma está involucrada? (por ejemplo, DS 594 o Ley 16.744) | Texto libre | Sí | → `legal.operacion`<br>mínimo 3 caracteres; si no, repregunta una vez |
| `legal.informe`<br>¿Qué necesitas del informe? | Opciones (una) | Sí | «Un informe nuevo» → `legal.operacion`<br>«Cambiar el formato o contenido de uno existente» → `legal.operacion`<br>«Recibirlo en forma periódica» → `legal.operacion` |
| `legal.operacion`<br>¿En qué faena, operación o área aplica? | Texto libre | Sí | → `legal.fiscalizacion`<br>mínimo 3 caracteres; si no, repregunta una vez |
| `legal.fiscalizacion`<br>¿Hay una fiscalización o auditoría programada? | Sí / No | Sí | «Sí» → `legal.fiscalizacion_fecha`, prioridad mínima **alta**<br>«No» → cierre común |
| `legal.fiscalizacion_fecha`<br>¿Para qué fecha está programada? | Fecha | Sí | → cierre común |

## C-Controla

**Control Documental.** Controla versiones, aprobaciones y vigencias de procedimientos, registros y documentos críticos.

Recorrido: 11 preguntas.

```mermaid
flowchart TD
  inicio["¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas."]
  controla_documento["¿Qué tipo de documentos están involucrados?"]
  controla_problema["¿Qué es lo que hoy no funciona bien?"]
  controla_versiones["¿Qué pasa hoy con las versiones? (por ejemplo, se usan copias antiguas…"]
  controla_aprobadores["¿Quiénes deben aprobar y en qué orden?"]
  controla_vigencia["¿Cada cuánto deben revisarse los documentos?"]
  controla_notificar["¿Quiénes deben recibir aviso de los cambios o vencimientos?"]
  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]
  inicio --> controla_documento
  controla_documento --> controla_problema
  controla_problema -->|"El control de versiones"| controla_versiones
  controla_problema -->|"El flujo de aprobación"| controla_aprobadores
  controla_problema -->|"Los vencimientos y vigencias"| controla_vigencia
  controla_versiones --> controla_notificar
  controla_aprobadores --> controla_notificar
  controla_vigencia --> controla_notificar
  controla_notificar --> COMUN
  SUG_controla_documento_preventivos(["Sugiere C-Previene"])
  controla_documento -.->|"Matrices de riesgo, PTS o pla…"| SUG_controla_documento_preventivos
```

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `inicio`<br>¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas. | Texto libre | Sí | → `controla.documento`<br>mínimo 25 caracteres; si no, repregunta una vez |
| `controla.documento`<br>¿Qué tipo de documentos están involucrados? | Opciones (varias) | Sí | «Procedimientos»<br>«Registros»<br>«Instructivos o formularios»<br>«Matrices de riesgo, PTS o planes de emergencia» **sugiere C-Previene**<br>«Otra» (respuesta escrita)<br>luego → `controla.problema` |
| `controla.problema`<br>¿Qué es lo que hoy no funciona bien? | Opciones (una) | Sí | «El control de versiones» → `controla.versiones`<br>«El flujo de aprobación» → `controla.aprobadores`<br>«Los vencimientos y vigencias» → `controla.vigencia` |
| `controla.versiones`<br>¿Qué pasa hoy con las versiones? (por ejemplo, se usan copias antiguas o no se sabe cuál es la vigente) | Texto libre | Sí | → `controla.notificar`<br>mínimo 15 caracteres; si no, repregunta una vez |
| `controla.aprobadores`<br>¿Quiénes deben aprobar y en qué orden? | Texto libre | Sí | → `controla.notificar`<br>mínimo 10 caracteres; si no, repregunta una vez |
| `controla.vigencia`<br>¿Cada cuánto deben revisarse los documentos? | Opciones (una) | Sí | «Una vez al año» → `controla.notificar`<br>«Cada seis meses» → `controla.notificar`<br>«Depende de cada documento» → `controla.notificar`<br>«Otra» (respuesta escrita)<br>luego → `controla.notificar` |
| `controla.notificar`<br>¿Quiénes deben recibir aviso de los cambios o vencimientos? | Texto libre | No (se puede saltar) | → cierre común |

## C-Previene

**Gestor Documental.** Centraliza la documentación preventiva: matrices de riesgo, procedimientos de trabajo seguro (PTS) y planes de emergencia.

Recorrido: de 11 a 12 preguntas.

```mermaid
flowchart TD
  inicio["¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas."]
  previene_documento["¿Qué documentación preventiva está involucrada?"]
  previene_simulacro["¿También se necesita registrar los simulacros de emergencia?"]
  previene_faena["¿A qué faenas, áreas o procesos aplica?"]
  previene_accion["¿Qué se necesita hacer con esa documentación?"]
  previene_acceso["¿Quiénes deben poder consultarla? (por ejemplo, prevencionistas, superv…"]
  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]
  inicio --> previene_documento
  previene_documento -->|"Matrices de riesgo / Procedimientos de trabajo seguro (PTS) / E…"| previene_faena
  previene_documento -->|"Planes de emergencia"| previene_simulacro
  previene_simulacro --> previene_faena
  previene_faena --> previene_accion
  previene_accion --> previene_acceso
  previene_acceso --> COMUN
  SUG_previene_documento_incidente(["Sugiere C-Investiga"])
  previene_documento -.->|"El reporte de un incidente"| SUG_previene_documento_incidente
```

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `inicio`<br>¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas. | Texto libre | Sí | → `previene.documento`<br>mínimo 25 caracteres; si no, repregunta una vez |
| `previene.documento`<br>¿Qué documentación preventiva está involucrada? | Opciones (una) | Sí | «Matrices de riesgo» → `previene.faena`<br>«Procedimientos de trabajo seguro (PTS)» → `previene.faena`<br>«Planes de emergencia» → `previene.simulacro`<br>«El reporte de un incidente» → `previene.faena`, **sugiere C-Investiga**<br>«Otra» (respuesta escrita)<br>luego → `previene.faena` |
| `previene.simulacro`<br>¿También se necesita registrar los simulacros de emergencia? | Sí / No | Sí | «Sí» → `previene.faena`<br>«No» → `previene.faena` |
| `previene.faena`<br>¿A qué faenas, áreas o procesos aplica? | Texto libre | Sí | → `previene.accion`<br>mínimo 3 caracteres; si no, repregunta una vez |
| `previene.accion`<br>¿Qué se necesita hacer con esa documentación? | Opciones (varias) | Sí | «Centralizar lo que hoy está disperso»<br>«Crear o actualizar contenido»<br>«Controlar que los trabajadores la lean»<br>luego → `previene.acceso` |
| `previene.acceso`<br>¿Quiénes deben poder consultarla? (por ejemplo, prevencionistas, supervisores, trabajadores) | Texto libre | No (se puede saltar) | → cierre común |

## C-Lidera

**Programas de Liderazgo.** Planifica y da seguimiento a programas de liderazgo en seguridad: caminatas, observaciones y compromisos de la línea de mando.

Recorrido: de 11 a 12 preguntas.

```mermaid
flowchart TD
  inicio["¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas."]
  lidera_actividad["¿Qué actividad de liderazgo en seguridad está involucrada?"]
  lidera_participantes["¿Qué cargos de la línea de mando participan?"]
  lidera_necesidad["¿Qué necesitas resolver?"]
  lidera_frecuencia["¿Con qué frecuencia deben realizarse?"]
  lidera_sin_conexion["¿Se necesita registrar sin conexión a internet?"]
  lidera_metas["¿Hay metas de cumplimiento? (por ejemplo, 4 caminatas al mes por gerent…"]
  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]
  inicio --> lidera_actividad
  lidera_actividad --> lidera_participantes
  lidera_participantes --> lidera_necesidad
  lidera_necesidad -->|"Planificar el calendario de actividades"| lidera_frecuencia
  lidera_necesidad -->|"Registrarlas en terreno desde el celular"| lidera_sin_conexion
  lidera_necesidad -->|"Medir el cumplimiento y reportarlo"| lidera_metas
  lidera_frecuencia --> lidera_metas
  lidera_sin_conexion --> lidera_metas
  lidera_metas --> COMUN
  SUG_lidera_actividad_formacion(["Sugiere C-Capacita"])
  lidera_actividad -.->|"Formación de los líderes"| SUG_lidera_actividad_formacion
```

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `inicio`<br>¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas. | Texto libre | Sí | → `lidera.actividad`<br>mínimo 25 caracteres; si no, repregunta una vez |
| `lidera.actividad`<br>¿Qué actividad de liderazgo en seguridad está involucrada? | Opciones (varias) | Sí | «Caminatas de seguridad»<br>«Observaciones de conducta»<br>«Compromisos de la línea de mando»<br>«Formación de los líderes» **sugiere C-Capacita**<br>«Otra» (respuesta escrita)<br>luego → `lidera.participantes` |
| `lidera.participantes`<br>¿Qué cargos de la línea de mando participan? | Texto libre | Sí | → `lidera.necesidad`<br>mínimo 5 caracteres; si no, repregunta una vez |
| `lidera.necesidad`<br>¿Qué necesitas resolver? | Opciones (una) | Sí | «Planificar el calendario de actividades» → `lidera.frecuencia`<br>«Registrarlas en terreno desde el celular» → `lidera.sin_conexion`<br>«Medir el cumplimiento y reportarlo» → `lidera.metas` |
| `lidera.frecuencia`<br>¿Con qué frecuencia deben realizarse? | Opciones (una) | Sí | «Semanal» → `lidera.metas`<br>«Mensual» → `lidera.metas`<br>«Trimestral» → `lidera.metas`<br>«Otra» (respuesta escrita)<br>luego → `lidera.metas` |
| `lidera.sin_conexion`<br>¿Se necesita registrar sin conexión a internet? | Sí / No | Sí | «Sí» → `lidera.metas`<br>«No» → `lidera.metas` |
| `lidera.metas`<br>¿Hay metas de cumplimiento? (por ejemplo, 4 caminatas al mes por gerente) | Texto libre | No (se puede saltar) | → cierre común |

## C-Acredita

**Gestión del personal.** Gestiona la acreditación de trabajadores y contratistas: documentos, exámenes, cursos y vencimientos en un solo lugar.

Recorrido: de 10 a 12 preguntas.

```mermaid
flowchart TD
  inicio["¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas."]
  acredita_quienes["¿A quiénes aplica la acreditación?"]
  acredita_empresas["¿Cuántas empresas contratistas y cuántas personas, aproximadamente?"]
  acredita_requisito["¿Qué requisitos de acreditación están involucrados?"]
  acredita_problema["¿Cuál es el problema principal hoy?"]
  acredita_anticipacion["¿Con cuánta anticipación se debe avisar antes de un vencimiento?"]
  acredita_bloqueo["¿Se debe bloquear el ingreso a faena si un requisito está vencido?"]
  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]
  inicio --> acredita_quienes
  acredita_quienes -->|"Trabajadores propios"| acredita_requisito
  acredita_quienes -->|"Contratistas / Ambos"| acredita_empresas
  acredita_empresas --> acredita_requisito
  acredita_requisito --> acredita_problema
  acredita_problema -->|"Se vencen sin aviso"| acredita_anticipacion
  acredita_problema -->|"Se controla en planillas"| COMUN
  acredita_problema -->|"Entran a faena personas con requisitos vencidos"| acredita_bloqueo
  acredita_anticipacion --> COMUN
  acredita_bloqueo --> COMUN
  SUG_acredita_requisito_capacitacion(["Sugiere C-Capacita"])
  acredita_requisito -.->|"Organizar la capacitación en…"| SUG_acredita_requisito_capacitacion
```

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `inicio`<br>¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas. | Texto libre | Sí | → `acredita.quienes`<br>mínimo 25 caracteres; si no, repregunta una vez |
| `acredita.quienes`<br>¿A quiénes aplica la acreditación? | Opciones (una) | Sí | «Trabajadores propios» → `acredita.requisito`<br>«Contratistas» → `acredita.empresas`<br>«Ambos» → `acredita.empresas` |
| `acredita.empresas`<br>¿Cuántas empresas contratistas y cuántas personas, aproximadamente? | Texto libre | No (se puede saltar) | → `acredita.requisito` |
| `acredita.requisito`<br>¿Qué requisitos de acreditación están involucrados? | Opciones (varias) | Sí | «Documentos (contrato, seguros, etc.)»<br>«Exámenes ocupacionales»<br>«Cursos obligatorios»<br>«Organizar la capacitación en sí» **sugiere C-Capacita**<br>«Otra» (respuesta escrita)<br>luego → `acredita.problema` |
| `acredita.problema`<br>¿Cuál es el problema principal hoy? | Opciones (una) | Sí | «Se vencen sin aviso» → `acredita.anticipacion`<br>«Se controla en planillas» → cierre común<br>«Entran a faena personas con requisitos vencidos» → `acredita.bloqueo`, prioridad mínima **alta** |
| `acredita.anticipacion`<br>¿Con cuánta anticipación se debe avisar antes de un vencimiento? | Opciones (una) | Sí | «7 días» → cierre común<br>«15 días» → cierre común<br>«30 días» → cierre común<br>«Otra» (respuesta escrita)<br>luego → cierre común |
| `acredita.bloqueo`<br>¿Se debe bloquear el ingreso a faena si un requisito está vencido? | Sí / No | Sí | «Sí» → cierre común<br>«No, solo avisar» → cierre común |

## C-Capacita

**Gestor del conocimiento.** Organiza capacitaciones, evaluaciones y el conocimiento de la organización, con registro de asistencia y certificados.

Recorrido: de 10 a 11 preguntas.

```mermaid
flowchart TD
  inicio["¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas."]
  capacita_necesidad["¿Qué necesitas en capacitación y conocimiento?"]
  capacita_evaluacion["¿Cómo se debe evaluar?"]
  capacita_certificado["¿El certificado debe emitirse automáticamente al aprobar?"]
  capacita_publico["¿A quiénes está dirigido y cuántas personas, aproximadamente?"]
  capacita_asistencia["¿Cómo se registra hoy la asistencia?"]
  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]
  inicio --> capacita_necesidad
  capacita_necesidad -->|"Programar capacitaciones / Ordenar el conocimiento de la organi…"| capacita_publico
  capacita_necesidad -->|"Evaluar lo aprendido"| capacita_evaluacion
  capacita_necesidad -->|"Emitir certificados"| capacita_certificado
  capacita_evaluacion --> capacita_publico
  capacita_certificado --> capacita_publico
  capacita_publico --> capacita_asistencia
  capacita_asistencia --> COMUN
  SUG_capacita_necesidad_acreditacion(["Sugiere C-Acredita"])
  capacita_necesidad -.->|"Cursos exigidos para acredita…"| SUG_capacita_necesidad_acreditacion
```

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `inicio`<br>¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas. | Texto libre | Sí | → `capacita.necesidad`<br>mínimo 25 caracteres; si no, repregunta una vez |
| `capacita.necesidad`<br>¿Qué necesitas en capacitación y conocimiento? | Opciones (una) | Sí | «Programar capacitaciones» → `capacita.publico`<br>«Evaluar lo aprendido» → `capacita.evaluacion`<br>«Emitir certificados» → `capacita.certificado`<br>«Ordenar el conocimiento de la organización» → `capacita.publico`<br>«Cursos exigidos para acreditar contratistas» → `capacita.publico`, **sugiere C-Acredita** |
| `capacita.evaluacion`<br>¿Cómo se debe evaluar? | Opciones (una) | Sí | «Una prueba al final» → `capacita.publico`<br>«Con nota mínima para aprobar» → `capacita.publico`<br>«Evaluación práctica en terreno» → `capacita.publico`<br>«Otra» (respuesta escrita)<br>luego → `capacita.publico` |
| `capacita.certificado`<br>¿El certificado debe emitirse automáticamente al aprobar? | Sí / No | Sí | «Sí» → `capacita.publico`<br>«No, lo aprueba alguien antes» → `capacita.publico` |
| `capacita.publico`<br>¿A quiénes está dirigido y cuántas personas, aproximadamente? | Texto libre | Sí | → `capacita.asistencia`<br>mínimo 5 caracteres; si no, repregunta una vez |
| `capacita.asistencia`<br>¿Cómo se registra hoy la asistencia? | Opciones (una) | No (se puede saltar) | «Firma en papel» → cierre común<br>«Registro digital» → cierre común<br>«No se registra» → cierre común |

## C-Investiga

**Reportabilidad e Incidentes.** Reporta incidentes desde terreno, investiga sus causas y realiza seguimiento a las acciones correctivas.

Recorrido: de 9 a 10 preguntas.

```mermaid
flowchart TD
  inicio["¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas."]
  investiga_necesidad["¿En qué parte del proceso de incidentes necesitas apoyo?"]
  investiga_terreno["¿Qué debe permitir el reporte en terreno?"]
  investiga_metodo["¿Qué método de investigación usan?"]
  investiga_acciones["¿Cada acción correctiva debe tener responsable, plazo y aviso de vencim…"]
  investiga_tipo["¿Qué tipo de eventos abarca?"]
  COMUN[["Cierre común: tipo, urgencia, plazo, interesados, resultado, comentario"]]
  inicio --> investiga_necesidad
  investiga_necesidad -->|"Reportar desde terreno"| investiga_terreno
  investiga_necesidad -->|"Investigar las causas"| investiga_metodo
  investiga_necesidad -->|"Seguir las acciones correctivas"| investiga_acciones
  investiga_necesidad -->|"Evaluar el cumplimiento legal tras un incidente"| investiga_tipo
  investiga_terreno --> investiga_tipo
  investiga_metodo --> investiga_tipo
  investiga_acciones --> investiga_tipo
  investiga_tipo --> COMUN
  SUG_investiga_necesidad_legal(["Sugiere C-Legal"])
  investiga_necesidad -.->|"Evaluar el cumplimiento legal…"| SUG_investiga_necesidad_legal
```

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `inicio`<br>¿En qué puedo colaborar contigo hoy? Cuéntame brevemente qué necesitas. | Texto libre | Sí | → `investiga.necesidad`<br>mínimo 25 caracteres; si no, repregunta una vez |
| `investiga.necesidad`<br>¿En qué parte del proceso de incidentes necesitas apoyo? | Opciones (una) | Sí | «Reportar desde terreno» → `investiga.terreno`<br>«Investigar las causas» → `investiga.metodo`<br>«Seguir las acciones correctivas» → `investiga.acciones`<br>«Evaluar el cumplimiento legal tras un incidente» → `investiga.tipo`, **sugiere C-Legal** |
| `investiga.terreno`<br>¿Qué debe permitir el reporte en terreno? | Opciones (varias) | Sí | «Adjuntar fotos»<br>«Funcionar sin conexión»<br>«Registrar la ubicación»<br>«Otra» (respuesta escrita)<br>luego → `investiga.tipo` |
| `investiga.metodo`<br>¿Qué método de investigación usan? | Opciones (una) | Sí | «Árbol de causas» → `investiga.tipo`<br>«5 porqués» → `investiga.tipo`<br>«ICAM» → `investiga.tipo`<br>«Otra» (respuesta escrita)<br>luego → `investiga.tipo` |
| `investiga.acciones`<br>¿Cada acción correctiva debe tener responsable, plazo y aviso de vencimiento? | Sí / No | Sí | «Sí» → `investiga.tipo`<br>«No» → `investiga.tipo` |
| `investiga.tipo`<br>¿Qué tipo de eventos abarca? | Opciones (varias) | Sí | «Accidentes con lesión» prioridad mínima **alta**<br>«Incidentes sin lesión»<br>«Cuasi accidentes»<br>luego → cierre común |

## Cierre común (todas las salas)

| Pregunta | Tipo | Obligatoria | Respuestas → siguiente |
|---|---|---|---|
| `comun.tipo`<br>¿Qué tipo de solicitud es? | Opciones (una) | Sí | «Algo nuevo que hoy no existe» → cierre común, tipo **nueva funcionalidad**<br>«Mejorar algo que ya existe» → cierre común, tipo **mejora**<br>«Algo no funciona como debería» → cierre común, tipo **error**<br>«Es una consulta» → cierre común, tipo **consulta** |
| `comun.urgencia`<br>¿Qué tan urgente es? | Opciones (una) | Sí | «Hay riesgo para las personas» → cierre común, prioridad mínima **crítica**<br>«Hay una fiscalización o un plazo legal próximo» → cierre común, prioridad mínima **alta**<br>«Afecta el trabajo diario» → cierre común, prioridad mínima **media**<br>«Es una mejora deseable, sin apuro» → cierre común, prioridad mínima **baja** |
| `comun.plazo`<br>¿Hay una fecha límite? Si no la hay, puedes pasar a la siguiente pregunta. | Fecha | No (se puede saltar) | → cierre común |
| `comun.interesados`<br>¿Quiénes usarán el resultado o deben estar al tanto? (cargos, áreas o personas) | Texto libre | No (se puede saltar) | → cierre común |
| `comun.resultado`<br>¿Cómo sabremos que quedó bien? Describe el resultado que esperas. | Texto libre | Sí | → cierre común<br>mínimo 20 caracteres; si no, repregunta una vez |
| `comun.cierre`<br>¿Algo más que quieras agregar antes de generar el requerimiento? | Texto libre | No (se puede saltar) | → fin |
