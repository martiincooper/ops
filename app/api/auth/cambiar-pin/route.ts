import { NextRequest, NextResponse } from "next/server";
import { adjuntarSesion, dbDeCuenta, requireUsuario } from "@/lib/auth";
import { esquemaCambioPin } from "@/lib/esquemas";
import { HttpError, leerJson, manejar } from "@/lib/http";
import { inicioPorRol, type Rol } from "@/lib/jwt";
import { minutosRestantes, registrarFallo } from "@/lib/limites";
import { PIN_INICIAL, hashPin, motivoPinDebil, verificarPin } from "@/lib/pin";

export const POST = manejar(async (req: NextRequest) => {
  const u = await requireUsuario(req, undefined, { permitirCambioPendiente: true });
  const { pin_actual, pin_nuevo } = await leerJson(req, esquemaCambioPin);
  const db = dbDeCuenta(u);
  const fila = db
    .prepare("SELECT pin_hash, bloqueado_hasta FROM usuarios WHERE id = ?")
    .get(u.id) as { pin_hash: string | null; bloqueado_hasta: string | null };

  // Cambio voluntario: exige el código actual (con el mismo bloqueo que el login).
  if (u.debe_cambiar_pin !== 1) {
    const espera = minutosRestantes(fila.bloqueado_hasta);
    if (espera > 0) throw new HttpError(429, `Cuenta bloqueada por intentos fallidos. Intenta en ${espera} min.`);
    if (!pin_actual) throw new HttpError(400, "Ingresa tu código actual");
    const ok = fila.pin_hash ? await verificarPin(pin_actual, fila.pin_hash) : pin_actual === PIN_INICIAL;
    if (!ok) {
      registrarFallo(db, u.id);
      throw new HttpError(401, "El código actual no es correcto");
    }
    if (pin_actual === pin_nuevo) throw new HttpError(400, "El código nuevo debe ser distinto al actual");
  }

  const debil = motivoPinDebil(pin_nuevo);
  if (debil) throw new HttpError(400, debil);

  const hash = await hashPin(pin_nuevo);
  // Incrementar version_sesion cierra las sesiones abiertas en otros dispositivos.
  const act = db
    .prepare(
      `UPDATE usuarios
          SET pin_hash = ?, debe_cambiar_pin = 0, version_sesion = version_sesion + 1,
              intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE id = ?
        RETURNING id, rol, version_sesion, debe_cambiar_pin`,
    )
    .get(hash, u.id) as { id: string; rol: Rol; version_sesion: number; debe_cambiar_pin: number };

  return adjuntarSesion(NextResponse.json({ redirigir: inicioPorRol(act.rol) }), { ...act, empresa: u.empresa });
});
