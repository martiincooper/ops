"use client";

import { FolderKanban, KeyRound, LoaderCircle, Lock, RotateCcw, Trash2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import BotonSalir from "@/components/BotonSalir";
import { ErrorApi, api, clp, cx, miles } from "@/lib/cliente";

export interface FilaUsuario {
  id: string;
  nombre: string;
  email: string;
  rol: "team" | "admin" | "executive";
  activo: number;
  debe_cambiar_pin: number;
  ultimo_acceso: string | null;
  bloqueado_hasta: string | null;
  tiene_historial: number;
}

export interface FilaProyecto {
  id: string;
  codigo: string;
  nombre: string;
  presupuesto_clp: number;
  fecha_inicio: string;
  fecha_entrega_objetivo: string;
  estado: "concepto" | "prototipado" | "pruebas" | "entregado" | "pausado";
}

const ROLES = { team: "Equipo", admin: "Jefatura (admin)", executive: "Gerencia" } as const;
const ESTADOS: FilaProyecto["estado"][] = ["concepto", "prototipado", "pruebas", "entregado", "pausado"];

const fmtFechaHora = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Santiago",
});

function estadoUsuario(u: FilaUsuario): { texto: string; clase: string } {
  if (!u.activo) return { texto: "Desactivado", clase: "text-slate-500 bg-slate-500/10" };
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) return { texto: "Bloqueado", clase: "text-aether-danger bg-aether-danger/10" };
  if (u.debe_cambiar_pin) return { texto: "Sin primer ingreso", clase: "text-aether-warning bg-aether-warning/10" };
  return { texto: "Activo", clase: "text-aether-success bg-aether-success/10" };
}

export default function AdminPanel({
  yo,
  usuariosIniciales,
  proyectosIniciales,
  hoy,
}: {
  yo: { id: string; nombre: string };
  usuariosIniciales: FilaUsuario[];
  proyectosIniciales: FilaProyecto[];
  hoy: string;
}) {
  const [pestana, setPestana] = useState<"equipo" | "proyectos">("equipo");
  const [usuarios, setUsuarios] = useState(usuariosIniciales);
  const [proyectos, setProyectos] = useState(proyectosIniciales);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  // Formulario usuario
  const [nEmail, setNEmail] = useState("");
  const [nNombre, setNNombre] = useState("");
  const [nRol, setNRol] = useState<FilaUsuario["rol"]>("team");

  // Formulario proyecto
  const [pCodigo, setPCodigo] = useState("");
  const [pNombre, setPNombre] = useState("");
  const [pPresupuesto, setPPresupuesto] = useState("");
  const [pInicio, setPInicio] = useState(hoy);
  const [pEntrega, setPEntrega] = useState("");

  async function recargarUsuarios() {
    setUsuarios((await api<{ usuarios: FilaUsuario[] }>("/api/admin/usuarios")).usuarios);
  }
  async function recargarProyectos() {
    setProyectos((await api<{ proyectos: FilaProyecto[] }>("/api/admin/proyectos")).proyectos);
  }

  async function accion(clave: string, fn: () => Promise<string | void>) {
    setOcupado(clave);
    setAviso(null);
    try {
      const texto = await fn();
      if (texto) setAviso({ tipo: "ok", texto });
    } catch (e) {
      setAviso({ tipo: "error", texto: (e as ErrorApi).message });
    } finally {
      setOcupado(null);
      setConfirmar(null);
    }
  }

  const agregarUsuario = () =>
    accion("nuevo-usuario", async () => {
      await api("/api/admin/usuarios", { method: "POST", json: { email: nEmail, nombre: nNombre, rol: nRol } });
      await recargarUsuarios();
      const e = nEmail.trim().toLowerCase();
      setNEmail("");
      setNNombre("");
      return `${e} agregado. Ingresa con el código inicial y deberá cambiarlo. Pídele que entre hoy.`;
    });

  const patchUsuario = (u: FilaUsuario, cambios: Record<string, unknown>, texto: string) =>
    accion(u.id, async () => {
      await api(`/api/admin/usuarios/${u.id}`, { method: "PATCH", json: cambios });
      await recargarUsuarios();
      return texto;
    });

  const eliminarUsuario = (u: FilaUsuario) =>
    accion(u.id, async () => {
      const r = await api<{ accion: string }>(`/api/admin/usuarios/${u.id}`, { method: "DELETE" });
      await recargarUsuarios();
      return r.accion === "eliminado"
        ? `${u.email} eliminado.`
        : `${u.email} tiene registros: se desactivó (sin acceso) para conservar su historial.`;
    });

  const agregarProyecto = () =>
    accion("nuevo-proyecto", async () => {
      await api("/api/admin/proyectos", {
        method: "POST",
        json: {
          codigo: pCodigo,
          nombre: pNombre,
          presupuesto_clp: Number(pPresupuesto || 0),
          fecha_inicio: pInicio,
          fecha_entrega_objetivo: pEntrega,
        },
      });
      await recargarProyectos();
      setPCodigo("");
      setPNombre("");
      setPPresupuesto("");
      setPEntrega("");
      return "Proyecto creado.";
    });

  const cambiarEstadoProyecto = (p: FilaProyecto, estado: FilaProyecto["estado"]) =>
    accion(p.id, async () => {
      await api(`/api/admin/proyectos/${p.id}`, { method: "PATCH", json: { estado } });
      await recargarProyectos();
      return `${p.codigo}: ${estado}.`;
    });

  return (
    <div className="min-h-dvh">
      <header className="border-b border-aether-border bg-aether-card/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aether-muted">Aether Ops</p>
            <p className="text-base font-bold text-white">Administración</p>
          </div>
          <nav className="flex items-center gap-5 text-xs">
            <Link href="/checkin" className="text-slate-400 hover:text-white">Mi jornada</Link>
            <Link href="/cambiar-pin" className="flex items-center gap-1 text-slate-400 hover:text-white"><KeyRound size={13} /> Mi código</Link>
            <span className="text-slate-500">{yo.nombre}</span>
            <BotonSalir />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 grid grid-cols-3 gap-3 text-xs">
          {["Panel standup diario", "Capacidad 14 días", "Validación financiera"].map((t) => (
            <div key={t} className="rounded-xl border border-dashed border-aether-border px-4 py-3 text-slate-500">
              {t} <span className="text-slate-600">· siguiente etapa</span>
            </div>
          ))}
        </div>

        <div className="mb-5 flex gap-2">
          <button onClick={() => setPestana("equipo")} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold", pestana === "equipo" ? "bg-aether-accent text-white" : "text-slate-400 hover:bg-white/5")}>
            <Users size={14} /> Equipo ({usuarios.filter((u) => u.activo).length})
          </button>
          <button onClick={() => setPestana("proyectos")} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold", pestana === "proyectos" ? "bg-aether-accent text-white" : "text-slate-400 hover:bg-white/5")}>
            <FolderKanban size={14} /> Proyectos ({proyectos.length})
          </button>
        </div>

        {aviso && (
          <p role="status" className={cx("mb-4 rounded-lg px-3 py-2 text-xs", aviso.tipo === "ok" ? "bg-aether-success/10 text-aether-success" : "bg-aether-danger/10 text-aether-danger")}>
            {aviso.texto}
          </p>
        )}

        {pestana === "equipo" ? (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); agregarUsuario(); }}
              className="tarjeta mb-5 grid grid-cols-[2fr_2fr_1.3fr_auto] items-end gap-3 p-4"
            >
              <div>
                <label htmlFor="n-email" className="etiqueta">Email</label>
                <input id="n-email" type="email" required value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="nombre@aether.cl" className="campo text-sm" />
              </div>
              <div>
                <label htmlFor="n-nombre" className="etiqueta">Nombre</label>
                <input id="n-nombre" required value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Nombre Apellido" className="campo text-sm" />
              </div>
              <div>
                <label htmlFor="n-rol" className="etiqueta">Rol</label>
                <select id="n-rol" value={nRol} onChange={(e) => setNRol(e.target.value as FilaUsuario["rol"])} className="campo text-sm">
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <button type="submit" disabled={ocupado !== null} className="flex h-[46px] items-center gap-1.5 rounded-lg bg-aether-accent px-4 text-xs font-bold text-white disabled:opacity-50">
                {ocupado === "nuevo-usuario" ? <LoaderCircle size={14} className="animate-spin" /> : <UserPlus size={14} />} Agregar
              </button>
            </form>

            <div className="tarjeta overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-aether-border text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Persona</th>
                    <th className="px-4 py-3 font-medium">Rol</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium">Último acceso</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aether-border">
                  {usuarios.map((u) => {
                    const est = estadoUsuario(u);
                    const soyYo = u.id === yo.id;
                    return (
                      <tr key={u.id} className={cx(!u.activo && "opacity-60")}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">{u.nombre}{soyYo && <span className="ml-1 text-slate-500">(tú)</span>}</p>
                          <p className="text-slate-500">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Rol de ${u.nombre}`}
                            value={u.rol}
                            disabled={soyYo || !u.activo || ocupado !== null}
                            onChange={(e) => patchUsuario(u, { rol: e.target.value }, `Rol de ${u.email} actualizado. Sus sesiones abiertas se cerraron.`)}
                            className="rounded-md border border-aether-border bg-aether-bg px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
                            style={{ fontSize: 12 }}
                          >
                            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", est.clase)}>
                            {est.texto === "Bloqueado" && <Lock size={10} />}{est.texto}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{u.ultimo_acceso ? fmtFechaHora.format(new Date(u.ultimo_acceso)) : "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {ocupado === u.id && <LoaderCircle size={14} className="mr-1 animate-spin text-slate-400" />}
                            {u.activo ? (
                              <>
                                {!soyYo && (
                                  <button
                                    type="button"
                                    title="Volver al código inicial (cierra sus sesiones)"
                                    disabled={ocupado !== null}
                                    onClick={() => patchUsuario(u, { resetear_pin: true }, `Código de ${u.email} reseteado al inicial; deberá cambiarlo al ingresar.`)}
                                    className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"
                                  >
                                    <RotateCcw size={13} /> Resetear código
                                  </button>
                                )}
                                {!soyYo &&
                                  (confirmar === u.id ? (
                                    <button type="button" onClick={() => eliminarUsuario(u)} className="rounded-md bg-aether-danger px-2 py-1 font-semibold text-white">
                                      ¿{u.tiene_historial ? "Desactivar" : "Eliminar"}?
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      title={u.tiene_historial ? "Tiene registros: se desactiva y conserva su historial" : "Eliminar acceso"}
                                      disabled={ocupado !== null}
                                      onClick={() => setConfirmar(u.id)}
                                      className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-400 hover:bg-aether-danger/10 hover:text-aether-danger"
                                    >
                                      <Trash2 size={13} /> Quitar
                                    </button>
                                  ))}
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                onClick={() => patchUsuario(u, { activo: true, resetear_pin: true }, `${u.email} reactivado con código inicial.`)}
                                className="rounded-md px-2 py-1 text-aether-accent-soft hover:bg-white/5"
                              >
                                Reactivar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); agregarProyecto(); }}
              className="tarjeta mb-5 grid grid-cols-[1.2fr_2fr_1.2fr_1fr_1fr_auto] items-end gap-3 p-4"
            >
              <div>
                <label htmlFor="p-codigo" className="etiqueta">Código</label>
                <input id="p-codigo" required value={pCodigo} onChange={(e) => setPCodigo(e.target.value.toUpperCase())} placeholder="AETH-SEN-01" className="campo font-mono text-sm" />
              </div>
              <div>
                <label htmlFor="p-nombre" className="etiqueta">Nombre</label>
                <input id="p-nombre" required value={pNombre} onChange={(e) => setPNombre(e.target.value)} placeholder="Sensor IoT v2.1" className="campo text-sm" />
              </div>
              <div>
                <label htmlFor="p-presupuesto" className="etiqueta">Presupuesto CLP</label>
                <input id="p-presupuesto" inputMode="numeric" required value={pPresupuesto ? miles(Number(pPresupuesto)) : ""} onChange={(e) => setPPresupuesto(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="5.000.000" className="campo text-sm tabular-nums" />
              </div>
              <div>
                <label htmlFor="p-inicio" className="etiqueta">Inicio</label>
                <input id="p-inicio" type="date" required value={pInicio} onChange={(e) => setPInicio(e.target.value)} className="campo text-sm" />
              </div>
              <div>
                <label htmlFor="p-entrega" className="etiqueta">Entrega objetivo</label>
                <input id="p-entrega" type="date" required min={pInicio} value={pEntrega} onChange={(e) => setPEntrega(e.target.value)} className="campo text-sm" />
              </div>
              <button type="submit" disabled={ocupado !== null} className="flex h-[46px] items-center gap-1.5 rounded-lg bg-aether-accent px-4 text-xs font-bold text-white disabled:opacity-50">
                {ocupado === "nuevo-proyecto" && <LoaderCircle size={14} className="animate-spin" />} Crear
              </button>
            </form>

            <div className="tarjeta overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-aether-border text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Código</th>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 text-right font-medium">Presupuesto</th>
                    <th className="px-4 py-3 font-medium">Inicio</th>
                    <th className="px-4 py-3 font-medium">Entrega objetivo</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aether-border">
                  {proyectos.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Sin proyectos. El equipo necesita al menos uno activo para registrar objetivos.</td></tr>
                  )}
                  {proyectos.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono font-semibold text-aether-accent-soft">{p.codigo}</td>
                      <td className="px-4 py-3 text-white">{p.nombre}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{clp(p.presupuesto_clp)}</td>
                      <td className="px-4 py-3 text-slate-400">{p.fecha_inicio}</td>
                      <td className={cx("px-4 py-3", p.fecha_entrega_objetivo < hoy && !["entregado", "pausado"].includes(p.estado) ? "text-aether-danger" : "text-slate-400")}>
                        {p.fecha_entrega_objetivo}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Estado de ${p.codigo}`}
                          value={p.estado}
                          disabled={ocupado !== null}
                          onChange={(e) => cambiarEstadoProyecto(p, e.target.value as FilaProyecto["estado"])}
                          className="rounded-md border border-aether-border bg-aether-bg px-2 py-1 text-xs capitalize text-slate-200"
                          style={{ fontSize: 12 }}
                        >
                          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
