// Pruebas del MODO DEMOSTRACIÓN (sin Firebase): registro, círculos, tiempo real entre pestañas,
// visualizador, administrador y descargas.
import fs from 'fs';
import { nuevoNavegador, nuevoContexto, vigilar, BASE, SALIDA, afirmar, esperar } from './comun.mjs';
import { registrar, terminarRegistro, agregarCirculo, esperarQue, tocarMapa, tocarCirculo } from './flujos.mjs';

export default async function pruebaDemo() {
  const nav = await nuevoNavegador();
  const errores = [];
  try {
    const ctx = await nuevoContexto(nav);

    // ---------- Inicio y registro paso a paso ----------
    const p = await ctx.newPage();
    errores.push(vigilar(p, 'p'));
    await p.goto(BASE);
    await p.waitForSelector('#p-inicio:not([hidden])');
    afirmar(await p.isVisible('#aviso-demo'), 'aviso de modo demostración visible');
    await p.screenshot({ path: SALIDA + '/01-inicio.png' });
    await p.click('#op-registro');
    await p.waitForSelector('#p-registro:not([hidden])');
    const h1 = '#reg-hermanos .hermano[data-i="0"]';
    const h2 = '#reg-hermanos .hermano[data-i="1"]';
    afirmar(await p.isDisabled(`${h1} [name="edad"]`), 'la edad está deshabilitada hasta escribir el nombre');
    await p.fill(`${h1} [name="nombre"]`, 'efraín antonio');
    await p.fill(`${h1} [name="apellido"]`, 'de león martínez');
    afirmar((await p.textContent('#reg-usuario-vista')) === 'efrain.deleon', 'vista previa del usuario: efrain.deleon');
    afirmar(!(await p.isDisabled(`${h1} [name="edad"]`)), 'se habilitan edad, parroquia y comunidad');
    await p.fill(`${h1} [name="edad"]`, '34');
    await p.fill(`${h1} [name="parroquia"]`, 'Nuestra Señora de los Dolores (Izalco)');
    await p.fill(`${h1} [name="comunidad"]`, '1ª Comunidad');
    afirmar((await p.inputValue(`${h2} [name="parroquia"]`)) === 'Nuestra Señora de los Dolores (Izalco)', 'la parroquia se copia al hermano 2');
    await p.fill(`${h2} [name="nombre"]`, 'Juan');
    await p.fill(`${h2} [name="apellido"]`, 'López');
    await p.fill(`${h2} [name="edad"]`, '29');
    await p.click('#reg-cuantos [data-n="3"]');
    afirmar((await p.$$('#reg-hermanos .hermano')).length === 3, 'con «+2 hermanos» hay tres tarjetas');
    afirmar((await p.inputValue(`${h2} [name="nombre"]`)) === 'Juan', 'se conservan los datos al cambiar la cantidad');
    await p.click('#reg-cuantos [data-n="2"]');
    await p.click('#reg-enviar');
    afirmar((await p.textContent('#reg-error')).includes('Revisa'), 'sin contraseña no deja registrar');
    await p.fill('#reg-clave', '123456');
    await p.fill('#reg-clave2', '123456');
    await p.screenshot({ path: SALIDA + '/02-registro.png', fullPage: true });
    await p.click('#reg-enviar');
    await p.waitForSelector('#p-listo:not([hidden])', { timeout: 8000 });
    afirmar((await p.textContent('#listo-usuario')) === 'efrain.deleon', 'se crea el usuario efrain.deleon');
    await p.screenshot({ path: SALIDA + '/03-listo.png' });
    await p.click('#listo-continuar');
    await p.waitForSelector('#p-app:not([hidden])');
    await esperar(600);
    afirmar((await p.textContent('#app-sub')).includes('Efraín D. y Juan L.'), 'la cabecera muestra a los enviados');
    await p.screenshot({ path: SALIDA + '/04-mapa.png' });

    // ---------- Barra de círculos ----------
    await p.click('#circulos [data-tipo="persona"]');
    await p.click('#btn-agregar');
    afirmar(await p.isVisible('#aviso-mapa'), 'al tocar «Agregar» se pide tocar el mapa');
    await tocarMapa(p, 0.45, 0.35);
    await p.waitForSelector('.hoja #f-personas');
    afirmar(await p.isHidden('#aviso-mapa'), 'el aviso se oculta mientras se llena el círculo');
    await p.click('.hoja [data-contar="1"]');
    await p.click('.hoja [data-contar="1"]');
    await p.fill('.hoja #f-nota', 'Familia Pérez, piden oración');
    await p.screenshot({ path: SALIDA + '/05-nuevo-circulo.png' });
    await p.click('.hoja [data-accion="guardar"]');
    await esperar(500);
    const mias = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('izalco.demo.db.v1')).marcas).filter((m) => m.usuario === 'efrain.deleon'));
    afirmar(mias.length === 1 && mias[0].tipo === 'persona' && mias[0].personas === 2 && mias[0].nota.includes('Pérez'), 'el círculo se guarda con tipo, personas y nota');
    afirmar(await p.isVisible('#barra-marcar'), 'la barra de círculos vuelve a aparecer');
    await esperarQue(p, () => Object.keys(JSON.parse(localStorage.getItem('izalco.demo.db.v1')).ubicaciones).length === 1, 'se publica la ubicación en vivo');
    await p.click('#tabs [data-tab="vivo"]');
    await p.click('#asa-vivo');
    await esperar(300);
    await p.screenshot({ path: SALIDA + '/06-en-vivo.png' });
    await p.click('#tabs [data-tab="equipo"]');
    await esperar(200);
    await p.screenshot({ path: SALIDA + '/07-mi-equipo.png', fullPage: true });

    // ---------- Varios equipos a la vez (pestañas del mismo navegador) ----------
    const a1 = await ctx.newPage();
    errores.push(vigilar(a1, 'a1'));
    const a2 = await ctx.newPage();
    errores.push(vigilar(a2, 'a2'));
    await registrar(a1, { base: BASE, hermanos: [{ nombre: 'Juan', apellido: 'López', edad: 41, parroquia: 'San José', comunidad: '2ª Comunidad' }] });
    afirmar((await terminarRegistro(a1)) === 'juan.lopez', 'equipo que fue solo: juan.lopez');
    await registrar(a2, {
      base: BASE,
      hermanos: [
        { nombre: 'María José', apellido: 'Pérez', edad: 33, parroquia: 'Nuestra Señora de los Dolores (Izalco)', comunidad: '1ª Comunidad' },
        { nombre: 'Ana', apellido: 'Cruz', edad: 25 },
        { nombre: 'Luis', apellido: 'Gómez', edad: 52 }
      ]
    });
    afirmar((await terminarRegistro(a2)) === 'maria.perez', 'equipo de tres: maria.perez');
    const a5 = await ctx.newPage();
    errores.push(vigilar(a5, 'a5'));
    await registrar(a5, { base: BASE, hermanos: [{ nombre: 'María', apellido: 'Pérez', edad: 60, parroquia: 'X', comunidad: 'Y' }] });
    await a5.waitForSelector('.modal [data-r="otro"]');
    await a5.click('.modal [data-r="otro"]');
    afirmar((await terminarRegistro(a5)) === 'maria.perez2', 'nombre repetido: se ofrece crear maria.perez2');
    await a5.close();

    const antes = await a2.evaluate(() => Object.keys(IZ.estado.marcas).length);
    await agregarCirculo(a1, { tipo: 'volver', personas: 3, nota: 'Interesados en las catequesis' });
    await esperarQue(a2, (n) => Object.keys(IZ.estado.marcas).length === n + 1, 'otro equipo ve el círculo nuevo al instante', antes);
    await esperarQue(a2, () => Object.keys(IZ.estado.ubicaciones).length >= 2, 'otro equipo ve la ubicación en vivo');
    const id = await a1.evaluate(() => Object.entries(IZ.estado.marcas).find(([, m]) => m.usuario === 'juan.lopez')[0]);
    await tocarCirculo(a2, id);
    afirmar(!(await a2.$('.hoja [data-accion="borrar-marca"]')), 'no se puede borrar el círculo de otro equipo');
    await a2.click('.hoja [data-cerrar]');
    await tocarCirculo(a1, id);
    await a1.click('.hoja [data-accion="mover-marca"]');
    await a1.waitForSelector('#aviso-mapa:not([hidden])');
    const latAntes = await a1.evaluate((id) => IZ.estado.marcas[id].lat, id);
    await tocarMapa(a1, 0.3, 0.3);
    await a1.click('.hoja [data-accion="guardar"]');
    await esperarQue(a2, ([id, lat]) => IZ.estado.marcas[id].lat !== lat, 'el círculo movido se ve movido en el otro teléfono', [id, latAntes]);
    await tocarCirculo(a1, id);
    await a1.click('.hoja [data-accion="editar-marca"]');
    await a1.click('.hoja .chip-tipo[data-tipo="casa"]');
    await a1.fill('.hoja #f-nota', '');
    await a1.click('.hoja [data-accion="guardar"]');
    await esperarQue(a2, (id) => IZ.estado.marcas[id].tipo === 'casa' && !IZ.estado.marcas[id].nota, 'la edición (tipo y nota) llega al otro teléfono', id);

    // ---------- Visualizador ----------
    const v = await ctx.newPage();
    errores.push(vigilar(v, 'v'));
    await v.goto(BASE + '#/ver');
    await v.waitForSelector('#p-app:not([hidden])');
    afirmar(await v.isHidden('#barra-marcar'), 'el visualizador no tiene barra de círculos');
    await esperarQue(v, () => document.querySelectorAll('.icono-persona').length >= 2, 'el visualizador ve a los hermanos en vivo');
    await v.click('#asa-vivo');
    await esperar(300);
    await v.screenshot({ path: SALIDA + '/08-visualizador.png' });

    // ---------- Administrador ----------
    const adm = await ctx.newPage();
    errores.push(vigilar(adm, 'adm'));
    await adm.goto(BASE + '#/admin');
    await adm.fill('#adm-usuario', 'admin');
    await adm.fill('#adm-clave', 'mala');
    await adm.click('#adm-enviar');
    await adm.waitForFunction(() => document.querySelector('#adm-error').textContent.length > 0);
    afirmar(true, 'clave de administrador incorrecta: rechazada');
    await adm.fill('#adm-clave', 'izalco');
    await adm.click('#adm-enviar');
    await adm.waitForSelector('#p-app:not([hidden])');
    await adm.click('#tabs [data-tab="equipos"]');
    await esperarQue(adm, () => document.querySelectorAll('#adm-equipos .tarjeta').length === 5, 'el administrador ve todos los equipos (ejemplo + 4)');
    await adm.screenshot({ path: SALIDA + '/09-admin-equipos.png' });
    await adm.click('#adm-equipos details summary');
    await esperar(16000); // pasa un ciclo del reloj de actualización
    afirmar(await adm.evaluate(() => document.querySelector('#adm-equipos details').open), 'el historial abierto no se cierra solo al actualizarse');
    await adm.fill('#adm-buscar', 'gomez');
    await esperarQue(adm, () => document.querySelectorAll('#adm-equipos .tarjeta').length === 1, 'busca por nombre de hermano');
    await adm.fill('#adm-buscar', '');
    await adm.click('#tabs [data-tab="visitas"]');
    await esperar(200);
    await adm.screenshot({ path: SALIDA + '/10-admin-visitas.png' });
    await adm.click('#tabs [data-tab="zonas"]');
    await esperar(200);
    await adm.screenshot({ path: SALIDA + '/11-admin-zonas.png' });
    await adm.click('#tabs [data-tab="mas"]');
    await esperar(200);
    await adm.screenshot({ path: SALIDA + '/12-admin-descargar.png', fullPage: true });
    const carpeta = SALIDA + '/descargas-demo';
    fs.mkdirSync(carpeta, { recursive: true });
    for (const tipo of ['excel', 'kml', 'csv-visitas', 'csv-hermanos', 'geojson', 'json']) {
      const [d] = await Promise.all([adm.waitForEvent('download'), adm.click(`[data-descargar="${tipo}"]`)]);
      const destino = `${carpeta}/${d.suggestedFilename()}`;
      await d.saveAs(destino);
      afirmar(fs.statSync(destino).size > 200, `descarga ${d.suggestedFilename()}`);
    }
  } finally {
    await nav.close();
  }
  const todos = errores.flat();
  afirmar(todos.length === 0, 'sin errores de JavaScript en las páginas' + (todos.length ? ': ' + todos.join(' | ') : ''));
}
