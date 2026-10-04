// Pruebas de reglas puras: zona horaria, Say-Do por objetivos, tableros, migraciones, códigos. Ejecutar: npm run test:logica
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { calcularProgreso } from "../lib/metricas";
import { empresaPorEmail } from "../lib/empresas";
import { esquemaGasto } from "../lib/esquemas";
import { AVISO_PROYECTOS_POR_ETAPA, type EstadoProyecto, leerEtapas, registrarCambioEtapa } from "../lib/etapas";
import { MIGRACIONES_EMPRESA } from "../lib/migraciones";
import { ErrorObjetivo, agregarObjetivo, bitacoraEditable, cambiarBloqueo, cambiarObjetivo, quitarObjetivo } from "../lib/objetivos";
import { eliminarCuenta, idsHeredados } from "../lib/registros";
import { repartirMonto } from "../lib/reparto";
import { capacidad, equipoActivo, gastosEmpresa, metricasExec, standup } from "../lib/tableros";
import { hashPin, motivoPinDebil, verificarPin } from "../lib/pin";
import { METAS_DEFECTO, esquemaMetas, guardarMetas, leerMetas } from "../lib/metas";
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

  console.log("Say-Do por objetivos (sin horario)");
  const hoy = "2026-10-01"; // jueves
  const db = dbNueva();
  bitacora(db, "2026-09-24", "ppp", null); //                  jue: nunca terminada (datos antiguos) → 0/3
  bitacora(db, "2026-09-25", "cc", "2026-09-25T22:45:00Z"); //   vie: terminada 19:45 → la hora no importa
  bitacora(db, "2026-09-28", "cccc", "2026-09-29T04:30:00Z"); // lun: terminada 01:30 del día siguiente
  db.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('o1','u1','2026-09-29',1)").run(); // mar: no disponible
  bitacora(db, "2026-09-30", "cccp", "2026-09-30T15:00:00Z"); // mié: 3/4

  await prueba("jornada en curso: no cuenta en Say-Do hasta terminarla", () => {
    bitacora(db, hoy, "cc", null);
    let p = calcularProgreso(db, "u1", hoy, "2026-09-01");
    assert.equal(p.completadas_14d, 9); // (0+2+4+3)/(3+2+4+4)
    assert.equal(p.comprometidas_14d, 13);
    assert.equal(p.hoy.registro, "abierto");
    db.prepare("UPDATE bitacoras SET checkout_tarde = '2026-10-01T21:00:00Z' WHERE fecha = ?").run(hoy);
    p = calcularProgreso(db, "u1", hoy, "2026-09-01");
    assert.equal(p.saydo_14d, 73); // 11/15
    assert.equal(p.jornadas_14d, 5);
    assert.equal(p.historial.find((d) => d.fecha === "2026-09-29")!.tipo, "ooo");
    assert.equal(p.historial.find((d) => d.fecha === "2026-09-28")!.cierre_local, "01:30");
  });
  await prueba("la ventana es de 14 días: jornadas anteriores no cuentan", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-17", "pppp", "2026-09-17T20:00:00Z"); // 15 días antes: fuera
    bitacora(d, "2026-09-18", "cc", "2026-09-18T20:00:00Z"); //   14 días: dentro
    const p = calcularProgreso(d, "u1", hoy, "2026-09-01");
    assert.deepEqual([p.completadas_14d, p.comprometidas_14d, p.historial.length], [2, 2, 14]);
  });
  await prueba("la jornada en curso puede ser de ayer (pasada la medianoche) y sigue sin contar", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-29", "cc", "2026-09-29T20:00:00Z");
    bitacora(d, "2026-09-30", "cp", null); // comenzada ayer, aún abierta
    const p = calcularProgreso(d, "u1", hoy, "2026-09-01");
    assert.equal(p.comprometidas_14d, 2);
    assert.equal(p.historial[1].registro, "abierto");
  });
  await prueba("postergados (datos antiguos) salen del denominador", () => {
    const d2 = dbNueva();
    bitacora(d2, hoy, "coo", "2026-10-01T20:00:00Z");
    const p = calcularProgreso(d2, "u1", hoy, "2026-09-01");
    assert.equal(p.hoy.comprometidas, 1);
    assert.equal(p.hoy.saydo, 100);
  });
  await prueba("días antes de crear la cuenta no aparecen en el historial", () => {
    const d4 = dbNueva();
    bitacora(d4, "2026-09-30", "cc", "2026-09-30T21:00:00Z");
    assert.equal(calcularProgreso(d4, "u1", hoy, "2026-09-30").historial.length, 2);
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
  await prueba("gerencia · concepto → cliente: vs fecha estimada; pausados y entregados no cuentan", () => {
    const d = dbNueva(); // p1 vence 31-dic: en plazo
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p2','A2','x',1,'2026-08-01','2026-09-25','pruebas')").run();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p3','A3','x',1,'2026-08-01','2026-10-10','prototipado')").run();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p4','A4','x',1,'2026-07-01','2026-09-01','pausado')").run();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p5','A5','x',1,'2026-06-01','2026-08-01','entregado')").run();
    const m = metricasExec(d, hoy);
    assert.deepEqual([m.tiempo.en_desarrollo, m.tiempo.en_plazo, m.tiempo.atrasados, m.tiempo.por_vencer, m.tiempo.estado], [3, 2, 1, 1, "fuera"]);
    assert.deepEqual(m.tiempo.proyectos.map((p) => [p.id, p.situacion]), [["p2", "atrasado"], ["p3", "por_vencer"], ["p1", "en_plazo"]]);
    const p1 = m.tiempo.proyectos.find((p) => p.id === "p1")!;
    assert.deepEqual([p1.dias_estimados, p1.dias_transcurridos, p1.dias_restantes], [121, 30, 91]); // 1-sep → 31-dic
    assert.ok(!m.costo.proyectos.some((p) => p.id === "p5"), "entregado fuera del costo");
    assert.deepEqual(m.pipeline.pausados.map((p) => p.id), ["p4"]);
    assert.deepEqual(m.entregados.map((p) => p.id), ["p5"]);
    d.prepare("UPDATE proyectos SET estado = 'entregado' WHERE id = 'p2'").run();
    assert.equal(metricasExec(d, hoy).tiempo.estado, "en_meta");
  });
  await prueba("historial de etapas: días por etapa, días en la etapa actual, corrección el mismo día", () => {
    const d = dbNueva(); // p1: inicio 1-sep, sin historial → concepto desde el inicio
    let p1 = metricasExec(d, hoy).tiempo.proyectos[0];
    assert.deepEqual([p1.estado, p1.etapa_desde, p1.dias_en_etapa], ["concepto", "2026-09-01", 30]);
    const proyecto = () => d.prepare("SELECT id, estado, fecha_inicio FROM proyectos WHERE id = 'p1'").get() as { id: string; estado: string; fecha_inicio: string };
    const cambiar = (estado: EstadoProyecto, fecha: string) =>
      d.transaction(() => {
        registrarCambioEtapa(d, proyecto(), estado, fecha);
        d.prepare("UPDATE proyectos SET estado = ? WHERE id = 'p1'").run(estado);
      })();
    cambiar("prototipado", "2026-09-11");
    cambiar("pausado", "2026-09-21");
    cambiar("prototipado", "2026-09-26");
    p1 = metricasExec(d, hoy).tiempo.proyectos[0];
    assert.deepEqual(p1.dias_por_etapa, { concepto: 10, prototipado: 15, pruebas: 0, pausado: 5 });
    assert.deepEqual([p1.estado, p1.etapa_desde, p1.dias_en_etapa], ["prototipado", "2026-09-26", 5]);
    // mismo día: se corrige el tramo en vez de agregar uno de 0 días; volver al estado previo lo fusiona
    cambiar("pruebas", "2026-10-01");
    cambiar("entregado", "2026-10-01");
    let h = (leerEtapas(d, "p1").get("p1") ?? []).map((f) => [f.estado, f.desde]);
    assert.deepEqual(h.slice(-1), [["entregado", "2026-10-01"]]);
    assert.equal(h.length, 5);
    cambiar("prototipado", "2026-10-01");
    h = (leerEtapas(d, "p1").get("p1") ?? []).map((f) => [f.estado, f.desde]);
    assert.deepEqual(h, [["concepto", "2026-09-01"], ["prototipado", "2026-09-11"], ["pausado", "2026-09-21"], ["prototipado", "2026-09-26"]]);
  });
  await prueba("pipeline: por etapa, aviso cuando una etapa supera el umbral; entregados y pausados fuera", () => {
    const d = dbNueva(); // p1 en concepto
    const ins = d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES (?, ?, 'x', 1, '2026-09-01', '2026-12-31', ?)");
    for (let i = 0; i <= AVISO_PROYECTOS_POR_ETAPA; i++) ins.run(`q${i}`, `PROTO-${i}`, "prototipado");
    ins.run("e1", "ENT-1", "entregado");
    ins.run("z1", "PAUSA-1", "pausado");
    const m = metricasExec(d, hoy);
    assert.deepEqual(m.pipeline.etapas.map((e) => [e.estado, e.proyectos.length, e.saturada]), [
      ["concepto", 1, false],
      ["prototipado", AVISO_PROYECTOS_POR_ETAPA + 1, true],
      ["pruebas", 0, false],
    ]);
    assert.deepEqual(m.pipeline.saturadas, ["prototipado"]);
    assert.equal(m.pipeline.en_desarrollo, AVISO_PROYECTOS_POR_ETAPA + 2);
    d.prepare("UPDATE proyectos SET estado = 'pruebas' WHERE id = 'q0'").run();
    assert.deepEqual(metricasExec(d, hoy).pipeline.saturadas, []); // exactamente el umbral: sin aviso
  });
  await prueba("entregados: concepto → cliente real, entrega vs estimada y costo final vs BOM", () => {
    const d = dbNueva(); // p1: inicio 1-sep, estimada 31-dic, BOM 1.000.000
    const et = d.prepare("INSERT INTO proyecto_etapas (proyecto_id, estado, desde) VALUES ('p1', ?, ?)");
    et.run("concepto", "2026-09-01"); et.run("prototipado", "2026-09-05"); et.run("pruebas", "2026-09-20"); et.run("entregado", "2026-09-28");
    d.prepare("UPDATE proyectos SET estado = 'entregado' WHERE id = 'p1'").run();
    d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, estado) VALUES ('g1','u1','x',1080000,'aprobado')").run();
    d.prepare("INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_clp) VALUES ('g1','p1',1080000)").run();
    let e = metricasExec(d, hoy).entregados[0];
    assert.deepEqual([e.fecha_entregado, e.dias_concepto_cliente, e.dias_estimados, e.desvio_dias, e.plazo], ["2026-09-28", 27, 121, -94, "en_meta"]);
    assert.deepEqual(e.dias_por_etapa, { concepto: 4, prototipado: 15, pruebas: 8, pausado: 0 });
    assert.deepEqual([e.costo_clp, e.pct_costo, e.situacion_costo, e.costo, e.compras], [1080000, 108, "en_riesgo", "en_riesgo", 1]);
    d.prepare("UPDATE proyectos SET fecha_entrega_objetivo = '2026-09-20' WHERE id = 'p1'").run();
    e = metricasExec(d, hoy).entregados[0];
    assert.deepEqual([e.desvio_dias, e.plazo], [8, "fuera"]);
    const m = metricasExec(d, hoy);
    assert.equal(m.tiempo.en_desarrollo, 0);
    assert.equal(m.costo.proyectos.length, 0);
  });
  await prueba("metas: solo la tolerancia de costo, guardada por empresa; claves antiguas se ignoran", () => {
    const d = dbNueva();
    assert.deepEqual(leerMetas(d), METAS_DEFECTO);
    d.prepare("INSERT INTO metas (clave, valor) VALUES ('objetivos_diarios_pct', 85)").run();
    guardarMetas(d, { tolerancia_costo_pct: 15 }, "Martin");
    assert.deepEqual(leerMetas(d), { tolerancia_costo_pct: 15 });
    assert.equal(metricasExec(d, hoy).metas.tolerancia_costo_pct, 15);
    assert.equal(esquemaMetas.safeParse({ tolerancia_costo_pct: 120 }).success, false);
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

  console.log("Migración v3 → v4 (envío opcional)");
  await prueba("compras existentes quedan con envío 0; el envío debe ser menor que el total", () => {
    const d = new Database(":memory:");
    d.pragma("foreign_keys = ON");
    MIGRACIONES_EMPRESA.slice(0, 3).forEach((m) => d.exec(m));
    d.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES ('u1','A','a@x.cl','team')").run();
    d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp) VALUES ('a','u1','PCB',76000)").run();
    d.exec(MIGRACIONES_EMPRESA[3]);
    assert.equal((d.prepare("SELECT envio_clp FROM gastos WHERE id = 'a'").get() as { envio_clp: number }).envio_clp, 0);
    d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, envio_clp) VALUES ('b','u1','Sensor',12500,2500)").run();
    assert.throws(() => d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, envio_clp) VALUES ('c','u1','x',2500,2500)").run());
    assert.throws(() => d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, envio_clp) VALUES ('d','u1','x',2500,-1)").run());
  });
  await prueba("esquema de compra: envío opcional, entero y no negativo; total ≤ 1.000 millones", () => {
    const base = { proyecto_ids: ["p1"], item: "PCB", monto_clp: 10000 };
    assert.equal(esquemaGasto.safeParse(base).success, true);
    assert.equal(esquemaGasto.safeParse({ ...base, envio_clp: null }).success, true);
    assert.equal(esquemaGasto.safeParse({ ...base, envio_clp: 2500 }).success, true);
    assert.equal(esquemaGasto.safeParse({ ...base, envio_clp: -1 }).success, false);
    assert.equal(esquemaGasto.safeParse({ ...base, envio_clp: 2.5 }).success, false);
    assert.equal(esquemaGasto.safeParse({ ...base, monto_clp: 1_000_000_000, envio_clp: 1 }).success, false);
  });

  console.log("Migración v4 → v5 (historial de etapas)");
  await prueba("proyectos existentes: concepto desde su inicio y su estado actual desde hoy", () => {
    const d = new Database(":memory:");
    d.pragma("foreign_keys = ON");
    MIGRACIONES_EMPRESA.slice(0, 4).forEach((m) => d.exec(m));
    const ins = d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES (?, ?, 'x', 1, ?, '2027-12-31', ?)");
    ins.run("a", "A", "2026-08-01", "concepto");
    ins.run("b", "B", "2026-07-01", "pruebas");
    ins.run("c", "C", "2027-01-15", "prototipado"); // inicio futuro: no antes del inicio
    d.exec(MIGRACIONES_EMPRESA[4]);
    const h = leerEtapas(d);
    assert.deepEqual(h.get("a")!.map((f) => [f.estado, f.desde]), [["concepto", "2026-08-01"]]);
    const b = h.get("b")!.map((f) => f.estado);
    assert.deepEqual(b, ["concepto", "pruebas"]);
    assert.ok(h.get("b")![1].desde >= "2026-07-01");
    assert.deepEqual(h.get("c")!.map((f) => [f.estado, f.desde]), [["concepto", "2027-01-15"], ["prototipado", "2027-01-15"]]);
    d.prepare("DELETE FROM proyectos WHERE id = 'a'").run(); // en cascada
    assert.equal((d.prepare("SELECT COUNT(*) n FROM proyecto_etapas WHERE proyecto_id = 'a'").get() as { n: number }).n, 0);
  });

  console.log("Objetivos editables");
  await prueba("solo la jornada más reciente es editable; al comenzar otra, la anterior queda fija", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-29", "cp", "2026-09-29T20:00:00Z");
    const ahora = "2026-09-30T12:00:00Z";
    const ant = d.prepare("SELECT id FROM tareas_diarias ORDER BY orden LIMIT 1").get() as { id: string };
    cambiarObjetivo(d, "u1", ant.id, { completada: false }, ahora); // la última, aunque terminada: editable
    const nuevo = agregarObjetivo(d, "u1", { descripcion: "Extra", proyecto_ids: ["p1"] }, 4, ahora);
    assert.ok(nuevo);
    assert.throws(() => agregarObjetivo(d, "u1", { descripcion: "x", proyecto_ids: ["p1"] }, 3, ahora), /Máximo 3/);
    bitacora(d, "2026-09-30", "", null); // comienza la siguiente
    assert.throws(() => cambiarObjetivo(d, "u1", ant.id, { completada: true }, ahora), (e: unknown) => e instanceof ErrorObjetivo && e.status === 409);
    assert.throws(() => quitarObjetivo(d, "u1", nuevo), (e: unknown) => e instanceof ErrorObjetivo && e.status === 409);
    assert.throws(() => cambiarBloqueo(d, "u1", "x"), (e: unknown) => e instanceof ErrorObjetivo && e.status === 409); // en curso
    const otro = agregarObjetivo(d, "u1", { descripcion: "Hoy", proyecto_ids: ["p1"] }, 4, ahora);
    assert.equal(bitacoraEditable(d, "u1")!.checkout_tarde, null);
    quitarObjetivo(d, "u1", otro); // en curso: puede quedar sin objetivos
    assert.equal((d.prepare("SELECT COUNT(*) n FROM tareas_diarias WHERE id = ?").get(otro) as { n: number }).n, 0);
  });

  console.log("Eliminar cuentas");
  await prueba("eliminar con registros: pasan al administrador; jornadas del mismo día se fusionan; días no disponibles se borran", () => {
    const d = dbNueva();
    const usr = d.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES (?, ?, ?, 'team')");
    usr.run("u2", "Beto", "beto@aether.cl");
    usr.run("u3", "Carla", "carla@aether.cl");
    const bit = d.prepare("INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana, checkout_tarde, bloqueos) VALUES (?, ?, ?, 'x', ?, ?)");
    const tar = d.prepare("INSERT INTO tareas_diarias (id, bitacora_id, descripcion, estado) VALUES (?, ?, ?, 'completado')");
    bit.run("bB", "u2", "2026-09-30", "2026-09-30T20:00:00Z", "Falta stock"); tar.run("tB", "bB", "De Beto");
    bit.run("bC1", "u3", "2026-09-30", "2026-09-30T21:00:00Z", "Aduana"); tar.run("tC1", "bC1", "De Carla");
    bit.run("bC2", "u3", "2026-09-29", null, null); tar.run("tC2", "bC2", "De Carla 2");
    d.prepare("INSERT INTO gastos (id, usuario_id, bitacora_id, item, monto_clp) VALUES ('g1','u3','bC1','x',1000)").run();
    d.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('o1','u3','2026-10-05',1)").run();
    const admin = { id: "a1", nombre: "Martin" };
    assert.throws(() => eliminarCuenta(d, "u2", null));
    assert.deepEqual(eliminarCuenta(d, "u2", admin), { jornadas: 1, compras: 0 });
    assert.deepEqual(eliminarCuenta(d, "u3", admin), { jornadas: 2, compras: 1 });
    const fila = d.prepare("SELECT id, nombre, activo, admin_id FROM usuarios WHERE admin_id = 'a1'").get() as { id: string; nombre: string; activo: number };
    assert.deepEqual([fila.nombre, fila.activo], ["Martin", 0]);
    assert.deepEqual(idsHeredados(d, "a1"), [fila.id]);
    const bits = d.prepare("SELECT id, fecha, checkout_tarde, bloqueos FROM bitacoras WHERE usuario_id = ? ORDER BY fecha").all(fila.id) as { id: string; fecha: string; checkout_tarde: string | null; bloqueos: string | null }[];
    assert.deepEqual(bits.map((b) => [b.fecha, b.checkout_tarde, b.bloqueos]), [
      ["2026-09-29", null, null],
      ["2026-09-30", "2026-09-30T21:00:00Z", "Falta stock / Aduana"],
    ]);
    const deLa30 = (d.prepare("SELECT descripcion FROM tareas_diarias WHERE bitacora_id = ? ORDER BY descripcion").all(bits[1].id) as { descripcion: string }[]).map((t) => t.descripcion);
    assert.deepEqual(deLa30, ["De Beto", "De Carla"]);
    assert.deepEqual(d.prepare("SELECT usuario_id, bitacora_id FROM gastos").all(), [{ usuario_id: fila.id, bitacora_id: bits[1].id }]);
    assert.equal((d.prepare("SELECT COUNT(*) n FROM ausencias_ooo").get() as { n: number }).n, 0);
    assert.equal((d.prepare("SELECT COUNT(*) n FROM usuarios WHERE id IN ('u2','u3')").get() as { n: number }).n, 0);
    assert.ok(!equipoActivo(d).some((p) => p.id === fila.id), "la fila de registros heredados no es parte del equipo");
    assert.deepEqual(eliminarCuenta(d, "u1", null), { jornadas: 0, compras: 0 }); // sin registros
    assert.deepEqual(d.prepare("PRAGMA foreign_key_check").all(), []);
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
