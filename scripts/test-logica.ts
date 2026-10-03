// Pruebas de reglas puras: zona horaria, ventanas, racha, Say-Do, tableros, juego, migraciones, códigos. Ejecutar: npm run test:logica
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { calcularProgreso } from "../lib/metricas";
import { empresaPorEmail } from "../lib/empresas";
import { MIGRACIONES_EMPRESA } from "../lib/migraciones";
import { repartirMonto } from "../lib/reparto";
import { capacidad, equipoActivo, gastosEmpresa, metricasExec, standup } from "../lib/tableros";
import { hashPin, motivoPinDebil, verificarPin } from "../lib/pin";
import { calcularJuego, nivelDe, xpParaNivel } from "../lib/juego";
import { momentoDe, vistaPara, VENTANAS_DEFECTO as V } from "../lib/jornada";
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

  console.log("Racha y Say-Do");
  const hoy = "2026-10-01"; // jueves
  const db = dbNueva();
  bitacora(db, "2026-09-24", "ppp", null); //               jue: nunca cerrada → 0/3
  bitacora(db, "2026-09-25", "cc", "2026-09-25T22:45:00Z"); // vie: 19:45 → tarde, rompe racha
  bitacora(db, "2026-09-28", "cccc", "2026-09-28T21:30:00Z"); // lun: 18:30, 100%
  db.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('o1','u1','2026-09-29',1)").run(); // mar: OOO
  bitacora(db, "2026-09-30", "cccp", "2026-09-30T22:30:00Z"); // mié: 19:30 exacto, 75%

  await prueba("racha = 2 (mié + lun; OOO del mar se omite; vie cerrado 19:45 la corta)", () => {
    const p = calcularProgreso(db, "u1", hoy, "2026-09-01");
    assert.equal(p.racha, 2);
  });
  await prueba("hoy abierto no corta la racha; cerrado a tiempo con ≥75% la suma", () => {
    bitacora(db, hoy, "cc", null);
    assert.equal(calcularProgreso(db, "u1", hoy, "2026-09-01").racha, 2);
    db.prepare("UPDATE bitacoras SET checkout_tarde = '2026-10-01T21:00:00Z' WHERE fecha = ?").run(hoy);
    assert.equal(calcularProgreso(db, "u1", hoy, "2026-09-01").racha, 3);
  });
  await prueba("Say-Do 14d agrupado: (0+2+4+3+2)/(3+2+4+4+2) = 11/15 = 73%; días sin registro = 3 (21, 22, 23-sep)", () => {
    const p = calcularProgreso(db, "u1", hoy, "2026-09-01");
    assert.equal(p.completadas_14d, 11);
    assert.equal(p.comprometidas_14d, 15);
    assert.equal(p.saydo_14d, 73);
    assert.equal(p.dias_sin_registro_14d, 3); // 18-sep feriado, 19/20 fin de semana
  });
  await prueba("postergadas por OOO salen del denominador", () => {
    const d2 = dbNueva();
    bitacora(d2, hoy, "coo", "2026-10-01T20:00:00Z");
    const p = calcularProgreso(d2, "u1", hoy, "2026-09-01");
    assert.equal(p.hoy.comprometidas, 1);
    assert.equal(p.hoy.saydo, 100);
    assert.equal(p.racha, 1);
  });
  await prueba("feriado (12-oct) se omite; día hábil sin registro corta", () => {
    const d3 = dbNueva();
    bitacora(d3, "2026-10-09", "cc", "2026-10-09T21:00:00Z"); // vie ok
    // 10 y 11 fin de semana, 12 feriado, 8-oct sin registro
    const p = calcularProgreso(d3, "u1", "2026-10-13", "2026-09-01");
    assert.equal(p.racha, 1);
  });
  await prueba("días antes de crear la cuenta no cortan la racha", () => {
    const d4 = dbNueva();
    bitacora(d4, "2026-09-30", "cc", "2026-09-30T21:00:00Z");
    assert.equal(calcularProgreso(d4, "u1", hoy, "2026-09-30").racha, 1);
    assert.equal(calcularProgreso(d4, "u1", hoy, "2026-09-01").racha, 1); // el 29 es hábil sin registro → corta tras sumar el 30
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
  await prueba("capacidad: parcial 14:00–17:00 en jornada 08:30–18:00 deja 68%; OOO = 0; fin de semana fuera", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo, hora_inicio, hora_fin) VALUES ('a','u1','2026-10-02',0,'14:00','17:00')").run();
    d.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('b','u1','2026-10-05',1)").run();
    const c = capacidad(d, hoy, equipoActivo(d), 14);
    const celda = (f: string) => c.filas[0].celdas.find((x) => x.fecha === f)!;
    assert.equal(celda("2026-10-01").estado, "disponible");
    assert.equal(celda("2026-10-02").estado, "parcial");
    assert.equal(celda("2026-10-02").fraccion, 0.68); // 1 − 180/570
    assert.equal(celda("2026-10-03").estado, "fin_de_semana");
    assert.equal(celda("2026-10-05").estado, "ooo");
    assert.equal(celda("2026-10-12").estado, "feriado");
    // 9 días hábiles entre jue 1 y mié 14 (sin 12-oct feriado) − 1 OOO − 0,32 parcial = 7,68
    assert.equal(c.filas[0].dias_disponibles, 7.7);
  });
  await prueba("reparto en partes iguales sin perder pesos", () => {
    assert.deepEqual(repartirMonto(100, 3), [34, 33, 33]);
    assert.deepEqual(repartirMonto(90000, 2), [45000, 45000]);
    assert.deepEqual(repartirMonto(5, 1), [5]);
    for (const [m, k] of [[1, 3], [99999, 7], [1234567, 4]]) {
      assert.equal(repartirMonto(m, k).reduce((x, y) => x + y, 0), m);
    }
  });
  await prueba("gerencia: gasto por proyecto con compras repartidas; rechazadas excluidas", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p2','AETH-02','Fuente',100000,'2026-09-01','2026-11-30')").run();
    const g = d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, estado) VALUES (?, 'u1', 'x', ?, ?)");
    const gp = d.prepare("INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_clp) VALUES (?, ?, ?)");
    g.run("g1", 43435, "aprobado"); gp.run("g1", "p1", 43435);
    g.run("g2", 90001, "pendiente"); gp.run("g2", "p1", 45001); gp.run("g2", "p2", 45000); // compra de 2 proyectos
    g.run("g3", 99999, "rechazado"); gp.run("g3", "p2", 99999);
    const m = metricasExec(d, hoy);
    const p1 = m.proyectos.find((p) => p.id === "p1")!;
    const p2 = m.proyectos.find((p) => p.id === "p2")!;
    assert.equal(p1.total_clp, 88436);
    assert.equal(p1.por_validar_clp, 45001);
    assert.equal(p1.compras, 2);
    assert.equal(p2.total_clp, 45000);
    assert.equal(p2.pct_presupuesto, 45);
    assert.equal(m.totales.total_clp, 133436);
    assert.equal(m.totales.por_validar_clp, 90001);
    assert.equal(m.totales.aprobado_clp, 43435);
    assert.equal(p1.dias_comprometidos, 121); // 1-sep → 31-dic
    assert.equal(p1.dias_transcurridos, 30);
    const filas = gastosEmpresa(d, { estado: "todos" });
    assert.deepEqual(filas.find((f) => f.id === "g2")!.proyectos.map((p) => [p.codigo, p.monto_clp]), [["AETH-01", 45001], ["AETH-02", 45000]]);
  });
  await prueba("standup: bloqueo sin resolver va primero; resuelto deja de contar", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO usuarios (id, nombre, email, rol, creado_en) VALUES ('u2','Beto','beto@aether.cl','team','2026-09-01T12:00:00.000Z')").run();
    d.prepare("INSERT INTO bitacoras (id, usuario_id, fecha, checkin_manana, bloqueos) VALUES ('bx','u2','2026-09-30','2026-09-30T12:00:00Z','Falta stock')").run();
    let s = standup(d, hoy, equipoActivo(d));
    assert.equal(s[0].nombre, "Beto");
    assert.equal(s[0].prioridad, 1);
    d.prepare("UPDATE bitacoras SET bloqueo_resuelto_en = '2026-10-01T12:00:00Z' WHERE id = 'bx'").run();
    s = standup(d, hoy, equipoActivo(d));
    assert.ok(s.every((f) => f.bloqueos.length === 0));
  });

  console.log("Ventanas de la jornada (hora de Chile)");
  await prueba("momento del día según ventanas 08:30–10:30 y 17:00–19:30", () => {
    assert.equal(momentoDe("08:29", V), "antes");
    assert.equal(momentoDe("08:30", V), "manana");
    assert.equal(momentoDe("10:30", V), "manana");
    assert.equal(momentoDe("10:31", V), "dia");
    assert.equal(momentoDe("17:00", V), "tarde");
    assert.equal(momentoDe("19:30", V), "tarde");
    assert.equal(momentoDe("19:31", V), "despues");
  });
  await prueba("encuesta obligatoria solo dentro de su ventana y si no está hecha; si no, tablero", () => {
    assert.equal(vistaPara("pendiente_manana", "manana", true), "encuesta_manana");
    assert.equal(vistaPara("pendiente_manana", "dia", true), "tablero"); // tarde: tablero con aviso, no obligatorio
    assert.equal(vistaPara("pendiente_tarde", "manana", true), "tablero"); // recién registró: ve su tablero
    assert.equal(vistaPara("pendiente_tarde", "dia", true), "tablero");
    assert.equal(vistaPara("pendiente_tarde", "tarde", true), "encuesta_tarde");
    assert.equal(vistaPara("pendiente_tarde", "despues", true), "tablero");
    assert.equal(vistaPara("cerrado", "tarde", true), "tablero");
    assert.equal(vistaPara("ooo_completo", "manana", true), "tablero");
    assert.equal(vistaPara("pendiente_manana", "manana", false), "tablero"); // fin de semana / feriado
  });

  console.log("Juego: XP, nivel y logros");
  await prueba("niveles: 0→1, 100→2, 300→3, 600→4", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(xpParaNivel), [0, 100, 300, 600, 1000]);
    assert.deepEqual([0, 99, 100, 299, 300, 650].map(nivelDe), [1, 1, 2, 2, 3, 4]);
  });
  await prueba("XP = objetivos×10 + cierres a tiempo×5 + días perfectos×15 + inicios a tiempo×3; logros", () => {
    const d = dbNueva();
    // 30-sep: inicio 08:45 (11:45Z), cierre 19:00 (22:00Z), 3/3 → perfecto
    bitacora(d, "2026-09-30", "ccc", "2026-09-30T22:00:00Z");
    d.prepare("UPDATE bitacoras SET checkin_manana = '2026-09-30T11:45:00Z' WHERE fecha = '2026-09-30'").run();
    // 29-sep: inicio 11:00 (14:00Z, tarde), cierre 20:00 (23:00Z, fuera de hora), 1/2
    bitacora(d, "2026-09-29", "cp", "2026-09-29T23:00:00Z");
    d.prepare("UPDATE bitacoras SET checkin_manana = '2026-09-29T14:00:00Z' WHERE fecha = '2026-09-29'").run();
    const j = calcularJuego(d, "u1", hoy, "2026-09-01");
    assert.equal(j.objetivos_completados, 4);
    assert.equal(j.dias_perfectos, 1);
    assert.equal(j.xp, 4 * 10 + 1 * 5 + 1 * 15 + 1 * 3);
    assert.equal(j.nivel, 1);
    assert.equal(j.mejor_racha, 1);
    const l = Object.fromEntries(j.logros.map((x) => [x.clave, x]));
    assert.equal(l.primera.logrado, true);
    assert.equal(l.perfecto.logrado, true);
    assert.equal(l.madrugador.progreso, 1);
    assert.equal(l.racha5.logrado, false);
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
