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
  let adminId, admin2, admin2Id, ana, beto, dora, ggA, ggD, pA, pA2, pD, anaGastoId, gastoDobleId, manana, hoy;

  console.log("Autenticación");
  await prueba("health 200 (abre control + bases de ambas empresas)", async () => assert.equal((await anon.pedir("/api/health")).status, 200));
  await prueba("API sin sesión → 401; página → /login", async () => {
    assert.equal((await anon.pedir("/api/jornada")).status, 401);
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
    r = await admin.pedir(q("/api/admin/proyectos", A), { metodo: "POST", json: { ...p, presupuesto_clp: 1000000, codigo: "AETH-GW-03", nombre: "Gateway LoRa" } });
    assert.equal(r.status, 201);
    pA2 = r.datos.id;
    const la = (await admin.pedir(q("/api/admin/proyectos", A))).datos.proyectos;
    const ld = (await admin.pedir(q("/api/admin/proyectos", D))).datos.proyectos;
    assert.deepEqual(la.map((x) => x.codigo).sort(), ["AETH-GW-03", "AETH-SEN-01"]);
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
    assert.equal((await ggA.cliente.pedir("/api/jornada")).status, 403);
    let r = await ana.cliente.pedir("/admin");
    assert.match(r.headers.get("location"), /\/checkin$/);
    r = await ggD.cliente.pedir("/checkin");
    assert.match(r.headers.get("location"), /\/exec$/);
  });

  console.log("Aislamiento entre empresas");
  await prueba("cada integrante ve solo los proyectos de su empresa (y ?empresa= se ignora)", async () => {
    const a = (await ana.cliente.pedir(q("/api/jornada", D))).datos;
    assert.equal(a.empresa.clave, A);
    assert.deepEqual(a.proyectos.map((p) => p.codigo), ["AETH-GW-03", "AETH-SEN-01"]);
    const d = (await dora.cliente.pedir(q("/api/jornada", A))).datos;
    assert.equal(d.empresa.clave, D);
    assert.ok(d.proyectos.every((p) => p.id !== pA));
  });
  await prueba("gerencia ve solo su empresa aunque pida otra", async () => {
    const r = await ggD.cliente.pedir(q("/api/exec", A));
    assert.equal(r.status, 200);
    assert.equal(r.datos.empresa.clave, D);
    assert.ok(r.datos.costo.proyectos.every((p) => p.id !== pA));
    assert.ok(r.datos.tiempo.proyectos.every((p) => p.id !== pA));
    assert.ok(!("equipo" in r.datos) && !("bloqueos" in r.datos) && !("plazo" in r.datos));
    assert.deepEqual(Object.keys(r.datos.metas), ["tolerancia_costo_pct"]);
  });
  await prueba("administrador elige la empresa del tablero de gerencia", async () => {
    assert.equal((await admin.pedir(q("/api/exec", A))).datos.empresa.clave, A);
    assert.equal((await admin.pedir(q("/api/exec", D))).datos.empresa.clave, D);
  });
  await prueba("cabecera x-user-id ignorada", async () => {
    assert.equal((await anon.pedir("/api/jornada", { headers: { "x-user-id": ana.id } })).status, 401);
  });

  console.log("Jornada: comenzar y terminar cuando la persona quiera (sin horario)");
  await prueba("comenzar con objetivos opcionales: sin proyecto, de la otra empresa o más de 4 → 400", async () => {
    const enviar = (tareas) => ana.cliente.pedir("/api/jornada/comenzar", { metodo: "POST", json: { tareas } });
    const t = { proyecto_ids: [pA], descripcion: "x" };
    assert.equal((await enviar([t, { proyecto_ids: [], descripcion: "x" }])).status, 400);
    assert.equal((await enviar([t, { proyecto_ids: [pA, pD], descripcion: "x" }])).status, 400);
    assert.equal((await enviar([t, t, t, t, t])).status, 400);
  });
  await prueba("comenzar: 3 objetivos (uno de 2 proyectos) → 201 a cualquier hora; reenvío idempotente", async () => {
    const tareas = [
      { proyecto_ids: [pA, pA2, pA], descripcion: "Ruteo de líneas SPI compartidas" }, // duplicado se ignora
      { proyecto_ids: [pA], descripcion: "Pruebas deep-sleep" },
      { proyecto_id: pA2, descripcion: "Compilar firmware FreeRTOS" }, // formato de un solo proyecto, aún aceptado
    ];
    const r1 = await ana.cliente.pedir("/api/jornada/comenzar", { metodo: "POST", json: { tareas } });
    assert.equal(r1.status, 201, JSON.stringify(r1.datos));
    assert.deepEqual(r1.datos.tareas.map((t) => t.proyectos.map((p) => p.codigo)), [["AETH-GW-03", "AETH-SEN-01"], ["AETH-SEN-01"], ["AETH-GW-03"]]);
    assert.equal(r1.datos.fase, "en_curso");
    assert.ok(r1.datos.jornada.checkin_manana);
    assert.equal(r1.datos.jornada.fecha, r1.datos.hoy);
    assert.ok(!("ventanas" in r1.datos) && !("vista" in r1.datos));
    const r2 = await ana.cliente.pedir("/api/jornada/comenzar", { metodo: "POST", json: { tareas } });
    assert.equal(r2.status, 200);
    assert.equal(r2.datos.ya_existia, true);
    assert.equal(r2.datos.tareas.length, 3);
    manana = r1.datos;
    hoy = r1.datos.hoy;
  });
  await prueba("doble envío simultáneo → una sola jornada", async () => {
    const tareas = [{ proyecto_ids: [pA], descripcion: "A" }, { proyecto_ids: [pA], descripcion: "B" }];
    const rs = await Promise.all([1, 2, 3].map(() => beto.cliente.pedir("/api/jornada/comenzar", { metodo: "POST", json: { tareas } })));
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 200, 201]);
  });
  await prueba("otro usuario no puede terminar con objetivos ajenos", async () => {
    const r = await beto.cliente.pedir("/api/jornada/terminar", { metodo: "POST", json: { tareas: manana.tareas.map((t) => ({ id: t.id, estado: "completado" })) } });
    assert.equal(r.status, 400);
  });
  await prueba("jornada en curso: marcar objetivos logrados (solo los propios)", async () => {
    const [a] = manana.tareas;
    const r = await ana.cliente.pedir(`/api/jornada/objetivos/${a.id}`, { metodo: "PATCH", json: { completada: true } });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.tareas.find((t) => t.id === a.id).estado, "completado");
    assert.ok(!("juego" in r.datos) && !("racha" in r.datos));
    assert.equal(r.datos.fase, "en_curso");
    assert.equal((await beto.cliente.pedir(`/api/jornada/objetivos/${a.id}`, { metodo: "PATCH", json: { completada: true } })).status, 404);
    const d = await ana.cliente.pedir(`/api/jornada/objetivos/${a.id}`, { metodo: "PATCH", json: { completada: false } });
    assert.equal(d.datos.tareas.find((t) => t.id === a.id).estado, "pendiente");
  });
  await prueba("terminar: validaciones y balance con bloqueo; segundo término → 404; no se comienza otra hoy", async () => {
    const [a, b, c] = manana.tareas;
    const enviar = (json) => ana.cliente.pedir("/api/jornada/terminar", { metodo: "POST", json });
    assert.equal((await enviar({ tareas: [{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "pendiente" }] })).status, 400);
    assert.equal((await enviar({ tareas: [{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }] })).status, 400);
    const json = {
      tareas: [{ id: a.id, estado: "completado" }, { id: b.id, estado: "completado" }, { id: c.id, estado: "pendiente", motivo_pendiente: "Esperando componentes" }],
      bloqueo: "Aduana retiene el envío de DigiKey",
    };
    const r = await enviar(json);
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.fase, "terminada");
    assert.ok(r.datos.jornada.checkout_tarde);
    assert.equal((await enviar(json)).status, 404); // ya no hay jornada en curso
    // terminada sigue editable hasta comenzar la próxima
    const ed = await ana.cliente.pedir(`/api/jornada/objetivos/${a.id}`, { metodo: "PATCH", json: { completada: false } });
    assert.equal(ed.status, 200, JSON.stringify(ed.datos));
    assert.equal(ed.datos.fase, "terminada");
    assert.equal((await ana.cliente.pedir(`/api/jornada/objetivos/${a.id}`, { metodo: "PATCH", json: { completada: true } })).status, 200);
    const otra = await ana.cliente.pedir("/api/jornada/comenzar", { metodo: "POST", json: { tareas: [{ proyecto_ids: [pA], descripcion: "x" }, { proyecto_ids: [pA], descripcion: "y" }] } });
    assert.equal(otra.status, 409);
    assert.match(otra.datos.error, /Ya terminaste tu jornada de hoy/);
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

  console.log("Jornada como eventos: objetivos editables en curso y después de terminar");
  let ines;
  await prueba("comenzar es un toque; los objetivos se agregan, editan y quitan después (máx. 4)", async () => {
    ines = await cuenta(admin, A, "ines@aether-tech.dev", "Inés Mora", "team", "936184");
    let r = await ines.cliente.pedir("/api/jornada/comenzar", { metodo: "POST" });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.deepEqual([r.datos.fase, r.datos.tareas.length], ["en_curso", 0]);
    r = await ines.cliente.pedir("/api/jornada/terminar", { metodo: "POST", json: { tareas: [] } });
    assert.equal(r.status, 400);
    assert.match(r.datos.error, /al menos un objetivo/);
    const agregar = (descripcion, proyecto_ids = [pA]) => ines.cliente.pedir("/api/jornada/objetivos", { metodo: "POST", json: { descripcion, proyecto_ids } });
    for (const d of ["Medir ruido", "Ajustar ganancia", "Documentar", "Revisar BOM"]) assert.equal((await agregar(d)).status, 201);
    assert.equal((await agregar("Quinto")).status, 400);
    assert.equal((await agregar("Otra empresa", [pD])).status, 400);
    let t = (await ines.cliente.pedir("/api/jornada")).datos.tareas;
    r = await ines.cliente.pedir(`/api/jornada/objetivos/${t[0].id}`, { metodo: "PATCH", json: { descripcion: "Medir ruido en ADC", proyecto_ids: [pA, pA2] } });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.deepEqual([r.datos.tareas[0].descripcion, r.datos.tareas[0].proyectos.length], ["Medir ruido en ADC", 2]);
    assert.equal((await ana.cliente.pedir(`/api/jornada/objetivos/${t[0].id}`, { metodo: "PATCH", json: { completada: true } })).status, 404); // ajeno
    assert.equal((await ana.cliente.pedir(`/api/jornada/objetivos/${t[0].id}`, { metodo: "DELETE" })).status, 404);
    r = await ines.cliente.pedir(`/api/jornada/objetivos/${t[3].id}`, { metodo: "DELETE" });
    assert.equal(r.datos.tareas.length, 3);
    assert.equal((await ines.cliente.pedir("/api/jornada", { metodo: "PATCH", json: { bloqueo: "x" } })).status, 409); // en curso: se informa al terminar
  });
  await prueba("después de terminar: agregar, marcar, motivo y bloqueo siguen editables; el standup ve lo último", async () => {
    let t = (await ines.cliente.pedir("/api/jornada")).datos.tareas;
    let r = await ines.cliente.pedir("/api/jornada/terminar", {
      metodo: "POST",
      json: { tareas: [{ id: t[0].id, estado: "completado" }, { id: t[1].id, estado: "pendiente", motivo_pendiente: "Falta el osciloscopio" }, { id: t[2].id, estado: "completado" }] },
    });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    r = await ines.cliente.pedir("/api/jornada/objetivos", { metodo: "POST", json: { descripcion: "Subir informe", proyecto_ids: [pA] } });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.fase, "terminada");
    t = r.datos.tareas;
    assert.equal((await ines.cliente.pedir(`/api/jornada/objetivos/${t[3].id}`, { metodo: "PATCH", json: { completada: true } })).status, 200);
    r = await ines.cliente.pedir(`/api/jornada/objetivos/${t[1].id}`, { metodo: "PATCH", json: { motivo_pendiente: "Llega el lunes" } });
    assert.equal(r.datos.tareas[1].motivo_pendiente, "Llega el lunes");
    r = await ines.cliente.pedir("/api/jornada", { metodo: "PATCH", json: { bloqueo: "Sin osciloscopio" } });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    const fila = async () => (await admin.pedir(q("/api/admin/standup", A, "&alcance=todos"))).datos.filas.find((f) => f.email === "ines@aether-tech.dev");
    let f = await fila();
    assert.deepEqual([f.ultima.completadas, f.ultima.comprometidas, f.bloqueos.length], [3, 4, 1]);
    assert.ok(f.ultima.tareas.some((x) => x.descripcion === "Medir ruido en ADC"), "el standup ve la edición");
    assert.equal((await admin.pedir(q(`/api/admin/bloqueos/${f.bloqueos[0].bitacora_id}`, A), { metodo: "POST" })).status, 200);
    await ines.cliente.pedir("/api/jornada", { metodo: "PATCH", json: { bloqueo: "Sin osciloscopio" } }); // mismo texto: sigue resuelto
    assert.equal((await fila()).bloqueos.length, 0);
    await ines.cliente.pedir("/api/jornada", { metodo: "PATCH", json: { bloqueo: "Ahora falta la fuente" } }); // nuevo: sin resolver
    assert.equal((await fila()).bloqueos.length, 1);
    // una jornada terminada conserva al menos un objetivo
    for (const x of t.slice(1)) assert.equal((await ines.cliente.pedir(`/api/jornada/objetivos/${x.id}`, { metodo: "DELETE" })).status, 200);
    assert.equal((await ines.cliente.pedir(`/api/jornada/objetivos/${t[0].id}`, { metodo: "DELETE" })).status, 400);
    assert.equal((await ines.cliente.pedir("/api/jornada/comenzar", { metodo: "POST" })).status, 409); // una por día
  });

  console.log("Días no disponibles y disponibilidad");
  await prueba("día futuro no disponible aparece en la disponibilidad de 14 días; duplicado → 409", async () => {
    let f = sumar(hoy, 1);
    while ([0, 6].includes(new Date(`${f}T12:00:00Z`).getUTCDay())) f = sumar(f, 1);
    assert.equal((await ana.cliente.pedir("/api/no-disponible", { metodo: "POST", json: { fecha: f, motivo: "Viaje" } })).status, 201);
    assert.equal((await ana.cliente.pedir("/api/no-disponible", { metodo: "POST", json: { fecha: f, dia_completo: true } })).status, 409);
    assert.equal((await ana.cliente.pedir("/api/no-disponible", { metodo: "POST", json: { fecha: sumar(hoy, -1) } })).status, 400);
    const c = (await admin.pedir(q("/api/admin/capacidad", A, "&alcance=todos"))).datos;
    const fila = c.filas.find((x) => x.nombre === "Ana Rojas");
    assert.equal(fila.celdas.find((x) => x.fecha === f).estado, "no_disponible");
    assert.equal(fila.celdas.find((x) => x.fecha === f).detalle, "Viaje");
    assert.equal(c.dias.length, 14);
    assert.ok(!("jornada" in c));
  });
  await prueba("no se marca no disponible un día con jornada; hoy no disponible bloquea comenzar hasta quitarlo", async () => {
    assert.equal((await beto.cliente.pedir("/api/no-disponible", { metodo: "POST", json: { fecha: hoy } })).status, 409);
    const r = await dora.cliente.pedir("/api/no-disponible", { metodo: "POST", json: { fecha: hoy, motivo: "Otro cliente" } });
    assert.equal(r.status, 201);
    assert.equal(r.datos.fase, "no_disponible");
    assert.equal(r.datos.no_disponible_hoy.motivo, "Otro cliente");
    const tareas = [{ proyecto_ids: [pD], descripcion: "a" }, { proyecto_ids: [pD], descripcion: "b" }];
    assert.equal((await dora.cliente.pedir("/api/jornada/comenzar", { metodo: "POST", json: { tareas } })).status, 409);
    const st = (await admin.pedir(q("/api/admin/standup", D, "&alcance=todos"))).datos.filas.find((x) => x.email === "dora@datasheq.cl");
    assert.equal(st.prioridad, 3);
    assert.equal(st.motivo, "No disponible hoy");
    const d = await dora.cliente.pedir(`/api/no-disponible/${r.datos.id}`, { metodo: "DELETE" });
    assert.equal(d.datos.fase, "sin_iniciar");
    assert.equal((await beto.cliente.pedir(`/api/no-disponible/${r.datos.id}`, { metodo: "DELETE" })).status, 404); // ajeno
  });
  await prueba("standup: última jornada sin horas y sin alerta por días sin jornada", async () => {
    const filas = (await admin.pedir(q("/api/admin/standup", A, "&alcance=todos"))).datos.filas;
    const b = filas.find((x) => x.email === "beto@aether-tech.dev");
    assert.equal(b.ultima.estado, "en_curso");
    assert.equal(b.ultima.tareas.length, 2);
    assert.ok(!("dias_sin_registro_14d" in b) && !("hoy" in b));
    assert.ok(!JSON.stringify(b.ultima).includes("checkin"));
  });

  console.log("Compras");
  const compra = (extra = {}) => ({
    proyecto_ids: [pA], item: "ST-Link V3 Mini", descripcion: "Programador para el sensor", monto_clp: 43435, ...extra,
  });
  await prueba("compra: nombre, descripción y monto en un proyecto", async () => {
    const r = await ana.cliente.pedir("/api/gastos", { metodo: "POST", json: compra() });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    anaGastoId = r.datos.id;
    const g = r.datos.gastos.find((x) => x.id === anaGastoId);
    assert.equal(g.monto_clp, 43435);
    assert.equal(g.envio_clp, 0);
    assert.equal(g.descripcion, "Programador para el sensor");
    assert.deepEqual(g.proyectos, ["AETH-SEN-01"]);
    assert.ok(!("iva_clp" in g) && !("tipo_documento" in g));
  });
  await prueba("compra con envío para 2 proyectos: total = compra + envío, repartido en partes iguales sin perder pesos", async () => {
    const r = await ana.cliente.pedir("/api/gastos", { metodo: "POST", json: compra({ item: "Osciloscopio (arriendo)", monto_clp: 85001, envio_clp: 5000, proyecto_ids: [pA, pA2] }) });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    gastoDobleId = r.datos.id;
    assert.deepEqual(r.datos.gastos.find((x) => x.id === gastoDobleId).proyectos, ["AETH-GW-03", "AETH-SEN-01"]);
    const fila = (await admin.pedir(q("/api/admin/gastos", A, "&alcance=todos"))).datos.gastos.find((x) => x.id === gastoDobleId);
    assert.equal(fila.monto_clp, 90001);
    assert.equal(fila.envio_clp, 5000);
    const partes = Object.fromEntries(fila.proyectos.map((p) => [p.codigo, p.monto_clp]));
    assert.equal(partes["AETH-SEN-01"] + partes["AETH-GW-03"], 90001);
    assert.ok(Math.abs(partes["AETH-SEN-01"] - partes["AETH-GW-03"]) <= 1);
  });
  await prueba("descripción y envío opcionales (envío null = sin envío)", async () => {
    const r = await ana.cliente.pedir("/api/gastos", { metodo: "POST", json: compra({ item: "Cables dupont", monto_clp: 11900, descripcion: null, envio_clp: null }) });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.equal(r.datos.gastos[0].descripcion, null);
    assert.equal(r.datos.gastos[0].monto_clp, 11900);
    assert.equal(r.datos.gastos[0].envio_clp, 0);
  });
  await prueba("validaciones: sin nombre, monto 0, decimales, envío inválido, sin proyecto, proyecto de otra empresa → 400", async () => {
    const mal = async (x) => (await ana.cliente.pedir("/api/gastos", { metodo: "POST", json: compra(x) })).status;
    assert.equal(await mal({ item: " " }), 400);
    assert.equal(await mal({ monto_clp: 0 }), 400);
    assert.equal(await mal({ monto_clp: 1.5 }), 400);
    assert.equal(await mal({ envio_clp: -1 }), 400);
    assert.equal(await mal({ envio_clp: 1500.5 }), 400);
    assert.equal(await mal({ monto_clp: 999_999_999, envio_clp: 2 }), 400);
    assert.equal(await mal({ monto_clp: 0, envio_clp: 5000 }), 400);
    assert.equal(await mal({ proyecto_ids: [] }), 400);
    assert.equal(await mal({ proyecto_ids: [pA, pD] }), 400);
  });
  await prueba("la otra empresa registra sus compras aparte", async () => {
    const r = await dora.cliente.pedir("/api/gastos", { metodo: "POST", json: compra({ proyecto_ids: [pD] }) });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.equal((await ana.cliente.pedir("/api/gastos")).datos.gastos.length, 3);
  });
  await prueba("mesa de validación: rechazar exige motivo; rechazada sale del gasto real; aprobar", async () => {
    const lista = (await admin.pedir(q("/api/admin/gastos", A, "&alcance=todos"))).datos.gastos;
    assert.equal(lista.length, 3);
    assert.ok(lista.every((g) => g.estado === "pendiente"));
    const antes = (await ggA.cliente.pedir("/api/exec")).datos;
    assert.equal(antes.costo.total_clp, 43435 + 90001 + 11900);
    const sen = (m) => m.costo.proyectos.find((p) => p.codigo === "AETH-SEN-01").total_clp;
    const gw = (m) => m.costo.proyectos.find((p) => p.codigo === "AETH-GW-03").total_clp;
    assert.equal(sen(antes) + gw(antes), 43435 + 90001 + 11900);
    assert.equal((await admin.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "rechazado" } })).status, 400);
    assert.equal((await admin.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "rechazado", observacion: "No corresponde" } })).status, 200);
    const tras = (await ggA.cliente.pedir("/api/exec")).datos;
    assert.equal(tras.costo.total_clp, 90001 + 11900);
    assert.equal(sen(tras), sen(antes) - 43435);
    assert.equal(gw(tras), gw(antes));
    assert.ok(!("iva" in tras));
    assert.equal((await admin.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "aprobado" } })).status, 200);
    const g = (await admin.pedir(q("/api/admin/gastos", A, "&alcance=todos&estado=todos"))).datos.gastos.find((x) => x.id === anaGastoId);
    assert.equal(g.estado, "aprobado");
    assert.ok(g.validado_por_nombre);
    assert.equal(g.descripcion, "Programador para el sensor");
    const fin = (await ggA.cliente.pedir("/api/exec")).datos;
    assert.equal(fin.costo.total_clp - fin.costo.por_validar_clp, 43435); // aprobado
    assert.equal((await ggD.cliente.pedir("/api/exec")).datos.costo.total_clp, 43435); // la compra de Dora, separada
  });
  await prueba("tolerancia de costo: solo administradores la cambian; gerencia la ve", async () => {
    const metas = { tolerancia_costo_pct: 15 };
    assert.equal((await ggA.cliente.pedir(q("/api/admin/metas", A), { metodo: "PUT", json: metas })).status, 403);
    assert.equal((await admin.pedir(q("/api/admin/metas", A), { metodo: "PUT", json: { tolerancia_costo_pct: 120 } })).status, 400);
    const r = await admin.pedir(q("/api/admin/metas", A), { metodo: "PUT", json: metas });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.deepEqual((await ggA.cliente.pedir("/api/exec")).datos.metas, metas);
    assert.equal((await ggD.cliente.pedir("/api/exec")).datos.metas.tolerancia_costo_pct, 10); // otra empresa: por defecto
  });

  console.log("Etapas y pipeline");
  const proyectoD = async (codigo) => {
    const r = await admin.pedir(q("/api/admin/proyectos", D), {
      metodo: "POST",
      json: { codigo, nombre: `Proyecto ${codigo}`, presupuesto_clp: 1000000, fecha_inicio: "2026-09-01", fecha_entrega_objetivo: "2027-03-31" },
    });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    return r.datos.id;
  };
  const etapasDe = async (id) => (await admin.pedir(q("/api/admin/proyectos", D))).datos.proyectos.find((p) => p.id === id).etapas;
  const estadoD = (id, estado) => admin.pedir(q(`/api/admin/proyectos/${id}`, D), { metodo: "PATCH", json: { estado } });
  let pEt;
  await prueba("historial de etapas: se registra al crear y en cada cambio de estado; el mismo día se corrige", async () => {
    pEt = await proyectoD("DSQ-ETP-01");
    assert.deepEqual((await etapasDe(pEt)).map((e) => [e.estado, e.desde]), [["concepto", "2026-09-01"]]);
    assert.equal((await estadoD(pEt, "prototipado")).status, 200);
    let et = await etapasDe(pEt);
    assert.deepEqual(et.map((e) => [e.estado, e.desde]), [["concepto", "2026-09-01"], ["prototipado", hoy]]);
    await estadoD(pEt, "pruebas"); // mismo día: corrige, no agrega un tramo de 0 días
    et = await etapasDe(pEt);
    assert.deepEqual(et.map((e) => e.estado), ["concepto", "pruebas"]);
    await estadoD(pEt, "concepto"); // vuelve al estado previo: se fusiona
    assert.deepEqual((await etapasDe(pEt)).map((e) => e.estado), ["concepto"]);
    await estadoD(pEt, "prototipado");
  });
  await prueba("corregir fechas de etapas: en orden, no después de hoy, la primera es el inicio; gerencia no puede", async () => {
    const et = await etapasDe(pEt);
    const put = (cl, etapas) => cl.pedir(q(`/api/admin/proyectos/${pEt}/etapas`, D), { metodo: "PUT", json: { etapas } });
    assert.equal((await put(ggD.cliente, et.map((e) => ({ id: e.id, desde: e.desde })))).status, 403);
    assert.equal((await put(admin, [{ id: et[0].id, desde: "2026-09-20" }, { id: et[1].id, desde: "2026-09-10" }])).status, 400);
    assert.equal((await put(admin, [{ id: et[0].id, desde: "2026-09-01" }, { id: et[1].id, desde: "2099-01-01" }])).status, 400);
    assert.equal((await put(admin, [{ id: et[0].id, desde: "2026-09-01" }])).status, 409);
    const r = await put(admin, [{ id: et[0].id, desde: "2026-08-20" }, { id: et[1].id, desde: "2026-09-15" }]);
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    const p = (await admin.pedir(q("/api/admin/proyectos", D))).datos.proyectos.find((x) => x.id === pEt);
    assert.equal(p.fecha_inicio, "2026-08-20");
    assert.deepEqual(p.etapas.map((e) => e.desde), ["2026-08-20", "2026-09-15"]);
  });
  await prueba("gerencia: pipeline por etapa con aviso al pasar el umbral; entregados aparte con sus indicadores", async () => {
    let m = (await ggD.cliente.pedir("/api/exec")).datos;
    const umbral = m.pipeline.aviso_por_etapa;
    const proto = () => m.pipeline.etapas.find((e) => e.estado === "prototipado");
    const enProto = proto().proyectos.length; // DSQ-ETP-01
    const nuevos = [];
    for (let i = enProto; i <= umbral; i++) {
      const id = await proyectoD(`DSQ-PIP-0${i}`);
      await estadoD(id, "prototipado");
      nuevos.push(id);
    }
    m = (await ggD.cliente.pedir("/api/exec")).datos;
    assert.equal(proto().proyectos.length, umbral + 1);
    assert.deepEqual(m.pipeline.saturadas, ["prototipado"]);
    const etp = proto().proyectos.find((p) => p.id === pEt);
    assert.equal(etp.etapa_desde, "2026-09-15");
    assert.equal(etp.dias_por_etapa.concepto, 26); // 20-ago → 15-sep
    // entregar uno: sale del pipeline, del plazo y del costo; aparece en entregados
    await estadoD(nuevos[0], "entregado");
    m = (await ggD.cliente.pedir("/api/exec")).datos;
    assert.deepEqual(m.pipeline.saturadas, []);
    assert.ok(!m.tiempo.proyectos.some((p) => p.id === nuevos[0]));
    assert.ok(!m.costo.proyectos.some((p) => p.id === nuevos[0]));
    const e = m.entregados.find((p) => p.id === nuevos[0]);
    assert.equal(e.fecha_entregado, hoy);
    assert.equal(e.plazo, "en_meta"); // antes de la fecha estimada (31-mar-2027)
    assert.ok(e.dias_concepto_cliente >= 0 && e.desvio_dias < 0);
    assert.equal(m.costo.total_clp, 43435); // la compra de Dora no cambia
  });
  await prueba("editar proyecto: código, nombre, BOM y fechas; validaciones; el inicio mueve la primera etapa", async () => {
    const patch = (cl, json) => cl.pedir(q(`/api/admin/proyectos/${pEt}`, D), { metodo: "PATCH", json });
    const leer = async () => (await admin.pedir(q("/api/admin/proyectos", D))).datos.proyectos.find((p) => p.id === pEt);
    assert.equal((await patch(ggD.cliente, { nombre: "x" })).status, 403);
    let r = await patch(admin, { codigo: "dsq-etp-1b", nombre: "Encoder absoluto", presupuesto_clp: 2500000, fecha_entrega_objetivo: "2027-04-30" });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    let p = await leer();
    assert.deepEqual([p.codigo, p.nombre, p.presupuesto_clp, p.fecha_entrega_objetivo], ["DSQ-ETP-1B", "Encoder absoluto", 2500000, "2027-04-30"]);
    assert.equal((await patch(admin, { codigo: "DSQ-GW-01" })).status, 409);
    assert.equal((await patch(admin, { codigo: "x y" })).status, 400);
    assert.equal((await patch(admin, { fecha_entrega_objetivo: "2026-08-01" })).status, 400); // antes del inicio
    assert.equal((await patch(admin, { fecha_inicio: "2026-09-20" })).status, 400); // después del comienzo de prototipado (15-sep)
    r = await patch(admin, { fecha_inicio: "2026-08-10" });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    p = await leer();
    assert.equal(p.fecha_inicio, "2026-08-10");
    assert.deepEqual(p.etapas.map((e) => [e.estado, e.desde]), [["concepto", "2026-08-10"], ["prototipado", "2026-09-15"]]);
    const m = (await ggD.cliente.pedir("/api/exec")).datos;
    const enExec = m.tiempo.proyectos.find((x) => x.id === pEt);
    assert.deepEqual([enExec.codigo, enExec.nombre, enExec.dias_por_etapa.concepto], ["DSQ-ETP-1B", "Encoder absoluto", 36]);
  });
  await prueba("gerencia no puede validar compras", async () => {
    assert.equal((await ggA.cliente.pedir(q(`/api/admin/gastos/${anaGastoId}`, A), { metodo: "PATCH", json: { estado: "aprobado" } })).status, 403);
  });

  console.log("Seguridad y administración");
  await prueba("Origin ajeno en POST → 403", async () => {
    const r = await ana.cliente.pedir("/api/no-disponible", { metodo: "POST", json: { fecha: hoy }, headers: { origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  });
  await prueba("bloqueo tras 5 fallos (cuenta de Datasheq); reseteo por admin desbloquea", async () => {
    const c = new Cliente("dora2");
    for (let i = 1; i <= 4; i++) assert.equal((await c.login("dora@datasheq.cl", "111112")).status, 401);
    assert.equal((await c.login("dora@datasheq.cl", "111112")).status, 429);
    assert.equal((await c.login("dora@datasheq.cl", "905162")).status, 429);
    assert.equal((await admin.pedir(q(`/api/admin/usuarios/${dora.id}`, D), { metodo: "PATCH", json: { resetear_pin: true } })).status, 200);
    assert.equal((await dora.cliente.pedir("/api/jornada")).status, 401);
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
  await prueba("desactivar y reactivar una cuenta: sin acceso mientras está desactivada", async () => {
    assert.equal((await admin.pedir(q(`/api/admin/usuarios/${beto.id}`, A), { metodo: "PATCH", json: { activo: false } })).status, 200);
    assert.equal((await beto.cliente.pedir("/api/jornada")).status, 401);
    assert.equal((await new Cliente("b2").login("beto@aether-tech.dev", "618273")).status, 401);
    let u = (await admin.pedir(q("/api/admin/usuarios", A))).datos.usuarios.find((x) => x.id === beto.id);
    assert.equal(u.activo, 0);
    assert.ok(u.jornadas > 0, "conserva sus registros");
    assert.equal((await admin.pedir(q(`/api/admin/usuarios/${beto.id}`, A), { metodo: "PATCH", json: { activo: true, resetear_pin: true } })).status, 200);
    u = (await admin.pedir(q("/api/admin/usuarios", A))).datos.usuarios.find((x) => x.id === beto.id);
    assert.equal(u.activo, 1);
  });
  await prueba("eliminar definitivamente: sus jornadas y compras pasan al administrador elegido; los costos no cambian", async () => {
    const fer = await cuenta(admin, A, "fer@aether-tech.dev", "Fer Soto", "team", "740286", [adminId]);
    const gus = await cuenta(admin, A, "gus@aether-tech.dev", "Gus Lara", "team", "852397", [adminId]);
    for (const c of [fer, gus]) {
      const r = await c.cliente.pedir("/api/jornada/comenzar", {
        metodo: "POST",
        json: { tareas: [{ proyecto_ids: [pA], descripcion: "Medir consumo" }, { proyecto_ids: [pA2], descripcion: "Revisar firmware" }] },
      });
      assert.equal(r.status, 201, JSON.stringify(r.datos));
      assert.equal((await c.cliente.pedir("/api/gastos", { metodo: "POST", json: { proyecto_ids: [pA], item: "Cable", monto_clp: 5000 } })).status, 201);
    }
    const costoAntes = (await ggA.cliente.pedir("/api/exec")).datos.costo.total_clp;
    const del = (id, extra = "") => admin.pedir(q(`/api/admin/usuarios/${id}`, A, extra), { metodo: "DELETE" });
    assert.equal((await ggA.cliente.pedir(q(`/api/admin/usuarios/${fer.id}`, A, `&asignar_a=${adminId}`), { metodo: "DELETE" })).status, 403);
    assert.equal((await del(fer.id)).status, 400); // con registros: hay que elegir administrador
    assert.equal((await del(fer.id, `&asignar_a=${admin2Id}`)).status, 400); // administrador eliminado
    let r = await del(fer.id, `&asignar_a=${adminId}`);
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.deepEqual([r.datos.accion, r.datos.jornadas, r.datos.compras], ["eliminado", 1, 1]);
    assert.ok(r.datos.asignado_a);
    r = await del(gus.id, `&asignar_a=${adminId}`); // misma fecha que la jornada heredada de Fer: se fusionan
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal((await fer.cliente.pedir("/api/jornada")).status, 401);
    assert.equal((await new Cliente("f2").login("fer@aether-tech.dev", "740286")).status, 401);
    const lista = (await admin.pedir(q("/api/admin/usuarios", A))).datos.usuarios;
    assert.ok(!lista.some((x) => [fer.id, gus.id].includes(x.id) || x.email.includes("aether-ops.interno")));
    const heredadas = (await admin.pedir(q("/api/admin/gastos", A, "&alcance=mios&estado=todos"))).datos.gastos.filter((g) => g.heredado);
    assert.equal(heredadas.length, 2);
    assert.ok(heredadas.every((g) => g.persona === r.datos.asignado_a));
    assert.equal((await ggA.cliente.pedir("/api/exec")).datos.costo.total_clp, costoAntes);
    // sin registros: se elimina sin elegir administrador (también gerencia)
    const hugo = await cuenta(admin, A, "hugo@aether-tech.dev", "Hugo Vera", "executive");
    r = await del(hugo.id);
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.equal(r.datos.asignado_a, null);
    assert.equal((await del(hugo.id)).status, 404);
  });

  await prueba("eliminar proyecto: borra lo exclusivo, reparte lo compartido y libera la bitácora vacía", async () => {
    const p = { presupuesto_clp: 1000000, fecha_inicio: "2026-09-01", fecha_entrega_objetivo: "2026-12-15" };
    const x = (await admin.pedir(q("/api/admin/proyectos", A), { metodo: "POST", json: { ...p, codigo: "DEL-01", nombre: "Borrar 1" } })).datos.id;
    const y = (await admin.pedir(q("/api/admin/proyectos", A), { metodo: "POST", json: { ...p, codigo: "DEL-02", nombre: "Borrar 2" } })).datos.id;
    const eli = await cuenta(admin, A, "eli@aether-tech.dev", "Eli Paz", "team", "583014");
    let r = await eli.cliente.pedir("/api/jornada/comenzar", {
      metodo: "POST",
      json: { tareas: [{ proyecto_ids: [x], descripcion: "Solo del 1" }, { proyecto_ids: [x, y], descripcion: "Compartido" }] },
    });
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    assert.equal((await eli.cliente.pedir("/api/gastos", { metodo: "POST", json: { proyecto_ids: [x], item: "Solo 1", monto_clp: 1000 } })).status, 201);
    const comp = (await eli.cliente.pedir("/api/gastos", { metodo: "POST", json: { proyecto_ids: [x, y], item: "Compartida", monto_clp: 1001 } })).datos.id;

    assert.equal((await eli.cliente.pedir(`/api/admin/proyectos/${x}`, { metodo: "DELETE" })).status, 403);
    assert.equal((await admin.pedir(q("/api/admin/proyectos/no-existe", A), { metodo: "DELETE" })).status, 404);
    r = await admin.pedir(q(`/api/admin/proyectos/${x}`, A), { metodo: "DELETE" });
    assert.equal(r.status, 200, JSON.stringify(r.datos));
    assert.deepEqual([r.datos.objetivos, r.datos.compras, r.datos.compras_reasignadas], [1, 1, 1]);

    let e = (await eli.cliente.pedir("/api/jornada")).datos;
    assert.equal(e.fase, "en_curso");
    assert.deepEqual(e.tareas.map((t) => [t.descripcion, t.proyectos.map((p) => p.codigo)]), [["Compartido", ["DEL-02"]]]);
    const fila = (await admin.pedir(q("/api/admin/gastos", A, "&alcance=todos&estado=todos"))).datos.gastos.find((g) => g.id === comp);
    assert.ok(fila, "la compra compartida sigue");
    assert.deepEqual(fila.proyectos.map((p) => [p.codigo, p.monto_clp]), [["DEL-02", 1001]]);
    assert.equal((await eli.cliente.pedir("/api/gastos")).datos.gastos.length, 1);

    r = await admin.pedir(q(`/api/admin/proyectos/${y}`, A), { metodo: "DELETE" });
    assert.deepEqual([r.datos.objetivos, r.datos.compras], [1, 1]);
    e = (await eli.cliente.pedir("/api/jornada")).datos;
    assert.equal(e.fase, "sin_iniciar", "la jornada abierta sin objetivos se libera");
    assert.equal((await eli.cliente.pedir("/api/gastos")).datos.gastos.length, 0);
    const codigos = (await admin.pedir(q("/api/admin/proyectos", A))).datos.proyectos.map((p) => p.codigo);
    assert.ok(!codigos.includes("DEL-01") && !codigos.includes("DEL-02"));
  });

  console.log(`\n${ok} pruebas OK, ${fallos} fallidas`);
  process.exitCode = fallos ? 1 : 0;
}

main();
