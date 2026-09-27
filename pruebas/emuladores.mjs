// Acceso a los emuladores de Firebase (Auth: 9099, Realtime Database: 9000)
import fs from 'fs';
import path from 'path';
import { RAIZ } from './comun.mjs';

export const PROYECTO = 'demo-izalco';
export const NS = `${PROYECTO}-default-rtdb`;
export const DB = 'http://127.0.0.1:9000';
export const AUTH = 'http://127.0.0.1:9099';
const DUENO = { Authorization: 'Bearer owner' };

export async function emuladoresDisponibles() {
  try {
    const [a, b] = await Promise.all([fetch(AUTH + '/'), fetch(`${DB}/.json?ns=${NS}`)]);
    return a.ok && (b.ok || b.status === 401);
  } catch (e) {
    return false;
  }
}
/** Borra todo y carga las reglas del repositorio. */
export async function reiniciarEmuladores() {
  await fetch(`${DB}/.json?ns=${NS}`, { method: 'DELETE', headers: DUENO });
  await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  const reglas = fs.readFileSync(path.join(RAIZ, 'database.rules.json'), 'utf8');
  const r = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: DUENO, body: reglas });
  if (!r.ok) throw new Error('No se pudieron cargar las reglas: ' + (await r.text()));
}
export async function dbPoner(ruta, valor) {
  const r = await fetch(`${DB}/${ruta}.json?ns=${NS}`, { method: 'PUT', headers: DUENO, body: JSON.stringify(valor) });
  if (!r.ok) throw new Error(`PUT ${ruta}: ${r.status}`);
}
export async function dbLeer(ruta) {
  return (await fetch(`${DB}/${ruta}.json?ns=${NS}`, { headers: DUENO })).json();
}
/** config.js para que la app use los emuladores. */
export const CONFIG_EMULADORES = `window.APP_CONFIG = {
  firebase: { apiKey: 'demo-key', authDomain: '${PROYECTO}.firebaseapp.com', databaseURL: 'https://${NS}.firebaseio.com', projectId: '${PROYECTO}', appId: '1:1:web:1' },
  emuladores: { auth: '${AUTH}', dbHost: '127.0.0.1', dbPuerto: 9000 },
  titulo: 'Evangelización Izalco', centro: [13.74472, -89.67306], zoom: 16
};`;
