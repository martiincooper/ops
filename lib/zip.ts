// Zip mínimo (un solo archivo .zip en memoria, nombres UTF-8, compresión deflate). Sin dependencias.
import { deflateRawSync } from "node:zlib";

const TABLA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = TABLA[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ArchivoZip {
  /** Ruta dentro del zip, con «/» (p. ej. «docs/adr/0001-x.md»). */
  ruta: string;
  contenido: string | Buffer;
}

export function crearZip(archivos: ArchivoZip[], ahora = new Date()): Buffer {
  const hora = (ahora.getUTCHours() << 11) | (ahora.getUTCMinutes() << 5) | (ahora.getUTCSeconds() >> 1);
  const fecha = (Math.max(ahora.getUTCFullYear() - 1980, 0) << 9) | ((ahora.getUTCMonth() + 1) << 5) | ahora.getUTCDate();
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let pos = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.ruta, "utf8");
    const datos = Buffer.isBuffer(a.contenido) ? a.contenido : Buffer.from(a.contenido, "utf8");
    const comp = deflateRawSync(datos);
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(fecha, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    local.copy(dir, 6, 4, 26); // versión, banderas, método, hora, fecha, crc y tamaños
    dir.writeUInt16LE(nombre.length, 28);
    dir.writeUInt32LE(pos, 42);
    partes.push(local, nombre, comp);
    central.push(dir, nombre);
    pos += local.length + nombre.length + comp.length;
  }
  const tamCentral = central.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(tamCentral, 12);
  fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, ...central, fin]);
}
