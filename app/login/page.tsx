"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useCallback, useState } from "react";
import Marca from "@/components/Marca";
import PinPad from "@/components/PinPad";
import { ErrorApi, api } from "@/lib/cliente";

export default function Login() {
  const [email, setEmail] = useState("");
  const [paso, setPaso] = useState<"email" | "pin">("email");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);

  const enviarPin = useCallback(
    async (pin: string) => {
      setOcupado(true);
      setError(null);
      try {
        const r = await api<{ redirigir: string }>("/api/auth/login", { method: "POST", json: { email, pin } });
        window.location.href = r.redirigir;
      } catch (e) {
        const err = e as ErrorApi;
        const restantes = err.datos?.intentos_restantes as number | undefined;
        setError(
          restantes !== undefined && restantes <= 3
            ? `${err.message}. Quedan ${restantes} intento${restantes === 1 ? "" : "s"}.`
            : err.message,
        );
        setReinicio((n) => n + 1);
        setOcupado(false);
      }
    },
    [email],
  );

  return (
    <main className="flex min-h-dvh items-start justify-center px-4 pb-10 pt-[max(env(safe-area-inset-top),2.5rem)] sm:items-center sm:pt-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Marca />
        </div>

        <div className="tarjeta px-6 py-8 sm:px-8">
          {paso === "email" ? (
            <form
              className="animate-aparecer space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Ingresa un email válido");
                setEmail(email.trim().toLowerCase());
                setError(null);
                setPaso("pin");
              }}
            >
              <div>
                <h1 className="text-2xl font-semibold text-tinta">Ingresar</h1>
                <p className="mt-1 text-sm text-tinta-3">Con tu email de trabajo y tu código de 6 dígitos.</p>
              </div>
              <div>
                <label htmlFor="email" className="etiqueta">Email de trabajo</label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.cl"
                  className="campo"
                />
              </div>
              {error && <p className="rounded-2xl bg-error-fondo px-4 py-2.5 text-sm text-error-tinta">{error}</p>}
              <button type="submit" className="boton-primario">Continuar</button>
              <p className="text-center text-sm text-tinta-3">
                ¿Primer ingreso? Usa el código inicial que te entregó tu jefatura; se te pedirá cambiarlo.
              </p>
            </form>
          ) : (
            <div className="animate-aparecer">
              <button
                type="button"
                onClick={() => {
                  setPaso("email");
                  setError(null);
                }}
                className="boton-texto -ml-3 mb-4"
              >
                <ArrowLeft size={16} /> {email}
              </button>
              <PinPad titulo="Ingresa tu código" subtitulo="6 dígitos" onCompleto={enviarPin} ocupado={ocupado} error={error} reinicio={reinicio} />
              {ocupado && (
                <p className="mt-6 flex items-center justify-center gap-2 text-sm text-tinta-3">
                  <LoaderCircle size={16} className="animate-spin" /> Verificando…
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
