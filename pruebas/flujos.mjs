// Pasos que se repiten en las pruebas
import { afirmar, esperar, SALIDA } from './comun.mjs';

export async function registrar(p, { base, fecha, hermanos, clave = '123456', codigo, captura }) {
  await p.goto(base + '#/registro');
  await p.waitForSelector('#p-registro:not([hidden])');
  if (fecha) await p.fill('#reg-fecha', fecha);
  await p.click(`#reg-cuantos [data-n="${hermanos.length}"]`);
  for (let i = 0; i < hermanos.length; i++) {
    const h = hermanos[i];
    const sel = `#reg-hermanos .hermano[data-i="${i}"]`;
    await p.fill(`${sel} [name="nombre"]`, h.nombre);
    await p.fill(`${sel} [name="apellido"]`, h.apellido);
    await p.fill(`${sel} [name="edad"]`, String(h.edad));
    if (h.parroquia) await p.fill(`${sel} [name="parroquia"]`, h.parroquia);
    if (h.comunidad) await p.fill(`${sel} [name="comunidad"]`, h.comunidad);
  }
  await p.fill('#reg-clave', clave);
  await p.fill('#reg-clave2', clave);
  if (codigo !== undefined) {
    await p.waitForSelector('#reg-caja-codigo:not([hidden])', { timeout: 5000 });
    await p.fill('#reg-codigo', codigo);
  }
  if (captura) await p.screenshot({ path: `${SALIDA}/${captura}`, fullPage: true });
  await p.click('#reg-enviar');
}
export async function terminarRegistro(p) {
  await p.waitForSelector('#p-listo:not([hidden])', { timeout: 15000 });
  const usuario = (await p.textContent('#listo-usuario')).trim();
  await p.click('#listo-continuar');
  await p.waitForSelector('#p-app:not([hidden])', { timeout: 15000 });
  await esperar(500);
  return usuario;
}
export async function tocarMapa(p, fx, fy) {
  const caja = await p.locator('#mapa').boundingBox();
  await p.mouse.click(caja.x + caja.width * fx, caja.y + caja.height * fy);
}
/** Toca un círculo existente en el mapa (lo centra primero). */
export async function tocarCirculo(p, id) {
  await p.evaluate((id) => {
    const m = IZ.estado.marcas[id];
    IZ.estado.mapa.map.setView([m.lat, m.lng], 18, { animate: false });
  }, id);
  await esperar(300);
  const punto = await p.evaluate((id) => {
    const m = IZ.estado.marcas[id];
    const q = IZ.estado.mapa.map.latLngToContainerPoint([m.lat, m.lng]);
    const r = document.getElementById('mapa').getBoundingClientRect();
    return { x: r.left + q.x, y: r.top + q.y };
  }, id);
  await p.mouse.click(punto.x, punto.y);
  await p.waitForSelector('.hoja .detalle-fila');
}
export async function agregarCirculo(p, { tipo = 'casa', fx = 0.5, fy = 0.4, personas = 0, nota = '' } = {}) {
  if (await p.isHidden('#barra-marcar')) await p.click('#tabs [data-tab="marcar"]');
  await p.click(`#circulos [data-tipo="${tipo}"]`);
  await p.click('#btn-agregar');
  await p.waitForSelector('#aviso-mapa:not([hidden])');
  await tocarMapa(p, fx, fy);
  await p.waitForSelector('.hoja #f-personas');
  for (let i = 0; i < personas; i++) await p.click('.hoja [data-contar="1"]');
  if (nota) await p.fill('.hoja #f-nota', nota);
  await p.click('.hoja [data-accion="guardar"]');
  await p.waitForSelector('.hoja #f-personas', { state: 'detached' });
}
/** Espera hasta que la condición (evaluada en la página) se cumpla. */
export async function esperarQue(p, condicion, descripcion, arg, ms = 10000) {
  const inicio = Date.now();
  let ultimo;
  while (Date.now() - inicio < ms) {
    try {
      ultimo = await p.evaluate(condicion, arg);
      if (ultimo) {
        afirmar(true, descripcion);
        return ultimo;
      }
    } catch (e) {
      ultimo = e.message;
    }
    await esperar(150);
  }
  throw new Error(`FALLÓ (tiempo agotado): ${descripcion} · último valor: ${JSON.stringify(ultimo)}`);
}
