"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ESTADO_PAGO } from "@/components/EstadoPago";
import type { GastoResumen, ProyectoActivo } from "@/lib/dominio";
import { ESTADOS_PAGO, type EstadoPago } from "@/lib/esquemas";
import { ErrorApi, api, clp, cx } from "@/lib/cliente";
import ListaCompras from "./ListaCompras";

/**
 * Todas las compras propias (no solo las de hoy), filtrables por estado de pago. Cada una se edita completa, en
 * cualquier estado de validación, y su estado de pago se cambia en la misma lista.
 */
export default function HistorialCompras({ proyectos }: { proyectos: ProyectoActivo[] }) {
  const [pago, setPago] = useState<EstadoPago | "todos">("todos");
  const [gastos, setGastos] = useState<GastoResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api<{ gastos: GastoResumen[] }>(pago === "todos" ? "/api/gastos" : `/api/gastos?pago=${pago}`);
      setGastos(r.gastos);
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar tus compras. Revisa tu conexión.");
    }
  }, [pago]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const total = (gastos ?? []).reduce((s, g) => s + g.monto_clp, 0);

  return (
    <div>
      <div className="-mx-1 mb-3 overflow-x-auto px-1">
        <div className="segmentos" role="group" aria-label="Filtrar por estado de pago">
          {(["todos", ...ESTADOS_PAGO] as const).map((e) => {
            const Icono = e === "todos" ? null : ESTADO_PAGO[e].Icono;
            return (
              <button
                key={e}
                type="button"
                aria-pressed={pago === e}
                onClick={() => setPago(e)}
                className={cx("segmento whitespace-nowrap", pago === e && "segmento-activo bg-superficie text-indigo-tinta shadow-sm")}
              >
                {Icono && <Icono size={13} aria-hidden className="mr-1 inline" />}
                {e === "todos" ? "Todas" : ESTADO_PAGO[e].corto}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="mb-2 rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}
      {gastos === null ? (
        !error && <LoaderCircle size={18} className="mx-auto my-4 animate-spin text-tinta-3" />
      ) : gastos.length === 0 ? (
        <p className="text-sm text-tinta-3">{pago === "todos" ? "Aún no registras compras." : `Sin compras en «${ESTADO_PAGO[pago].nombre}».`}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-tinta-3">
            {gastos.length} {gastos.length === 1 ? "compra" : "compras"} · <b className="font-semibold text-tinta-2">{clp(total)}</b>
          </p>
          <ListaCompras gastos={gastos} proyectos={proyectos} conFecha onCambio={cargar} />
        </>
      )}
    </div>
  );
}
