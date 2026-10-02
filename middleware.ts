import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_SESION,
  RENOVAR_TRAS_S,
  firmarSesion,
  inicioPorRol,
  opcionesCookie,
  verificarSesion,
  type Rol,
} from "./lib/jwt";

// Solo páginas: enrutamiento por rol y renovación deslizante de la sesión.
// Las rutas /api/* quedan fuera del matcher: cada route handler autentica con requireUsuario() contra SQLite.
// (Pasar /api por el middleware Node.js de Next 15.5 producía 500 intermitentes en subidas multipart:
//  "Response body object should not be disturbed or locked".)

const PUBLICAS = ["/login"];
const PERMITIDAS_CAMBIO_PIN = ["/cambiar-pin"];

const ACCESO_PAGINAS: { prefijo: string; roles: Rol[] }[] = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/exec", roles: ["executive", "admin"] },
  { prefijo: "/checkin", roles: ["team", "admin"] },
  { prefijo: "/mi-progreso", roles: ["team", "admin"] },
];

function coincide(path: string, prefijo: string) {
  return path === prefijo || path.startsWith(prefijo + "/");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value);

  if (PUBLICAS.some((p) => coincide(pathname, p))) {
    if (claims && pathname === "/login") {
      return NextResponse.redirect(new URL(claims.cp ? "/cambiar-pin" : inicioPorRol(claims.rol), req.url));
    }
    return NextResponse.next();
  }

  if (!claims) return NextResponse.redirect(new URL("/login", req.url));

  if (claims.cp && !PERMITIDAS_CAMBIO_PIN.some((p) => coincide(pathname, p))) {
    return NextResponse.redirect(new URL("/cambiar-pin", req.url));
  }

  if (pathname === "/") return NextResponse.redirect(new URL(inicioPorRol(claims.rol), req.url));
  const regla = ACCESO_PAGINAS.find((r) => coincide(pathname, r.prefijo));
  if (regla && !regla.roles.includes(claims.rol)) {
    return NextResponse.redirect(new URL(inicioPorRol(claims.rol), req.url));
  }

  const res = NextResponse.next();
  const ahora = Math.floor(Date.now() / 1000);
  if (claims.iat && ahora - claims.iat > RENOVAR_TRAS_S) {
    const token = await firmarSesion({ sub: claims.sub, rol: claims.rol, ver: claims.ver, cp: claims.cp });
    res.cookies.set(COOKIE_SESION, token, opcionesCookie());
  }
  return res;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
