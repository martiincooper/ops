// Prueba de extremo a extremo contra un servidor en marcha con base de datos VACÍA.
// Uso: DATA_DIR=/tmp/aether-e2e ADMIN_EMAIL=admin@aether.cl npm start -- -p 3100   (en otra terminal)
//      BASE=http://127.0.0.1:3100 node scripts/e2e.mjs
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const ADMIN = process.env.ADMIN_EMAIL ?? "admin@aether.cl";
let ok = 0;
let fallos = 0;

class Cliente {
  constructor(nombre) {
    this.nombre = nombre;
    this.cookie = "";
  }
  async pedir(ruta, { metodo = "GET", json, form, headers = {} } = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let body;
    if (json !== undefined) {
      h["content-type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) body = form;
    const res = await fetch(BASE + ruta, { method: metodo, headers: h, body, redirect: "manual" });
    const sc = res.headers.get("set-cookie");
    if (sc) {
      const m = sc.match(/aether_sesion=([^;]*)/);
      if (m) this.cookie = m[1] ? `aether_sesion=${m[1]}` : "";
    }
    const tipo = res.headers.get("content-type") ?? "";
    const datos = tipo.includes("json") ? await res.json() : await res.arrayBuffer();
    return { status: res.status, datos, headers: res.headers };
  }
  login(email, pin) {
    return this.pedir("/api/auth/login", { metodo: "POST", json: { email, pin } });
  }
}

async function prueba(nombre, fn) {
  try {
    await fn();
    ok++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallos++;
    console.error(`  ✗ ${nombre}\n    ${e.message}`);
  }
}

const jpeg = () => new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0xff, 0xd9])], { type: "image/jpeg" });

function formGasto(campos, archivo = jpeg(), nombre = "f.jpg") {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, String(v));
  if (archivo) f.set("comprobante", archivo, nombre);
  return f;
}

async function nuevoUsuario(admin, email, nombre, rol, pin) {
  const r = await admin.pedir("/api/admin/usuarios", { metodo: "POST", json: { email, nombre, rol } });
  assert.equal(r.status, 201, JSON.stringify(r.datos));
  const c = new Cliente(nombre);
  if (pin) {
    assert.equal((await c.login(email, "000000")).status, 200);
    const cp = await c.pedir("/api/auth/cambiar-pin", { metodo: "POST", json: { pin_nuevo: pin } });
    assert.equal(cp.status, 200, JSON.stringify(cp.datos));
  }
  return { cliente: c, id: r.datos.id };
}

async function main() {
  const admin = new Cliente("admin");
  const anon = new Cliente("anon");
  let ana, beto, gerente, proyectoId, anaGastoId;
  let manana;

  console.log("Autenticación");
  await prueba("health 200", async () => assert.equal((await anon.pedir("/api/health")).status, 200));
  await prueba("API sin sesión → 401", async () => assert.equal((await anon.pedir("/api/bitacora")).status, 401));
  await prueba("página sin sesión → redirige a /login", async () => {
    const r = await anon.pedir("/checkin");
    assert.equal(r.status, 307);
    assert.match(r.headers.get("location"), /\/login$/);
  });
  await prueba("código incorrecto → 401 con intentos restantes", async () => {
    const r = await admin.login(ADMIN, "111111");
    assert.equal(r.status, 401);
    assert.equal(r.datos.intentos_restantes, 4);
  });
  await prueba("email inexistente → mismo 401 genérico", async () => {
    const r = await anon.login("nadie@aether.cl", "000000");
    assert.equal(r.status, 401);
    assert.equal(r.datos.error, "Email o código incorrecto");
  });
  let cookieInicial;
  await prueba("primer ingreso con 000000 → exige cambio", async () => {
    const r = await admin.login(ADMIN.toUpperCase(), "000000");
    assert.equal(r.status, 200);
    assert.equal(r.datos.redirigir, "/cambiar-pin");
    cookieInicial = admin.cookie;
  });
  await prueba("con cambio pendiente no accede a la API → 403", async () => {
    const r = await admin.pedir("/api/admin/usuarios");
    assert.equal(r.status, 403);
    assert.equal(r.datos.debe_cambiar_pin, true);
  });
  await prueba("códigos triviales rechazados (123456, 000000)", async () => {
    for (const p of ["123456", "000000", "777777"]) {
      const r = await admin.pedir("/api/auth/cambiar-pin", { metodo: "POST", json: { pin_nuevo: p } });
      assert.equal(r.status, 400, p);
    }
  });
  await prueba("cambio de código → nueva sesión y acceso a /admin", async () => {
    const r = await admin.pedir("/api/auth/cambiar-pin", { metodo: "POST", json: { pin_nuevo: "482915" } });
    assert.equal(r.status, 200);
    assert.equal(r.datos.redirigir, "/admin");
    assert.equal((await admin.pedir("/api/admin/usuarios")).status, 200);
  });
  await prueba("la sesión anterior al cambio queda revocada", async () => {
    const viejo = new Cliente("viejo");
    viejo.cookie = cookieInicial;
    assert.ok([401, 403].includes((await viejo.pedir("/api/admin/usuarios")).status));
  });
  await prueba("login con el código nuevo", async () => {
    const c = new Cliente("admin2");
    assert.equal((await c.login(ADMIN, "482915")).status, 200);
    assert.equal((await c.login(ADMIN, "000000")).status, 401);
  });

  console.log("Administración");
  await prueba("crear proyecto y rechazar código duplicado", async () => {
    const p = { codigo: "aeth-sen-01", nombre: "Sensor IoT v2.1", presupuesto_clp: 5000000, fecha_inicio: "2026-09-01", fecha_entrega_objetivo: "2026-12-15" };
    const r = await admin.pedir("/api/admin/proyectos", { metodo: "POST", json: p });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    proyectoId = r.datos.id;
    assert.equal((await admin.pedir("/api/admin/proyectos", { metodo: "POST", json: p })).status, 409);
  });
  await prueba("crear personas (equipo y gerencia) y primer ingreso", async () => {
    ana = await nuevoUsuario(admin, "ana@aether.cl", "Ana Rojas", "team", "739204");
    beto = await nuevoUsuario(admin, "beto@aether.cl", "Beto Díaz", "team", "618273");
    gerente = await nuevoUsuario(admin, "gg@aether.cl", "Gerencia", "executive", "905162");
    assert.equal((await admin.pedir("/api/admin/usuarios", { metodo: "POST", json: { email: "ANA@aether.cl", nombre: "x", rol: "team" } })).status, 409);
  });
  await prueba("roles: equipo no entra a admin; gerencia no usa bitácora", async () => {
    assert.equal((await ana.cliente.pedir("/api/admin/usuarios")).status, 403);
    assert.equal((await gerente.cliente.pedir("/api/bitacora")).status, 403);
    const r = await ana.cliente.pedir("/admin");
    assert.equal(r.status, 307);
    assert.match(r.headers.get("location"), /\/checkin$/);
  });
  await prueba("no se puede desactivar al último admin / a sí mismo", async () => {
    const yo = (await admin.pedir("/api/admin/usuarios")).datos.usuarios.find((u) => u.email === ADMIN);
    assert.equal((await admin.pedir(`/api/admin/usuarios/${yo.id}`, { metodo: "PATCH", json: { activo: false } })).status, 400);
  });

  console.log("Bitácora");
  await prueba("cabecera x-user-id ignorada (B1)", async () => {
    const r = await anon.pedir("/api/bitacora", { headers: { "x-user-id": ana.id } });
    assert.equal(r.status, 401);
  });
  await prueba("estado inicial: pendiente_manana con fecha local", async () => {
    const r = await ana.cliente.pedir("/api/bitacora");
    assert.equal(r.status, 200);
    assert.equal(r.datos.fase, "pendiente_manana");
    assert.match(r.datos.hoy, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r.datos.proyectos.length, 1);
  });
  await prueba("mañana: 1 objetivo → 400; 5 → 400", async () => {
    const t = { proyecto_id: proyectoId, descripcion: "x" };
    assert.equal((await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas: [t] } })).status, 400);
    assert.equal((await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas: [t, t, t, t, t] } })).status, 400);
  });
  await prueba("mañana: proyecto inexistente → 400 (no 500)", async () => {
    const t = { proyecto_id: "nope", descripcion: "x" };
    assert.equal((await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas: [t, t] } })).status, 400);
  });
  await prueba("mañana: 3 objetivos → 201; reenvío idempotente → 200 sin duplicar (B6)", async () => {
    const tareas = ["Ruteo de líneas SPI", "Pruebas deep-sleep", "Compilar firmware FreeRTOS"].map((d) => ({ proyecto_id: proyectoId, descripcion: d }));
    const r1 = await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas } });
    assert.equal(r1.status, 201);
    assert.equal(r1.datos.fase, "pendiente_tarde");
    const r2 = await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas } });
    assert.equal(r2.status, 200);
    assert.equal(r2.datos.ya_existia, true);
    assert.equal(r2.datos.tareas.length, 3);
    manana = r1.datos;
  });
  await prueba("doble envío simultáneo → una sola bitácora", async () => {
    const tareas = [{ proyecto_id: proyectoId, descripcion: "A" }, { proyecto_id: proyectoId, descripcion: "B" }];
    const rs = await Promise.all([1, 2, 3].map(() => beto.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas } })));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 200, 201]);
    assert.equal((await beto.cliente.pedir("/api/bitacora")).datos.tareas.length, 2);
  });
  await prueba("otro usuario no puede cerrar tareas ajenas (B2)", async () => {
    const r = await beto.cliente.pedir("/api/bitacora/tarde", {
      metodo: "POST",
      json: { tareas: manana.tareas.map((t) => ({ id: t.id, estado: "completado" })) },
    });
    assert.equal(r.status, 400);
    const deAna = (await ana.cliente.pedir("/api/bitacora")).datos;
    assert.ok(deAna.tareas.every((t) => t.estado === "pendiente"));
    assert.equal(deAna.fase, "pendiente_tarde");
  });
  await prueba("tarde: pendiente sin motivo → 400; falta una tarea → 400; postergar sin OOO → 400", async () => {
    const [a, b, c] = manana.tareas;
    const enviar = (tareas) => ana.cliente.pedir("/api/bitacora/tarde", { metodo: "POST", json: { tareas } });
    assert.equal((await enviar([{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "pendiente" }])).status, 400);
    assert.equal((await enviar([{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }])).status, 400);
    assert.equal((await enviar([{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "postergado_ooo" }])).status, 400);
    assert.equal((await enviar([{ id: a.id, estado: "listo" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "completado" }])).status, 400);
  });
  await prueba("tarde: cierre válido → cerrado; segundo cierre → 409 (B7)", async () => {
    const [a, b, c] = manana.tareas;
    const json = {
      tareas: [{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "pendiente", motivo_pendiente: "Esperando componentes de importación" }],
      bloqueo: "Aduana retiene el envío de DigiKey",
    };
    const r = await ana.cliente.pedir("/api/bitacora/tarde", { metodo: "POST", json });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.fase, "cerrado");
    assert.equal(r.datos.bitacora.bloqueos, json.bloqueo);
    assert.equal((await ana.cliente.pedir("/api/bitacora/tarde", { metodo: "POST", json })).status, 409);
  });
  await prueba("progreso: Say-Do de hoy 67% (2/3)", async () => {
    const r = await ana.cliente.pedir("/api/progreso");
    assert.equal(r.status, 200);
    assert.equal(r.datos.hoy.saydo, 67);
    assert.equal(r.datos.hoy.registro, "cerrado");
  });

  console.log("Fuera de oficina");
  let hoy, oooId;
  const sumar = (f, d) => { const x = new Date(`${f}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  await prueba("día completo futuro → 201; duplicado → 409; parcial ese día → 409", async () => {
    hoy = (await ana.cliente.pedir("/api/bitacora")).datos.hoy;
    const f = sumar(hoy, 7);
    const r = await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: true, motivo: "Médico" } });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    oooId = r.datos.id;
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: true } })).status, 409);
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: false, hora_inicio: "09:00", hora_fin: "10:00" } })).status, 409);
  });
  await prueba("parciales: superposición → 409; fin < inicio → 400; fecha pasada → 400", async () => {
    const f = sumar(hoy, 8);
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: false, hora_inicio: "14:00", hora_fin: "17:00" } })).status, 201);
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: false, hora_inicio: "16:00", hora_fin: "18:00" } })).status, 409);
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: false, hora_inicio: "12:00", hora_fin: "11:00" } })).status, 400);
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: sumar(hoy, -1), dia_completo: true } })).status, 400);
  });
  await prueba("cancelar OOO propio → 200; ajeno → 404", async () => {
    assert.equal((await beto.cliente.pedir(`/api/ooo/${oooId}`, { metodo: "DELETE" })).status, 404);
    assert.equal((await ana.cliente.pedir(`/api/ooo/${oooId}`, { metodo: "DELETE" })).status, 200);
  });
  await prueba("OOO día completo hoy posterga objetivos abiertos; cancelarlo los restituye (C4)", async () => {
    const r = await beto.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: hoy, dia_completo: true } });
    assert.equal(r.status, 201);
    assert.equal(r.datos.fase, "ooo_completo");
    assert.ok(r.datos.tareas.every((t) => t.estado === "postergado_ooo"));
    const d = await beto.cliente.pedir(`/api/ooo/${r.datos.id}`, { metodo: "DELETE" });
    assert.equal(d.datos.fase, "pendiente_tarde");
    assert.ok(d.datos.tareas.every((t) => t.estado === "pendiente"));
  });
  await prueba("con OOO parcial hoy se permite 'postergado por ausencia'", async () => {
    assert.equal((await beto.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: hoy, dia_completo: false, hora_inicio: "15:00", hora_fin: "17:00" } })).status, 201);
    const t = (await beto.cliente.pedir("/api/bitacora")).datos.tareas;
    const r = await beto.cliente.pedir("/api/bitacora/tarde", { metodo: "POST", json: { tareas: [{ id: t[0].id, estado: "completado" }, { id: t[1].id, estado: "postergado_ooo" }] } });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    const p = (await beto.cliente.pedir("/api/progreso")).datos;
    assert.equal(p.hoy.comprometidas, 1);
    assert.equal(p.hoy.saydo, 100);
  });

  console.log("Gastos y comprobantes");
  const base = { proyecto_id: () => proyectoId, item: "ST-Link V3 Mini", monto_item_clp: 32000, monto_envio_clp: 4500, tipo_documento: "factura", rut_emisor: "76.086.428-5", folio_documento: "44102" };
  const campos = (extra = {}) => ({ ...base, proyecto_id: proyectoId, fecha_documento: hoy, ...extra });
  await prueba("factura sin RUT → 400; RUT inválido → 400", async () => {
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ rut_emisor: "" })) })).status, 400);
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ rut_emisor: "76.086.428-1" })) })).status, 400);
  });
  await prueba("archivo que no es imagen/PDF → 415; sin archivo → 400", async () => {
    const falso = new Blob(["<html>no soy una foto</html>"], { type: "image/jpeg" });
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos(), falso) })).status, 415);
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos(), null) })).status, 400);
  });
  await prueba("decimales en CLP → 400; fecha futura → 400", async () => {
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ monto_item_clp: "32000.5" })) })).status, 400);
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ fecha_documento: sumar(hoy, 3) })) })).status, 400);
  });
  await prueba("factura válida → 201, IVA 19% sobre neto ítem+envío = 6.935", async () => {
    const r = await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos()) });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    anaGastoId = r.datos.id;
    const g = r.datos.gastos.find((x) => x.id === anaGastoId);
    assert.equal(g.iva_clp, 6935);
    assert.equal(g.estado, "pendiente");
  });
  await prueba("mismo documento (RUT+folio) dos veces → 409 (M5)", async () => {
    const r = await beto.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ rut_emisor: "76086428-5" })) });
    assert.equal(r.status, 409);
  });
  await prueba("boleta sin RUT → 201 con IVA 0; PDF aceptado", async () => {
    const pdf = new Blob(["%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"], { type: "application/pdf" });
    const r = await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ tipo_documento: "boleta", rut_emisor: "", folio_documento: "991", monto_envio_clp: 0 }), pdf, "b.pdf") });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.gastos[0].iva_clp, 0);
  });
  await prueba("comprobante: dueño 200 (image/jpeg); otro del equipo 404; gerencia y admin 200 (B4)", async () => {
    const r = await ana.cliente.pedir(`/api/comprobantes/${anaGastoId}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await beto.cliente.pedir(`/api/comprobantes/${anaGastoId}`)).status, 404);
    assert.equal((await gerente.cliente.pedir(`/api/comprobantes/${anaGastoId}`)).status, 200);
    assert.equal((await admin.pedir(`/api/comprobantes/${anaGastoId}`)).status, 200);
    assert.equal((await anon.pedir(`/api/comprobantes/${anaGastoId}`)).status, 401);
  });

  console.log("Seguridad");
  await prueba("Origin ajeno en POST → 403", async () => {
    const r = await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: hoy, dia_completo: true }, headers: { origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  });
  await prueba("bloqueo tras 5 fallos; ni el código correcto entra mientras dure", async () => {
    const carla = await nuevoUsuario(admin, "carla@aether.cl", "Carla", "team", "530718");
    const c = new Cliente("carla2");
    for (let i = 1; i <= 4; i++) assert.equal((await c.login("carla@aether.cl", "111112")).status, 401);
    const quinto = await c.login("carla@aether.cl", "111112");
    assert.equal(quinto.status, 429);
    assert.match(quinto.datos.error, /15 min/);
    assert.equal((await c.login("carla@aether.cl", "530718")).status, 429);
    // reseteo por admin desbloquea y vuelve al código inicial
    assert.equal((await admin.pedir(`/api/admin/usuarios/${carla.id}`, { metodo: "PATCH", json: { resetear_pin: true } })).status, 200);
    assert.equal((await carla.cliente.pedir("/api/bitacora")).status, 401); // sesión revocada
    const r = await c.login("carla@aether.cl", "000000");
    assert.equal(r.status, 200);
    assert.equal(r.datos.redirigir, "/cambiar-pin");
  });
  await prueba("quitar usuario sin historial → eliminado; con historial → desactivado y sin sesión", async () => {
    const lista = (await admin.pedir("/api/admin/usuarios")).datos.usuarios;
    const carla = lista.find((u) => u.email === "carla@aether.cl");
    assert.equal((await admin.pedir(`/api/admin/usuarios/${carla.id}`, { metodo: "DELETE" })).datos.accion, "eliminado");
    assert.equal((await admin.pedir(`/api/admin/usuarios/${beto.id}`, { metodo: "DELETE" })).datos.accion, "desactivado");
    assert.equal((await beto.cliente.pedir("/api/bitacora")).status, 401);
    assert.equal((await new Cliente("b").login("beto@aether.cl", "618273")).status, 401);
  });

  console.log(`\n${ok} pruebas OK, ${fallos} fallidas`);
  process.exitCode = fallos ? 1 : 0;
}

main();
