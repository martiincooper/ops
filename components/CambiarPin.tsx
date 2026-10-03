"use client";

import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import PinPad from "@/components/PinPad";
import { ErrorApi, api } from "@/lib/cliente";

type Paso = "actual" | "nuevo" | "confirmar";

// Reglas espejo de lib/pin.ts (el servidor vuelve a validar).
function motivoDebil(pin: string): string | null {
  if (pin === "000000" || /^(\d)\1{5}$/.test(pin)) return "No uses un mismo dígito repetido";
  const d = pin.split("").map(Number);
  if (d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10) || d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10)) {
    return "No uses secuencias consecutivas";
  }
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return "No uses patrones repetidos";
  return null;
}

export default function CambiarPin({ obligatorio, nombre }: { obligatorio: boolean; nombre: string }) {
  const [paso, setPaso] = useState<Paso>(obligatorio ? "nuevo" : "actual");
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);
  const [ocupado, setOcupado] = useState(false);

  const fallo = (msg: string, volverA: Paso) => {
    setError(msg);
    setPaso(volverA);
    setReinicio((n) => n + 1);
  };

  const completo = useCallback(
    async (pin: string) => {
      if (paso === "actual") {
        setActual(pin);
        setError(null);
        setPaso("nuevo");
        setReinicio((n) => n + 1);
        return;
      }
      if (paso === "nuevo") {
        const debil = motivoDebil(pin);
        if (debil) return fallo(debil, "nuevo");
        if (!obligatorio && pin === actual) return fallo("Debe ser distinto al actual", "nuevo");
        setNuevo(pin);
        setError(null);
        setPaso("confirmar");
        setReinicio((n) => n + 1);
        return;
      }
      if (pin !== nuevo) return fallo("Los códigos no coinciden. Vuelve a crearlo.", "nuevo");
      setOcupado(true);
      try {
        const r = await api<{ redirigir: string }>("/api/auth/cambiar-pin", {
          method: "POST",
          json: { pin_nuevo: pin, ...(obligatorio ? {} : { pin_actual: actual }) },
        });
        window.location.href = r.redirigir;
      } catch (e) {
        const err = e as ErrorApi;
        fallo(err.message, err.status === 401 ? (obligatorio ? "nuevo" : "actual") : "nuevo");
        setOcupado(false);
      }
    },
    [paso, actual, nuevo, obligatorio],
  );

  const textos: Record<Paso, [string, string]> = {
    actual: ["Código actual", "Ingresa el código que usas hoy"],
    nuevo: ["Crea tu código", "6 dígitos que solo tú conozcas"],
    confirmar: ["Confirma tu código", "Ingrésalo nuevamente"],
  };

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 pb-10 pt-[max(env(safe-area-inset-top),2rem)] sm:items-center sm:pt-10">
      <div className="w-full max-w-md">
        {!obligatorio && (
          <Link href="/" className="boton-texto mb-4">
            <ArrowLeft size={16} /> Volver
          </Link>
        )}
        <div className="tarjeta px-6 py-8">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-suave text-indigo-tinta">
              <KeyRound size={22} />
            </span>
            {obligatorio ? (
              <>
                <h1 className="text-xl font-semibold text-tinta">Hola, {nombre.split(" ")[0]}</h1>
                <p className="mt-1 text-sm text-tinta-3">Antes de continuar, reemplaza el código inicial por uno personal.</p>
              </>
            ) : (
              <h1 className="text-xl font-semibold text-tinta">Cambiar código</h1>
            )}
          </div>
          <PinPad key={paso} titulo={textos[paso][0]} subtitulo={textos[paso][1]} onCompleto={completo} ocupado={ocupado} error={error} reinicio={reinicio} />
        </div>
      </div>
    </main>
  );
}
