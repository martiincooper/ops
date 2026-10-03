"use client";

import { Delete } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cliente";

interface Props {
  titulo: string;
  subtitulo?: string;
  /** Se llama al completar 6 dígitos. */
  onCompleto: (pin: string) => void;
  ocupado?: boolean;
  error?: string | null;
  /** Cambiar este valor limpia el teclado y dispara la animación de error. */
  reinicio?: number;
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "borrar"];

export default function PinPad({ titulo, subtitulo, onCompleto, ocupado, error, reinicio = 0 }: Props) {
  const [pin, setPin] = useState("");
  const [temblor, setTemblor] = useState(false);

  useEffect(() => {
    setPin("");
    if (reinicio > 0 && error) {
      setTemblor(true);
      const t = setTimeout(() => setTemblor(false), 400);
      return () => clearTimeout(t);
    }
  }, [reinicio, error]);

  const pulsar = useCallback(
    (tecla: string) => {
      if (ocupado) return;
      if (tecla === "borrar") return setPin((p) => p.slice(0, -1));
      setPin((p) => (p.length >= 6 ? p : p + tecla));
    },
    [ocupado],
  );

  // Envía una sola vez por código completo, aunque el padre se vuelva a renderizar.
  const onCompletoRef = useRef(onCompleto);
  onCompletoRef.current = onCompleto;
  const enviado = useRef(false);
  useEffect(() => {
    if (pin.length !== 6) {
      enviado.current = false;
      return;
    }
    if (enviado.current) return;
    const t = setTimeout(() => {
      enviado.current = true;
      onCompletoRef.current(pin);
    }, 120); // deja ver el sexto punto antes de enviar
    return () => clearTimeout(t);
  }, [pin]);

  // Teclado físico (escritorio)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pulsar(e.key);
      else if (e.key === "Backspace") pulsar("borrar");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [pulsar]);

  return (
    <div className="flex flex-col items-center">
      <p className="text-xl font-semibold text-tinta">{titulo}</p>
      {subtitulo && <p className="mt-1 text-center text-sm text-tinta-3">{subtitulo}</p>}

      <div
        className={cx("mt-7 flex gap-3.5", temblor && "animate-temblor")}
        role="status"
        aria-label={`${pin.length} de 6 dígitos ingresados`}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={cx(
              "h-3.5 w-3.5 rounded-full transition-all duration-150",
              i < pin.length ? (error && temblor ? "scale-110 bg-error" : "scale-110 bg-indigo") : "bg-linea",
            )}
          />
        ))}
      </div>

      <p className={cx("mt-4 min-h-5 text-center text-sm", error ? "text-error-tinta" : "text-transparent")}>{error || "·"}</p>

      <div className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4">
        {TECLAS.map((t, i) =>
          t === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={ocupado}
              onClick={() => pulsar(t)}
              aria-label={t === "borrar" ? "Borrar" : t}
              className={cx(
                "flex h-[72px] w-[72px] select-none items-center justify-center rounded-full text-2xl font-medium transition active:scale-95 disabled:opacity-40",
                t === "borrar"
                  ? "text-tinta-3 hover:bg-superficie/60"
                  : "bg-superficie text-tinta shadow-tarjeta hover:bg-indigo-suave active:bg-indigo-suave",
              )}
            >
              {t === "borrar" ? <Delete size={24} /> : t}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
