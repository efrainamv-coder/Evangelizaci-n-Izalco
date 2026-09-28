// Prueba de extremo a extremo con FIREBASE (emuladores): varios teléfonos a la vez.
import fs from 'fs';
import { nuevoNavegador, nuevoContexto, vigilar, BASE, SALIDA, afirmar, esperar } from './comun.mjs';
import { registrar, terminarRegistro, agregarCirculo, esperarQue, tocarMapa } from './flujos.mjs';
import { reiniciarEmuladores, dbPoner, dbLeer, CONFIG_EMULADORES } from './emuladores.mjs';

// Errores de consola que son esperados en esta prueba (se provocan a propósito).
const ESPERADOS = [/permission_denied/i, /status of 400/, /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/];

export default async function pruebaFirebase() {
  await reiniciarEmuladores();
  const nav = await nuevoNavegador();
  const errores = [];
  const contextos = [];
  const abrir = async (nombre, geo) => {
    const ctx = await nuevoContexto(nav, { config: CONFIG_EMULADORES, geo });
    contextos.push(ctx);
    const p = await ctx.newPage();
    errores.push(vigilar(p, nombre));
    return { ctx, p };
  };
  try {
    // ---------- 1) Administrador: crear la cuenta y darle permiso ----------
    const ADM = await abrir('ADM', false);
    await ADM.p.goto(BASE + '#/admin');
    await ADM.p.waitForSelector('#p-admin-login:not([hidden])', { timeout: 15000 });
    afirmar(await ADM.p.isVisible('#adm-crear-caja'), 'con Firebase se ofrece crear la cuenta del administrador');
    await ADM.p.fill('#adm-usuario', 'admin@parroquia.org');
    await ADM.p.fill('#adm-clave', 'admin123');
    await ADM.p.click('#adm-crear');
    await ADM.p.click('.modal [data-r="si"]');
    await ADM.p.waitForSelector('#p-incompleto:not([hidden])', { timeout: 15000 });
    const uidAdmin = (await ADM.p.textContent('#inc-uid')).trim();
    afirmar(uidAdmin.length > 10, 'se muestra el UID para darle permiso de administrador');
    await ADM.p.screenshot({ path: SALIDA + '/20-admin-uid.png' });
    await dbPoner('admins/' + uidAdmin, true);
    await ADM.p.click('#inc-reintentar');
    await ADM.p.waitForSelector('#p-app:not([hidden])', { timeout: 15000 });
    await esperarQue(ADM.p, () => Object.keys(IZ.estado.zonas).length === 2, 'al entrar el administrador se cargan las zonas iniciales');

    // ---------- 2) Dos equipos, cada uno en su teléfono ----------
    const A = await abrir('A', { latitude: 13.7425, longitude: -89.6725, accuracy: 10 });
    await registrar(A.p, { base: BASE, hermanos: [{ nombre: 'Efraín', apellido: 'Martínez', edad: 34, parroquia: 'Nuestra Señora de los Dolores (Izalco)', comunidad: '1ª Comunidad' }, { nombre: 'Juan', apellido: 'López', edad: 29 }] });
    afirmar((await terminarRegistro(A.p)) === 'efrain.martinez', 'equipo A registrado: efrain.martinez');
    const B = await abrir('B', { latitude: 13.744, longitude: -89.669, accuracy: 15 });
    await registrar(B.p, { base: BASE, hermanos: [{ nombre: 'Ana', apellido: 'Cruz', edad: 45, parroquia: 'San Antonio', comunidad: '3ª Comunidad' }] });
    afirmar((await terminarRegistro(B.p)) === 'ana.cruz', 'equipo B registrado: ana.cruz');
    const equipos = await dbLeer('equipos');
    afirmar(Object.keys(equipos).length === 2 && Object.keys(await dbLeer('salidas')).length === 2, 'equipos y salidas guardados en Firebase');

    // ---------- 3) Tiempo real entre teléfonos ----------
    await agregarCirculo(A.p, { tipo: 'casa', fx: 0.4, fy: 0.35, personas: 4, nota: 'Familia Rivas' });
    await esperarQue(B.p, () => Object.values(IZ.estado.marcas).some((m) => m.nota === 'Familia Rivas'), 'B ve al instante el círculo que puso A');
    await esperarQue(ADM.p, () => Object.values(IZ.estado.marcas).some((m) => m.usuario === 'efrain.martinez'), 'el administrador también lo ve');
    await esperarQue(A.p, () => document.querySelectorAll('.icono-persona').length === 1, 'A ve a B en el mapa (ubicación en vivo)');
    await esperarQue(A.p, () => Object.values(IZ.estado.ubicaciones).some((d) => Object.values(d).some((p) => p.equipo === 'Ana C.')), 'la ubicación en vivo lleva el nombre de los enviados');
    await A.p.screenshot({ path: SALIDA + '/21-equipo-A.png' });
    await B.ctx.setGeolocation({ latitude: 13.7452, longitude: -89.6701, accuracy: 8 });
    await esperarQue(A.p, () => Object.values(IZ.estado.ubicaciones).some((d) => Object.values(d).some((p) => Math.abs(p.lat - 13.7452) < 1e-4)), 'cuando B camina, A lo ve moverse', undefined, 15000);

    // ---------- 4) Visualizador ----------
    const V = await abrir('V', false);
    await V.p.goto(BASE + '#/ver');
    await V.p.waitForSelector('#p-app:not([hidden])', { timeout: 15000 });
    await esperarQue(V.p, () => document.querySelectorAll('.icono-persona').length === 2, 'el visualizador ve a los dos equipos en vivo');
    await esperarQue(V.p, () => Object.keys(IZ.estado.marcas).length === 1, 'el visualizador ve los círculos');
    await V.p.screenshot({ path: SALIDA + '/22-visualizador.png' });
    const intento = await V.p.evaluate(async () => {
      await IZ.estado.backend.agregarMarca({ tipo: 'casa', lat: 13.74, lng: -89.67, fecha: '2026-09-27', equipo: 'x' }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      return Object.keys(IZ.estado.marcas).length;
    });
    afirmar(intento === 1, 'el visualizador no puede agregar círculos (lo impiden las reglas)');

    // ---------- 5) Código de acceso ----------
    await ADM.p.click('#tabs [data-tab="mas"]');
    await ADM.p.waitForSelector('#adm-codigo');
    await ADM.p.fill('#adm-codigo', 'dolores2026');
    await ADM.p.click('[data-accion="guardar-codigo"]');
    await esperar(800);
    afirmar((await dbLeer('config/publica')).requiereCodigo === true, 'el administrador activa un código de acceso');
    const V2 = await abrir('V2', false);
    await V2.p.goto(BASE + '#/ver');
    await V2.p.waitForSelector('#p-visor:not([hidden])', { timeout: 15000 });
    await V2.p.fill('#vis-codigo', 'otro');
    await V2.p.click('#form-visor button[type="submit"]');
    await V2.p.waitForFunction(() => document.querySelector('#vis-error').textContent.includes('código'), null, { timeout: 10000 });
    afirmar(true, 'código incorrecto: no entra al modo visualizador');
    await V2.p.fill('#vis-codigo', 'dolores2026');
    await V2.p.click('#form-visor button[type="submit"]');
    await V2.p.waitForSelector('#p-app:not([hidden])', { timeout: 15000 });
    afirmar(true, 'código correcto: entra al mapa en vivo');
    const C = await abrir('C', { latitude: 13.7418, longitude: -89.6739, accuracy: 20 });
    await registrar(C.p, { base: BASE, codigo: 'malo', hermanos: [{ nombre: 'Pedro', apellido: 'Ramos', edad: 50, parroquia: 'Dolores', comunidad: '2ª Comunidad' }] });
    await C.p.waitForFunction(() => document.querySelector('#reg-error').textContent.includes('código'), null, { timeout: 10000 });
    afirmar(true, 'registro con código incorrecto: rechazado');
    await C.p.fill('#reg-codigo', 'dolores2026');
    await C.p.click('#reg-enviar');
    afirmar((await terminarRegistro(C.p)) === 'pedro.ramos', 'con el código correcto se registra con el mismo usuario');

    // ---------- 6) Al cerrar la app, el hermano sale de "en línea" ----------
    await esperarQue(A.p, () => Object.keys(IZ.estado.ubicaciones).length === 3, 'A ve a 3 equipos en línea');
    await B.ctx.close();
    await esperarQue(A.p, () => Object.keys(IZ.estado.ubicaciones).length === 2, 'al cerrar B la app, desaparece su ubicación', undefined, 20000);

    // ---------- 7) Sesión: recargar, salir y volver a entrar ----------
    await A.p.reload();
    await A.p.waitForSelector('#p-app:not([hidden])', { timeout: 15000 });
    afirmar((await A.p.textContent('#app-titulo')) === 'efrain.martinez', 'la sesión se mantiene al recargar');
    const uidA = Object.keys(equipos).find((k) => equipos[k].usuario === 'efrain.martinez');
    await A.p.click('#tabs [data-tab="equipo"]');
    await A.p.click('#vista-equipo [data-accion="salir"]');
    await A.p.click('.modal [data-r="si"]');
    await A.p.waitForSelector('#p-inicio:not([hidden])', { timeout: 10000 });
    await esperar(800);
    afirmar(!((await dbLeer('ubicaciones')) || {})[uidA], 'al cerrar sesión se deja de compartir la ubicación');
    await A.p.goto(BASE + '#/entrar');
    await A.p.fill('#ent-usuario', 'Efraín Martínez');
    await A.p.fill('#ent-clave', 'malaclave');
    await A.p.click('#form-entrar button[type="submit"]');
    await A.p.waitForFunction(() => document.querySelector('#ent-error').textContent.length > 0, null, { timeout: 10000 });
    afirmar((await A.p.textContent('#ent-error')).includes('incorrectos'), 'contraseña incorrecta: rechazada');
    await A.p.fill('#ent-clave', '123456');
    await A.p.click('#form-entrar button[type="submit"]');
    await A.p.waitForSelector('#p-app:not([hidden])', { timeout: 15000 });
    afirmar((await A.p.textContent('#app-titulo')) === 'efrain.martinez', 'entra escribiendo «Efraín Martínez» (se convierte en efrain.martinez)');

    // ---------- 8) "¿Salen hoy?" si el registro es de otro domingo ----------
    await dbPoner(`equipos/${uidA}/fecha`, '2026-09-20');
    await A.p.reload();
    await A.p.waitForSelector('.modal [data-r="mismo"]', { timeout: 15000 });
    await A.p.screenshot({ path: SALIDA + '/23-salen-hoy.png' });
    await A.p.click('.modal [data-r="mismo"]');
    await esperar(1200);
    const hoy = await A.p.evaluate(() => IZ.util.hoyISO());
    afirmar((await dbLeer(`equipos/${uidA}/fecha`)) === hoy, '«Sí, con los mismos hermanos» registra la salida de hoy');
    afirmar(Object.keys(await dbLeer('salidas')).length === 4, 'queda en el historial de salidas');

    // ---------- 9) Zonas: el administrador las edita y todos lo ven ----------
    await ADM.p.click('#tabs [data-tab="zonas"]');
    await ADM.p.click('[data-zona-datos="zona-2-noroeste"]');
    await ADM.p.waitForSelector('.hoja #z-nombre');
    await ADM.p.click('.hoja [data-estado="visitada"]');
    await ADM.p.click('.hoja [data-accion="guardar-zona"]');
    await esperarQue(A.p, () => IZ.estado.zonas['zona-2-noroeste'].estado === 'visitada', 'cambio de estado de zona visto por los equipos');
    await ADM.p.click('[data-zona-forma="zona-1-noreste"]');
    await ADM.p.waitForSelector('.manija-mover');
    await ADM.p.screenshot({ path: SALIDA + '/24-editar-forma.png' });
    const antesZ = (await dbLeer('zonas/zona-1-noreste')).puntos[0];
    const mv = await ADM.p.locator('.manija-mover').boundingBox();
    await ADM.p.mouse.move(mv.x + mv.width / 2, mv.y + mv.height / 2);
    await ADM.p.mouse.down();
    await ADM.p.mouse.move(mv.x + mv.width / 2 + 30, mv.y + mv.height / 2 + 20, { steps: 8 });
    await ADM.p.mouse.up();
    await ADM.p.click('#edicion-botones [data-ed="guardar-forma"]');
    await esperar(1000);
    const despuesZ = (await dbLeer('zonas/zona-1-noreste')).puntos[0];
    afirmar(Math.abs(despuesZ[1] - antesZ[1]) > 1e-5, 'arrastrando el centro se mueve toda la zona');
    await ADM.p.click('#tabs [data-tab="zonas"]');
    await ADM.p.click('[data-accion="nueva-zona"]');
    await ADM.p.waitForSelector('#panel-edicion:not([hidden])');
    for (const [fx, fy] of [[0.3, 0.3], [0.6, 0.3], [0.6, 0.5], [0.3, 0.5]]) await tocarMapa(ADM.p, fx, fy);
    await ADM.p.click('#edicion-botones [data-ed="terminar"]');
    await ADM.p.waitForSelector('.hoja #z-nombre');
    await ADM.p.fill('.hoja #z-nombre', 'Zona 3 · Centro');
    await ADM.p.click('.hoja [data-estado="pendiente"]');
    await ADM.p.click('.hoja [data-accion="guardar-zona"]');
    await esperarQue(C.p, () => Object.values(IZ.estado.zonas).some((z) => z.nombre === 'Zona 3 · Centro' && z.puntos.length === 4), 'una zona nueva dibujada aparece a los equipos');

    // ---------- 10) Descargas ----------
    await ADM.p.click('#tabs [data-tab="equipos"]');
    await esperarQue(ADM.p, () => document.querySelectorAll('#adm-equipos .tarjeta').length === 3, 'el administrador ve los 3 equipos con sus hermanos');
    await ADM.p.screenshot({ path: SALIDA + '/25-admin-equipos.png' });
    await ADM.p.click('#tabs [data-tab="mas"]');
    const carpeta = SALIDA + '/descargas-firebase';
    fs.mkdirSync(carpeta, { recursive: true });
    for (const tipo of ['excel', 'kml']) {
      const [d] = await Promise.all([ADM.p.waitForEvent('download'), ADM.p.click(`[data-descargar="${tipo}"]`)]);
      await d.saveAs(`${carpeta}/${d.suggestedFilename()}`);
      afirmar(fs.statSync(`${carpeta}/${d.suggestedFilename()}`).size > 500, `descarga ${d.suggestedFilename()}`);
    }
  } finally {
    await nav.close();
  }
  const inesperados = errores.flat().filter((e) => !ESPERADOS.some((r) => r.test(e)));
  afirmar(inesperados.length === 0, 'sin errores inesperados en las páginas' + (inesperados.length ? ': ' + inesperados.join(' | ') : ''));
}
