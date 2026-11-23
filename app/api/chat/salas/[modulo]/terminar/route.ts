import { manejar } from "@/lib/http";
import { asientoDesdeEntorno, dispararCierre, terminarSolicitud } from "@/lib/chat/asistente";
import { configGithub } from "@/lib/chat/github";
import { accionBoton } from "@/lib/chat/servicio";

type Ctx = { params: Promise<{ modulo: string }> };

/** «Terminar»: solo mientras el asistente informa que terminó; el primero gana, el segundo recibe 409 con el estado actual. */
export const POST = manejar<Ctx>(async (req, { params }) =>
  accionBoton(req, (await params).modulo, (db, sala) => {
    const id = terminarSolicitud(db, sala);
    void dispararCierre(db, id, asientoDesdeEntorno(), configGithub()); // el cierre y el envío siguen aparte: «enviando…»
  }),
);
