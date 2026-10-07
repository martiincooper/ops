import { ShieldX } from "lucide-react";
import BotonSalir from "@/components/BotonSalir";
import Marca from "@/components/Marca";
import { MENSAJE_ACCESO_DENEGADO } from "@/lib/chat/modulos";

/** Pantalla para cuentas que no son @datasheq.com. */
export default function AccesoDenegado({ email }: { email: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <Marca />
        </div>
        <div role="alert" className="tarjeta px-6 py-8 sm:px-8">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-error-fondo text-error-tinta">
            <ShieldX size={28} aria-hidden />
          </span>
          <h1 className="text-xl font-semibold text-tinta">Acceso denegado</h1>
          <p className="mt-2 text-sm text-error-tinta">{MENSAJE_ACCESO_DENEGADO}</p>
          <p className="mt-4 text-xs text-tinta-3">Ingresaste como {email}.</p>
          <div className="mt-6 flex justify-center">
            <BotonSalir />
          </div>
        </div>
      </div>
    </main>
  );
}
