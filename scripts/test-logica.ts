// Pruebas de reglas puras: zona horaria, racha por objetivos, Say-Do, tableros, juego, migraciones, códigos. Ejecutar: npm run test:logica
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { calcularProgreso } from "../lib/metricas";
import { empresaPorEmail } from "../lib/empresas";
import { MIGRACIONES_EMPRESA } from "../lib/migraciones";
import { repartirMonto } from "../lib/reparto";
import { capacidad, equipoActivo, gastosEmpresa, metricasExec, standup } from "../lib/tableros";
import { hashPin, motivoPinDebil, verificarPin } from "../lib/pin";
import { METAS_DEFECTO, esquemaMetas, guardarMetas, leerMetas } from "../lib/metas";
import { calcularJuego, nivelDe, xpParaNivel } from "../lib/juego";
import { fechaLocal, horaLocal, sumarDias } from "../lib/tiempo";

let ok = 0;
async function prueba(nombre: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    console.error(`  ✗ ${nombre}\n`, e);
    process.exitCode = 1;
  }
}

function dbNueva() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  MIGRACIONES_EMPRESA.forEach((m) => db.exec(m));
  db.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p1','AETH-01','Sensor',1000000,'2026-09-01','2026-12-31')").run();
  db.prepare("INSERT INTO usuarios (id, nombre, email, rol, creado_en) VALUES ('u1','Ana','ana@aether.cl','team','2026-09-01T12:00:00.000Z')").run();
  return db;
}

let n = 0;
/** Crea una bitácora con tareas. estados: c=completado, p=pendiente, o=postergado_ooo */
function bitacora(db: Database.Database, fecha: string, estados: string, cierreUtc: string | null) {
  const id = `b${++n}`;
  db.prepare("INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana, checkout_tarde) VALUES (?, 'u1', ?, ?, ?)").run(
    id, fecha, `${fecha}T12:00:00.000Z`, cierreUtc,
  );
  const mapa: Record<string, string> = { c: "completado", p: "pendiente", o: "postergado_ooo" };
  [...estados].forEach((e, i) => {
    db.prepare("INSERT INTO tareas_diarias (id, bitacora_id, orden, descripcion, estado) VALUES (?, ?, ?, 'x', ?)").run(
      `${id}t${i}`, id, i, mapa[e],
    );
    db.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) VALUES (?, 'p1')").run(`${id}t${i}`);
  });
}

async function main() {
  console.log("Zona horaria (America/Santiago)");
  await prueba("22:30 hora Chile del 1-oct sigue siendo 1-oct (en UTC ya es 2-oct)", () => {
    assert.equal(fechaLocal("2026-10-02T01:30:00Z"), "2026-10-01");
    assert.equal(new Date("2026-10-02T01:30:00Z").toISOString().slice(0, 10), "2026-10-02"); // el bug original
  });
  await prueba("horario de verano: 22:00Z = 19:00 local en octubre", () => {
    assert.equal(horaLocal("2026-09-30T22:00:00Z"), "19:00");
  });
  await prueba("horario de invierno: 23:00Z = 19:00 local en julio", () => {
    assert.equal(horaLocal("2026-07-15T23:00:00Z"), "19:00");
  });
  await prueba("sumarDias cruza meses", () => assert.equal(sumarDias("2026-10-01", -1), "2026-09-30"));

  console.log("Racha y Say-Do (por objetivos, sin horario)");
  const hoy = "2026-10-01"; // jueves
  const db = dbNueva();
  bitacora(db, "2026-09-24", "ppp", null); //                  jue: nunca terminada (datos antiguos) → 0/3, corta
  bitacora(db, "2026-09-25", "cc", "2026-09-25T22:45:00Z"); //   vie: terminada 19:45 → la hora no importa, suma
  bitacora(db, "2026-09-28", "cccc", "2026-09-29T04:30:00Z"); // lun: terminada 01:30 del día siguiente, suma
  db.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('o1','u1','2026-09-29',1)").run(); // mar: no disponible
  bitacora(db, "2026-09-30", "cccp", "2026-09-30T15:00:00Z"); // mié: 75 %, suma

  await prueba("racha = 3 (mié + lun + vie; días sin jornada no cortan; la jornada antigua sin terminar sí)", () => {
    assert.equal(calcularProgreso(db, "u1", hoy, "2026-09-01").racha, 3);
  });
  await prueba("jornada en curso: no cuenta en la racha ni en Say-Do hasta terminarla", () => {
    bitacora(db, hoy, "cc", null);
    let p = calcularProgreso(db, "u1", hoy, "2026-09-01");
    assert.equal(p.racha, 3);
    assert.equal(p.completadas_14d, 9); // (0+2+4+3)/(3+2+4+4)
    assert.equal(p.comprometidas_14d, 13);
    assert.equal(p.hoy.registro, "abierto");
    db.prepare("UPDATE bitacoras SET checkout_tarde = '2026-10-01T21:00:00Z' WHERE fecha = ?").run(hoy);
    p = calcularProgreso(db, "u1", hoy, "2026-09-01");
    assert.equal(p.racha, 4);
    assert.equal(p.saydo_14d, 73); // 11/15
    assert.equal(p.jornadas_14d, 5);
  });
  await prueba("una jornada terminada bajo 75 % reinicia la racha", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-28", "cc", "2026-09-28T20:00:00Z");
    bitacora(d, "2026-09-29", "cpp", "2026-09-29T20:00:00Z"); // 33 %
    bitacora(d, "2026-09-30", "cc", "2026-09-30T20:00:00Z");
    assert.equal(calcularProgreso(d, "u1", hoy, "2026-09-01").racha, 1);
  });
  await prueba("semanas sin trabajar no cortan la racha", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-07", "cc", "2026-09-07T20:00:00Z");
    bitacora(d, "2026-09-30", "cc", "2026-09-30T20:00:00Z");
    assert.equal(calcularProgreso(d, "u1", hoy, "2026-09-01").racha, 2);
  });
  await prueba("la jornada en curso puede ser de ayer (pasada la medianoche) y sigue sin contar", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-29", "cc", "2026-09-29T20:00:00Z");
    bitacora(d, "2026-09-30", "cp", null); // comenzada ayer, aún abierta
    const p = calcularProgreso(d, "u1", hoy, "2026-09-01");
    assert.equal(p.racha, 1);
    assert.equal(p.comprometidas_14d, 2);
    assert.equal(p.historial[1].registro, "abierto");
  });
  await prueba("postergados (datos antiguos) salen del denominador", () => {
    const d2 = dbNueva();
    bitacora(d2, hoy, "coo", "2026-10-01T20:00:00Z");
    const p = calcularProgreso(d2, "u1", hoy, "2026-09-01");
    assert.equal(p.hoy.comprometidas, 1);
    assert.equal(p.hoy.saydo, 100);
    assert.equal(p.racha, 1);
  });

  console.log("Esquema");
  await prueba("OOO día completo duplicado es rechazado (antes: NULLs distintos en UNIQUE)", () => {
    const d5 = dbNueva();
    d5.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('a','u1','2026-10-05',1)").run();
    assert.throws(() =>
      d5.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('b','u1','2026-10-05',1)").run(),
    );
  });
  await prueba("OOO parcial exige horas y fin > inicio", () => {
    const d6 = dbNueva();
    assert.throws(() => d6.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('a','u1','2026-10-05',0)").run());
    assert.throws(() => d6.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo, hora_inicio, hora_fin) VALUES ('a','u1','2026-10-05',0,'15:00','14:00')").run());
  });
  await prueba("FK activas: objetivo con proyecto inexistente falla; borrar objetivo borra sus proyectos", () => {
    const d7 = dbNueva();
    bitacora(d7, hoy, "c", null);
    const t = `b${n}t0`;
    assert.throws(() => d7.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) VALUES (?, 'nope')").run(t));
    d7.prepare("DELETE FROM tareas_diarias WHERE id = ?").run(t);
    assert.equal((d7.prepare("SELECT COUNT(*) AS n FROM tarea_proyectos").get() as { n: number }).n, 0);
  });

  console.log("Empresas y tableros");
  await prueba("dominio del email decide la empresa", () => {
    assert.equal(empresaPorEmail("ana@aether-tech.dev")?.clave, "aether-tech");
    assert.equal(empresaPorEmail("Pedro@DATASHEQ.CL")?.clave, "datasheq");
    assert.equal(empresaPorEmail("x@gmail.com"), undefined);
    assert.equal(empresaPorEmail("x@sub.aether-tech.dev"), undefined);
  });
  await prueba("disponibilidad por días: no disponible, fin de semana, feriado; parciales antiguas se ignoran", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo, hora_inicio, hora_fin) VALUES ('a','u1','2026-10-02',0,'14:00','17:00')").run();
    d.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo, motivo) VALUES ('b','u1','2026-10-05',1,'Viaje')").run();
    const c = capacidad(d, hoy, equipoActivo(d), 14);
    const celda = (f: string) => c.filas[0].celdas.find((x) => x.fecha === f)!;
    assert.equal(celda("2026-10-01").estado, "disponible");
    assert.equal(celda("2026-10-02").estado, "disponible");
    assert.equal(celda("2026-10-03").estado, "fin_de_semana");
    assert.equal(celda("2026-10-05").estado, "no_disponible");
    assert.equal(celda("2026-10-05").detalle, "Viaje");
    assert.equal(celda("2026-10-12").estado, "feriado");
    // 9 días hábiles entre jue 1 y mié 14 (sin el feriado del 12) − 1 no disponible
    assert.equal(c.filas[0].dias_disponibles, 8);
    assert.equal(c.dias.find((x) => x.fecha === "2026-10-05")!.disponibles, 0);
  });
  await prueba("reparto en partes iguales sin perder pesos", () => {
    assert.deepEqual(repartirMonto(100, 3), [34, 33, 33]);
    assert.deepEqual(repartirMonto(90000, 2), [45000, 45000]);
    assert.deepEqual(repartirMonto(5, 1), [5]);
    for (const [m, k] of [[1, 3], [99999, 7], [1234567, 4]]) {
      assert.equal(repartirMonto(m, k).reduce((x, y) => x + y, 0), m);
    }
  });
  await prueba("gerencia · costo vs estimación BOM: compras repartidas, rechazadas excluidas, tolerancia", () => {
    const d = dbNueva(); // p1 AETH-01: estimación 1.000.000
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p2','AETH-02','Fuente',100000,'2026-09-01','2026-11-30')").run();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p3','AETH-03','Gateway',0,'2026-09-01','2026-11-30')").run();
    const g = d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, estado, creado_en) VALUES (?, 'u1', 'x', ?, ?, ?)");
    const gp = d.prepare("INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_clp) VALUES (?, ?, ?)");
    g.run("g1", 43435, "aprobado", "2026-09-10T15:00:00Z"); gp.run("g1", "p1", 43435); //    periodo anterior
    g.run("g2", 90001, "pendiente", "2026-09-25T15:00:00Z"); gp.run("g2", "p1", 45001); gp.run("g2", "p2", 45000);
    g.run("g3", 99999, "rechazado", "2026-09-26T15:00:00Z"); gp.run("g3", "p2", 99999); //  no cuenta
    g.run("g4", 62000, "aprobado", "2026-09-30T15:00:00Z"); gp.run("g4", "p2", 62000); //   p2: 107.000 = 107 %
    let m = metricasExec(d, hoy);
    const p1 = m.costo.proyectos.find((p) => p.id === "p1")!;
    const p2 = m.costo.proyectos.find((p) => p.id === "p2")!;
    assert.deepEqual([p1.total_clp, p1.por_validar_clp, p1.compras, p1.pct, p1.situacion], [88436, 45001, 2, 9, "dentro"]);
    assert.deepEqual([p2.total_clp, p2.pct, p2.situacion], [107000, 107, "en_riesgo"]);
    assert.equal(m.costo.proyectos.find((p) => p.id === "p3")!.situacion, "sin_estimacion");
    assert.equal(m.costo.proyectos[0].id, "p2"); // lo más grave primero
    assert.deepEqual([m.costo.con_estimacion, m.costo.dentro, m.costo.en_riesgo, m.costo.fuera, m.costo.estado], [2, 1, 1, 0, "en_riesgo"]);
    assert.equal(m.costo.total_clp, 195436);
    assert.equal(m.costo.periodo_clp, 90001 + 62000); // 18-sep → 1-oct
    assert.equal(m.costo.periodo_anterior_clp, 43435); // 4-sep → 17-sep
    m = metricasExec(d, hoy, { ...m.metas, tolerancia_costo_pct: 5 });
    assert.equal(m.costo.estado, "fuera");
    const filas = gastosEmpresa(d, { estado: "todos" });
    assert.deepEqual(filas.find((f) => f.id === "g2")!.proyectos.map((p) => [p.codigo, p.monto_clp]), [["AETH-01", 45001], ["AETH-02", 45000]]);
  });
  await prueba("gerencia · plazo: atrasado fuera de meta; pausados y entregados no cuentan", () => {
    const d = dbNueva(); // p1 vence 31-dic: en plazo
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p2','A2','x',1,'2026-08-01','2026-09-25','pruebas')").run();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p3','A3','x',1,'2026-08-01','2026-10-10','prototipado')").run();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p4','A4','x',1,'2026-07-01','2026-09-01','pausado')").run();
    const m = metricasExec(d, hoy);
    assert.deepEqual([m.plazo.activos, m.plazo.en_plazo, m.plazo.atrasados, m.plazo.por_vencer, m.plazo.estado], [3, 2, 1, 1, "fuera"]);
    assert.deepEqual(m.plazo.proyectos.map((p) => p.situacion), ["atrasado", "por_vencer", "en_plazo", "pausado"]);
    const p1 = m.plazo.proyectos.find((p) => p.id === "p1")!;
    assert.equal(p1.dias_comprometidos, 121); // 1-sep → 31-dic
    assert.equal(p1.dias_transcurridos, 30);
    d.prepare("UPDATE proyectos SET estado = 'entregado' WHERE id = 'p2'").run();
    assert.equal(metricasExec(d, hoy).plazo.estado, "en_meta");
  });
  await prueba("gerencia · objetivos diarios: 14 días vs 14 anteriores, meta y estado", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-10", "cp", "2026-09-10T20:00:00Z"); //   anterior: 1/2 = 50 %
    bitacora(d, "2026-09-22", "cccp", "2026-09-22T20:00:00Z"); // actual
    bitacora(d, "2026-09-29", "ccc", "2026-09-29T20:00:00Z"); //  actual: 6/7 = 86 %
    bitacora(d, hoy, "pp", null); //                             en curso: no cuenta
    let m = metricasExec(d, hoy);
    assert.deepEqual([m.equipo.completadas, m.equipo.comprometidas, m.equipo.pct, m.equipo.pct_anterior], [6, 7, 86, 50]);
    assert.deepEqual([m.equipo.jornadas, m.equipo.personas_con_jornadas, m.equipo.personas, m.equipo.estado], [2, 1, 1, "en_meta"]);
    m = metricasExec(d, hoy, { ...m.metas, objetivos_diarios_pct: 90 });
    assert.equal(m.equipo.estado, "en_riesgo"); // 86 ≥ 90 − 10
    m = metricasExec(d, hoy, { ...m.metas, objetivos_diarios_pct: 100 });
    assert.equal(m.equipo.estado, "fuera");
  });
  await prueba("gerencia · bloqueos: abiertos, vencidos según la meta de días, resueltos fuera", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-25", "c", "2026-09-25T20:00:00Z");
    bitacora(d, "2026-09-30", "c", "2026-09-30T20:00:00Z");
    d.prepare("UPDATE bitacoras SET bloqueos = 'Falta stock' WHERE fecha = '2026-09-25'").run();
    d.prepare("UPDATE bitacoras SET bloqueos = 'Aduana' WHERE fecha = '2026-09-30'").run();
    let m = metricasExec(d, hoy);
    assert.deepEqual([m.bloqueos.abiertos, m.bloqueos.vencidos, m.bloqueos.estado], [2, 1, "fuera"]); // 6 días > 3
    assert.deepEqual(m.bloqueos.lista.map((b) => [b.texto, b.dias, b.proyectos]), [["Falta stock", 6, ["AETH-01"]], ["Aduana", 1, ["AETH-01"]]]);
    assert.equal(m.bloqueos.nuevos_periodo, 2);
    d.prepare("UPDATE bitacoras SET bloqueo_resuelto_en = 'x' WHERE fecha = '2026-09-25'").run();
    m = metricasExec(d, hoy);
    assert.deepEqual([m.bloqueos.abiertos, m.bloqueos.vencidos, m.bloqueos.estado], [1, 0, "en_riesgo"]);
  });
  await prueba("metas: por defecto, guardadas por empresa, validadas", () => {
    const d = dbNueva();
    assert.deepEqual(leerMetas(d), METAS_DEFECTO);
    guardarMetas(d, { tolerancia_costo_pct: 15, objetivos_diarios_pct: 85, bloqueo_max_dias: 2 }, "Martin");
    assert.deepEqual(leerMetas(d), { tolerancia_costo_pct: 15, objetivos_diarios_pct: 85, bloqueo_max_dias: 2 });
    assert.equal(metricasExec(d, hoy).metas.objetivos_diarios_pct, 85);
    assert.equal(esquemaMetas.safeParse({ tolerancia_costo_pct: 10, objetivos_diarios_pct: 40, bloqueo_max_dias: 3 }).success, false);
  });
  await prueba("standup: bloqueo sin resolver va primero; resuelto deja de contar", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO usuarios (id, nombre, email, rol, creado_en) VALUES ('u2','Beto','beto@aether.cl','team','2026-09-01T12:00:00.000Z')").run();
    d.prepare("INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana, bloqueos) VALUES ('bx','u2','2026-09-30','2026-09-30T12:00:00Z','Falta stock')").run();
    let s = standup(d, hoy, equipoActivo(d));
    assert.equal(s[0].nombre, "Beto");
    assert.equal(s[0].prioridad, 1);
    assert.equal(s[0].ultima?.estado, "en_curso");
    assert.equal(s[1].ultima, null); // Ana sin jornadas: sin alerta
    assert.equal(s[1].prioridad, 4);
    d.prepare("UPDATE bitacoras SET bloqueo_resuelto_en = '2026-10-01T12:00:00Z' WHERE id = 'bx'").run();
    s = standup(d, hoy, equipoActivo(d));
    assert.ok(s.every((f) => f.bloqueos.length === 0));
  });

  console.log("Juego: XP, nivel y logros");
  await prueba("niveles: 0→1, 100→2, 300→3, 600→4", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(xpParaNivel), [0, 100, 300, 600, 1000]);
    assert.deepEqual([0, 99, 100, 299, 300, 650].map(nivelDe), [1, 1, 2, 2, 3, 4]);
  });
  await prueba("XP = objetivos×10 + jornadas terminadas×5 + jornadas perfectas×15 (la hora no suma); logros", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p2','AETH-02','Fuente',1,'2026-09-01','2026-12-31')").run();
    bitacora(d, "2026-09-29", "cp", "2026-09-30T03:00:00Z"); // 1/2, terminada a medianoche
    bitacora(d, "2026-09-30", "ccc", "2026-09-30T13:00:00Z"); // 3/3 → perfecta
    d.prepare("INSERT INTO tarea_proyectos (tarea_id, proyecto_id) SELECT id, 'p2' FROM tareas_diarias WHERE bitacora_id = ? AND orden = 0").run(`b${n}`);
    bitacora(d, hoy, "c", null); // en curso: su objetivo logrado suma; la jornada aún no
    const j = calcularJuego(d, "u1", hoy, "2026-09-01");
    assert.equal(j.objetivos_completados, 5);
    assert.equal(j.jornadas_perfectas, 1);
    assert.equal(j.xp, 5 * 10 + 2 * 5 + 1 * 15);
    assert.equal(j.nivel, 1);
    assert.equal(j.mejor_racha, 1);
    const l = Object.fromEntries(j.logros.map((x) => [x.clave, x]));
    assert.equal(l.primera.logrado, true);
    assert.equal(l.perfecto.logrado, true);
    assert.equal(l.constante.progreso, 2);
    assert.equal(l.todoterreno.progreso, 2);
    assert.equal(l.racha5.logrado, false);
    assert.ok(!("madrugador" in l) && !("puntual" in l));
  });

  console.log("Migración v1 → v2 (compras simples, varios proyectos)");
  await prueba("compras: total = ítem + envío + IVA, documento en la descripción, estados conservados", () => {
    const d = new Database(":memory:");
    d.pragma("foreign_keys = ON");
    d.exec(MIGRACIONES_EMPRESA[0]);
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p1','P','P',1,'2026-09-01','2026-12-31')").run();
    d.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES ('u1','A','a@x.cl','team')").run();
    d.prepare("INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana) VALUES ('b1','u1','2026-10-01','x')").run();
    d.prepare("INSERT INTO tareas_diarias (id, bitacora_id, proyecto_id, descripcion, estado) VALUES ('t1','b1','p1','Ruteo','completado')").run();
    const ins = d.prepare(`INSERT INTO gastos (id, usuario_id, proyecto_id, fecha_documento, item, monto_item_clp, monto_envio_clp, iva_clp,
      tipo_documento, rut_emisor, folio_documento, comprobante_archivo, comprobante_mime, estado) VALUES (?, 'u1','p1','2026-10-01', ?, ?, ?, ?, ?, ?, ?, 'f', 'image/jpeg', ?)`);
    ins.run("a", "ST-Link", 32000, 4500, 6935, "factura", "76086428-5", "44102", "aprobado");
    ins.run("b", "PCB", 54200, 21800, 0, "extranjero", null, "W1", "pendiente");
    d.transaction(() => d.exec(MIGRACIONES_EMPRESA[1]))();
    const filas = d.prepare("SELECT * FROM gastos ORDER BY id").all() as Record<string, unknown>[];
    assert.equal(filas.length, 2);
    assert.equal(filas[0].monto_clp, 43435);
    assert.equal(filas[0].estado, "aprobado");
    assert.equal(filas[0].descripcion, "Factura 44102 · RUT 76086428-5 · incluye envío $4500");
    assert.equal(filas[1].monto_clp, 76000);
    for (const col of ["rut_emisor", "folio_documento", "tipo_documento", "iva_clp", "monto_envio_clp", "comprobante_archivo", "proyecto_id"]) {
      assert.ok(!(col in filas[0]), col);
    }
    assert.deepEqual(d.prepare("SELECT gasto_id, proyecto_id, monto_clp FROM gasto_proyectos ORDER BY gasto_id").all(), [
      { gasto_id: "a", proyecto_id: "p1", monto_clp: 43435 },
      { gasto_id: "b", proyecto_id: "p1", monto_clp: 76000 },
    ]);
    assert.deepEqual(d.prepare("SELECT tarea_id, proyecto_id FROM tarea_proyectos").all(), [{ tarea_id: "t1", proyecto_id: "p1" }]);
    assert.equal((d.prepare("SELECT estado FROM tareas_diarias").get() as { estado: string }).estado, "completado");
    assert.deepEqual(d.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(d.prepare("SELECT name FROM sqlite_master WHERE name LIKE '_mig%'").all(), []);
    assert.throws(() => d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp) VALUES ('c','u1','x',0)").run());
  });

  console.log("Códigos");
  await prueba("códigos triviales rechazados", () => {
    for (const p of ["000000", "111111", "123456", "654321", "890123", "121212", "123123", "12345"]) {
      assert.notEqual(motivoPinDebil(p), null, p);
    }
    assert.equal(motivoPinDebil("482915"), null);
  });
  await prueba("hash scrypt verifica y distingue", async () => {
    const h = await hashPin("482915");
    assert.equal(await verificarPin("482915", h), true);
    assert.equal(await verificarPin("482916", h), false);
  });

  console.log(`\n${ok} pruebas OK${process.exitCode ? " — HAY FALLOS" : ""}`);
}

main();
