// Pruebas de las REGLAS DE SEGURIDAD (database.rules.json) contra los emuladores de Firebase.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, set, get, push, update, remove, serverTimestamp } from 'firebase/database';
import { afirmar } from './comun.mjs';
import { NS, PROYECTO, AUTH, reiniciarEmuladores, dbPoner } from './emuladores.mjs';

const cfg = { apiKey: 'demo-key', authDomain: `${PROYECTO}.firebaseapp.com`, databaseURL: `https://${NS}.firebaseio.com`, projectId: PROYECTO };

export default async function pruebaReglas() {
  const clientes = [];
  let n = 0;
  function cliente() {
    const app = initializeApp(cfg, 'c' + ++n);
    const auth = getAuth(app);
    connectAuthEmulator(auth, AUTH, { disableWarnings: true });
    const db = getDatabase(app);
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
    const c = { app, auth, db };
    clientes.push(c);
    return c;
  }
  const owner = dbPoner;
  async function espera(desc, promesa, debePasar) {
    let ok = true;
    let err = null;
    try {
      await promesa;
    } catch (e) {
      ok = false;
      err = e;
    }
    afirmar(ok === debePasar, `${desc} → ${debePasar ? 'permitido' : 'denegado'}${ok !== debePasar ? ' (resultado contrario: ' + (err && err.message) + ')' : ''}`);
  }
  const miembroEq = (m = {}) => ({ nombre: 'Efraín', apellido: 'Martínez', edad: 34, parroquia: 'Nuestra Señora de los Dolores', comunidad: '1ª Comunidad', ...m });
  // Los avisos de "permission_denied" en la consola son esperados en esta prueba.
  const avisoOriginal = console.warn;
  const logOriginal = console.log;
  console.warn = () => {};
  console.log = (...a) => (String(a[0]).includes('FIREBASE WARNING') ? null : logOriginal(...a));
  try {
    await reiniciarEmuladores();
    const dom = 'demo-izalco.firebaseapp.com';

    // --- sin sesión
    const anon0 = cliente();
    await espera('sin sesión: leer config/publica', get(ref(anon0.db, 'config/publica')), true);
    await espera('sin sesión: leer marcas', get(ref(anon0.db, 'marcas')), false);

    // --- equipo A
    const A = cliente();
    const credA = await createUserWithEmailAndPassword(A.auth, `efrain.martinez@${dom}`, '123456');
    const uidA = credA.user.uid;
    await espera('A: leer marcas antes de ser miembro', get(ref(A.db, 'marcas')), false);
    await espera('A: crear equipo antes de ser miembro', set(ref(A.db, 'equipos/' + uidA), { usuario: 'efrain.martinez', fecha: '2026-09-27', solo: false, miembros: [miembroEq()], creado: serverTimestamp() }), false);
    await espera('A: registrarse como miembro', set(ref(A.db, 'miembros/' + uidA), { rol: 'equipo', codigo: '', t: serverTimestamp() }), true);
    await espera('A: reescribir su miembro (no permitido)', set(ref(A.db, 'miembros/' + uidA), { rol: 'equipo', codigo: 'x', t: serverTimestamp() }), false);
    await espera('A: equipo con usuario ajeno', set(ref(A.db, 'equipos/' + uidA), { usuario: 'juan.lopez', fecha: '2026-09-27', solo: false, miembros: [miembroEq()], creado: serverTimestamp() }), false);
    await espera('A: equipo con fecha mala', set(ref(A.db, 'equipos/' + uidA), { usuario: 'efrain.martinez', fecha: '27/09/2026', solo: false, miembros: [miembroEq()], creado: serverTimestamp() }), false);
    await espera('A: equipo con 4 miembros', set(ref(A.db, 'equipos/' + uidA), { usuario: 'efrain.martinez', fecha: '2026-09-27', solo: false, miembros: [miembroEq(), miembroEq(), miembroEq(), miembroEq()], creado: serverTimestamp() }), false);
    await espera('A: crear equipo válido', set(ref(A.db, 'equipos/' + uidA), { usuario: 'efrain.martinez', fecha: '2026-09-27', solo: false, miembros: [miembroEq(), miembroEq({ nombre: 'Juan', apellido: 'López' })], creado: serverTimestamp(), actualizado: serverTimestamp() }), true);
    await espera('A: leer su equipo', get(ref(A.db, 'equipos/' + uidA)), true);
    await espera('A: leer todos los equipos', get(ref(A.db, 'equipos')), false);
    await espera('A: registrar salida', push(ref(A.db, 'salidas'), { uid: uidA, usuario: 'efrain.martinez', fecha: '2026-09-27', solo: false, miembros: [miembroEq()], creado: serverTimestamp() }), true);
    await espera('A: leer salidas', get(ref(A.db, 'salidas')), false);
    const marcaA = push(ref(A.db, 'marcas'));
    await espera('A: agregar marca', set(marcaA, { uid: uidA, usuario: 'efrain.martinez', equipo: 'Efraín M. y Juan L.', tipo: 'casa', lat: 13.7429, lng: -89.6731, personas: 3, nota: 'Familia', fecha: '2026-09-27', creado: serverTimestamp() }), true);
    await espera('A: marca con tipo inválido', push(ref(A.db, 'marcas'), { uid: uidA, usuario: 'efrain.martinez', tipo: 'otro', lat: 13.7, lng: -89.6, fecha: '2026-09-27', creado: 1 }), false);
    await espera('A: marca con campo extra', push(ref(A.db, 'marcas'), { uid: uidA, usuario: 'efrain.martinez', tipo: 'casa', lat: 13.7, lng: -89.6, fecha: '2026-09-27', creado: 1, hack: true }), false);
    await espera('A: marca a nombre de otro usuario', push(ref(A.db, 'marcas'), { uid: uidA, usuario: 'juan.lopez', tipo: 'casa', lat: 13.7, lng: -89.6, fecha: '2026-09-27', creado: 1 }), false);
    await espera('A: marca con uid ajeno', push(ref(A.db, 'marcas'), { uid: 'otro', usuario: 'efrain.martinez', tipo: 'casa', lat: 13.7, lng: -89.6, fecha: '2026-09-27', creado: 1 }), false);
    await espera('A: editar su marca', update(marcaA, { nota: 'Familia Pérez', tipo: 'volver', actualizado: serverTimestamp() }), true);
    await espera('A: publicar ubicación', set(ref(A.db, `ubicaciones/${uidA}/disp1`), { lat: 13.743, lng: -89.673, prec: 12, t: serverTimestamp(), usuario: 'efrain.martinez', equipo: 'Efraín M.' }), true);
    await espera('A: publicar ubicación en otro uid', set(ref(A.db, `ubicaciones/otro/disp1`), { lat: 13.743, lng: -89.673, t: 1 }), false);
    await espera('A: escribir zonas', set(ref(A.db, 'zonas/z1'), { nombre: 'X', estado: 'visitada', puntos: [[13.7, -89.6], [13.71, -89.6], [13.7, -89.61]] }), false);
    await espera('A: leer secreto', get(ref(A.db, 'secreto')), false);
    await espera('A: escribir config', set(ref(A.db, 'config/publica/requiereCodigo'), false), false);
    await espera('A: hacerse admin', set(ref(A.db, 'admins/' + uidA), true), false);

    // --- visor anónimo
    const V = cliente();
    const credV = await signInAnonymously(V.auth);
    const uidV = credV.user.uid;
    await espera('visor: pretender rol equipo', set(ref(V.db, 'miembros/' + uidV), { rol: 'equipo', codigo: '', t: serverTimestamp() }), false);
    await espera('visor: registrarse como visor', set(ref(V.db, 'miembros/' + uidV), { rol: 'visor', codigo: '', t: serverTimestamp() }), true);
    await espera('visor: leer marcas', get(ref(V.db, 'marcas')), true);
    await espera('visor: leer ubicaciones', get(ref(V.db, 'ubicaciones')), true);
    await espera('visor: leer zonas', get(ref(V.db, 'zonas')), true);
    await espera('visor: agregar marca', push(ref(V.db, 'marcas'), { uid: uidV, usuario: 'x', tipo: 'casa', lat: 13.7, lng: -89.6, fecha: '2026-09-27', creado: 1 }), false);
    await espera('visor: crear equipo', set(ref(V.db, 'equipos/' + uidV), { usuario: 'x', fecha: '2026-09-27', solo: true, miembros: [miembroEq()], creado: 1 }), false);
    await espera('visor: publicar ubicación', set(ref(V.db, `ubicaciones/${uidV}/d`), { lat: 13.7, lng: -89.6, t: 1 }), false);
    await espera('visor: borrar marca de A', remove(ref(V.db, 'marcas/' + marcaA.key)), false);

    // --- equipo B
    const B = cliente();
    const credB = await createUserWithEmailAndPassword(B.auth, `juan.lopez@${dom}`, '654321');
    const uidB = credB.user.uid;
    await set(ref(B.db, 'miembros/' + uidB), { rol: 'equipo', codigo: '', t: serverTimestamp() });
    await set(ref(B.db, 'equipos/' + uidB), { usuario: 'juan.lopez', fecha: '2026-09-27', solo: true, miembros: [miembroEq({ nombre: 'Juan', apellido: 'López' })], creado: serverTimestamp() });
    await espera('B: borrar marca de A', remove(ref(B.db, 'marcas/' + marcaA.key)), false);
    await espera('B: editar marca de A', update(ref(B.db, 'marcas/' + marcaA.key), { nota: 'hack' }), false);
    await espera('B: robar marca de A (cambiar uid)', update(ref(B.db, 'marcas/' + marcaA.key), { uid: uidB }), false);
    await espera('B: borrar ubicación de A', remove(ref(B.db, `ubicaciones/${uidA}`)), false);
    await espera('B: leer equipo de A', get(ref(B.db, 'equipos/' + uidA)), false);

    // --- admin
    const ADM = cliente();
    const credAdm = await createUserWithEmailAndPassword(ADM.auth, 'admin@parroquia.org', 'admin123');
    const uidAdm = credAdm.user.uid;
    await espera('admin (sin estar en /admins): leer equipos', get(ref(ADM.db, 'equipos')), false);
    await owner('admins/' + uidAdm, true);
    await espera('admin: leer su marca de admin', get(ref(ADM.db, 'admins/' + uidAdm)), true);
    await espera('admin: leer equipos', get(ref(ADM.db, 'equipos')), true);
    await espera('admin: leer salidas', get(ref(ADM.db, 'salidas')), true);
    await espera('admin: leer marcas', get(ref(ADM.db, 'marcas')), true);
    await espera('admin: leer miembros', get(ref(ADM.db, 'miembros')), true);
    await espera('admin: crear zona', set(ref(ADM.db, 'zonas/z1'), { nombre: 'Zona 1', estado: 'visitada', fecha: '2026-09-27', puntos: [[13.7, -89.6], [13.71, -89.6], [13.7, -89.61]], actualizado: serverTimestamp() }), true);
    await espera('admin: zona con estado inválido', set(ref(ADM.db, 'zonas/z2'), { nombre: 'Zona 2', estado: 'otro', puntos: [[13.7, -89.6]] }), false);
    await espera('admin: editar marca de A', update(ref(ADM.db, 'marcas/' + marcaA.key), { nota: 'revisado', actualizado: serverTimestamp() }), true);
    await espera('admin: config publica + código (multi-ruta)', update(ref(ADM.db), { 'secreto/codigo': 'dolores2026', 'config/publica/requiereCodigo': true, 'config/publica/zonasIniciadas': true }), true);
    await espera('admin: leer código', get(ref(ADM.db, 'secreto/codigo')), true);

    // --- con código activado
    const C = cliente();
    const credC = await createUserWithEmailAndPassword(C.auth, `maria.perez@${dom}`, '111111');
    await espera('C: miembro sin código', set(ref(C.db, 'miembros/' + credC.user.uid), { rol: 'equipo', codigo: '', t: serverTimestamp() }), false);
    await espera('C: miembro con código malo', set(ref(C.db, 'miembros/' + credC.user.uid), { rol: 'equipo', codigo: 'otro', t: serverTimestamp() }), false);
    await espera('C: miembro con código bueno', set(ref(C.db, 'miembros/' + credC.user.uid), { rol: 'equipo', codigo: 'dolores2026', t: serverTimestamp() }), true);
    const V2 = cliente();
    const credV2 = await signInAnonymously(V2.auth);
    await espera('visor2: sin código', set(ref(V2.db, 'miembros/' + credV2.user.uid), { rol: 'visor', codigo: '', t: serverTimestamp() }), false);
    await espera('visor2: leer marcas sin ser miembro', get(ref(V2.db, 'marcas')), false);
    await espera('visor2: con código', set(ref(V2.db, 'miembros/' + credV2.user.uid), { rol: 'visor', codigo: 'dolores2026', t: serverTimestamp() }), true);
    await espera('visor (antiguo) sigue leyendo', get(ref(V.db, 'marcas')), true);
    await espera('A: su propia marca borrar', remove(ref(A.db, 'marcas/' + marcaA.key)), true);
    await espera('admin: quitar código', update(ref(ADM.db), { 'secreto/codigo': null, 'config/publica/requiereCodigo': false }), true);
    await espera('A: borrar su ubicación', remove(ref(A.db, `ubicaciones/${uidA}/disp1`)), true);

  } finally {
    console.warn = avisoOriginal;
    console.log = logOriginal;
    for (const c of clientes) await deleteApp(c.app);
  }
}
