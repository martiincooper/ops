"use client";

import { LoaderCircle, Lock, RotateCcw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { api, cx } from "@/lib/cliente";
import { Aviso, Cargando, fechaHora, useAccion, useDatos, type Yo } from "./comun";

interface Admin {
  id: string;
  nombre: string;
  email: string;
  activo: number;
  debe_cambiar_pin: number;
  ultimo_acceso: string | null;
  bloqueado_hasta: string | null;
  supervisados: number;
}

function estado(a: Admin) {
  if (!a.activo) return { texto: "Desactivado", clase: "text-slate-500 bg-slate-500/10" };
  if (a.bloqueado_hasta && new Date(a.bloqueado_hasta) > new Date()) return { texto: "Bloqueado", clase: "text-aether-danger bg-aether-danger/10" };
  if (a.debe_cambiar_pin) return { texto: "Sin primer ingreso", clase: "text-aether-warning bg-aether-warning/10" };
  return { texto: "Activo", clase: "text-aether-success bg-aether-success/10" };
}

export default function Administradores({ yo }: { yo: Yo }) {
  const { datos, error, cargando, recargar } = useDatos<{ admins: Admin[] }>("/api/admin/administradores");
  const { ocupado, aviso, ejecutar } = useAccion();
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const admins = datos?.admins ?? [];

  const patch = (a: Admin, cambios: Record<string, unknown>, texto: string) =>
    ejecutar(a.id, async () => {
      await api(`/api/admin/administradores/${a.id}`, { method: "PATCH", json: cambios });
      await recargar();
      return texto;
    });

  return (
    <div>
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-aether-border bg-aether-card px-4 py-3 text-xs text-slate-400">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-aether-accent-soft" />
        Los administradores (jefatura intermedia) usan este mismo tablero: cambian de empresa con el selector, gestionan
        cuentas y proyectos de ambas, validan compras y supervisan a los integrantes que se les asignen. El email puede ser de
        cualquier dominio.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar("nuevo", async () => {
            await api("/api/admin/administradores", { method: "POST", json: { email, nombre } });
            await recargar();
            const e2 = email.trim().toLowerCase();
            setEmail("");
            setNombre("");
            return `${e2} es administrador. Ingresa con el código inicial y deberá cambiarlo. Asígnale supervisados en Equipo.`;
          });
        }}
        className="tarjeta mb-5 grid grid-cols-[2fr_2fr_auto] items-end gap-3 p-4"
      >
        <div>
          <label htmlFor="a-email" className="etiqueta">Email (cualquier dominio)</label>
          <input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@dominio.com" className="campo text-sm" />
        </div>
        <div>
          <label htmlFor="a-nombre" className="etiqueta">Nombre</label>
          <input id="a-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre Apellido" className="campo text-sm" />
        </div>
        <button type="submit" disabled={ocupado !== null} className="flex h-[46px] items-center gap-1.5 rounded-lg bg-aether-accent px-4 text-xs font-bold text-white disabled:opacity-50">
          {ocupado === "nuevo" ? <LoaderCircle size={14} className="animate-spin" /> : <UserPlus size={14} />} Agregar administrador
        </button>
      </form>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {admins.length > 0 && (
        <div className="tarjeta overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-aether-border text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Administrador</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Supervisados</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-aether-border">
              {admins.map((a) => {
                const est = estado(a);
                const soyYo = a.id === yo.id;
                return (
                  <tr key={a.id} className={cx(!a.activo && "opacity-60")}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">
                        {a.nombre}
                        {soyYo && <span className="ml-1 text-slate-500">(tú)</span>}
                      </p>
                      <p className="text-slate-500">{a.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold", est.clase)}>
                        {est.texto === "Bloqueado" && <Lock size={10} />}
                        {est.texto}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{a.supervisados}</td>
                    <td className="px-4 py-3 text-slate-400">{fechaHora(a.ultimo_acceso)}</td>
                    <td className="px-4 py-3">
                      {!soyYo && (
                        <div className="flex items-center justify-end gap-1">
                          {ocupado === a.id && <LoaderCircle size={14} className="mr-1 animate-spin text-slate-400" />}
                          {a.activo ? (
                            <>
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                onClick={() => patch(a, { resetear_pin: true }, `Código de ${a.email} reseteado.`)}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"
                              >
                                <RotateCcw size={13} /> Resetear código
                              </button>
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                onClick={() => patch(a, { activo: false }, `${a.email} desactivado.`)}
                                className="rounded-md px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"
                              >
                                Desactivar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => patch(a, { activo: true, resetear_pin: true }, `${a.email} reactivado con código inicial.`)}
                              className="rounded-md px-2 py-1 text-aether-accent-soft hover:bg-white/5"
                            >
                              Reactivar
                            </button>
                          )}
                          {confirmar === a.id ? (
                            <button
                              type="button"
                              onClick={() =>
                                ejecutar(a.id, async () => {
                                  await api(`/api/admin/administradores/${a.id}`, { method: "DELETE" });
                                  setConfirmar(null);
                                  await recargar();
                                  return `${a.email} eliminado; sus supervisiones se quitaron.`;
                                })
                              }
                              className="rounded-md bg-aether-danger px-2 py-1 font-semibold text-white"
                            >
                              ¿Eliminar?
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => setConfirmar(a.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-slate-400 hover:bg-aether-danger/10 hover:text-aether-danger"
                            >
                              <Trash2 size={13} /> Quitar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
