// Utilidades compartidas por las pruebas
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..');
export const PUERTO = Number(process.env.PUERTO || 8080);
export const BASE = `http://127.0.0.1:${PUERTO}/`;
export const SALIDA = path.join(AQUI, 'capturas');
/** config.js para el modo demostración (sin Firebase), aunque el config.js real ya tenga Firebase. */
export const CONFIG_DEMO = "window.APP_CONFIG = { firebase: null, adminDemo: { usuario: 'admin', clave: 'izalco' } };";
fs.mkdirSync(SALIDA, { recursive: true });
const FIREBASE_JS = path.join(AQUI, 'node_modules', 'firebase');

// ---- Mosaicos falsos: las pruebas no necesitan internet para dibujar el mapa ----
function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, crc]);
}
function png(ancho, alto, tipoColor, pixel) {
  const bpp = tipoColor === 6 ? 4 : 3;
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * bpp);
    for (let x = 0; x < ancho; x++) pixel(x, y).forEach((v, i) => (fila[1 + x * bpp + i] = v));
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = tipoColor;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), bloque('IDAT', zlib.deflateSync(Buffer.concat(filas))), bloque('IEND', Buffer.alloc(0))]);
}
const cuadricula = (r, g, b) => (x, y) => (x % 64 < 3 || y % 64 < 3 ? [255, 255, 255] : [r, g, b]);
const MOSAICO_SATELITE = png(256, 256, 2, cuadricula(96, 110, 92));
const MOSAICO_CALLES = png(256, 256, 2, cuadricula(236, 232, 224));
const MOSAICO_VACIO = png(1, 1, 6, () => [0, 0, 0, 0]);

export async function nuevoNavegador() {
  return chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
}
/** Contexto de "teléfono" (Pixel 7) con GPS simulado, sin internet para mapas y con Firebase local. */
export async function nuevoContexto(navegador, op = {}) {
  const ctx = await navegador.newContext({
    ...devices['Pixel 7'],
    locale: 'es-SV',
    timezoneId: 'America/El_Salvador',
    permissions: op.geo === false ? [] : ['geolocation'],
    geolocation: op.geo === false ? undefined : op.geo || { latitude: 13.748, longitude: -89.6741, accuracy: 12 },
    serviceWorkers: 'block',
    acceptDownloads: true
  });
  await ctx.route(/arcgisonline\.com|openstreetmap\.org/, (route) => {
    const url = route.request().url();
    const cuerpo = /Reference/.test(url) ? MOSAICO_VACIO : /World_Imagery/.test(url) ? MOSAICO_SATELITE : MOSAICO_CALLES;
    route.fulfill({ status: 200, contentType: 'image/png', body: cuerpo });
  });
  await ctx.route(/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z-]+\.js)/, (route) => {
    const nombre = route.request().url().match(/(firebase-[a-z-]+\.js)/)[1];
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(FIREBASE_JS, nombre)) });
  });
  if (op.config) {
    await ctx.route(/\/config\.js(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: op.config }));
  }
  return ctx;
}
/** Junta los errores de la página (se esperan cero, salvo los que la prueba provoca). */
export function vigilar(pagina, nombre) {
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  return errores;
}
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let aciertos = 0;
export function afirmar(condicion, mensaje) {
  if (!condicion) throw new Error('FALLÓ: ' + mensaje);
  aciertos++;
  console.log('  ✓ ' + mensaje);
}
export const totalAciertos = () => aciertos;
