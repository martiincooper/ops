// Prueba de extremo a extremo contra un servidor en marcha con datos VACÍOS (dos empresas por defecto).
// Uso: DATA_DIR=/tmp/aether-e2e ADMIN_EMAIL=admin@aether-tech.dev JWT_SECRET=... COOKIE_SECURE=false \
//        node .next/standalone/server.js        (en otra terminal, PORT=3100)
//      BASE=http://127.0.0.1:3100 ADMIN_EMAIL=admin@aether-tech.dev node scripts/e2e.mjs
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const ADMIN = process.env.ADMIN_EMAIL ?? "admin@aether-tech.dev";
const A = "aether-tech";
const D = "datasheq";
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

const jpeg = () =>
  new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0xff, 0xd9])], { type: "image/jpeg" });

function formGasto(campos, archivo = jpeg(), nombre = "f.jpg") {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, String(v));
  if (archivo) f.set("comprobante", archivo, nombre);
  return f;
}

const q = (ruta, empresa, extra = "") => `${ruta}?empresa=${empresa}${extra}`;

async function primerIngreso(email, pin) {
  const c = new Cliente(email);
  assert.equal((await c.login(email, "000000")).status, 200);
  const cp = await c.pedir("/api/auth/cambiar-pin", { metodo: "POST", json: { pin_nuevo: pin } });
  assert.equal(cp.status, 200, JSON.stringify(cp.datos));
  return c;
}

async function cuenta(admin, empresa, email, nombre, rol, pin, supervisores) {
  const r = await admin.pedir(q("/api/admin/usuarios", empresa), {
    metodo: "POST",
    json: { email, nombre, rol, ...(supervisores ? { supervisores } : {}) },
  });
  assert.equal(r.status, 201, JSON.stringify(r.datos));
  return { id: r.datos.id, cliente: pin ? await primerIngreso(email, pin) : null };
}

const sumar = (f, d) => {
  const x = new Date(`${f}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

async function main() {
  const admin = new Cliente("admin");
  const anon = new Cliente("anon");
  let adminId, admin2, admin2Id, ana, beto, dora, ggA, ggD, pA, pD, anaGastoId, manana, hoy;

  console.log("Autenticación");
  await prueba("health 200 (abre control + bases de ambas empresas)", async () => assert.equal((await anon.pedir("/api/health")).status, 200));
  await prueba("API sin sesión → 401; página → /login", async () => {
    assert.equal((await anon.pedir("/api/bitacora")).status, 401);
    const r = await anon.pedir("/checkin");
    assert.equal(r.status, 307);
    assert.match(r.headers.get("location"), /\/login$/);
  });
  await prueba("código incorrecto → 401 con intentos restantes", async () => {
    const r = await admin.login(ADMIN, "111111");
    assert.equal(r.status, 401);
    assert.equal(r.datos.intentos_restantes, 4);
  });
  await prueba("email de dominio desconocido → mismo 401 genérico", async () => {
    const r = await anon.login("alguien@gmail.com", "000000");
    assert.equal(r.status, 401);
    assert.equal(r.datos.error, "Email o código incorrecto");
  });
  let cookieInicial;
  await prueba("primer ingreso del admin con 000000 → exige cambio; API bloqueada hasta cambiarlo", async () => {
    const r = await admin.login(ADMIN.toUpperCase(), "000000");
    assert.equal(r.status, 200);
    assert.equal(r.datos.redirigir, "/cambiar-pin");
    cookieInicial = admin.cookie;
    const b = await admin.pedir("/api/admin/administradores");
    assert.equal(b.status, 403);
    assert.equal(b.datos.debe_cambiar_pin, true);
  });
  await prueba("códigos triviales rechazados", async () => {
    for (const p of ["123456", "000000", "777777"]) {
      assert.equal((await admin.pedir("/api/auth/cambiar-pin", { metodo: "POST", json: { pin_nuevo: p } })).status, 400, p);
    }
  });
  await prueba("cambio de código → /admin; la sesión anterior queda revocada", async () => {
    const r = await admin.pedir("/api/auth/cambiar-pin", { metodo: "POST", json: { pin_nuevo: "482915" } });
    assert.equal(r.status, 200);
    assert.equal(r.datos.redirigir, "/admin");
    const viejo = new Cliente("viejo");
    viejo.cookie = cookieInicial;
    assert.ok([401, 403].includes((await viejo.pedir("/api/admin/administradores")).status));
    const lista = (await admin.pedir("/api/admin/administradores")).datos.admins;
    adminId = lista.find((a) => a.email === ADMIN.toLowerCase()).id;
  });

  console.log("Empresas y cuentas");
  await prueba("proyectos separados por empresa", async () => {
    const p = { presupuesto_clp: 5000000, fecha_inicio: "2026-09-01", fecha_entrega_objetivo: "2026-12-15" };
    let r = await admin.pedir(q("/api/admin/proyectos", A), { metodo: "POST", json: { ...p, codigo: "aeth-sen-01", nombre: "Sensor IoT v2.1" } });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    pA = r.datos.id;
    r = await admin.pedir(q("/api/admin/proyectos", D), { metodo: "POST", json: { ...p, codigo: "DSQ-GW-01", nombre: "Gateway Datasheq" } });
    assert.equal(r.status, 201);
    pD = r.datos.id;
    // mismo código permitido en la otra empresa (bases distintas)
    assert.equal((await admin.pedir(q("/api/admin/proyectos", D), { metodo: "POST", json: { ...p, codigo: "AETH-SEN-01", nombre: "x" } })).status, 201);
    assert.equal((await admin.pedir(q("/api/admin/proyectos", A), { metodo: "POST", json: { ...p, codigo: "AETH-SEN-01", nombre: "x" } })).status, 409);
    const la = (await admin.pedir(q("/api/admin/proyectos", A))).datos.proyectos;
    const ld = (await admin.pedir(q("/api/admin/proyectos", D))).datos.proyectos;
    assert.deepEqual(la.map((x) => x.codigo), ["AETH-SEN-01"]);
    assert.deepEqual(ld.map((x) => x.codigo).sort(), ["AETH-SEN-01", "DSQ-GW-01"]);
    assert.equal((await admin.pedir(q("/api/admin/proyectos", "otra"))).status, 400);
  });
  await prueba("segundo administrador con email de cualquier dominio", async () => {
    const r = await admin.pedir("/api/admin/administradores", { metodo: "POST", json: { email: "segunda@ejemplo.org", nombre: "Segunda Jefa" } });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    admin2Id = r.datos.id;
    admin2 = await primerIngreso("segunda@ejemplo.org", "618374");
    assert.equal((await admin2.pedir(q("/api/admin/usuarios", D))).status, 200);
  });
  await prueba("cuentas: el dominio debe coincidir con la empresa elegida", async () => {
    const x = (empresa, email) => admin.pedir(q("/api/admin/usuarios", empresa), { metodo: "POST", json: { email, nombre: "X", rol: "team" } });
    assert.equal((await x(D, "x@aether-tech.dev")).status, 400);
    assert.equal((await x(A, "x@datasheq.cl")).status, 400);
    assert.equal((await x(A, "x@gmail.com")).status, 400);
  });
  await prueba("crear equipo y gerencia en ambas empresas, con supervisores", async () => {
    ana = await cuenta(admin, A, "ana@aether-tech.dev", "Ana Rojas", "team", "739204"); // supervisor por defecto: quien la crea
    beto = await cuenta(admin, A, "beto@aether-tech.dev", "Beto Díaz", "team", "618273", [admin2Id]);
    dora = await cuenta(admin, D, "dora@datasheq.cl", "Dora Pérez", "team", "905162", [adminId, admin2Id]);
    ggA = await cuenta(admin, A, "gg@aether-tech.dev", "Gerencia Aether", "executive", "504918");
    ggD = await cuenta(admin, D, "gerencia@datasheq.cl", "Gerencia Datasheq", "executive", "571930");
    const u = (await admin.pedir(q("/api/admin/usuarios", A))).datos.usuarios;
    assert.deepEqual(u.find((x) => x.email === "ana@aether-tech.dev").supervisores.map((s) => s.id), [adminId]);
    assert.deepEqual(u.find((x) => x.email === "beto@aether-tech.dev").supervisores.map((s) => s.id), [admin2Id]);
    assert.equal(u.find((x) => x.email === "gg@aether-tech.dev").supervisores.length, 0);
  });
  await prueba("emails únicos entre administradores y cuentas", async () => {
    assert.equal((await admin.pedir("/api/admin/administradores", { metodo: "POST", json: { email: "ANA@aether-tech.dev", nombre: "x" } })).status, 409);
    assert.equal((await admin.pedir(q("/api/admin/usuarios", A), { metodo: "POST", json: { email: "ana@aether-tech.dev", nombre: "x", rol: "team" } })).status, 409);
  });
  await prueba("roles: equipo y gerencia no entran a /admin ni a su API", async () => {
    assert.equal((await ana.cliente.pedir(q("/api/admin/usuarios", A))).status, 403);
    assert.equal((await ggD.cliente.pedir(q("/api/admin/standup", D))).status, 403);
    assert.equal((await ggA.cliente.pedir("/api/bitacora")).status, 403);
    let r = await ana.cliente.pedir("/admin");
    assert.match(r.headers.get("location"), /\/checkin$/);
    r = await ggD.cliente.pedir("/checkin");
    assert.match(r.headers.get("location"), /\/exec$/);
  });

  console.log("Aislamiento entre empresas");
  await prueba("cada integrante ve solo los proyectos de su empresa (y ?empresa= se ignora)", async () => {
    const a = (await ana.cliente.pedir(q("/api/bitacora", D))).datos;
    assert.equal(a.empresa.clave, A);
    assert.deepEqual(a.proyectos.map((p) => p.codigo), ["AETH-SEN-01"]);
    const d = (await dora.cliente.pedir(q("/api/bitacora", A))).datos;
    assert.equal(d.empresa.clave, D);
    assert.ok(d.proyectos.every((p) => p.id !== pA));
  });
  await prueba("gerencia ve solo su empresa aunque pida otra", async () => {
    const r = await ggD.cliente.pedir(q("/api/exec", A));
    assert.equal(r.status, 200);
    assert.equal(r.datos.empresa.clave, D);
    assert.ok(r.datos.proyectos.every((p) => p.id !== pA));
  });
  await prueba("administrador elige la empresa del tablero de gerencia", async () => {
    assert.equal((await admin.pedir(q("/api/exec", A))).datos.empresa.clave, A);
    assert.equal((await admin.pedir(q("/api/exec", D))).datos.empresa.clave, D);
  });
  await prueba("cabecera x-user-id ignorada", async () => {
    assert.equal((await anon.pedir("/api/bitacora", { headers: { "x-user-id": ana.id } })).status, 401);
  });

  console.log("Bitácora");
  await prueba("mañana: 1 objetivo → 400; proyecto de la otra empresa → 400", async () => {
    const t = { proyecto_id: pA, descripcion: "x" };
    assert.equal((await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas: [t] } })).status, 400);
    const otra = { proyecto_id: pD, descripcion: "x" };
    assert.equal((await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas: [otra, otra] } })).status, 400);
  });
  await prueba("mañana: 3 objetivos → 201; reenvío idempotente", async () => {
    const tareas = ["Ruteo de líneas SPI", "Pruebas deep-sleep", "Compilar firmware FreeRTOS"].map((d) => ({ proyecto_id: pA, descripcion: d }));
    const r1 = await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas } });
    assert.equal(r1.status, 201);
    const r2 = await ana.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas } });
    assert.equal(r2.status, 200);
    assert.equal(r2.datos.ya_existia, true);
    assert.equal(r2.datos.tareas.length, 3);
    manana = r1.datos;
    hoy = r1.datos.hoy;
  });
  await prueba("doble envío simultáneo → una sola bitácora", async () => {
    const tareas = [{ proyecto_id: pA, descripcion: "A" }, { proyecto_id: pA, descripcion: "B" }];
    const rs = await Promise.all([1, 2, 3].map(() => beto.cliente.pedir("/api/bitacora/manana", { metodo: "POST", json: { tareas } })));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 200, 201]);
  });
  await prueba("otro usuario no puede cerrar tareas ajenas", async () => {
    const r = await beto.cliente.pedir("/api/bitacora/tarde", { metodo: "POST", json: { tareas: manana.tareas.map((t) => ({ id: t.id, estado: "completado" })) } });
    assert.equal(r.status, 400);
  });
  await prueba("tarde: validaciones y cierre con bloqueo; segundo cierre → 409", async () => {
    const [a, b, c] = manana.tareas;
    const enviar = (json) => ana.cliente.pedir("/api/bitacora/tarde", { metodo: "POST", json });
    assert.equal((await enviar({ tareas: [{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "pendiente" }] })).status, 400);
    assert.equal((await enviar({ tareas: [{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }] })).status, 400);
    const json = {
      tareas: [{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "pendiente", motivo_pendiente: "Esperando componentes" }],
      bloqueo: "Aduana retiene el envío de DigiKey",
    };
    const r = await enviar(json);
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.fase, "cerrado");
    assert.equal((await enviar(json)).status, 409);
  });

  console.log("Tablero de jefatura");
  await prueba("standup: 'mis supervisados' filtra por supervisor; 'todos' muestra la empresa completa", async () => {
    const mios = (await admin.pedir(q("/api/admin/standup", A, "&alcance=mios"))).datos.filas.map((f) => f.email);
    assert.deepEqual(mios, ["ana@aether-tech.dev"]);
    const todos = (await admin.pedir(q("/api/admin/standup", A, "&alcance=todos"))).datos.filas.map((f) => f.email).sort();
    assert.deepEqual(todos, ["ana@aether-tech.dev", "beto@aether-tech.dev"]);
    const de2 = (await admin2.pedir(q("/api/admin/standup", A, "&alcance=mios"))).datos.filas.map((f) => f.email);
    assert.deepEqual(de2, ["beto@aether-tech.dev"]);
    const compartida = (await admin2.pedir(q("/api/admin/standup", D, "&alcance=mios"))).datos.filas.map((f) => f.email);
    assert.deepEqual(compartida, ["dora@datasheq.cl"]);
  });
  await prueba("standup: bloqueo primero; marcar resuelto (una sola vez)", async () => {
    const filas = (await admin.pedir(q("/api/admin/standup", A, "&alcance=todos"))).datos.filas;
    assert.equal(filas[0].email, "ana@aether-tech.dev");
    assert.equal(filas[0].prioridad, 1);
    const bid = filas[0].bloqueos[0].bitacora_id;
    assert.equal((await admin.pedir(q(`/api/admin/bloqueos/${bid}`, D), { metodo: "POST" })).status, 404); // otra empresa
    assert.equal((await admin.pedir(q(`/api/admin/bloqueos/${bid}`, A), { metodo: "POST" })).status, 200);
    assert.equal((await admin.pedir(q(`/api/admin/bloqueos/${bid}`, A), { metodo: "POST" })).status, 404);
    const despues = (await admin.pedir(q("/api/admin/standup", A, "&alcance=todos"))).datos.filas;
    assert.equal(despues.find((f) => f.email === "ana@aether-tech.dev").bloqueos.length, 0);
  });
  await prueba("cambiar supervisión (compartida / exclusiva)", async () => {
    let r = await admin.pedir(q(`/api/admin/usuarios/${beto.id}`, A), { metodo: "PATCH", json: { supervisores: [adminId, admin2Id] } });
    assert.equal(r.status, 200);
    const mios = (await admin.pedir(q("/api/admin/standup", A, "&alcance=mios"))).datos.filas.map((f) => f.email).sort();
    assert.deepEqual(mios, ["ana@aether-tech.dev", "beto@aether-tech.dev"]);
    r = await admin.pedir(q(`/api/admin/usuarios/${beto.id}`, A), { metodo: "PATCH", json: { supervisores: ["no-existe"] } });
    assert.equal(r.status, 400);
  });

  console.log("Fuera de oficina y capacidad");
  await prueba("OOO día completo futuro aparece en la capacidad de 14 días", async () => {
    let f = sumar(hoy, 1);
    while ([0, 6].includes(new Date(`${f}T12:00:00Z`).getUTCDay())) f = sumar(f, 1);
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: true, motivo: "Médico" } })).status, 201);
    assert.equal((await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: f, dia_completo: true } })).status, 409);
    const c = (await admin.pedir(q("/api/admin/capacidad", A, "&alcance=todos"))).datos;
    const fila = c.filas.find((x) => x.nombre === "Ana Rojas");
    assert.equal(fila.celdas.find((x) => x.fecha === f).estado, "ooo");
    assert.equal(c.dias.length, 14);
  });
  await prueba("OOO día completo hoy posterga objetivos abiertos; cancelarlo los restituye", async () => {
    const r = await beto.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: hoy, dia_completo: true } });
    assert.equal(r.status, 201);
    assert.equal(r.datos.fase, "ooo_completo");
    const d = await beto.cliente.pedir(`/api/ooo/${r.datos.id}`, { metodo: "DELETE" });
    assert.equal(d.datos.fase, "pendiente_tarde");
    assert.ok(d.datos.tareas.every((t) => t.estado === "pendiente"));
  });

  console.log("Compras, comprobantes y validación");
  const campos = (extra = {}) => ({
    proyecto_id: pA, item: "ST-Link V3 Mini", monto_item_clp: 32000, monto_envio_clp: 4500,
    tipo_documento: "factura", rut_emisor: "76.086.428-5", folio_documento: "44102", fecha_documento: hoy, ...extra,
  });
  await prueba("factura válida → IVA 6.935; mismo documento dos veces en la misma empresa → 409", async () => {
    const r = await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos()) });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    anaGastoId = r.datos.id;
    assert.equal(r.datos.gastos.find((x) => x.id === anaGastoId).iva_clp, 6935);
    assert.equal((await beto.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos()) })).status, 409);
  });
  await prueba("el mismo documento en la otra empresa se registra aparte", async () => {
    const r = await dora.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ proyecto_id: pD })) });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
  });
  await prueba("validaciones de compra: RUT, archivo, decimales", async () => {
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ rut_emisor: "76.086.428-1", folio_documento: "9" })) })).status, 400);
    const falso = new Blob(["<html>no</html>"], { type: "image/jpeg" });
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ folio_documento: "9" }), falso) })).status, 415);
    assert.equal((await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ folio_documento: "9", monto_item_clp: "1.5" })) })).status, 400);
  });
  await prueba("boleta → IVA 0; PDF aceptado", async () => {
    const pdf = new Blob(["%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"], { type: "application/pdf" });
    const r = await ana.cliente.pedir("/api/gastos", { metodo: "POST", form: formGasto(campos({ tipo_documento: "boleta", rut_emisor: "", folio_documento: "991", monto_item_clp: 11900, monto_envio_clp: 0 }), pdf, "b.pdf") });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.gastos[0].iva_clp, 0);
  });
  await prueba("comprobante: dueño, gerencia y admin de su empresa sí; otra empresa o colega no", async () => {
    const r = await ana.cliente.pedir(`/api/comprobantes/${anaGastoId}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.equal((await beto.cliente.pedir(`/api/comprobantes/${anaGastoId}`)).status, 404);
    assert.equal((await ggA.cliente.pedir(`/api/comprobantes/${anaGastoId}`)).status, 200);
    assert.equal((await ggD.cliente.pedir(`/api/comprobantes/${anaGastoId}`)).status, 404);
    assert.equal((await dora.cliente.pedir(`/api/comprobantes/${anaGastoId}`)).status, 404);
    assert.equal((await admin.pedir(q(`/api/comprobantes/${anaGastoId}`, A))).status, 200);
    assert.equal((await admin.pedir(q(`/api/comprobantes/${anaGastoId}`, D))).status, 404);
  });
  await prueba("mesa de validación: rechazar exige motivo; rechazada sale del gasto real; aprobar", async () => {
    const lista = (await admin.pedir(q("/api/admin/gastos", A, "&alcance=todos"))).datos.gastos;
    assert.equal(lista.length, 2);
    assert.ok(lista.every((g) => g.estado === "pendiente"));
    const antes = (await ggA.cliente.pedir("/api/exec")).datos.totales;
    assert.equal(antes.total_clp, 32000 + 4500 + 11900);
    assert.equal((await admin.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "rechazado" } })).status, 400);
    assert.equal((await admin.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "rechazado", observacion: "Folio ilegible" } })).status, 200);
    const tras = (await ggA.cliente.pedir("/api/exec")).datos;
    assert.equal(tras.totales.total_clp, 11900);
    assert.equal(tras.iva.iva_recuperable_clp, 0);
    assert.equal(tras.iva.iva_absorbido_boleta_clp, 1900);
    assert.equal((await admin.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "aprobado" } })).status, 200);
    const g = (await admin.pedir(q("/api/admin/gastos", A, "&alcance=todos&estado=todos"))).datos.gastos.find((x) => x.id === anaGastoId);
    assert.equal(g.estado, "aprobado");
    assert.ok(g.validado_por_nombre);
    const datasheq = (await ggD.cliente.pedir("/api/exec")).datos.totales.total_clp;
    assert.equal(datasheq, 36500); // la compra de Dora, separada
  });
  await prueba("gerencia no puede validar compras", async () => {
    assert.equal((await ggA.cliente.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "aprobado" } })).status, 403);
  });

  console.log("Seguridad y administración");
  await prueba("Origin ajeno en POST → 403", async () => {
    const r = await ana.cliente.pedir("/api/ooo", { metodo: "POST", json: { fecha: hoy, dia_completo: true }, headers: { origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  });
  await prueba("bloqueo tras 5 fallos (cuenta de Datasheq); reseteo por admin desbloquea", async () => {
    const c = new Cliente("dora2");
    for (let i = 1; i <= 4; i++) assert.equal((await c.login("dora@datasheq.cl", "111112")).status, 401);
    assert.equal((await c.login("dora@datasheq.cl", "111112")).status, 429);
    assert.equal((await c.login("dora@datasheq.cl", "905162")).status, 429);
    assert.equal((await admin.pedir(q(`/api/admin/usuarios/${dora.id}`, D), { metodo: "PATCH", json: { resetear_pin: true } })).status, 200);
    assert.equal((await dora.cliente.pedir("/api/bitacora")).status, 401);
    assert.equal((await c.login("dora@datasheq.cl", "000000")).datos.redirigir, "/cambiar-pin");
  });
  await prueba("administradores: no a sí mismo; quitar a otro borra sus supervisiones", async () => {
    assert.equal((await admin.pedir(`/api/admin/administradores/${adminId}`, { metodo: "PATCH", json: { activo: false } })).status, 400);
    assert.equal((await admin.pedir(`/api/admin/administradores/${adminId}`, { metodo: "DELETE" })).status, 400);
    assert.equal((await admin.pedir(`/api/admin/administradores/${admin2Id}`, { metodo: "DELETE" })).status, 200);
    assert.equal((await admin2.pedir(q("/api/admin/standup", A))).status, 401);
    const u = (await admin.pedir(q("/api/admin/usuarios", D))).datos.usuarios.find((x) => x.email === "dora@datasheq.cl");
    assert.deepEqual(u.supervisores.map((s) => s.id), [adminId]);
  });
  await prueba("quitar cuenta con historial → desactivada y sin sesión", async () => {
    assert.equal((await admin.pedir(q(`/api/admin/usuarios/${beto.id}`, A), { metodo: "DELETE" })).datos.accion, "desactivado");
    assert.equal((await beto.cliente.pedir("/api/bitacora")).status, 401);
  });

  console.log(`\n${ok} pruebas OK, ${fallos} fallidas`);
  process.exitCode = fallos ? 1 : 0;
}

main();
