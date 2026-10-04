"use client";

import { Ban, Check, LoaderCircle, Lock, Pencil, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { Fragment, useState } from "react";
import { Avatar } from "@/components/ui";
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
  jornadas: number;
  compras: number;
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
  if (!u.activo) return { texto: "Desactivada", clase: "text-tinta-3 bg-suave" };
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) return { texto: "Bloqueada", clase: "text-error-tinta bg-error-fondo" };
  if (u.debe_cambiar_pin) return { texto: "Sin primer ingreso", clase: "text-alerta-tinta bg-alerta-fondo" };
  return { texto: "Activa", clase: "text-ok-tinta bg-ok-fondo" };
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
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                on ? "bg-indigo text-white" : "bg-superficie text-tinta-2 ring-1 ring-linea hover:ring-indigo/40",
              )}
            >
              {on && <Check size={11} />} {a.nombre}
            </button>
          );
        })}
    </div>
  );
}

/** Confirmación de eliminación definitiva; si hay registros, elige a qué administrador pasan. */
function ConfirmarEliminacion({
  u,
  admins,
  yo,
  ocupado,
  onEliminar,
  onCancelar,
}: {
  u: Cuenta;
  admins: AdminLista[];
  yo: Yo;
  ocupado: boolean;
  onEliminar: (asignarA: string | null) => void;
  onCancelar: () => void;
}) {
  const activos = admins.filter((a) => a.activo);
  const supervisor = u.supervisores.find((s) => activos.some((a) => a.id === s.id));
  const [destino, setDestino] = useState(supervisor?.id ?? yo.id);
  const conRegistros = u.jornadas + u.compras > 0;
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-error-fondo/70 p-4 text-sm">
      <Trash2 size={18} className="shrink-0 text-error-tinta" aria-hidden />
      <p className="min-w-0 flex-1 basis-64 text-tinta">
        <b className="font-semibold">Eliminar a {u.nombre} definitivamente.</b> No se puede deshacer.
        {conRegistros ? (
          <span className="mt-1 flex flex-wrap items-center gap-2 text-tinta-2">
            <label htmlFor={`dest-${u.id}`}>
              Sus {[u.jornadas ? plural(u.jornadas, "jornada") : null, u.compras ? plural(u.compras, "compra") : null].filter(Boolean).join(" y ")} pasan a
            </label>
            <select
              id={`dest-${u.id}`}
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="rounded-full border-0 bg-superficie px-3 py-1.5 text-sm text-tinta"
            >
              {activos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                  {u.supervisores.some((s) => s.id === a.id) ? " (supervisa)" : a.id === yo.id ? " (tú)" : ""}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <span className="block text-tinta-2">No tiene jornadas ni compras.</span>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onEliminar(conRegistros ? destino : null)}
          className="inline-flex items-center gap-1.5 rounded-full bg-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {ocupado && <LoaderCircle size={14} className="animate-spin" />} Eliminar definitivamente
        </button>
        <button type="button" onClick={onCancelar} className="boton-texto">Cancelar</button>
      </div>
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
        className="tarjeta mb-6 space-y-4 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[2fr_2fr_1.2fr_auto] md:items-end">
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
          <button type="submit" disabled={ocupado !== null} className="boton h-[50px] px-5">
            {ocupado === "nuevo" ? <LoaderCircle size={14} className="animate-spin" /> : <UserPlus size={14} />} Agregar
          </button>
        </div>
        {rol === "team" ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="etiqueta mb-0 shrink-0">Supervisado por</span>
            <SelectorSupervisores admins={admins} valor={sup} onCambio={setSup} />
          </div>
        ) : (
          <p className="text-sm text-tinta-3">Gerencia ve el tablero de {empresa.nombre} completo; no tiene supervisores.</p>
        )}
      </form>

      <Aviso aviso={aviso} />
      <Cargando cargando={cargando && !datos} error={error} />

      {usuarios.length > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Rol</th>
                <th>Supervisado por</th>
                <th>Estado</th>
                <th>Último acceso</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const est = estadoCuenta(u);
                const enEdicion = editando?.id === u.id;
                return (
                  <Fragment key={u.id}>
                  <tr className={cx(!u.activo && confirmar !== u.id && "opacity-60")}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar nombre={u.nombre} tamano={36} />
                        <span>
                          <span className="block font-semibold text-tinta">{u.nombre}</span>
                          <span className="block text-xs text-tinta-3">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <select
                        aria-label={`Rol de ${u.nombre}`}
                        value={u.rol}
                        disabled={!u.activo || ocupado !== null}
                        onChange={(e) => patch(u, { rol: e.target.value }, `Rol de ${u.email} actualizado. Sus sesiones abiertas se cerraron.`)}
                        className="rounded-full border-0 bg-suave px-3 py-1.5 text-tinta"
                        style={{ fontSize: 12 }}
                      >
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td>
                      {u.rol !== "team" ? (
                        <span className="text-tinta-3">—</span>
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
                              className="rounded-full bg-indigo px-3 py-1 text-xs font-semibold text-white"
                            >
                              Guardar
                            </button>
                            <button type="button" onClick={() => setEditando(null)} className="boton-texto px-2.5 py-1 text-xs">Cancelar</button>
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
                            <span className="text-alerta-tinta">Sin supervisor</span>
                          ) : (
                            u.supervisores.map((s) => (
                              <span key={s.id} className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", s.id === yo.id ? "bg-indigo-suave text-indigo-tinta" : "bg-suave text-tinta-2")}>
                                {s.id === yo.id ? "Yo" : s.nombre}
                              </span>
                            ))
                          )}
                          {u.activo ? <Pencil size={13} className="text-tinta-3 group-hover:text-indigo" /> : null}
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={cx("chip", est.clase)}>
                        {est.texto === "Bloqueada" && <Lock size={10} />}
                        {est.texto}
                      </span>
                    </td>
                    <td className="text-tinta-3">{fechaHora(u.ultimo_acceso)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {ocupado === u.id && <LoaderCircle size={14} className="mr-1 animate-spin text-tinta-3" />}
                        {u.activo ? (
                          <>
                            <button
                              type="button"
                              title="Volver al código inicial (cierra sus sesiones)"
                              disabled={ocupado !== null}
                              onClick={() => patch(u, { resetear_pin: true }, `Código de ${u.email} reseteado; deberá cambiarlo al ingresar.`)}
                              className="boton-texto px-2.5 py-1 text-xs"
                            >
                              <RotateCcw size={13} /> Resetear código
                            </button>
                            <button
                              type="button"
                              title="Sin acceso, conserva todo; se puede reactivar"
                              disabled={ocupado !== null}
                              onClick={() => patch(u, { activo: false }, `${u.email} desactivada: ya no puede ingresar. Sus registros se conservan.`)}
                              className="boton-texto px-2.5 py-1 text-xs"
                            >
                              <Ban size={13} /> Desactivar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={ocupado !== null}
                            onClick={() => patch(u, { activo: true, resetear_pin: true }, `${u.email} reactivada con código inicial.`)}
                            className="rounded-full px-3 py-1 text-xs font-semibold text-indigo-tinta hover:bg-indigo-suave"
                          >
                            Reactivar
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={ocupado !== null}
                          aria-expanded={confirmar === u.id}
                          onClick={() => setConfirmar(confirmar === u.id ? null : u.id)}
                          className={cx(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                            confirmar === u.id ? "bg-error-fondo text-error-tinta" : "text-tinta-2 hover:bg-error-fondo hover:text-error-tinta",
                          )}
                        >
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {confirmar === u.id && (
                    <tr>
                      <td colSpan={6}>
                        <ConfirmarEliminacion
                          u={u}
                          admins={admins}
                          yo={yo}
                          ocupado={ocupado === u.id}
                          onCancelar={() => setConfirmar(null)}
                          onEliminar={(asignarA) =>
                            ejecutar(u.id, async () => {
                              const r = await api<{ jornadas: number; compras: number; asignado_a: string | null }>(
                                conEmpresa(`/api/admin/usuarios/${u.id}`, empresa.clave, asignarA ? { asignar_a: asignarA } : {}),
                                { method: "DELETE" },
                              );
                              setConfirmar(null);
                              await recargar();
                              return r.asignado_a
                                ? `${u.email} eliminada. Sus registros (${r.jornadas} jornada(s), ${r.compras} compra(s)) quedaron a nombre de ${r.asignado_a}.`
                                : `${u.email} eliminada.`;
                            })
                          }
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {datos && usuarios.length === 0 && (
        <p className="tarjeta px-6 py-10 text-center text-sm text-tinta-3">{empresa.nombre} aún no tiene cuentas. Agrega la primera arriba.</p>
      )}
    </div>
  );
}
