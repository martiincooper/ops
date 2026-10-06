"use client";

import { LoaderCircle, Pencil, Receipt, Repeat } from "lucide-react";
import { useState } from "react";
import FormGasto, { NOMBRE_TIPO_COSTO } from "@/components/FormGasto";
import { SelectPago } from "@/components/EstadoPago";
import { CodigosProyecto } from "@/components/SelectorProyectos";
import { Insignia, type Tono } from "@/components/ui";
import type { GastoResumen, ProyectoActivo } from "@/lib/dominio";
import type { EstadoPago } from "@/lib/esquemas";
import { ErrorApi, api, clp } from "@/lib/cliente";

const ESTADO: Record<GastoResumen["estado"], Tono> = { pendiente: "alerta", aprobado: "ok", rechazado: "error" };

const fmtFecha = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Santiago" });
const fmtFechaAnio = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" });
/** "lun, 6 oct" este año; "29 dic 2025" otros años. */
const fecha = (iso: string) => {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? fmtFecha.format(d) : fmtFechaAnio.format(d);
};

/**
 * Compras propias con su estado de validación y de pago. El estado de pago se cambia aquí mismo (por enviar → esperando
 * pago → comprada); el resto de los campos con «Editar», en cualquier estado de validación (también aprobadas o
 * rechazadas: precio final, envío, impuesto de aduana…). La validación se conserva.
 */
export default function ListaCompras({
  gastos,
  proyectos,
  conFecha = false,
  onCambio,
}: {
  gastos: GastoResumen[];
  proyectos: ProyectoActivo[];
  conFecha?: boolean;
  onCambio: () => void | Promise<void>;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; texto: string } | null>(null);

  async function cambiarPago(g: GastoResumen, estado_pago: EstadoPago) {
    setOcupado(g.id);
    setError(null);
    try {
      await api(`/api/gastos/${g.id}`, { method: "PATCH", json: { estado_pago } });
      await onCambio();
    } catch (e) {
      setError({ id: g.id, texto: e instanceof ErrorApi ? e.message : "No se pudo guardar. Revisa tu conexión." });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <ul className="space-y-2">
      {gastos.map((g) =>
        editando === g.id ? (
          <li key={g.id}>
            <FormGasto
              proyectos={proyectos}
              inicial={g}
              onCancelar={() => setEditando(null)}
              onGuardado={async () => {
                setEditando(null);
                await onCambio();
              }}
            />
          </li>
        ) : (
          <li key={g.id} className="flex items-start gap-3 rounded-2xl bg-suave p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-superficie text-indigo">
              <Receipt size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium leading-snug text-tinta">{g.item}</p>
              {!conFecha && g.descripcion && <p className="line-clamp-2 text-sm text-tinta-3">{g.descripcion}</p>}
              {conFecha && <p className="text-xs capitalize text-tinta-3">{fecha(g.creado_en)}</p>}
              {g.tipo_costo !== "unico" && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-tinta">
                  <Repeat size={12} /> {NOMBRE_TIPO_COSTO[g.tipo_costo]}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <SelectPago id={`pago-${g.id}`} item={g.item} valor={g.estado_pago} disabled={ocupado !== null} onCambio={(e) => cambiarPago(g, e)} />
                {ocupado === g.id && <LoaderCircle size={14} className="animate-spin text-tinta-3" />}
                <CodigosProyecto codigos={g.proyectos} />
              </div>
              {error?.id === g.id && <p className="mt-1 text-xs text-error-tinta">{error.texto}</p>}
              {g.editado_por_nombre && <p className="mt-1 text-[11px] text-tinta-3">Editada por {g.editado_por_nombre}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold tabular-nums text-tinta">{clp(g.monto_clp)}</span>
              {g.envio_clp > 0 && <span className="whitespace-nowrap text-xs tabular-nums text-tinta-3">incl. envío {clp(g.envio_clp)}</span>}
              {g.impuesto_clp > 0 && <span className="whitespace-nowrap text-xs tabular-nums text-tinta-3">incl. impuesto {clp(g.impuesto_clp)}</span>}
              <Insignia tono={ESTADO[g.estado]}>{g.estado}</Insignia>
              <button
                type="button"
                onClick={() => setEditando(g.id)}
                aria-label={`Editar compra: ${g.item}`}
                className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-indigo-tinta hover:bg-superficie"
              >
                <Pencil size={12} /> Editar
              </button>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
