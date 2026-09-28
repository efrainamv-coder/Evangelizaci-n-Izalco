/*
 * Motor de datos con FIREBASE (Realtime Database + Authentication).
 * Comparte los círculos, las zonas y las ubicaciones en vivo entre todos los teléfonos
 * en tiempo real. La seguridad la imponen las reglas de database.rules.json.
 *
 * Estructura de la base de datos:
 *   config/publica        { requiereCodigo, zonasIniciadas }         (lectura pública)
 *   secreto/codigo        código de acceso de la comunidad           (solo administrador)
 *   admins/{uid}          true                                       (se agrega desde la consola)
 *   miembros/{uid}        { rol: 'equipo'|'visor', codigo, t }
 *   equipos/{uid}         { usuario, fecha, solo, miembros[], creado, actualizado }
 *   salidas/{id}          historial de cada salida (fecha + enviados)
 *   marcas/{id}           círculos: { uid, usuario, equipo, tipo, lat, lng, personas, nota, fecha, creado }
 *   ubicaciones/{uid}/{dispositivo}   ubicación en vivo { lat, lng, prec, t, usuario, equipo }
 *   zonas/{id}            { nombre, estado, fecha, nota, puntos[[lat,lng]] }
 */
(function () {
  'use strict';
  const IZ = (window.IZ = window.IZ || {});
  const u = IZ.util;
  const VERSION_FIREBASE = '12.19.0';

  IZ.VERSION_FIREBASE = VERSION_FIREBASE;

  IZ.crearBackendFirebase = async function (config) {
    const f = config.firebase || {};
    if (!f.databaseURL) {
      throw new Error('En config.js falta «databaseURL» (la dirección de la Realtime Database, por ejemplo https://tu-proyecto-default-rtdb.firebaseio.com). Ver README, paso 5.');
    }
    const base = (config.firebaseCdn || 'https://www.gstatic.com/firebasejs/') + VERSION_FIREBASE + '/';
    const [fApp, fAuth, fDb] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-database.js')
    ]);
    const app = fApp.initializeApp(config.firebase);
    // Sin el soporte de ventanas emergentes de Google (no se usa): la app carga más rápido y gasta menos datos.
    const auth = fAuth.initializeAuth(app, { persistence: [fAuth.indexedDBLocalPersistence, fAuth.browserLocalPersistence] });
    const db = fDb.getDatabase(app);
    if (config.emuladores) {
      fAuth.connectAuthEmulator(auth, config.emuladores.auth, { disableWarnings: true });
      fDb.connectDatabaseEmulator(db, config.emuladores.dbHost, config.emuladores.dbPuerto);
    }
    const { ref, get, set, update, push, remove, onValue, onDisconnect, serverTimestamp } = fDb;
    const TS = () => serverTimestamp();

    const dominio = config.dominioUsuarios || config.firebase.authDomain || `${config.firebase.projectId}.firebaseapp.com`;
    const correoDe = (usuario) => `${usuario}@${dominio}`;

    // ---------- Errores ----------
    const esPermiso = (e) => /permission.denied/i.test(String((e && (e.code || e.message)) || ''));
    function traducir(e) {
      if (e && e.codigo) return e;
      const c = String((e && e.code) || '');
      const tabla = {
        'auth/email-already-in-use': 'usuario-existe',
        'auth/invalid-credential': 'credenciales',
        'auth/invalid-login-credentials': 'credenciales',
        'auth/wrong-password': 'credenciales',
        'auth/user-not-found': 'credenciales',
        'auth/invalid-email': 'usuario-invalido',
        'auth/missing-password': 'credenciales',
        'auth/too-many-requests': 'muchos-intentos',
        'auth/network-request-failed': 'sin-red',
        'auth/weak-password': 'clave-debil',
        'auth/operation-not-allowed': 'metodo-desactivado',
        'auth/admin-restricted-operation': 'metodo-desactivado',
        'auth/user-disabled': 'cuenta-desactivada'
      };
      if (tabla[c]) return u.error(tabla[c], e.message);
      if (esPermiso(e)) return u.error('sin-permiso', e.message);
      if (/offline|network/i.test(String(e && e.message))) return u.error('sin-red', e.message);
      return u.error('desconocido', (e && e.message) || String(e));
    }
    let alErrorEscritura = (e) => console.warn(e);
    const escribirSinEsperar = (promesa) => promesa.catch((e) => alErrorEscritura(traducir(e)));

    // ---------- Ubicaciones en vivo (presencia) ----------
    const presencias = new Map();
    function registrarPresencia(p) {
      if (!conectado || !p.ultimo) return;
      p.registrado = true;
      onDisconnect(p.ref)
        .remove()
        .then(() => set(p.ref, Object.assign({}, p.ultimo, { t: TS() })))
        .catch(() => (p.registrado = false));
    }

    // ---------- Hora del servidor y conexión ----------
    let desfase = 0;
    let conectado = false;
    const oyentesConexion = [];
    onValue(ref(db, '.info/serverTimeOffset'), (s) => (desfase = s.val() || 0));
    onValue(ref(db, '.info/connected'), (s) => {
      conectado = s.val() === true;
      oyentesConexion.forEach((cb) => cb(conectado));
      if (conectado) presencias.forEach(registrarPresencia);
      else presencias.forEach((p) => (p.registrado = false));
    });

    // ---------- Sesión ----------
    let sesion;
    let ocupado = 0;
    let secuencia = 0;
    const oyentesSesion = [];
    function emitir(s) {
      sesion = s;
      oyentesSesion.forEach((cb) => cb(s));
    }
    const conTiempo = (promesa, ms) =>
      Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(u.error('sin-red', 'tiempo agotado')), ms))]);

    async function resolverSesion() {
      const mia = ++secuencia;
      const user = auth.currentUser;
      if (!user) return emitir(null);
      const claveCache = 'izalco.rol.' + user.uid;
      let s;
      try {
        if (user.isAnonymous) {
          const m = await conTiempo(get(ref(db, 'miembros/' + user.uid)), 10000);
          s = { uid: user.uid, rol: m.exists() ? 'visor' : 'visor-pendiente' };
        } else {
          const usuario = String(user.email || '').split('@')[0];
          const adm = await conTiempo(get(ref(db, 'admins/' + user.uid)), 10000).catch((e) => {
            if (!esPermiso(e)) throw e;
            return null;
          });
          if (adm && adm.val() === true) s = { uid: user.uid, rol: 'admin', usuario, email: user.email };
          else {
            const eq = await conTiempo(get(ref(db, 'equipos/' + user.uid)), 10000);
            if (eq.exists()) s = { uid: user.uid, rol: 'equipo', usuario: eq.val().usuario || usuario };
            else {
              const m = await conTiempo(get(ref(db, 'miembros/' + user.uid)), 10000);
              s = { uid: user.uid, rol: 'incompleto', usuario, email: user.email, esMiembro: m.exists() };
            }
          }
        }
        if (['equipo', 'admin', 'visor'].includes(s.rol)) u.guardarLocal(claveCache, s);
      } catch (e) {
        // Sin conexión al abrir la app: se usa el último rol conocido de este teléfono.
        s = u.leerLocal(claveCache, null) || { uid: user.uid, rol: 'error', error: traducir(e) };
      }
      if (mia === secuencia) emitir(s);
    }
    fAuth.onAuthStateChanged(auth, () => {
      if (!ocupado) resolverSesion();
    });

    const api = {
      modo: 'firebase',
      async iniciar() {
        await auth.authStateReady();
        await resolverSesion();
      },
      alCambiarSesion(cb) {
        oyentesSesion.push(cb);
      },
      alFallarEscritura(cb) {
        alErrorEscritura = cb;
      },
      sesionActual: () => sesion,
      ahora: () => Date.now() + desfase,
      escucharConexion(cb) {
        oyentesConexion.push(cb);
        setTimeout(() => cb(conectado), 0);
        return () => {
          const i = oyentesConexion.indexOf(cb);
          if (i >= 0) oyentesConexion.splice(i, 1);
        };
      },
      async configPublica() {
        try {
          const s = await conTiempo(get(ref(db, 'config/publica')), 10000);
          return Object.assign({ requiereCodigo: false }, s.val() || {});
        } catch (e) {
          // config/publica siempre se puede leer si las reglas están publicadas
          throw esPermiso(e) ? u.error('reglas-faltantes') : traducir(e);
        }
      },

      async registrar({ usuario, clave, codigo, equipo }) {
        ocupado++;
        try {
          let cred;
          try {
            cred = await fAuth.createUserWithEmailAndPassword(auth, correoDe(usuario), clave);
          } catch (e) {
            throw traducir(e);
          }
          const uid = cred.user.uid;
          try {
            await set(ref(db, 'miembros/' + uid), { rol: 'equipo', codigo: String(codigo || ''), t: TS() });
          } catch (e) {
            await cred.user.delete().catch(() => fAuth.signOut(auth));
            throw esPermiso(e) ? u.error(codigo ? 'codigo-incorrecto' : 'registro-denegado') : traducir(e);
          }
          await guardarEquipoNuevo(uid, usuario, equipo);
          return { usuario, uid };
        } finally {
          ocupado--;
          await resolverSesion();
        }
      },
      /** Para cuentas cuyo registro quedó a medias (se creó el usuario pero no el equipo). */
      async completarRegistro({ codigo, equipo }) {
        const user = auth.currentUser;
        if (!user || user.isAnonymous) throw u.error('sin-permiso');
        ocupado++;
        try {
          const uid = user.uid;
          const usuario = String(user.email || '').split('@')[0];
          const m = await get(ref(db, 'miembros/' + uid));
          if (!m.exists()) {
            try {
              await set(ref(db, 'miembros/' + uid), { rol: 'equipo', codigo: String(codigo || ''), t: TS() });
            } catch (e) {
              throw esPermiso(e) ? u.error('codigo-incorrecto') : traducir(e);
            }
          }
          await guardarEquipoNuevo(uid, usuario, equipo);
          return { usuario, uid };
        } catch (e) {
          throw traducir(e);
        } finally {
          ocupado--;
          await resolverSesion();
        }
      },
      async entrar(usuario, clave) {
        ocupado++;
        try {
          await fAuth.signInWithEmailAndPassword(auth, correoDe(usuario), clave);
        } catch (e) {
          throw traducir(e);
        } finally {
          ocupado--;
        }
        await resolverSesion();
        return sesion;
      },
      async entrarVisor(codigo) {
        ocupado++;
        try {
          let user = auth.currentUser;
          if (!user || !user.isAnonymous) {
            if (user) await fAuth.signOut(auth);
            user = (await fAuth.signInAnonymously(auth)).user;
          }
          const m = await get(ref(db, 'miembros/' + user.uid));
          if (!m.exists()) {
            try {
              await set(ref(db, 'miembros/' + user.uid), { rol: 'visor', codigo: String(codigo || ''), t: TS() });
            } catch (e) {
              throw esPermiso(e) ? u.error(codigo ? 'codigo-incorrecto' : 'registro-denegado') : e;
            }
          }
        } catch (e) {
          throw traducir(e);
        } finally {
          ocupado--;
        }
        await resolverSesion();
        return sesion;
      },
      async entrarAdmin(usuarioOCorreo, clave) {
        const correo = String(usuarioOCorreo || '').includes('@') ? String(usuarioOCorreo).trim() : correoDe(u.normalizarUsuario(usuarioOCorreo));
        ocupado++;
        try {
          await fAuth.signInWithEmailAndPassword(auth, correo, clave);
        } catch (e) {
          throw traducir(e);
        } finally {
          ocupado--;
        }
        await resolverSesion();
        return sesion;
      },
      async crearAdmin(correo, clave) {
        ocupado++;
        try {
          const c = await fAuth.createUserWithEmailAndPassword(auth, String(correo).trim(), clave);
          return c.user.uid;
        } catch (e) {
          throw traducir(e);
        } finally {
          ocupado--;
          await resolverSesion();
        }
      },
      async reintentarSesion() {
        await resolverSesion();
        return sesion;
      },
      async salir() {
        for (const disp of Array.from(presencias.keys())) api.quitarUbicacion(disp);
        await fAuth.signOut(auth);
      },

      // ---------- Equipo ----------
      escucharEquipo(uid, cb) {
        return onValue(ref(db, 'equipos/' + uid), (s) => cb(s.val()), (e) => console.warn(e));
      },
      async guardarEquipo(uid, equipo, opciones) {
        const cambios = { fecha: equipo.fecha, solo: equipo.solo, miembros: equipo.miembros, actualizado: TS() };
        try {
          await update(ref(db, 'equipos/' + uid), cambios);
          if (opciones && opciones.nuevaSalida) {
            await push(ref(db, 'salidas'), {
              uid, usuario: (sesion && sesion.usuario) || '', fecha: equipo.fecha, solo: equipo.solo, miembros: equipo.miembros, creado: TS()
            });
          }
        } catch (e) {
          throw traducir(e);
        }
      },

      // ---------- Círculos ----------
      escucharMarcas(cb, alError) {
        return onValue(ref(db, 'marcas'), (s) => cb(s.val() || {}), (e) => alError && alError(traducir(e)));
      },
      async agregarMarca(marca) {
        const user = auth.currentUser;
        if (!user) throw u.error('sin-permiso');
        const r = push(ref(db, 'marcas'));
        const datos = Object.assign({}, marca, { uid: user.uid, usuario: (sesion && sesion.usuario) || '', creado: TS() });
        // No se espera la confirmación: si no hay señal, se envía al recuperar la conexión.
        escribirSinEsperar(set(r, datos));
        return r.key;
      },
      async editarMarca(id, cambios) {
        const c = Object.assign({}, cambios, { actualizado: TS() });
        delete c.uid;
        delete c.usuario;
        escribirSinEsperar(update(ref(db, 'marcas/' + id), c));
      },
      async borrarMarca(id) {
        escribirSinEsperar(remove(ref(db, 'marcas/' + id)));
      },

      // ---------- Ubicaciones en vivo ----------
      escucharUbicaciones(cb, alError) {
        return onValue(ref(db, 'ubicaciones'), (s) => cb(s.val() || {}), (e) => alError && alError(traducir(e)));
      },
      publicarUbicacion(disp, datos) {
        const user = auth.currentUser;
        if (!user || user.isAnonymous) return;
        let p = presencias.get(disp);
        if (!p) {
          p = { ref: ref(db, `ubicaciones/${user.uid}/${disp}`), registrado: false };
          presencias.set(disp, p);
        }
        p.ultimo = datos;
        if (!p.registrado) registrarPresencia(p);
        else escribirSinEsperar(set(p.ref, Object.assign({}, datos, { t: TS() })));
      },
      quitarUbicacion(disp) {
        const p = presencias.get(disp);
        if (!p) return;
        presencias.delete(disp);
        onDisconnect(p.ref).cancel().catch(() => {});
        remove(p.ref).catch(() => {});
      },

      // ---------- Zonas ----------
      escucharZonas(cb, alError) {
        return onValue(ref(db, 'zonas'), (s) => cb(s.val() || {}), (e) => alError && alError(traducir(e)));
      },
      async guardarZona(id, zona) {
        const r = id ? ref(db, 'zonas/' + id) : push(ref(db, 'zonas'));
        try {
          await set(r, Object.assign({}, zona, { actualizado: TS() }));
        } catch (e) {
          throw traducir(e);
        }
        return r.key;
      },
      async borrarZona(id) {
        try {
          await remove(ref(db, 'zonas/' + id));
        } catch (e) {
          throw traducir(e);
        }
      },
      /** La primera vez que entra el administrador se cargan las zonas iniciales. */
      async inicializarZonas() {
        try {
          const pub = (await get(ref(db, 'config/publica'))).val() || {};
          if (pub.zonasIniciadas) return false;
          const actuales = await get(ref(db, 'zonas'));
          const cambios = { 'config/publica/zonasIniciadas': true };
          if (!actuales.exists()) {
            (IZ.ZONAS_INICIALES || []).forEach((z) => {
              const { id, ...resto } = z;
              cambios['zonas/' + id] = Object.assign({}, resto, { actualizado: TS() });
            });
          }
          await update(ref(db), cambios);
          return true;
        } catch (e) {
          console.warn('No se pudieron iniciar las zonas', e);
          return false;
        }
      },

      // ---------- Administración ----------
      escucharEquipos(cb, alError) {
        return onValue(ref(db, 'equipos'), (s) => cb(s.val() || {}), (e) => alError && alError(traducir(e)));
      },
      escucharSalidas(cb, alError) {
        return onValue(ref(db, 'salidas'), (s) => cb(s.val() || {}), (e) => alError && alError(traducir(e)));
      },
      async leerCodigo() {
        try {
          return (await get(ref(db, 'secreto/codigo'))).val() || '';
        } catch (e) {
          throw traducir(e);
        }
      },
      async guardarCodigo(codigo) {
        codigo = String(codigo || '').trim();
        try {
          await update(ref(db), codigo
            ? { 'secreto/codigo': codigo, 'config/publica/requiereCodigo': true }
            : { 'secreto/codigo': null, 'config/publica/requiereCodigo': false });
        } catch (e) {
          throw traducir(e);
        }
      }
    };

    async function guardarEquipoNuevo(uid, usuario, equipo) {
      try {
        await set(ref(db, 'equipos/' + uid), {
          usuario, fecha: equipo.fecha, solo: equipo.solo, miembros: equipo.miembros, creado: TS(), actualizado: TS()
        });
        await push(ref(db, 'salidas'), { uid, usuario, fecha: equipo.fecha, solo: equipo.solo, miembros: equipo.miembros, creado: TS() });
      } catch (e) {
        throw traducir(e);
      }
    }

    return api;
  };
})();
