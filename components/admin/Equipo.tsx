"use client";

import { Check, LoaderCircle, Lock, Pencil, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { api, cx } from "@/lib/cliente";
import { Aviso, Cargando, conEmpresa, fechaHora, useAccion, useDatos, type EmpresaPublica, type Yo } from "./comun";

interface Cuenta {
  id: string;
  nombre: string;
  email: string;
  rol: "team" | "executive";
  activo: number;
  debe_cambiar_pin: number;
  ultimo_acceso: string | null;
  bloqueado_hasta: string | null;
  tiene_historial: number;
  supervisores: { id: string; nombre: string }[];
}

interface AdminLista {
  id: string;
  nombre: string;
  email: string;
  activo: number;
}

const ROLES = { team: "Equipo", executive: "Gerencia" } as const;

function estadoCuenta(u: Cuenta) {
  if (!u.activo) return { texto: "Desactivada", clase: "text-slate-500 bg-slate-500/10" };
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) return { texto: "Bloqueada", clase: "text-aether-danger bg-aether-danger/10" };
  if (u.debe_cambiar_pin) return { texto: "Sin primer ingreso", clase: "text-aether-warning bg-aether-warning/10" };
  return { texto: "Activa", clase: "text-aether-success bg-aether-success/10" };
}

function SelectorSupervisores({
  admins,
  valor,
  onCambio,
}: {
  admins: AdminLista[];
  valor: string[];
  onCambio: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {admins
        .filter((a) => a.activo || valor.includes(a.id))
        .map((a) => {
          const on = valor.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              onClick={() => onCambio(on ? valor.filter((x) => x !== a.id) : [...valor, a.id])}
              className={cx(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                on ? "border-aether-accent bg-aether-accent/15 text-aether-accent-soft" : "border-aether-border text-slate-400 hover:text-slate-200",
              )}
            >
              {on && <Check size={11} />} {a.nombre}
            </button>
          );
        })}
    </div>
  );
}

export default function Equipo({ empresa, yo }: { empresa: EmpresaPublica; yo: Yo }) {
  const { datos, error, cargando, recargar } = useDatos<{ usuarios: Cuenta[] }>(conEmpresa("/api/admin/usuarios", empresa.clave));
  const { datos: dAdmins } = useDatos<{ admins: AdminLista[] }>("/api/admin/administradores");
  const admins = dAdmins?.admins ?? [];
  const { ocupado, aviso, ejecutar } = useAccion();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; sup: string[] } | null>(null);

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Cuenta["rol"]>("team");
  const [sup, setSup] = useState<string[]>([yo.id]);

  const usuarios = datos?.usuarios ?? [];
  const url = (id: string) => conEmpresa(`/api/admin/usuarios/${id}`, empresa.clave);

  const patch = (u: Cuenta, cambios: Record<string, unknown>, texto: string) =>
    ejecutar(u.id, async () => {
      await api(url(u.id), { method: "PATCH", json: cambios });
      await recargar();
      return texto;
    });

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar("nuevo", async () => {
            await api(conEmpresa("/api/admin/usuarios", empresa.clave), {
              method: "POST",
              json: { email, nombre, rol, ...(rol === "team" ? { supervisores: sup } : {}) },
            });
            await recargar();
            const e2 = email.trim().toLowerCase();
            setEmail("");
            setNombre("");
            return `${e2} agregado a ${empresa.nombre}. Ingresa con el código inicial y deberá cambiarlo; pídele que entre hoy.`;
          });
        }}
        className="tarjeta mb-5 space-y-3 p-4"
      >
        <div className="grid grid-cols-[2fr_2fr_1.2fr_auto] items-end gap-3">
          <div>
            <label htmlFor="n-email" className="etiqueta">Email ({empresa.dominios.map((d) => "@" + d).join(", ")})</label>
            <input id="n-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`nombre@${empresa.dominios[0]}`} className="campo text-sm" />
          </div>
          <div>
            <label htmlFor="n-nombre" className="etiqueta">Nombre</label>
            <input id="n-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre Apellido" className="campo text-sm" />
          </div>
          <div>
            <label htmlFor="n-rol" className="etiqueta">Rol</label>
            <select id="n-rol" value={rol} onChange={(e) => setRol(e.target.value as Cuenta["rol"])} className="campo text-sm">
              <option value="team">Equipo</option>
              <option value="executive">Gerencia</option>
            </select>
          </div>
          <button type="submit" disabled={ocupado !== null} className="flex h-[46px] items-center gap-1.5 rounded-lg bg-aether-accent px-4 text-xs font-bold text-white disabled:opacity-50">
            {ocupado === "nuevo" ? <LoaderCircle size={14} className="animate-spin" /> : <UserPlus size={14} />} Agregar
          </button>
        </div>
        {rol === "team" ? (
          <div className="flex items-center gap-3">
            <span className="etiqueta mb-0 shrink-0">Supervisado por</span>
            <SelectorSupervisores admins={admins} valor={sup} onCambio={setSup} />
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Gerencia ve el tablero de {empresa.nombre} completo; no tiene supervisores.</p>
        )}
      </form>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />

      {usuarios.length > 0 && (
        <div className="tarjeta overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-aether-border text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Persona</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Supervisado por</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-aether-border">
              {usuarios.map((u) => {
                const est = estadoCuenta(u);
                const enEdicion = editando?.id === u.id;
                return (
                  <tr key={u.id} className={cx(!u.activo && "opacity-60")}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{u.nombre}</p>
                      <p className="text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Rol de ${u.nombre}`}
                        value={u.rol}
                        disabled={!u.activo || ocupado !== null}
                        onChange={(e) => patch(u, { rol: e.target.value }, `Rol de ${u.email} actualizado. Sus sesiones abiertas se cerraron.`)}
                        className="rounded-md border border-aether-border bg-aether-bg px-2 py-1 text-slate-200"
                        style={{ fontSize: 12 }}
                      >
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.rol !== "team" ? (
                        <span className="text-slate-600">—</span>
                      ) : enEdicion ? (
                        <div className="space-y-2">
                          <SelectorSupervisores admins={admins} valor={editando.sup} onCambio={(v) => setEditando({ id: u.id, sup: v })} />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await patch(u, { supervisores: editando.sup }, `Supervisión de ${u.nombre} actualizada.`);
                                if (ok) setEditando(null);
                              }}
                              className="rounded-md bg-aether-accent px-2 py-1 font-semibold text-white"
                            >
                              Guardar
                            </button>
                            <button type="button" onClick={() => setEditando(null)} className="px-2 py-1 text-slate-400">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!u.activo}
                          onClick={() => setEditando({ id: u.id, sup: u.supervisores.map((s) => s.id) })}
                          className="group flex flex-wrap items-center gap-1 text-left"
                        >
                          {u.supervisores.length === 0 ? (
                            <span className="text-aether-warning">Sin supervisor</span>
                          ) : (
                            u.supervisores.map((s) => (
                              <span key={s.id} className={cx("rounded-full px-2 py-0.5 text-[11px]", s.id === yo.id ? "bg-aether-accent/15 text-aether-accent-soft" : "bg-white/5 text-slate-300")}>
                                {s.id === yo.id ? "Yo" : s.nombre}
                              </span>
                            ))
                          )}
                          {u.activo ? <Pencil size={11} className="text-slate-600 group-hover:text-slate-300" /> : null}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", est.clase)}>
                        {est.texto === "Bloqueada" && <Lock size={10} />}
                        {est.texto}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fechaHora(u.ultimo_acceso)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {ocupado === u.id && <LoaderCircle size={14} className="mr-1 animate-spin text-slate-400" />}
                        {u.activo ? (
                          <>
                            <button
                              type="button"
                              title="Volver al código inicial (cierra sus sesiones)"
                              disabled={ocupado !== null}
                              onClick={() => patch(u, { resetear_pin: true }, `Código de ${u.email} reseteado; deberá cambiarlo al ingresar.`)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"
                            >
                              <RotateCcw size={13} /> Resetear código
                            </button>
                            {confirmar === u.id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  ejecutar(u.id, async () => {
                                    const r = await api<{ accion: string }>(url(u.id), { method: "DELETE" });
                                    setConfirmar(null);
                                    await recargar();
                                    return r.accion === "eliminado"
                                      ? `${u.email} eliminado.`
                                      : `${u.email} tiene registros: se desactivó (sin acceso) para conservar su historial.`;
                                  })
                                }
                                className="rounded-md bg-aether-danger px-2 py-1 font-semibold text-white"
                              >
                                ¿{u.tiene_historial ? "Desactivar" : "Eliminar"}?
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                onClick={() => setConfirmar(u.id)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-400 hover:bg-aether-danger/10 hover:text-aether-danger"
                              >
                                <Trash2 size={13} /> Quitar
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={ocupado !== null}
                            onClick={() => patch(u, { activo: true, resetear_pin: true }, `${u.email} reactivado con código inicial.`)}
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
      )}
      {datos && usuarios.length === 0 && (
        <p className="tarjeta px-4 py-6 text-center text-xs text-slate-500">{empresa.nombre} aún no tiene cuentas. Agrega la primera arriba.</p>
      )}
    </div>
  );
}
