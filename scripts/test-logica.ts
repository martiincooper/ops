// Pruebas de reglas puras: zona horaria, Say-Do por objetivos, tableros, migraciones, códigos. Ejecutar: npm run test:logica
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import Database from "better-sqlite3";
import { calcularProgreso } from "../lib/metricas";
import { empresaPorEmail } from "../lib/empresas";
import { MAX_OBJETIVOS, esquemaGasto, esquemaGastoCambio } from "../lib/esquemas";
import { FOTO_MAX_BYTES } from "../lib/chat/adjuntos";
import { ErrorGasto, crearGasto, editarGasto, eliminarGasto, necesitaTipoCambio } from "../lib/gastos";
import { borrarTarea, crearTarea, marcarTarea, tareasAbiertas } from "../lib/tareas";
import { AVISO_PROYECTOS_POR_ETAPA, type EstadoProyecto, leerEtapas, registrarCambioEtapa } from "../lib/etapas";
import { MIGRACIONES_CONTROL, MIGRACIONES_EMPRESA } from "../lib/migraciones";
import { ESPERAS_MIN, MAX_REINTENTOS, SIN_REPO, SIN_TOKEN, enviarIssue, pendientesDeReintento, procesarPendientes } from "../lib/chat/envio";
import { CUENTA_DATASHEQ, type DatosIssue, ETIQUETA_REVISION, ErrorGithub, configDesdeEntorno, crearIssueEn, olvidarEtiquetas } from "../lib/chat/githubApi";
import { REPOS_POR_DEFECTO, modulosActivos, repoDe, reposDeModulos, salaActiva } from "../lib/chat/repos";
import { CUPO_POR_MINUTO, consumirCupo, reiniciarCupos } from "../lib/chat/uso";
import { estadoVisible, reiniciarSincronizacion, sincronizar } from "../lib/chat/seguimiento";
import { MODULOS, type Modulo, codigoTicket, moduloPorClave, puedeAdministrarPortal, puedeUsarPortal } from "../lib/chat/modulos";
import {
  ErrorSala,
  SALA_NO_DISPONIBLE,
  TEXTO_MAX,
  adjuntoGuardado,
  enviarMensaje,
  estadoSalas,
  mensajes as mensajesChat,
  participantes,
  solicitud,
  solicitudAbierta,
  vistaSala,
} from "../lib/chat/salas";
import { ErrorObjetivo, agregarObjetivo, agregarObjetivoJefatura, bitacoraEditable, comenzarJornada, cambiarBloqueo, cambiarObjetivo, quitarObjetivo } from "../lib/objetivos";
import { cuentaDeRegistros, eliminarCuenta, idsHeredados } from "../lib/registros";
import { repartirMonto } from "../lib/reparto";
import { capacidad, comprasPorPago, equipoActivo, gastosEmpresa, metricasExec, standup } from "../lib/tableros";
import { hashPin, motivoPinDebil, verificarPin } from "../lib/pin";
import { METAS_DEFECTO, esquemaMetas, guardarMetas, leerMetas } from "../lib/metas";
import { fechaLocal, horaLocal, sumarDias } from "../lib/tiempo";

// Todas las salas con repositorio (las pruebas de salas usan varias); las de repositorios usan su propio entorno
process.env.GITHUB_REPOS = MODULOS.map((m) => `${m.clave}=dueno/repo`).join(",");

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
    assert.equal(empresaPorEmail("Pedro@DATASHEQ.COM")?.clave, "datasheq");
    assert.equal(empresaPorEmail("pedro@datasheq.cl"), undefined);
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

  console.log("Compras: impuesto, tipo de costo, edición y costos de jefatura");
  await prueba("migración v7/v8 sobre una base v6 con compras: impuesto 0, tipo único, total intacto", () => {
    const d = new Database(":memory:");
    d.pragma("foreign_keys = ON");
    MIGRACIONES_EMPRESA.slice(0, 6).forEach((m) => d.exec(m));
    d.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES ('u1','Ana','ana@aether.cl','team')").run();
    d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, envio_clp) VALUES ('g0','u1','Viejo',12000,2000)").run();
    MIGRACIONES_EMPRESA.slice(6).forEach((m) => d.exec(m));
    assert.deepEqual(d.prepare("SELECT monto_clp, envio_clp, impuesto_clp, tipo_costo, de_jefatura, editado_en FROM gastos").get(), {
      monto_clp: 12000, envio_clp: 2000, impuesto_clp: 0, tipo_costo: "unico", de_jefatura: 0, editado_en: null,
    });
    assert.deepEqual(d.prepare("SELECT COUNT(*) n FROM tareas_asignadas").get(), { n: 0 });
  });
  await prueba("esquema: impuesto opcional entero ≥ 0, tipo de costo válido, edición parcial", () => {
    const base = { proyecto_ids: ["p1"], item: "Sensor", monto_clp: 10000 };
    assert.equal(esquemaGasto.safeParse({ ...base, impuesto_clp: 3500, tipo_costo: "mensual" }).success, true);
    assert.equal(esquemaGasto.safeParse({ ...base, impuesto_clp: -1 }).success, false);
    assert.equal(esquemaGasto.safeParse({ ...base, tipo_costo: "semanal" }).success, false);
    assert.equal(esquemaGasto.safeParse({ ...base, monto_clp: 999_999_999, impuesto_clp: 2 }).success, false);
    assert.equal(esquemaGastoCambio.safeParse({ impuesto_clp: 5000 }).success, true);
    assert.equal(esquemaGastoCambio.safeParse({}).success, false);
  });
  await prueba("editar una compra aprobada: suma el impuesto, conserva el estado y vuelve a repartir", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p2','AETH-02','Gateway',1,'2026-09-01','2026-12-31')").run();
    const id = crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos: { proyecto_ids: ["p1", "p2"], item: "Módulo", monto_clp: 10001, envio_clp: 999 }, ahora: "2026-10-01T12:00:00Z" });
    assert.deepEqual(d.prepare("SELECT monto_clp, envio_clp, impuesto_clp, tipo_costo, estado FROM gastos").get(), { monto_clp: 11000, envio_clp: 999, impuesto_clp: 0, tipo_costo: "unico", estado: "pendiente" });
    d.prepare("UPDATE gastos SET estado = 'aprobado', validado_por = 'a1', validado_por_nombre = 'Jefa' WHERE id = ?").run(id);
    d.prepare("UPDATE proyectos SET estado = 'entregado' WHERE id = 'p2'").run(); // ya vinculado: se puede conservar
    editarGasto(d, id, { impuesto_clp: 4001, tipo_costo: "anual" }, { nombre: "Ana", ahora: "2026-10-05T12:00:00Z", usuarioId: "u1" });
    assert.deepEqual(d.prepare("SELECT monto_clp, envio_clp, impuesto_clp, tipo_costo, estado, validado_por_nombre, editado_por_nombre FROM gastos").get(), {
      monto_clp: 15001, envio_clp: 999, impuesto_clp: 4001, tipo_costo: "anual", estado: "aprobado", validado_por_nombre: "Jefa", editado_por_nombre: "Ana",
    });
    assert.deepEqual(d.prepare("SELECT proyecto_id, monto_clp FROM gasto_proyectos ORDER BY proyecto_id").all(), [
      { proyecto_id: "p1", monto_clp: 7501 }, { proyecto_id: "p2", monto_clp: 7500 },
    ]);
    // Precio final distinto: monto_clp es la compra sin envío ni impuesto
    editarGasto(d, id, { monto_clp: 20000, envio_clp: null, proyecto_ids: ["p1"] }, { nombre: "Jefa", ahora: "2026-10-05T13:00:00Z" });
    assert.deepEqual(d.prepare("SELECT monto_clp, envio_clp, impuesto_clp FROM gastos").get(), { monto_clp: 24001, envio_clp: 0, impuesto_clp: 4001 });
    assert.deepEqual(d.prepare("SELECT proyecto_id, monto_clp FROM gasto_proyectos").all(), [{ proyecto_id: "p1", monto_clp: 24001 }]);
    // p2 ya no está vinculado ni activo: no se puede volver a agregar
    assert.throws(() => editarGasto(d, id, { proyecto_ids: ["p1", "p2"] }, { nombre: "Ana", ahora: "x", usuarioId: "u1" }), ErrorGasto);
    // Otra persona del equipo no puede editarla
    assert.throws(() => editarGasto(d, id, { item: "x" }, { nombre: "Beto", ahora: "x", usuarioId: "u2" }), /no encontrada/);
    assert.deepEqual(d.prepare("PRAGMA foreign_key_check").all(), []);
  });
  await prueba("eliminar compra: equipo solo las propias (en cualquier estado), jefatura cualquiera; se borra su reparto", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p2','AETH-02','Fuente',100000,'2026-09-01','2026-11-30')").run();
    const nueva = () => crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos: { proyecto_ids: ["p1", "p2"], item: "Sensor", monto_clp: 10000 }, ahora: "2026-10-07T12:00:00Z" });
    const a = nueva();
    const b = nueva();
    d.prepare("UPDATE gastos SET estado = 'aprobado' WHERE id = ?").run(a);
    assert.throws(() => eliminarGasto(d, a, "u2"), /no encontrada/);
    eliminarGasto(d, a, "u1");
    eliminarGasto(d, b);
    assert.throws(() => eliminarGasto(d, b), ErrorGasto);
    assert.equal((d.prepare("SELECT COUNT(*) AS n FROM gastos").get() as { n: number }).n, 0);
    assert.equal((d.prepare("SELECT COUNT(*) AS n FROM gasto_proyectos").get() as { n: number }).n, 0);
  });
  await prueba("costo de jefatura: a nombre de su fila de registros, aprobado y no marcado como heredado", () => {
    const d = dbNueva();
    const fila = cuentaDeRegistros(d, { id: "a1", nombre: "Jefa" });
    crearGasto(d, { usuarioId: fila, bitacoraId: null, datos: { proyecto_ids: ["p1"], item: "Licencia CAD", monto_clp: 50000, tipo_costo: "mensual" }, aprobadaPor: { id: "a1", nombre: "Jefa" }, ahora: "2026-10-01T12:00:00Z" });
    const [g] = gastosEmpresa(d, { estado: "todos" });
    assert.deepEqual([g.estado, g.validado_por_nombre, g.de_jefatura, g.heredado, g.tipo_costo], ["aprobado", "Jefa", true, false, "mensual"]);
    assert.equal(gastosEmpresa(d).length, 0, "no aparece en «Por validar»");
    assert.equal(metricasExec(d, "2026-10-01").costo.proyectos[0].total_clp, 50000);
  });

  console.log("Compras: estado de pago (por enviar, esperando pago, comprada)");
  await prueba("migración v9 sobre una base v8: las compras existentes quedan como compradas", () => {
    const d = new Database(":memory:");
    d.pragma("foreign_keys = ON");
    MIGRACIONES_EMPRESA.slice(0, 8).forEach((m) => d.exec(m));
    d.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES ('u1','Ana','ana@aether.cl','team')").run();
    d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp) VALUES ('g0','u1','Viejo',12000)").run();
    MIGRACIONES_EMPRESA.slice(8).forEach((m) => d.exec(m));
    assert.deepEqual(d.prepare("SELECT estado_pago FROM gastos").get(), { estado_pago: "comprada" });
    assert.throws(() => d.prepare("UPDATE gastos SET estado_pago = 'pagada'").run());
  });
  await prueba("esquema: estado de pago opcional y solo los tres valores", () => {
    const base = { proyecto_ids: ["p1"], item: "Sensor", monto_clp: 10000 };
    for (const e of ["por_enviar", "esperando_pago", "comprada"]) assert.equal(esquemaGasto.safeParse({ ...base, estado_pago: e }).success, true, e);
    assert.equal(esquemaGasto.safeParse({ ...base, estado_pago: "pagada" }).success, false);
    assert.equal(esquemaGastoCambio.safeParse({ estado_pago: "esperando_pago" }).success, true);
  });
  await prueba("crear y editar: por defecto comprada; cambiar el estado de pago conserva la validación y el monto", () => {
    const d = dbNueva();
    const datos = { proyecto_ids: ["p1"], item: "Módulo", monto_clp: 10000 };
    const a = crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos, ahora: "2026-10-01T12:00:00Z" });
    const b = crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos: { ...datos, estado_pago: "por_enviar" }, ahora: "2026-10-01T12:01:00Z" });
    const pago = (id: string) => (d.prepare("SELECT estado_pago, estado, monto_clp FROM gastos WHERE id = ?").get(id) as Record<string, unknown>);
    assert.deepEqual(pago(a), { estado_pago: "comprada", estado: "pendiente", monto_clp: 10000 });
    d.prepare("UPDATE gastos SET estado = 'aprobado' WHERE id = ?").run(b);
    editarGasto(d, b, { estado_pago: "esperando_pago" }, { nombre: "Jefa", ahora: "2026-10-02T12:00:00Z" });
    assert.deepEqual(pago(b), { estado_pago: "esperando_pago", estado: "aprobado", monto_clp: 10000 });
    editarGasto(d, b, { impuesto_clp: 500 }, { nombre: "Ana", ahora: "2026-10-03T12:00:00Z", usuarioId: "u1" });
    assert.equal(pago(b).estado_pago, "esperando_pago", "editar otro campo no cambia el estado de pago");
  });
  await prueba("jefatura filtra por estado de pago; gerencia ve los tres grupos sin rechazadas", () => {
    const d = dbNueva();
    const nueva = (item: string, monto: number, estado_pago: "por_enviar" | "esperando_pago" | "comprada", ahora: string) => {
      const id = crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos: { proyecto_ids: ["p1"], item, monto_clp: monto, estado_pago }, ahora });
      d.prepare("UPDATE gastos SET creado_en = ? WHERE id = ?").run(ahora, id); // fecha de registro fija para el orden
      return id;
    };
    nueva("PCB", 30000, "por_enviar", "2026-10-01T12:00:00Z");
    nueva("Stencil", 20000, "por_enviar", "2026-10-02T12:00:00Z");
    const esp = nueva("Sensor", 15000, "esperando_pago", "2026-10-02T13:00:00Z");
    const rech = nueva("Rechazada", 99000, "esperando_pago", "2026-10-02T14:00:00Z");
    nueva("Cables", 5000, "comprada", "2026-10-03T12:00:00Z");
    d.prepare("UPDATE gastos SET estado = 'aprobado' WHERE id = ?").run(esp);
    d.prepare("UPDATE gastos SET estado = 'rechazado' WHERE id = ?").run(rech);
    assert.deepEqual(gastosEmpresa(d, { estado: "todos", pago: "por_enviar" }).map((g) => g.item), ["Stencil", "PCB"]);
    assert.deepEqual(gastosEmpresa(d, { estado: "todos", pago: "esperando_pago" }).map((g) => g.item), ["Rechazada", "Sensor"]);
    assert.equal(gastosEmpresa(d, { estado: "todos" }).length, 5, "sin filtro de pago: todas");
    assert.deepEqual(
      comprasPorPago(d).map((g) => [g.estado_pago, g.compras, g.total_clp, g.por_validar_clp, g.items.map((i) => i.item)]),
      [
        ["por_enviar", 2, 50000, 50000, ["Stencil", "PCB"]],
        ["esperando_pago", 1, 15000, 0, ["Sensor"]],
        ["comprada", 1, 5000, 5000, ["Cables"]],
      ],
    );
    const [g] = comprasPorPago(d);
    assert.deepEqual([g.items[0].persona, g.items[0].fecha, g.items[0].proyectos], ["Ana", "2026-10-02", [{ codigo: "AETH-01", nombre: "Sensor" }]]);
    assert.equal(metricasExec(d, "2026-10-03").pagos.length, 3);
  });

  console.log("Compras en dólares: conversión a pesos con el dólar del día");
  await prueba("esquema: montos en US$ con hasta 2 decimales; la compra en pesos o en dólares", () => {
    const base = { proyecto_ids: ["p1"], item: "Sensor" };
    assert.equal(esquemaGasto.safeParse({ ...base, monto_usd: 120.5 }).success, true);
    assert.equal(esquemaGasto.safeParse({ ...base, monto_usd: 120.555 }).success, false);
    assert.equal(esquemaGasto.safeParse({ ...base, monto_usd: 0 }).success, false);
    assert.equal(esquemaGasto.safeParse({ ...base, monto_clp: 10000, envio_usd: 9.99, impuesto_usd: 0.01 }).success, true);
    assert.equal(esquemaGasto.safeParse(base).success, false, "sin monto");
    assert.equal(esquemaGastoCambio.safeParse({ envio_usd: 15 }).success, true);
  });
  await prueba("crear en dólares: cada monto se convierte al peso con el dólar del día; se guarda el valor en US$", () => {
    const d = dbNueva();
    const tc = { valor: 977.25, fecha: "2026-10-06" };
    const datos = { proyecto_ids: ["p1"], item: "Módulo LoRa", monto_usd: 120.5, envio_usd: 10, impuesto_clp: 5000 };
    assert.equal(necesitaTipoCambio(d, null, datos), true);
    assert.equal(necesitaTipoCambio(d, null, { proyecto_ids: ["p1"], item: "x", monto_clp: 1000 }), false);
    assert.throws(() => crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos, ahora: "x" }), /dólar del día/, "sin dólar no se guarda");
    const id = crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos, ahora: "2026-10-06T12:00:00Z", tipoCambio: tc });
    // 120,5 × 977,25 = 117.758,6 → 117.759; 10 × 977,25 = 9.772,5 → 9.773 (redondeo al peso)
    assert.deepEqual(d.prepare("SELECT monto_clp, envio_clp, impuesto_clp, monto_usd, envio_usd, impuesto_usd, tipo_cambio, tipo_cambio_fecha FROM gastos WHERE id = ?").get(id), {
      monto_clp: 117759 + 9773 + 5000, envio_clp: 9773, impuesto_clp: 5000, monto_usd: 120.5, envio_usd: 10, impuesto_usd: null, tipo_cambio: 977.25, tipo_cambio_fecha: "2026-10-06",
    });
    assert.deepEqual(d.prepare("SELECT monto_clp FROM gasto_proyectos").get(), { monto_clp: 132532 }, "el reparto usa pesos");
  });
  await prueba("editar: al tocar los montos se reconvierte todo con el dólar de hoy; sin tocarlos no cambia nada", () => {
    const d = dbNueva();
    const id = crearGasto(d, { usuarioId: "u1", bitacoraId: null, datos: { proyecto_ids: ["p1"], item: "Placa", monto_usd: 100, envio_clp: 3000 }, ahora: "x", tipoCambio: { valor: 950, fecha: "2026-10-01" } });
    const fila = () => d.prepare("SELECT monto_clp, envio_clp, monto_usd, tipo_cambio, tipo_cambio_fecha FROM gastos").get();
    // Solo el estado de pago: no hace falta dólar y no cambia el monto
    assert.equal(necesitaTipoCambio(d, id, { estado_pago: "comprada" }), false);
    editarGasto(d, id, { estado_pago: "comprada" }, { nombre: "Ana", ahora: "x" });
    assert.deepEqual(fila(), { monto_clp: 98000, envio_clp: 3000, monto_usd: 100, tipo_cambio: 950, tipo_cambio_fecha: "2026-10-01" });
    // Se edita el envío (en pesos): la compra en dólares se reconvierte con el dólar de hoy
    assert.equal(necesitaTipoCambio(d, id, { envio_clp: 4000 }), true);
    assert.throws(() => editarGasto(d, id, { envio_clp: 4000 }, { nombre: "Ana", ahora: "x" }), ErrorGasto);
    editarGasto(d, id, { envio_clp: 4000 }, { nombre: "Ana", ahora: "x" }, { valor: 1000, fecha: "2026-10-06" });
    assert.deepEqual(fila(), { monto_clp: 104000, envio_clp: 4000, monto_usd: 100, tipo_cambio: 1000, tipo_cambio_fecha: "2026-10-06" });
    // Pasar la compra a pesos: se borra el valor en dólares y el dólar
    editarGasto(d, id, { monto_clp: 90000, monto_usd: null }, { nombre: "Ana", ahora: "x" });
    assert.deepEqual(fila(), { monto_clp: 94000, envio_clp: 4000, monto_usd: null, tipo_cambio: null, tipo_cambio_fecha: null });
  });

  console.log("Gerencia: desglose de costos (único, recurrente por periodo, por proyecto)");
  /** Base con p1 (AETH-01), p2 (AETH-02, entregado) y p3 (AETH-03, sin compras). */
  function dbCostos() {
    const d = dbNueva();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo, estado) VALUES ('p2','AETH-02','Fuente',100000,'2026-06-01','2026-08-30','entregado')").run();
    d.prepare("INSERT INTO proyectos (id, codigo, nombre, presupuesto_clp, fecha_inicio, fecha_entrega_objetivo) VALUES ('p3','AETH-03','Gateway',0,'2026-09-01','2026-11-30')").run();
    const g = d.prepare("INSERT INTO gastos (id, usuario_id, item, monto_clp, tipo_costo, estado, creado_en) VALUES (?, 'u1', ?, ?, ?, ?, ?)");
    const gp = d.prepare("INSERT INTO gasto_proyectos (gasto_id, proyecto_id, monto_clp) VALUES (?, ?, ?)");
    const compra = (id: string, item: string, tipo: string, estado: string, creado: string, partes: [string, number][]) => {
      g.run(id, item, partes.reduce((s, [, m]) => s + m, 0), tipo, estado, `${creado}T15:00:00Z`);
      partes.forEach(([p, m]) => gp.run(id, p, m));
    };
    return { d, compra };
  }
  await prueba("costo total: único + recurrente pagado, rechazadas fuera, entregados incluidos, repartido por proyecto", () => {
    const { d, compra } = dbCostos();
    compra("g1", "PCB v1", "unico", "aprobado", "2026-09-05", [["p1", 300000]]);
    compra("g2", "Stencil", "unico", "pendiente", "2026-09-06", [["p1", 25000], ["p2", 25000]]);
    compra("g3", "Licencia CAD", "mensual", "aprobado", "2026-09-07", [["p1", 18000]]);
    compra("g4", "Rechazada", "unico", "rechazado", "2026-09-08", [["p1", 999999]]);
    compra("g5", "Hosting", "anual", "aprobado", "2026-09-09", [["p2", 120000]]);
    const x = metricasExec(d, hoy).desglose;
    assert.deepEqual([x.total_clp, x.unico_clp, x.recurrente_clp, x.por_validar_clp, x.compras], [488000, 350000, 138000, 50000, 4]);
    assert.deepEqual(
      x.proyectos.map((p) => [p.codigo, p.estado, p.total_clp, p.unico_clp, p.recurrente_clp, p.compras]),
      [
        ["AETH-01", "concepto", 343000, 325000, 18000, 3],
        ["AETH-02", "entregado", 145000, 25000, 120000, 2],
      ],
      "del mayor al menor; el entregado cuenta; sin compras no aparece",
    );
    assert.equal(metricasExec(d, hoy).costo.total_clp, 343000, "Costo vs BOM sigue sin los entregados");
  });
  await prueba("costo recurrente: diario, mensual y anual llevados a día, mes y año", () => {
    const { d, compra } = dbCostos();
    compra("g1", "Datos móviles", "diario", "aprobado", "2026-09-05", [["p1", 5000]]);
    compra("g2", "Licencia CAD", "mensual", "aprobado", "2026-09-06", [["p1", 18000]]);
    compra("g3", "Hosting", "anual", "pendiente", "2026-09-07", [["p1", 60000], ["p3", 60000]]);
    const r = metricasExec(d, hoy).desglose.recurrente;
    assert.deepEqual(r.por_tipo, [
      { tipo: "diario", costos: 1, monto_clp: 5000, por_periodo: { dia: 5000, mes: 152083, anio: 1825000 } },
      { tipo: "mensual", costos: 1, monto_clp: 18000, por_periodo: { dia: 592, mes: 18000, anio: 216000 } },
      { tipo: "anual", costos: 1, monto_clp: 120000, por_periodo: { dia: 329, mes: 10000, anio: 120000 } },
    ]);
    assert.deepEqual(r.por_periodo, { dia: 5921, mes: 180083, anio: 2161000 });
    assert.deepEqual(r.costos.map((c) => [c.item, c.tipo, c.monto_clp, c.proyectos.map((p) => p.codigo)]), [
      ["Datos móviles", "diario", 5000, ["AETH-01"]],
      ["Licencia CAD", "mensual", 18000, ["AETH-01"]],
      ["Hosting", "anual", 120000, ["AETH-01", "AETH-03"]],
    ]);
    const x = metricasExec(d, hoy).desglose;
    const p3 = x.proyectos.find((p) => p.codigo === "AETH-03")!;
    assert.deepEqual(p3.recurrente_por_periodo, { dia: 164, mes: 5000, anio: 60000 }, "su parte del hosting anual");
    assert.equal(x.proyectos.find((p) => p.codigo === "AETH-01")!.recurrente_por_periodo.mes, 152083 + 18000 + 5000);
  });
  await prueba("el mismo costo recurrente registrado cada mes cuenta una vez (el más reciente) por periodo, todos en el total", () => {
    const { d, compra } = dbCostos();
    compra("g1", "Licencia CAD", "mensual", "aprobado", "2026-08-01", [["p1", 18000]]);
    compra("g2", "licencia  cad ", "mensual", "aprobado", "2026-09-01", [["p1", 20000]]); // mismo costo: sube el precio
    compra("g3", "Licencia CÁD", "mensual", "rechazado", "2026-09-15", [["p1", 50000]]); //    rechazado: no cuenta
    compra("g4", "Licencia CAD", "mensual", "aprobado", "2026-09-02", [["p3", 7000]]); //     otro proyecto: otro costo
    compra("g5", "Licencia CAD", "anual", "aprobado", "2026-07-01", [["p2", 100000]]); //    otro proyecto y tipo
    const x = metricasExec(d, hoy).desglose;
    const lic = x.recurrente.costos.find((c) => c.proyectos[0].codigo === "AETH-01")!;
    assert.deepEqual([lic.item, lic.monto_clp, lic.registros, lic.pagado_clp, lic.ultimo_registro], ["licencia  cad ", 20000, 2, 38000, "2026-09-01"]);
    assert.equal(x.recurrente.costos.length, 3);
    assert.equal(x.recurrente.por_periodo.mes, 20000 + 7000 + Math.round(100000 / 12));
    assert.equal(x.recurrente_clp, 18000 + 20000 + 7000 + 100000, "todos los pagos suman al total");
    // Si el registro más reciente pasa a «único», el vigente vuelve a ser el anterior
    d.prepare("UPDATE gastos SET tipo_costo = 'unico' WHERE id = 'g2'").run();
    const y = metricasExec(d, hoy).desglose;
    assert.equal(y.recurrente.costos.find((c) => c.proyectos[0].codigo === "AETH-01")!.monto_clp, 18000);
    assert.deepEqual([y.unico_clp, y.recurrente_clp], [20000, 125000]);
  });
  await prueba("sin compras: todo en cero y sin proyectos", () => {
    const x = metricasExec(dbCostos().d, hoy).desglose;
    assert.deepEqual([x.total_clp, x.recurrente.por_periodo, x.recurrente.por_tipo, x.proyectos], [0, { dia: 0, mes: 0, anio: 0 }, [], []]);
  });

  console.log("Objetivos sin tope de 4, objetivos de jefatura y tareas asignadas");
  await prueba("más de 4 objetivos por jornada, hasta el tope de seguridad", () => {
    const d = dbNueva();
    assert.equal(comenzarJornada(d, "u1", "2026-10-01", [], "2026-10-01T12:00:00Z"), "creada");
    for (let i = 0; i < MAX_OBJETIVOS; i++) agregarObjetivo(d, "u1", { descripcion: `o${i}`, proyecto_ids: ["p1"] }, MAX_OBJETIVOS, "2026-10-01T12:00:00Z");
    assert.throws(() => agregarObjetivo(d, "u1", { descripcion: "x", proyecto_ids: ["p1"] }, MAX_OBJETIVOS, "2026-10-01T12:00:00Z"), new RegExp(`Máximo ${MAX_OBJETIVOS}`));
  });
  await prueba("comenzarJornada: idempotente, no permite dos el mismo día ni con otra abierta ni no disponible", () => {
    const d = dbNueva();
    assert.equal(comenzarJornada(d, "u1", "2026-10-01", [{ descripcion: "a", proyecto_ids: ["p1"] }], "2026-10-01T12:00:00Z"), "creada");
    assert.equal(comenzarJornada(d, "u1", "2026-10-01", [], "2026-10-01T13:00:00Z"), "ya_existia");
    assert.throws(() => comenzarJornada(d, "u1", "2026-10-02", [], "2026-10-02T12:00:00Z"), /sin terminar/);
    d.prepare("UPDATE bitacoras SET checkout_tarde = '2026-10-01T20:00:00Z'").run();
    assert.throws(() => comenzarJornada(d, "u1", "2026-10-01", [], "2026-10-01T21:00:00Z"), /Ya terminaste/);
    d.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('x','u1','2026-10-02',1)").run();
    assert.throws(() => comenzarJornada(d, "u1", "2026-10-02", [], "2026-10-02T12:00:00Z"), /no disponible/);
    assert.throws(() => comenzarJornada(d, "u1", "2026-10-03", [{ descripcion: "a", proyecto_ids: ["nada"] }], "2026-10-03T12:00:00Z"), /no activo/);
  });
  await prueba("objetivo de jefatura: comienza la jornada de hoy si no existe; si existe, lo agrega", () => {
    const d = dbNueva();
    bitacora(d, "2026-09-30", "c", "2026-09-30T20:00:00Z"); // la de ayer, terminada
    const o = { descripcion: "Enviar el paquete", proyecto_ids: ["p1"] };
    assert.equal(agregarObjetivoJefatura(d, "u1", o, MAX_OBJETIVOS, "2026-10-01", "2026-10-01T12:00:00Z"), "jornada_creada");
    assert.equal(agregarObjetivoJefatura(d, "u1", { ...o, descripcion: "Otro" }, MAX_OBJETIVOS, "2026-10-01", "2026-10-01T13:00:00Z"), "agregado");
    const hoy = d.prepare("SELECT id, checkout_tarde FROM bitacoras WHERE fecha = '2026-10-01'").get() as { id: string; checkout_tarde: string | null };
    assert.equal(hoy.checkout_tarde, null);
    assert.deepEqual((d.prepare("SELECT descripcion FROM tareas_diarias WHERE bitacora_id = ? ORDER BY orden").all(hoy.id) as { descripcion: string }[]).map((t) => t.descripcion), ["Enviar el paquete", "Otro"]);
    d.prepare("INSERT INTO ausencias_ooo (id, usuario_id, fecha, dia_completo) VALUES ('x','u1','2026-10-02',1)").run();
    d.prepare("UPDATE bitacoras SET checkout_tarde = '2026-10-01T20:00:00Z' WHERE id = ?").run(hoy.id);
    assert.throws(() => agregarObjetivoJefatura(d, "u1", o, MAX_OBJETIVOS, "2026-10-02", "2026-10-02T12:00:00Z"), /no disponible/);
  });
  await prueba("tareas asignadas: quedan hasta hechas, no cuentan para el Say-Do, el standup las ve", () => {
    const d = dbNueva();
    d.prepare("INSERT INTO usuarios (id, nombre, email, rol) VALUES ('u2','Beto','beto@aether.cl','team')").run();
    const propia = crearTarea(d, "u1", "Enviar paquete", { id: "u1", nombre: "Ana" }, "2026-10-01T12:00:00Z");
    const asignada = crearTarea(d, "u1", "Pedirle a Beto la info", { id: "a1", nombre: "Jefa" }, "2026-10-01T12:05:00Z");
    let t = tareasAbiertas(d, "u1", "2026-10-03T12:00:00Z");
    assert.deepEqual(t.map((x) => [x.descripcion, x.asignada]), [["Enviar paquete", false], ["Pedirle a Beto la info", true]]);
    assert.throws(() => marcarTarea(d, propia, true, "Beto", "x", "u2"), /no encontrada/); // ajena
    marcarTarea(d, propia, true, "Ana", "2026-10-03T12:00:00Z", "u1");
    t = tareasAbiertas(d, "u1", "2026-10-03T13:00:00Z");
    assert.equal(t[1].completada_por_nombre, "Ana", "recién hecha: se ve tachada al final");
    assert.equal(tareasAbiertas(d, "u1", "2026-10-04T13:00:00Z").length, 1, "después desaparece");
    const [fila] = standup(d, "2026-10-03", equipoActivo(d, new Set(["u1"])));
    assert.deepEqual(fila.tareas_abiertas.map((x) => x.descripcion), ["Pedirle a Beto la info"]);
    assert.equal(fila.saydo_14d, null);
    borrarTarea(d, asignada, null);
    assert.equal(tareasAbiertas(d, "u1", "2026-10-04T13:00:00Z").length, 0);
    crearTarea(d, "u2", "x", { id: "u2", nombre: "Beto" }, "2026-10-01T12:00:00Z");
    eliminarCuenta(d, "u2", null); // las tareas se borran con la cuenta
    assert.deepEqual(d.prepare("SELECT COUNT(*) n FROM tareas_asignadas WHERE usuario_id = 'u2'").get(), { n: 0 });
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

  console.log("Portal gerencial (salas como chat grupal)");
  const dbControl = () => {
    const d = new Database(":memory:");
    d.pragma("foreign_keys = ON");
    MIGRACIONES_CONTROL.forEach((m) => d.exec(m));
    return d;
  };
  const ana = { id: "g1", rol: "executive", email: "ana@datasheq.com", nombre: "Ana Pérez" };
  const beto = { id: "g2", rol: "executive", email: "beto@datasheq.com", nombre: "Beto Rojas" };
  const t0 = new Date("2026-10-07T13:00:00Z");
  const mas = (min: number) => new Date(t0.getTime() + min * 60_000);

  await prueba("portal (#27): gerentes de Datasheq y administradores de cualquier dominio", () => {
    assert.equal(puedeUsarPortal({ rol: "executive", empresa: "datasheq" }), true);
    assert.equal(puedeUsarPortal({ rol: "admin", empresa: null }), true); // administrador: sin empresa, cualquier dominio
    assert.equal(puedeUsarPortal({ rol: "executive", empresa: "aether-tech" }), false);
    assert.equal(puedeUsarPortal({ rol: "team", empresa: "datasheq" }), false);
    assert.equal(puedeUsarPortal({ rol: "team", empresa: "aether-tech" }), false);
    assert.equal(puedeUsarPortal({ rol: "executive", empresa: null }), false);
  });
  await prueba("panel del portal (#27): solo administradores", () => {
    assert.equal(puedeAdministrarPortal({ rol: "admin" }), true);
    for (const rol of ["executive", "team"]) assert.equal(puedeAdministrarPortal({ rol }), false, rol);
  });
  await prueba("siete salas con etiqueta C-…", () => {
    assert.deepEqual(MODULOS.map((m) => m.nombre), ["C-Legal", "C-Controla", "C-Previene", "C-Lidera", "C-Acredita", "C-Capacita", "C-Investiga"]);
  });
  await prueba("migración v7: borra los datos del chat, quita el bloqueo, crea el modelo nuevo y chat_modulos vacía", () => {
    const d = new Database(":memory:");
    d.pragma("foreign_keys = ON");
    MIGRACIONES_CONTROL.slice(0, 6).forEach((m) => d.exec(m));
    // Datos del modelo anterior (v6): conversación con mensajes, sala bloqueada y un Issue ya creado en GitHub
    d.prepare("INSERT INTO chat_conversaciones (id, modulo, usuario_id, usuario_rol, usuario_email, usuario_nombre, ticket, issue_numero, issue_repo) VALUES ('v', 'c-legal', 'g1', 'executive', 'ana@datasheq.com', 'Ana', 41, 9, 'dueno/repo')").run();
    d.prepare("INSERT INTO chat_mensajes (conversacion_id, autor, texto) VALUES ('v', 'usuario', 'hola')").run();
    d.prepare("INSERT INTO chat_salas (modulo, conversacion_id, usuario_email) VALUES ('c-legal', 'v', 'ana@datasheq.com')").run();
    d.exec(MIGRACIONES_CONTROL[6]);
    d.exec(MIGRACIONES_CONTROL[7]); // v8: fotos adjuntas
    const tablas = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    assert.ok(!tablas.includes("chat_salas") && !tablas.includes("chat_conversaciones"), tablas.join());
    for (const t of ["chat_solicitudes", "chat_mensajes", "chat_participantes", "chat_modulos"]) {
      assert.ok(tablas.includes(t), t);
      assert.deepEqual(d.prepare(`SELECT COUNT(*) n FROM ${t}`).get(), { n: 0 }, `${t} vacía`);
    }
    // La primera solicitud tras la migración es GER-0001
    const { solicitud: s } = enviarMensaje(d, "c-legal", ana, "hola", t0);
    assert.equal(codigoTicket(s.ticket), "GER-0001");
    // chat_modulos: autonomía por defecto «revisar» y solo «revisar» | «automatico»
    d.prepare("INSERT INTO chat_modulos (clave, nombre) VALUES ('c-x', 'C-X')").run();
    assert.deepEqual(d.prepare("SELECT autonomia, archivado, repo FROM chat_modulos").get(), { autonomia: "revisar", archivado: 0, repo: null });
    assert.throws(() => d.prepare("UPDATE chat_modulos SET autonomia = 'otra'").run());
    // Rol del mensaje y estado del asistente restringidos
    assert.throws(() => d.prepare("INSERT INTO chat_mensajes (solicitud_id, autor_email, autor_nombre, rol, texto) VALUES (?, 'a', 'a', 'robot', 'x')").run(s.id));
    assert.throws(() => d.prepare("UPDATE chat_solicitudes SET asistente_estado = 'otro'").run());
  });
  await prueba("el primer mensaje abre una solicitud; los siguientes se unen y el autor queda como participante", () => {
    const d = dbControl();
    assert.equal(solicitudAbierta(d, "c-legal"), undefined);
    const a = enviarMensaje(d, "c-legal", ana, "  Necesito un informe  ", t0);
    assert.equal(a.nueva, true);
    assert.deepEqual([a.solicitud.estado, a.solicitud.ticket, a.solicitud.asistente_estado, a.solicitud.terminado], ["abierta", 1, "idle", 0]);
    assert.deepEqual(
      [a.mensaje.texto, a.mensaje.rol, a.mensaje.autor_email, a.mensaje.autor_nombre, a.mensaje.creado_en],
      ["Necesito un informe", "gerente", "ana@datasheq.com", "Ana Pérez", t0.toISOString()],
    );
    const b = enviarMensaje(d, "c-legal", { ...beto, email: "Beto@datasheq.com" }, "Yo también", mas(1));
    assert.equal(b.nueva, false);
    assert.equal(b.solicitud.id, a.solicitud.id);
    enviarMensaje(d, "c-legal", ana, "otro más", mas(2)); // Ana no se duplica como participante
    assert.deepEqual(participantes(d, a.solicitud.id).map((x) => x.email), ["ana@datasheq.com", "beto@datasheq.com"]);
    assert.deepEqual(mensajesChat(d, a.solicitud.id).map((m) => m.texto), ["Necesito un informe", "Yo también", "otro más"]);
    // Cada sala tiene lo suyo
    assert.equal(enviarMensaje(d, "c-previene", beto, "hola", mas(3)).solicitud.ticket, 2);
    assert.equal(solicitudAbierta(d, "c-legal")?.id, a.solicitud.id);
  });
  await prueba("sin bloqueo: varias personas a la vez, sin límite de tiempo ni expiración", () => {
    const d = dbControl();
    const a = enviarMensaje(d, "c-legal", ana, "uno", t0).solicitud;
    // Cuatro días después sigue abierta y otra persona escribe en ella
    const lejos = new Date(t0.getTime() + 4 * 24 * 60 * 60_000);
    const b = enviarMensaje(d, "c-legal", beto, "dos", lejos);
    assert.equal(b.nueva, false);
    assert.equal(b.solicitud.id, a.id);
    assert.equal(solicitud(d, a.id)?.estado, "abierta");
    // Ya no existen las tablas ni funciones de bloqueo
    assert.equal(d.prepare("SELECT 1 FROM sqlite_master WHERE name = 'chat_salas'").get(), undefined);
  });
  await prueba("a lo más una solicitud abierta por sala; tras cerrarla, el siguiente mensaje abre otra", () => {
    const d = dbControl();
    const a = enviarMensaje(d, "c-legal", ana, "uno", t0).solicitud;
    assert.throws(() => d.prepare("INSERT INTO chat_solicitudes (id, sala, ticket) VALUES ('x', 'c-legal', 99)").run(), /UNIQUE/);
    d.prepare("UPDATE chat_solicitudes SET estado = 'terminada' WHERE id = ?").run(a.id);
    const b = enviarMensaje(d, "c-legal", beto, "nuevo tema", mas(5));
    assert.equal(b.nueva, true);
    assert.deepEqual([b.solicitud.ticket, b.solicitud.id === a.id], [2, false]);
    assert.deepEqual(participantes(d, b.solicitud.id).map((x) => x.email), ["beto@datasheq.com"]);
  });
  await prueba("abrir una sala muestra todo el historial; con `desde` solo los mensajes más nuevos", () => {
    const d = dbControl();
    const a = enviarMensaje(d, "c-legal", ana, "uno", t0);
    enviarMensaje(d, "c-legal", beto, "dos", mas(1));
    d.prepare("UPDATE chat_solicitudes SET estado = 'cerrada' WHERE id = ?").run(a.solicitud.id);
    enviarMensaje(d, "c-legal", ana, "tres", mas(2));
    enviarMensaje(d, "c-previene", beto, "otra sala", mas(3));
    const v = vistaSala(d, "c-legal");
    assert.deepEqual(v.solicitudes.map((x) => [x.ticket, x.estado]), [[1, "cerrada"], [3 - 1, "abierta"]]);
    assert.deepEqual(v.mensajes.map((m) => [m.texto, m.autor_nombre]), [["uno", "Ana Pérez"], ["dos", "Beto Rojas"], ["tres", "Ana Pérez"]]);
    assert.equal(v.ultimo_id, v.mensajes[2].id);
    // Consulta periódica: solo lo posterior al último visto
    assert.deepEqual(vistaSala(d, "c-legal", v.mensajes[1].id).mensajes.map((m) => m.texto), ["tres"]);
    assert.deepEqual(vistaSala(d, "c-legal", v.ultimo_id).mensajes, []);
    enviarMensaje(d, "c-legal", beto, "cuatro", mas(4));
    assert.deepEqual(vistaSala(d, "c-legal", v.ultimo_id).mensajes.map((m) => m.texto), ["cuatro"]);
    assert.deepEqual(vistaSala(d, "c-lidera").mensajes, []); // sala sin historial
  });
  await prueba("mensajes inválidos y salas desconocidas o sin repositorio", () => {
    const d = dbControl();
    for (const t of ["", "   \n "]) assert.throws(() => enviarMensaje(d, "c-legal", ana, t, t0), (e: ErrorSala) => e.status === 400);
    assert.throws(() => enviarMensaje(d, "c-legal", ana, "x".repeat(TEXTO_MAX + 1), t0), (e: ErrorSala) => e.status === 400);
    assert.equal(enviarMensaje(d, "c-legal", ana, "x".repeat(TEXTO_MAX), t0).nueva, true);
    assert.throws(() => enviarMensaje(d, "c-nada", ana, "hola", t0), (e: ErrorSala) => e.status === 404);
    assert.throws(() => enviarMensaje(d, "c-lidera", ana, "hola", t0, {}), (e: ErrorSala) => e.status === 404 && e.message === SALA_NO_DISPONIBLE);
    assert.equal((d.prepare("SELECT COUNT(*) n FROM chat_solicitudes WHERE sala = 'c-lidera'").get() as { n: number }).n, 0);
  });
  await prueba("tickets correlativos entre salas", () => {
    const d = dbControl();
    const a = enviarMensaje(d, "c-legal", ana, "a", t0).solicitud;
    const b = enviarMensaje(d, "c-previene", beto, "b", t0).solicitud;
    assert.deepEqual([a.ticket, b.ticket], [1, 2]);
    assert.equal(codigoTicket(7), "GER-0007");
  });

  await prueba("fotos (#30): se guardan por contenido en adjuntos/<solicitud>/<n>.<ext> con su fila; límites con su mensaje", () => {
    const d = dbControl();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adjuntos-"));
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50)]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
    const envio = (texto: string, fotos: { nombre: string; datos: Buffer }[], t = t0) => enviarMensaje(d, "c-legal", ana, texto, t, process.env, fotos, dir);
    const falla = (fn: () => unknown, msg: string) => assert.throws(fn, (e: ErrorSala) => e.status === 400 && e.message === msg, msg);
    try {
      const a = envio("mira", [{ nombre: "uno.jpg", datos: jpg }, { nombre: "../dos.png", datos: png }, { nombre: "tres.webp", datos: webp }]);
      assert.deepEqual(a.mensaje.adjuntos.map((x) => [x.nombre, x.tipo, x.tamano]), [["uno.jpg", "image/jpeg", 53], ["dos.png", "image/png", 58], ["tres.webp", "image/webp", 32]]);
      for (const f of ["1.jpg", "2.png", "3.webp"]) assert.ok(fs.existsSync(path.join(dir, "adjuntos", a.solicitud.id, f)), f);
      const guardado = adjuntoGuardado(d, a.mensaje.adjuntos[0].id, dir);
      assert.ok(guardado && fs.readFileSync(guardado.archivo).equals(jpg));
      assert.equal(adjuntoGuardado(d, 999, dir), null);
      assert.deepEqual(vistaSala(d, "c-legal").mensajes[0].adjuntos.map((x) => x.id), a.mensaje.adjuntos.map((x) => x.id));
      assert.deepEqual(mensajesChat(d, a.solicitud.id)[0].adjuntos.length, 3);
      // solo fotos, sin texto, es un mensaje válido; sin texto ni fotos no
      assert.equal(envio("", [{ nombre: "solo.jpg", datos: jpg }], mas(1)).mensaje.texto, "");
      falla(() => envio("", [], mas(1)), "Escribe un mensaje");
      // tipo por contenido, no por nombre
      falla(() => envio("x", [{ nombre: "renombrada.png", datos: Buffer.from("MZ ejecutable") }]), "Solo se aceptan fotos JPG, PNG o WEBP («renombrada.png»)");
      falla(() => envio("x", [{ nombre: "vacia.jpg", datos: Buffer.alloc(0) }]), "Solo se aceptan fotos JPG, PNG o WEBP («vacia.jpg»)");
      // tamaño: 5 MB exactos pasan, un byte más no
      const justo = Buffer.concat([jpg, Buffer.alloc(FOTO_MAX_BYTES - jpg.length)]);
      assert.equal(envio("justo", [{ nombre: "justo.jpg", datos: justo }], mas(2)).mensaje.adjuntos.length, 1); // 5.ª foto
      falla(() => envio("x", [{ nombre: "grande.jpg", datos: Buffer.concat([justo, Buffer.alloc(1)]) }]), "Cada foto debe pesar como máximo 5 MB («grande.jpg»)");
      // límite de 6 por solicitud, entre todos sus mensajes: la 6.ª pasa, la 7.ª no y no deja nada
      assert.equal(envio("sexta", [{ nombre: "6.jpg", datos: jpg }], mas(3)).mensaje.adjuntos.length, 1);
      falla(() => envio("séptima", [{ nombre: "7.jpg", datos: jpg }], mas(4)), "Una solicitud admite como máximo 6 fotos");
      assert.equal((d.prepare("SELECT COUNT(*) n FROM chat_adjuntos").get() as { n: number }).n, 6);
      assert.equal(mensajesChat(d, a.solicitud.id).length, 4);
      assert.equal(fs.readdirSync(path.join(dir, "adjuntos", a.solicitud.id)).length, 6);
      // otra solicitud (otra sala) tiene su propio cupo de 6
      assert.equal(enviarMensaje(d, "c-previene", beto, "x", t0, process.env, Array.from({ length: 6 }, (_, i) => ({ nombre: `${i}.jpg`, datos: jpg })), dir).mensaje.adjuntos.length, 6);
      falla(() => envio("siete de golpe", Array.from({ length: 7 }, () => ({ nombre: "z.jpg", datos: jpg }))), "Una solicitud admite como máximo 6 fotos");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await prueba("fotos (#30): el respaldo copia la carpeta adjuntos", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "respaldo-"));
    try {
      fs.mkdirSync(path.join(dir, "adjuntos", "sol-1"), { recursive: true });
      fs.writeFileSync(path.join(dir, "adjuntos", "sol-1", "1.jpg"), "foto");
      execFileSync("node", ["scripts/backup.mjs", path.join(dir, "respaldos")], { env: { ...process.env, DATA_DIR: dir }, stdio: "pipe" });
      const [marca] = fs.readdirSync(path.join(dir, "respaldos"));
      assert.equal(fs.readFileSync(path.join(dir, "respaldos", marca, "adjuntos", "sol-1", "1.jpg"), "utf8"), "foto");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await prueba("cupo por minuto por cuenta: 30 mensajes, se renueva al minuto", () => {
    reiniciarCupos();
    const t = Date.parse("2026-10-08T15:00:00Z");
    for (let i = 0; i < CUPO_POR_MINUTO.mensaje; i++) assert.equal(consumirCupo("ana@datasheq.com", "mensaje", t + i * 1000), true);
    assert.equal(consumirCupo("ANA@datasheq.com", "mensaje", t + 30_000), false); // mismo correo, sin distinguir mayúsculas
    assert.equal(consumirCupo("beto@datasheq.com", "mensaje", t + 30_000), true); // cada cuenta tiene su cupo
    assert.equal(consumirCupo("ana@datasheq.com", "mensaje", t + 61_000), true); // pasó el minuto
    reiniciarCupos();
  });
  await prueba("estado visible del requerimiento: pendiente, abierto, en curso, cerrado y descartado", () => {
    const e = (issue_numero: number | null, issue_estado: string | null, issue_motivo: string | null = null, issue_asignado: string | null = null) =>
      estadoVisible({ issue_numero, issue_estado, issue_motivo, issue_asignado });
    assert.equal(e(null, null), "pendiente");
    assert.equal(e(5, "open"), "abierto");
    assert.equal(e(5, null), "abierto"); // creado y aún sin consultar
    assert.equal(e(5, "open", "reopened", "dev1"), "en_curso");
    assert.equal(e(5, "closed", "completed", "dev1"), "cerrado");
    assert.equal(e(5, "closed", "not_planned"), "descartado");
  });
  await prueba("seguimiento con un GitHub simulado: paginación, sin PR, since, frecuencia y error", async () => {
    const pedidos: URL[] = [];
    let falla = false;
    const issues = [
      ...Array.from({ length: 100 }, (_, i) => ({ number: 1000 + i, state: "open", assignees: [] })), // página 1 completa
      { number: 1, state: "closed", state_reason: "completed", assignees: [{ login: "dev1" }] },
      { number: 2, state: "open", assignees: [{ login: "dev2" }] },
      { number: 3, state: "closed", state_reason: "not_planned", assignees: [] },
      { number: 4, state: "open", pull_request: {} }, // un PR con la etiqueta: se ignora
    ];
    const servidor = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      pedidos.push(url);
      if (falla) return res.writeHead(502).end("{}");
      assert.equal(req.headers.authorization, "Bearer t0k3n");
      const pagina = Number(url.searchParams.get("page"));
      const por = Number(url.searchParams.get("per_page"));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(issues.slice((pagina - 1) * por, pagina * por)));
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const cfg = { api: `http://127.0.0.1:${(servidor.address() as { port: number }).port}`, token: "t0k3n", cuenta: CUENTA_DATASHEQ };
    try {
      reiniciarSincronizacion();
      const d = dbControl();
      const ids = [1, 2, 3, 99].map((n, i) => {
        const id = enviarMensaje(d, MODULOS[i].clave, { ...ana, email: `p${i}@datasheq.com` }, "x", t0).solicitud.id;
        d.prepare("UPDATE chat_solicitudes SET issue_numero = ?, issue_repo = 'dueno/repo' WHERE id = ?").run(n, id);
        return id;
      });
      const fila = (id: string) =>
        d.prepare("SELECT issue_estado, issue_motivo, issue_asignado, issue_actualizado_en FROM chat_solicitudes WHERE id = ?").get(id) as {
          issue_estado: string | null; issue_motivo: string | null; issue_asignado: string | null; issue_actualizado_en: string | null;
        };
      const h0 = Date.parse("2026-10-08T15:00:00Z");

      assert.equal((await sincronizar(d, null, { ahora: h0 })).sincronizado_en, null); // sin token: no consulta
      assert.equal(pedidos.length, 0);

      const s1 = await sincronizar(d, cfg, { ahora: h0 });
      assert.deepEqual(s1, { sincronizado_en: new Date(h0).toISOString(), error: null });
      assert.equal(pedidos.length, 2); // dos páginas
      assert.equal(pedidos[0].pathname, "/repos/dueno/repo/issues");
      assert.deepEqual([pedidos[0].searchParams.get("labels"), pedidos[0].searchParams.get("state"), pedidos[0].searchParams.get("since")], ["gerencia", "all", null]);
      assert.deepEqual(fila(ids[0]), { issue_estado: "closed", issue_motivo: "completed", issue_asignado: "dev1", issue_actualizado_en: new Date(h0).toISOString() });
      assert.equal(fila(ids[1]).issue_asignado, "dev2");
      assert.equal(fila(ids[2]).issue_motivo, "not_planned");
      assert.equal(fila(ids[3]).issue_estado, null); // #99 no vino: sin cambios, pero consultado
      assert.equal(fila(ids[3]).issue_actualizado_en, new Date(h0).toISOString());

      await sincronizar(d, cfg, { ahora: h0 + 5 * 60_000 }); // antes de 10 minutos: no consulta
      assert.equal(pedidos.length, 2);
      await sincronizar(d, cfg, { ahora: h0 + 30_000, forzar: true }); // forzada antes de 1 minuto desde el último intento: tampoco
      assert.equal(pedidos.length, 2);

      falla = true;
      const s2 = await sincronizar(d, cfg, { ahora: h0 + 11 * 60_000 });
      assert.equal(pedidos.length, 3);
      assert.equal(pedidos[2].searchParams.get("since"), new Date(h0 - 60_000).toISOString()); // desde la última correcta, con margen
      assert.match(s2.error ?? "", /HTTP 502/);
      assert.equal(s2.sincronizado_en, new Date(h0).toISOString()); // último estado conocido y su fecha
      assert.equal(fila(ids[0]).issue_estado, "closed");

      falla = false;
      const s3 = await sincronizar(d, cfg, { ahora: h0 + 12 * 60_000 + 1, forzar: true }); // «Actualizar» pasado 1 minuto
      assert.deepEqual(s3, { sincronizado_en: new Date(h0 + 12 * 60_000 + 1).toISOString(), error: null });
    } finally {
      servidor.close();
      reiniciarSincronizacion();
    }
  });
  // ── Envío a GitHub con reintentos, contra un GitHub simulado
  type Manejador = (req: http.IncomingMessage, url: URL, cuerpo: string) => { status: number; json?: unknown; headers?: Record<string, string> };
  let manejar: Manejador = () => ({ status: 500 });
  let loginFalso = CUENTA_DATASHEQ;
  const pedidos: string[] = [];
  const falso = http.createServer(async (req, res) => {
    let cuerpo = "";
    for await (const c of req) cuerpo += c;
    const url = new URL(req.url ?? "/", "http://x");
    pedidos.push(`${req.method} ${url.pathname}`);
    // GET /user: la cuenta dueña del token
    const r = url.pathname === "/user" ? { status: 200, json: { login: loginFalso } } : manejar(req, url, cuerpo);
    res.writeHead(r.status, { "content-type": "application/json", ...r.headers }).end(JSON.stringify(r.json ?? {}));
  });
  await new Promise<void>((ok) => falso.listen(0, "127.0.0.1", ok));
  const cfgFalso = { api: `http://127.0.0.1:${(falso.address() as { port: number }).port}`, token: "t", cuenta: CUENTA_DATASHEQ };
  const sinEspera = { dormir: async () => {} };
  const issueCreado = { status: 201, json: { number: 41, html_url: "https://github.example/dueno/repo/issues/41" } };
  const datosIssue = (ticket = 7): DatosIssue => ({
    ticket,
    modulo: moduloPorClave("c-legal") as Modulo,
    titulo: "Informe DS 594",
    resumen: "r",
    solicitantes: [{ nombre: "Ana", email: "ana@datasheq.com" }],
    solicitudId: "conv",
    fecha: "2026-10-08",
    transcripcion: [],
  });
  /** Solicitud ya terminada (lo que dejará «Terminar» en un ticket posterior): lista para enviarse como Issue. */
  const terminada = (d: ReturnType<typeof dbControl>, sala: string, persona: typeof ana) => {
    const { solicitud: s } = enviarMensaje(d, sala, persona, "Necesito un informe", t0);
    d.prepare("UPDATE chat_solicitudes SET estado = 'terminada', terminado = 1, titulo = 'Informe DS 594', resumen = 'r', terminada_en = ? WHERE id = ?").run(t0.toISOString(), s.id);
    return s.id;
  };
  const posts = () => pedidos.filter((p) => p === "POST /repos/dueno/repo/issues").length;

  await prueba("GitHub: reintenta errores transitorios (502, red, 429 con Retry-After) y no los definitivos (422)", async () => {
    olvidarEtiquetas();
    pedidos.length = 0;
    let n = 0;
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : ++n === 1 ? { status: 502 } : issueCreado);
    assert.deepEqual(await crearIssueEn(cfgFalso, "dueno/repo", datosIssue(), sinEspera), { numero: 41, url: "https://github.example/dueno/repo/issues/41" });
    assert.equal(posts(), 2); // el 502 se reintentó una vez

    pedidos.length = 0;
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : { status: 422, json: { message: "Validation Failed" } });
    await assert.rejects(crearIssueEn(cfgFalso, "dueno/repo", datosIssue(), sinEspera), (e: ErrorGithub) => !e.transitorio && e.status === 422 && /Validation Failed/.test(e.message));
    assert.equal(posts(), 1); // definitivo: sin reintento

    const esperas: number[] = [];
    n = 0;
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : ++n === 1 ? { status: 429, headers: { "retry-after": "2" } } : issueCreado);
    await crearIssueEn(cfgFalso, "dueno/repo", datosIssue(), { dormir: async (ms) => void esperas.push(ms) });
    assert.deepEqual(esperas, [2000]); // respeta Retry-After

    const caido = { ...cfgFalso, api: "http://127.0.0.1:9" }; // nadie escucha: error de red
    olvidarEtiquetas();
    await assert.rejects(crearIssueEn(caido, "dueno/repo", datosIssue(), sinEspera), (e: ErrorGithub) => e.transitorio && /No se pudo conectar/.test(e.message));
  });
  await prueba("GitHub: al reintentar no duplica el Issue si el intento anterior ya lo creó", async () => {
    pedidos.length = 0;
    manejar = (req, url) =>
      url.pathname.endsWith("/issues") && req.method === "GET"
        ? { status: 200, json: [{ number: 40, html_url: "https://github.example/dueno/repo/issues/40", title: "[GER-0007][C-Legal] Informe DS 594" }] }
        : issueCreado;
    const r = await crearIssueEn(cfgFalso, "dueno/repo", datosIssue(7), { ...sinEspera, comprobarDuplicado: true });
    assert.deepEqual(r, { numero: 40, url: "https://github.example/dueno/repo/issues/40", existente: true });
    assert.equal(posts(), 0);
  });
  await prueba("envío con reintentos automáticos: 1, 2, 5… minutos, solo transitorios, sin duplicar y uno a la vez", async () => {
    const d = dbControl();
    const generar = (persona: typeof ana, sala: string) => terminada(d, sala, persona);
    const fila = (id: string) => solicitud(d, id)!;
    let reloj = t0.getTime();
    const op = { ...sinEspera, ahora: () => new Date(reloj) };

    // Sin token: error definitivo, sin reintento automático
    const sinToken = generar(ana, "c-legal");
    assert.deepEqual(await enviarIssue(d, sinToken, null, op), { ok: false, error: SIN_TOKEN, reintento_en: null });
    assert.equal(fila(sinToken).issue_proximo_intento, null);

    // GitHub caído: programa 1, 2, 5, 15, 30 y 60 minutos; después, solo manual
    olvidarEtiquetas();
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : { status: 503 });
    const id = generar(beto, "c-previene");
    for (const [i, min] of ESPERAS_MIN.entries()) {
      const r = await enviarIssue(d, id, cfgFalso, op);
      assert.equal(r.reintento_en, new Date(reloj + min * 60_000).toISOString(), `intento ${i + 1}`);
      assert.deepEqual(pendientesDeReintento(d, new Date(reloj + min * 60_000 - 1000)), []); // aún no vence
      reloj += min * 60_000;
      assert.deepEqual(pendientesDeReintento(d, new Date(reloj)), [id]);
    }
    const ultimo = await enviarIssue(d, id, cfgFalso, op);
    assert.equal(ultimo.reintento_en, null);
    assert.equal(fila(id).issue_intentos, MAX_REINTENTOS + 1); // el envío inicial y los 6 reintentos automáticos

    // Vuelve GitHub: el reintento automático lo envía (buscando antes si ya existe) y limpia el error
    const otro = generar({ ...ana, email: "carla@datasheq.com" }, "c-lidera");
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : { status: 503 });
    await enviarIssue(d, otro, cfgFalso, op);
    reloj += 61_000;
    pedidos.length = 0;
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : req.method === "GET" ? { status: 200, json: [] } : issueCreado);
    assert.equal(await procesarPendientes(d, cfgFalso, op), 1);
    assert.ok(pedidos.includes("GET /repos/dueno/repo/issues")); // buscó duplicados antes de crear
    assert.deepEqual([fila(otro).issue_numero, fila(otro).issue_error, fila(otro).issue_proximo_intento], [41, null, null]);

    // Error definitivo (token sin permiso): no se reprograma
    const prohibido = generar({ ...ana, email: "dora@datasheq.com" }, "c-acredita");
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : { status: 403, json: { message: "Resource not accessible" } });
    const r403 = await enviarIssue(d, prohibido, cfgFalso, op);
    assert.deepEqual([r403.ok, r403.reintento_en, fila(prohibido).issue_intentos], [false, null, 0]);

    // Uno a la vez: el botón y el reintento automático no envían el mismo requerimiento en paralelo
    const doble = generar({ ...ana, email: "eva@datasheq.com" }, "c-capacita");
    let soltar: () => void = () => {};
    const espera = new Promise<void>((ok) => (soltar = ok));
    const lento = { ...op, dormir: () => espera };
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : { status: 503 });
    const primero = enviarIssue(d, doble, cfgFalso, lento);
    assert.deepEqual(await enviarIssue(d, doble, cfgFalso, op), { ok: false, error: "El requerimiento ya se está enviando a GitHub" });
    soltar();
    await primero;
  });
  await prueba("repositorio por módulo: C-Legal por defecto, GITHUB_REPOS asigna, «-» oculta e ignora inválidos", () => {
    assert.deepEqual(REPOS_POR_DEFECTO, { "c-legal": "datasheq-creator/clegal-railway" });
    assert.deepEqual(modulosActivos({}), ["c-legal"]);
    const env = { GITHUB_REPOS: "c-acredita=datasheq-creator/cacredita-railway; C-LEGAL=-\nc-lidera=no valido,c-nada=x/y" };
    const r = reposDeModulos(env);
    assert.equal(r["c-acredita"], "datasheq-creator/cacredita-railway");
    assert.equal(r["c-legal"], null); // desactivada
    assert.equal(r["c-lidera"], null); // inválido: se ignora
    assert.deepEqual(modulosActivos(env), ["c-acredita"]);
    assert.deepEqual([salaActiva("c-acredita", env), salaActiva("c-legal", env), repoDe("c-nada", env)], [true, false, null]);
    assert.equal(configDesdeEntorno({}), null); // sin token
    assert.deepEqual(configDesdeEntorno({ GITHUB_TOKEN: "x" }), { api: "https://api.github.com", token: "x", cuenta: CUENTA_DATASHEQ });
  });
  await prueba("GitHub: etiqueta «ready-for-human» y solo con el token de la cuenta de DataSHEQ", async () => {
    olvidarEtiquetas();
    pedidos.length = 0;
    let etiquetas: string[] = [];
    manejar = (req, url, cuerpo) => {
      if (url.pathname.endsWith("/labels")) return { status: 201 };
      etiquetas = (JSON.parse(cuerpo) as { labels: string[] }).labels;
      return issueCreado;
    };
    await crearIssueEn(cfgFalso, "dueno/repo", datosIssue(), sinEspera);
    assert.ok(etiquetas.includes(ETIQUETA_REVISION) && etiquetas.includes("gerencia"), etiquetas.join());
    assert.ok(pedidos.includes("POST /repos/dueno/repo/labels"));
    assert.equal(pedidos[0], "GET /user"); // verifica la cuenta antes de enviar

    // Token de otra cuenta: error definitivo, sin crear nada ni reintentar
    olvidarEtiquetas();
    pedidos.length = 0;
    loginFalso = "otra-persona";
    try {
      await assert.rejects(
        crearIssueEn(cfgFalso, "dueno/repo", datosIssue(), sinEspera),
        (e: ErrorGithub) => !e.transitorio && e.status === 403 && /es de «otra-persona», no de la cuenta de DataSHEQ «datasheq-creator»/.test(e.message),
      );
      assert.deepEqual(pedidos, ["GET /user"]);
    } finally {
      loginFalso = CUENTA_DATASHEQ;
      olvidarEtiquetas();
    }
  });
  await prueba("envío al repositorio de cada módulo: guarda issue_repo; sin repositorio, error definitivo", async () => {
    const d = dbControl();
    const env = { GITHUB_REPOS: "c-acredita=dueno/acredita,c-legal=-" };
    const generar = (email: string, sala: string) => terminada(d, sala, { ...ana, email }); // con el entorno de las pruebas: todas activas
    pedidos.length = 0;
    manejar = (req, url) => (url.pathname.endsWith("/labels") ? { status: 201 } : issueCreado);
    const acredita = generar("a@datasheq.com", "c-acredita");
    assert.deepEqual(await enviarIssue(d, acredita, cfgFalso, { ...sinEspera, env }), { ok: true });
    assert.ok(pedidos.includes("POST /repos/dueno/acredita/issues"), pedidos.join());
    assert.ok(!pedidos.some((p) => p.startsWith("POST /repos/dueno/repo/")));
    assert.deepEqual([solicitud(d, acredita)!.issue_repo, solicitud(d, acredita)!.issue_numero], ["dueno/acredita", 41]);

    const legal = generar("b@datasheq.com", "c-legal"); // c-legal desactivada en este entorno
    assert.deepEqual(await enviarIssue(d, legal, cfgFalso, { ...sinEspera, env }), { ok: false, error: SIN_REPO, reintento_en: null });
  });
  await prueba("seguimiento por repositorio: el mismo número en dos repositorios no se confunde", async () => {
    const d = dbControl();
    reiniciarSincronizacion();
    const ids = ["dueno/uno", "dueno/dos"].map((repo, i) => {
      const id = enviarMensaje(d, MODULOS[i].clave, { ...ana, email: `s${i}@datasheq.com` }, "x", t0).solicitud.id;
      d.prepare("UPDATE chat_solicitudes SET issue_numero = 5, issue_repo = ? WHERE id = ?").run(repo, id);
      return id;
    });
    pedidos.length = 0;
    manejar = (req, url) =>
      url.pathname === "/repos/dueno/uno/issues"
        ? { status: 200, json: [{ number: 5, state: "closed", state_reason: "completed", assignees: [] }] }
        : { status: 200, json: [{ number: 5, state: "open", assignees: [{ login: "dev9" }] }] };
    try {
      const s = await sincronizar(d, cfgFalso, { ahora: t0.getTime() });
      assert.equal(s.error, null);
      assert.deepEqual(pedidos.sort(), ["GET /repos/dueno/dos/issues", "GET /repos/dueno/uno/issues"]);
      assert.deepEqual([solicitud(d, ids[0])!.issue_estado, solicitud(d, ids[1])!.issue_estado], ["closed", "open"]);
      assert.equal(solicitud(d, ids[1])!.issue_asignado, "dev9");
    } finally {
      reiniciarSincronizacion();
    }
  });
  await prueba("salas sin repositorio: ocultas en el portal y no se puede escribir en ellas", () => {
    const d = dbControl();
    const env = { GITHUB_REPOS: "c-acredita=dueno/acredita" }; // + C-Legal por defecto
    assert.deepEqual(estadoSalas(d, false, env).map((s) => s.clave), ["c-legal", "c-acredita"]);
    const admin = estadoSalas(d, true, env);
    assert.equal(admin.length, MODULOS.length); // el panel las ve todas, con su repositorio
    assert.deepEqual([admin.find((s) => s.clave === "c-acredita")?.repo, admin.find((s) => s.clave === "c-lidera")?.repo], ["dueno/acredita", null]);
    assert.throws(() => enviarMensaje(d, "c-lidera", ana, "hola", t0, env), (e: ErrorSala) => e.status === 404 && e.message === SALA_NO_DISPONIBLE);
    assert.equal(enviarMensaje(d, "c-acredita", ana, "hola", t0, env).nueva, true);
    assert.deepEqual(estadoSalas(d, false, env).map((x) => [x.clave, x.abierta]), [["c-legal", false], ["c-acredita", true]]);
  });
  falso.close();

  console.log(`\n${ok} pruebas OK${process.exitCode ? " — HAY FALLOS" : ""}`);
}

main();
