import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adjuntarSesion } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { esquemaLogin } from "@/lib/esquemas";
import { HttpError, ipCliente, leerJson, manejar } from "@/lib/http";
import { inicioPorRol, type Rol } from "@/lib/jwt";
import { FALLOS_POR_BLOQUEO, consumirIntentoIp, minutosRestantes, registrarFallo } from "@/lib/limites";
import { PIN_INICIAL, senuelo, verificarPin } from "@/lib/pin";
import { ahoraIso } from "@/lib/tiempo";

interface FilaLogin {
  id: string;
  rol: Rol;
  activo: number;
  pin_hash: string | null;
  debe_cambiar_pin: number;
  version_sesion: number;
  bloqueado_hasta: string | null;
}

const CREDENCIALES = "Email o código incorrecto";

function igualSeguro(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const POST = manejar(async (req: NextRequest) => {
  if (!consumirIntentoIp(ipCliente(req))) {
    throw new HttpError(429, "Demasiados intentos desde esta conexión. Espera 15 minutos.");
  }
  const { email, pin } = await leerJson(req, esquemaLogin);
  const db = getDb();
  const u = db
    .prepare(
      `SELECT id, rol, activo, pin_hash, debe_cambiar_pin, version_sesion, bloqueado_hasta
         FROM usuarios WHERE email = ?`,
    )
    .get(email) as FilaLogin | undefined;

  if (!u || u.activo !== 1) {
    await verificarPin(pin, await senuelo()); // mismo costo de tiempo que un usuario real
    throw new HttpError(401, CREDENCIALES);
  }

  const espera = minutosRestantes(u.bloqueado_hasta);
  if (espera > 0) {
    throw new HttpError(429, `Cuenta bloqueada por intentos fallidos. Intenta en ${espera} min.`);
  }

  const ok = u.pin_hash
    ? await verificarPin(pin, u.pin_hash)
    : (await verificarPin(pin, await senuelo()), igualSeguro(pin, PIN_INICIAL));

  if (!ok) {
    const f = registrarFallo(db, u.id);
    if (f.bloqueado_hasta) {
      throw new HttpError(429, `Cuenta bloqueada por intentos fallidos. Intenta en ${minutosRestantes(f.bloqueado_hasta)} min.`);
    }
    throw new HttpError(401, CREDENCIALES, {
      intentos_restantes: FALLOS_POR_BLOQUEO - (f.intentos % FALLOS_POR_BLOQUEO),
    });
  }

  db.prepare(
    "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = ? WHERE id = ?",
  ).run(ahoraIso(), u.id);

  const res = NextResponse.json({
    redirigir: u.debe_cambiar_pin === 1 ? "/cambiar-pin" : inicioPorRol(u.rol),
  });
  return adjuntarSesion(res, u);
});
