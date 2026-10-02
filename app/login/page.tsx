"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useCallback, useState } from "react";
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-[max(env(safe-area-inset-top),3rem)]">
      <div className="mb-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-aether-muted">Aether</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Operaciones</h1>
      </div>

      {paso === "email" ? (
        <form
          className="animate-aparecer space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Ingresa un email válido");
            setEmail(email.trim().toLowerCase());
            setError(null);
            setPaso("pin");
          }}
        >
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
              placeholder="nombre@aether.cl"
              className="campo"
            />
          </div>
          {error && <p className="text-xs text-aether-danger">{error}</p>}
          <button type="submit" className="boton-primario">Continuar</button>
          <p className="pt-2 text-center text-xs text-slate-500">
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
            className="mb-6 flex items-center gap-1.5 text-xs text-slate-400"
          >
            <ArrowLeft size={14} /> {email}
          </button>
          <PinPad
            titulo="Ingresa tu código"
            subtitulo="6 dígitos"
            onCompleto={enviarPin}
            ocupado={ocupado}
            error={error}
            reinicio={reinicio}
          />
          {ocupado && (
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
              <LoaderCircle size={14} className="animate-spin" /> Verificando…
            </p>
          )}
        </div>
      )}
    </main>
  );
}
