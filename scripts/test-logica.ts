// Pruebas de reglas puras: zona horaria, racha, Say-Do, RUT, códigos. Ejecutar: npm run test:logica
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { calcularProgreso } from "../lib/metricas";
import { empresaPorEmail } from "../lib/empresas";
import { MIGRACIONES_EMPRESA } from "../lib/migraciones";
import { capacidad, equipoActivo, metricasExec, standup } from "../lib/tableros";
import { hashPin, motivoPinDebil, verificarPin } from "../lib/pin";
import { normalizarRut } from "../lib/rut";
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
  [...estados].forEach((e, i) =>
    db.prepare("INSERT INTO tareas_diarias (id, bitacora_id, proyecto_id, orden, descripcion, estado) VALUES (?, ?, 'p1', ?, 'x', ?)").run(
      `${id}t${i}`, id, i, mapa[e],
    ),
  );
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
  await prueba("FK activas: tarea con proyecto inexistente falla", () => {
    const d7 = dbNueva();
    bitacora(d7, hoy, "", null);
    assert.throws(() => d7.prepare("INSERT INTO tareas_diarias (id, bitacora_id, proyecto_id, descripcion) VALUES ('t','b" + n + "','nope','x')").run());
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
  await prueba("gerencia: IVA recuperable, IVA absorbido en boletas, rechazadas excluidas", () => {
    const d = dbNueva();
    const g = d.prepare(`INSERT INTO gastos (id, usuario_id, proyecto_id, fecha_documento, item, monto_item_clp, monto_envio_clp, iva_clp,
      tipo_documento, rut_emisor, folio_documento, comprobante_archivo, comprobante_mime, estado)
      VALUES (?, 'u1', 'p1', '2026-10-01', 'x', ?, ?, ?, ?, ?, ?, 'f', 'image/jpeg', ?)`);
    g.run("g1", 32000, 4500, 6935, "factura", "76086428-5", "1", "aprobado");
    g.run("g2", 11900, 0, 0, "boleta", null, "2", "pendiente");
    g.run("g3", 99999, 0, 0, "boleta", null, "3", "rechazado");
    const m = metricasExec(d, hoy);
    assert.equal(m.totales.componentes_clp, 43900);
    assert.equal(m.totales.flete_clp, 4500);
    assert.equal(m.totales.por_validar_clp, 11900);
    assert.equal(m.iva.iva_recuperable_clp, 6935);
    assert.equal(m.iva.iva_absorbido_boleta_clp, 1900); // 11.900 × 19/119
    assert.equal(m.proyectos[0].dias_comprometidos, 121); // 1-sep → 31-dic
    assert.equal(m.proyectos[0].dias_transcurridos, 30);
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

  console.log("RUT y códigos");
  await prueba("RUT módulo 11", () => {
    assert.equal(normalizarRut("12.345.678-5"), "12345678-5");
    assert.equal(normalizarRut("11111111-1"), "11111111-1");
    assert.equal(normalizarRut("12.345.678-9"), null);
    assert.equal(normalizarRut("abc"), null);
  });
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
