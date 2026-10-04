"use client";

import { Ban, LoaderCircle, Lock, RotateCcw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui";
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
  if (!a.activo) return { texto: "Desactivado", clase: "text-tinta-3 bg-suave" };
  if (a.bloqueado_hasta && new Date(a.bloqueado_hasta) > new Date()) return { texto: "Bloqueado", clase: "text-error-tinta bg-error-fondo" };
  if (a.debe_cambiar_pin) return { texto: "Sin primer ingreso", clase: "text-alerta-tinta bg-alerta-fondo" };
  return { texto: "Activo", clase: "text-ok-tinta bg-ok-fondo" };
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
      <p className="tarjeta mb-6 flex items-start gap-3 px-5 py-4 text-sm text-tinta-2">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-indigo" />
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
        className="tarjeta mb-6 grid gap-3 p-5 md:grid-cols-[2fr_2fr_auto] md:items-end"
      >
        <div>
          <label htmlFor="a-email" className="etiqueta">Email (cualquier dominio)</label>
          <input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@dominio.com" className="campo text-sm" />
        </div>
        <div>
          <label htmlFor="a-nombre" className="etiqueta">Nombre</label>
          <input id="a-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre Apellido" className="campo text-sm" />
        </div>
        <button type="submit" disabled={ocupado !== null} className="boton h-[50px] px-5">
          {ocupado === "nuevo" ? <LoaderCircle size={14} className="animate-spin" /> : <UserPlus size={14} />} Agregar administrador
        </button>
      </form>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />
      {admins.length > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Administrador</th>
                <th>Estado</th>
                <th className="text-right">Supervisados</th>
                <th>Último acceso</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const est = estado(a);
                const soyYo = a.id === yo.id;
                return (
                  <tr key={a.id} className={cx(!a.activo && "opacity-60")}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar nombre={a.nombre} tamano={36} />
                        <span>
                          <span className="block font-semibold text-tinta">
                            {a.nombre}
                            {soyYo && <span className="ml-1 font-normal text-tinta-3">(tú)</span>}
                          </span>
                          <span className="block text-xs text-tinta-3">{a.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={cx("chip", est.clase)}>
                        {est.texto === "Bloqueado" && <Lock size={10} />}
                        {est.texto}
                      </span>
                    </td>
                    <td className="text-right text-tinta-2">{a.supervisados}</td>
                    <td className="text-tinta-3">{fechaHora(a.ultimo_acceso)}</td>
                    <td>
                      {!soyYo && (
                        <div className="flex items-center justify-end gap-1">
                          {ocupado === a.id && <LoaderCircle size={14} className="mr-1 animate-spin text-tinta-3" />}
                          {a.activo ? (
                            <>
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                onClick={() => patch(a, { resetear_pin: true }, `Código de ${a.email} reseteado.`)}
                                className="boton-texto px-2.5 py-1 text-xs"
                              >
                                <RotateCcw size={13} /> Resetear código
                              </button>
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                onClick={() => patch(a, { activo: false }, `${a.email} desactivado: ya no puede ingresar.`)}
                                title="Sin acceso; se puede reactivar"
                                className="boton-texto px-2.5 py-1 text-xs"
                              >
                                <Ban size={13} /> Desactivar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => patch(a, { activo: true, resetear_pin: true }, `${a.email} reactivado con código inicial.`)}
                              className="rounded-full px-3 py-1 text-xs font-semibold text-indigo-tinta hover:bg-indigo-suave"
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
                                  return `${a.email} eliminado definitivamente; sus supervisiones se quitaron (las validaciones que hizo conservan su nombre).`;
                                })
                              }
                              className="rounded-full bg-error px-3 py-1 text-xs font-semibold text-white"
                            >
                              ¿Eliminar definitivamente?
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={ocupado !== null}
                              onClick={() => setConfirmar(a.id)}
                              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-tinta-2 hover:bg-error-fondo hover:text-error-tinta"
                            >
                              <Trash2 size={13} /> Eliminar
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
