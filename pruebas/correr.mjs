// Corre las pruebas:  node correr.mjs [demo] [reglas] [firebase]
// "reglas" y "firebase" necesitan los emuladores de Firebase encendidos (ver package.json: npm run firebase).
import { iniciarServidor } from './servidor.mjs';
import { PUERTO, totalAciertos } from './comun.mjs';
import { emuladoresDisponibles } from './emuladores.mjs';

const SUITES = {
  demo: () => import('./demo.mjs'),
  reglas: () => import('./reglas.mjs'),
  firebase: () => import('./firebase.mjs')
};
const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : ['demo', 'reglas', 'firebase'];
const servidor = await iniciarServidor(PUERTO);
let fallo = false;
for (const nombre of pedidas) {
  if (!SUITES[nombre]) {
    console.error(`No existe la prueba «${nombre}». Opciones: ${Object.keys(SUITES).join(', ')}`);
    fallo = true;
    continue;
  }
  if (nombre !== 'demo' && !(await emuladoresDisponibles())) {
    console.error(`\n✗ ${nombre}: los emuladores de Firebase no están encendidos (usa «npm run firebase»).`);
    fallo = true;
    continue;
  }
  console.log(`\n▶ ${nombre}`);
  const inicio = Date.now();
  try {
    await (await SUITES[nombre]()).default();
    console.log(`✔ ${nombre} (${Math.round((Date.now() - inicio) / 1000)} s)`);
  } catch (e) {
    fallo = true;
    console.error(`\n✗ ${nombre}: ${e.message}`);
  }
}
servidor.close();
console.log(`\n${totalAciertos()} comprobaciones correctas${fallo ? ' — HUBO FALLOS' : ''}`);
process.exit(fallo ? 1 : 0);
