"use client";

import { Pencil, Receipt, Repeat } from "lucide-react";
import { useState } from "react";
import FormGasto, { NOMBRE_TIPO_COSTO } from "@/components/FormGasto";
import { CodigosProyecto } from "@/components/SelectorProyectos";
import { Insignia, type Tono } from "@/components/ui";
import type { GastoResumen, ProyectoActivo } from "@/lib/dominio";
import { clp } from "@/lib/cliente";

const ESTADO: Record<GastoResumen["estado"], Tono> = { pendiente: "alerta", aprobado: "ok", rechazado: "error" };

const fmtFecha = new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Santiago" });

/**
 * Compras propias con su estado. Cada una se puede editar en cualquier estado (precio final, envío, impuesto de
 * aduana que llega después de aprobada…); la validación se conserva.
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
              {conFecha && <p className="text-xs capitalize text-tinta-3">{fmtFecha.format(new Date(g.creado_en))}</p>}
              {g.tipo_costo !== "unico" && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-tinta">
                  <Repeat size={12} /> {NOMBRE_TIPO_COSTO[g.tipo_costo]}
                </p>
              )}
              <CodigosProyecto codigos={g.proyectos} className="mt-1.5" />
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
