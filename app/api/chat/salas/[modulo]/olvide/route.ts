import { manejar } from "@/lib/http";
import { reabrirEntrevista } from "@/lib/chat/asistente";
import { accionBoton } from "@/lib/chat/servicio";

type Ctx = { params: Promise<{ modulo: string }> };

/** «Se me olvidó algo»: solo mientras el asistente informa que terminó; la solicitud sigue abierta. */
export const POST = manejar<Ctx>(async (req, { params }) => accionBoton(req, (await params).modulo, (db, sala) => void reabrirEntrevista(db, sala)));
