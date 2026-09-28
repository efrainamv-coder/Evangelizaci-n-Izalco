/*
 * Motor de datos del MODO DEMOSTRACIÓN.
 * Guarda todo en el almacenamiento del navegador (localStorage). Las pestañas abiertas del
 * mismo navegador se sincronizan al instante, así se puede probar el "tiempo real" en un
 * solo equipo. Tiene la misma interfaz que el motor de Firebase (backend-firebase.js).
 */
(function () {
  'use strict';
  const IZ = (window.IZ = window.IZ || {});
  const u = IZ.util;
  const CLAVE_DB = 'izalco.demo.db.v1';
  const CLAVE_SESION = 'izalco.demo.sesion';

  IZ.crearBackendLocal = function (config) {
    const adminDemo = Object.assign({ usuario: 'admin', clave: 'izalco' }, config.adminDemo || {});
    let db = cargar();
    const oyentes = [];
    const oyentesSesion = [];
    let sesion = null;

    function nuevaDB() {
      const ahora = Date.now();
      const d = {
        config: { publica: { requiereCodigo: false, zonasIniciadas: true } },
        secreto: {},
        _cuentas: {},
        miembros: {},
        equipos: {},
        salidas: {},
        marcas: {},
        ubicaciones: {},
        zonas: {}
      };
      (IZ.ZONAS_INICIALES || []).forEach((z) => {
        const { id, ...resto } = z;
        d.zonas[id] = Object.assign({}, resto, { actualizado: ahora });
      });
      // Equipo y casas de ejemplo, para que se vea cómo lucen los círculos.
      d.equipos.ejemplo = {
        usuario: 'ejemplo', fecha: '2026-09-27', solo: false, creado: ahora, actualizado: ahora,
        miembros: [
          { nombre: 'Hermano', apellido: 'Ejemplo', edad: 40, parroquia: 'Nuestra Señora de los Dolores (Izalco)', comunidad: '1ª Comunidad' },
          { nombre: 'Hermana', apellido: 'Ejemplo', edad: 38, parroquia: 'Nuestra Señora de los Dolores (Izalco)', comunidad: '1ª Comunidad' }
        ]
      };
      d.salidas.s_ejemplo = { uid: 'ejemplo', usuario: 'ejemplo', fecha: '2026-09-27', solo: false, miembros: d.equipos.ejemplo.miembros, creado: ahora };
      (IZ.MARCAS_EJEMPLO || []).forEach((p, i) => {
        d.marcas['m_ejemplo_' + i] = {
          uid: 'ejemplo', usuario: 'ejemplo', equipo: 'Hermano E. y Hermana E.', tipo: 'casa',
          lat: p[0], lng: p[1], personas: 0, nota: 'Ejemplo (captura del 27/09/2026)', fecha: '2026-09-27', creado: ahora - (5 - i) * 600000
        };
      });
      return d;
    }
    function cargar() {
      try {
        const d = JSON.parse(localStorage.getItem(CLAVE_DB));
        if (d && typeof d === 'object') return d;
      } catch (e) {
        /* datos dañados: se crean de nuevo */
      }
      return nuevaDB();
    }
    function persistir() {
      try {
        localStorage.setItem(CLAVE_DB, JSON.stringify(db));
      } catch (e) {
        console.warn('No se pudo guardar en el navegador', e);
      }
      notificar();
    }
    function leer(ruta) {
      return ruta.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), db);
    }
    function escribir(ruta, valor) {
      const partes = ruta.split('/').filter(Boolean);
      let o = db;
      for (let i = 0; i < partes.length - 1; i++) {
        if (typeof o[partes[i]] !== 'object' || o[partes[i]] === null) o[partes[i]] = {};
        o = o[partes[i]];
      }
      const k = partes[partes.length - 1];
      if (valor === null || valor === undefined) delete o[k];
      else o[k] = JSON.parse(JSON.stringify(valor));
    }
    function copia(v) {
      return v == null ? null : JSON.parse(JSON.stringify(v));
    }
    function notificar() {
      for (const o of oyentes.slice()) {
        const s = JSON.stringify(leer(o.ruta) ?? null);
        if (s !== o.ultimo) {
          o.ultimo = s;
          try {
            o.cb(JSON.parse(s));
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
    function escuchar(ruta, cb) {
      const o = { ruta, cb, ultimo: undefined };
      oyentes.push(o);
      setTimeout(() => {
        if (!oyentes.includes(o)) return;
        o.ultimo = JSON.stringify(leer(ruta) ?? null);
        cb(JSON.parse(o.ultimo));
      }, 0);
      return () => {
        const i = oyentes.indexOf(o);
        if (i >= 0) oyentes.splice(i, 1);
      };
    }
    // Otras pestañas del mismo navegador cambiaron los datos → "tiempo real" local.
    window.addEventListener('storage', (e) => {
      if (e.key === CLAVE_DB || e.key === null) {
        db = cargar();
        notificar();
        if (sesion) resolverSesion();
      }
    });

    // ---------- Sesión ----------
    function emitir(s) {
      sesion = s;
      oyentesSesion.forEach((cb) => cb(s));
    }
    function guardarSesion(s) {
      try {
        if (s) sessionStorage.setItem(CLAVE_SESION, JSON.stringify(s));
        else sessionStorage.removeItem(CLAVE_SESION);
      } catch (e) {
        /* sin sessionStorage */
      }
    }
    function resolverSesion() {
      let s = null;
      try {
        s = JSON.parse(sessionStorage.getItem(CLAVE_SESION));
      } catch (e) {
        s = null;
      }
      if (!s) return emitir(null);
      if (s.rol === 'admin') return emitir({ uid: s.uid, rol: 'admin', usuario: adminDemo.usuario });
      if (s.rol === 'visor') return emitir(db.miembros[s.uid] ? { uid: s.uid, rol: 'visor' } : { uid: s.uid, rol: 'visor-pendiente' });
      const eq = db.equipos[s.uid];
      if (!eq) {
        guardarSesion(null);
        return emitir(null);
      }
      return emitir({ uid: s.uid, rol: 'equipo', usuario: eq.usuario });
    }
    function verificarCodigo(codigo) {
      const secreto = db.secreto && db.secreto.codigo;
      if (secreto && String(codigo || '').trim() !== secreto) throw u.error('codigo-incorrecto');
    }
    function exigirEquipo() {
      if (!sesion || (sesion.rol !== 'equipo' && sesion.rol !== 'admin')) throw u.error('sin-permiso');
    }
    function exigirAdmin() {
      if (!sesion || sesion.rol !== 'admin') throw u.error('sin-permiso');
    }

    const api = {
      modo: 'demo',
      async iniciar() {
        resolverSesion();
      },
      alCambiarSesion(cb) {
        oyentesSesion.push(cb);
      },
      sesionActual: () => sesion,
      ahora: () => Date.now(),
      escucharConexion(cb) {
        const f = () => cb(navigator.onLine !== false);
        window.addEventListener('online', f);
        window.addEventListener('offline', f);
        setTimeout(f, 0);
        return () => {
          window.removeEventListener('online', f);
          window.removeEventListener('offline', f);
        };
      },
      async configPublica() {
        return Object.assign({ requiereCodigo: false }, copia(leer('config/publica')) || {});
      },
      async usuarioExiste(usuario) {
        return !!db._cuentas[usuario] || usuario === adminDemo.usuario;
      },

      async registrar({ usuario, clave, codigo, equipo }) {
        db = cargar();
        verificarCodigo(codigo);
        if (!usuario) throw u.error('usuario-invalido');
        if (db._cuentas[usuario] || usuario === adminDemo.usuario) throw u.error('usuario-existe');
        if (!clave || clave.length < 6) throw u.error('clave-debil');
        const uid = 'u' + u.idAleatorio(15);
        const sal = u.idAleatorio(12);
        const ahora = Date.now();
        db._cuentas[usuario] = { uid, sal, hash: await u.sha256(sal + clave) };
        db.miembros[uid] = { rol: 'equipo', codigo: String(codigo || ''), t: ahora };
        db.equipos[uid] = Object.assign({}, equipo, { usuario, creado: ahora, actualizado: ahora });
        db.salidas['s' + u.idAleatorio(15)] = { uid, usuario, fecha: equipo.fecha, solo: equipo.solo, miembros: equipo.miembros, creado: ahora };
        persistir();
        guardarSesion({ uid, rol: 'equipo' });
        resolverSesion();
        return { usuario, uid };
      },
      async completarRegistro() {
        throw u.error('sin-permiso');
      },
      async entrar(usuario, clave) {
        db = cargar();
        if (usuario === adminDemo.usuario) return api.entrarAdmin(usuario, clave);
        const c = db._cuentas[usuario];
        if (!c || (await u.sha256(c.sal + clave)) !== c.hash) throw u.error('credenciales');
        guardarSesion({ uid: c.uid, rol: 'equipo' });
        resolverSesion();
        return sesion;
      },
      async entrarVisor(codigo) {
        db = cargar();
        let s = null;
        try {
          s = JSON.parse(sessionStorage.getItem(CLAVE_SESION));
        } catch (e) {
          s = null;
        }
        const uid = s && s.rol === 'visor' ? s.uid : 'v' + u.idAleatorio(15);
        if (!db.miembros[uid]) {
          verificarCodigo(codigo);
          db.miembros[uid] = { rol: 'visor', codigo: String(codigo || ''), t: Date.now() };
          persistir();
        }
        guardarSesion({ uid, rol: 'visor' });
        resolverSesion();
        return sesion;
      },
      async entrarAdmin(usuario, clave) {
        if (u.normalizarUsuario(usuario) !== adminDemo.usuario || clave !== adminDemo.clave) throw u.error('credenciales');
        guardarSesion({ uid: 'admin-demo', rol: 'admin' });
        resolverSesion();
        return sesion;
      },
      async crearAdmin() {
        throw u.error('solo-firebase');
      },
      async salir() {
        if (sesion) {
          const ubic = db.ubicaciones[sesion.uid];
          if (ubic) {
            delete db.ubicaciones[sesion.uid];
            persistir();
          }
        }
        guardarSesion(null);
        emitir(null);
      },

      // ---------- Equipo ----------
      escucharEquipo(uid, cb) {
        return escuchar('equipos/' + uid, cb);
      },
      async guardarEquipo(uid, equipo, opciones) {
        exigirEquipo();
        db = cargar();
        const ahora = Date.now();
        const actual = db.equipos[uid];
        if (!actual) throw u.error('sin-permiso');
        db.equipos[uid] = Object.assign({}, actual, { fecha: equipo.fecha, solo: equipo.solo, miembros: equipo.miembros, actualizado: ahora });
        if (opciones && opciones.nuevaSalida) {
          db.salidas['s' + u.idAleatorio(15)] = { uid, usuario: actual.usuario, fecha: equipo.fecha, solo: equipo.solo, miembros: equipo.miembros, creado: ahora };
        }
        persistir();
      },

      // ---------- Círculos (marcas) ----------
      escucharMarcas(cb) {
        return escuchar('marcas', (v) => cb(v || {}));
      },
      async agregarMarca(marca) {
        exigirEquipo();
        db = cargar();
        const id = 'm' + Date.now().toString(36) + u.idAleatorio(6);
        db.marcas[id] = Object.assign({}, marca, { uid: sesion.uid, usuario: sesion.usuario || '', creado: Date.now() });
        persistir();
        return id;
      },
      async editarMarca(id, cambios) {
        exigirEquipo();
        db = cargar();
        const m = db.marcas[id];
        if (!m) throw u.error('no-existe');
        if (sesion.rol !== 'admin' && m.uid !== sesion.uid) throw u.error('sin-permiso');
        const limpio = Object.assign({}, cambios);
        delete limpio.uid;
        delete limpio.usuario;
        Object.keys(limpio).forEach((k) => {
          if (limpio[k] === null) delete m[k];
          else m[k] = limpio[k];
        });
        m.actualizado = Date.now();
        persistir();
      },
      async borrarMarca(id) {
        exigirEquipo();
        db = cargar();
        const m = db.marcas[id];
        if (!m) return;
        if (sesion.rol !== 'admin' && m.uid !== sesion.uid) throw u.error('sin-permiso');
        delete db.marcas[id];
        persistir();
      },

      // ---------- Ubicaciones en vivo ----------
      escucharUbicaciones(cb) {
        return escuchar('ubicaciones', (v) => cb(v || {}));
      },
      publicarUbicacion(disp, datos) {
        if (!sesion || sesion.rol !== 'equipo') return;
        db = cargar();
        escribir(`ubicaciones/${sesion.uid}/${disp}`, Object.assign({}, datos, { t: Date.now() }));
        persistir();
      },
      quitarUbicacion(disp) {
        if (!sesion) return;
        db = cargar();
        if (leer(`ubicaciones/${sesion.uid}/${disp}`) === undefined) return;
        escribir(`ubicaciones/${sesion.uid}/${disp}`, null);
        persistir();
      },

      // ---------- Zonas ----------
      escucharZonas(cb) {
        return escuchar('zonas', (v) => cb(v || {}));
      },
      async guardarZona(id, zona) {
        exigirAdmin();
        db = cargar();
        id = id || 'z' + Date.now().toString(36) + u.idAleatorio(4);
        db.zonas[id] = Object.assign({}, zona, { actualizado: Date.now() });
        persistir();
        return id;
      },
      async borrarZona(id) {
        exigirAdmin();
        db = cargar();
        delete db.zonas[id];
        persistir();
      },
      async inicializarZonas() {
        /* en modo demostración las zonas se cargan al crear los datos */
      },

      // ---------- Administración ----------
      escucharEquipos(cb) {
        return escuchar('equipos', (v) => cb(v || {}));
      },
      escucharSalidas(cb) {
        return escuchar('salidas', (v) => cb(v || {}));
      },
      async leerCodigo() {
        exigirAdmin();
        return (db.secreto && db.secreto.codigo) || '';
      },
      async guardarCodigo(codigo) {
        exigirAdmin();
        db = cargar();
        codigo = String(codigo || '').trim();
        if (codigo) {
          db.secreto = { codigo };
          db.config.publica.requiereCodigo = true;
        } else {
          db.secreto = {};
          db.config.publica.requiereCodigo = false;
        }
        persistir();
      },
      async reiniciarDemo() {
        db = nuevaDB();
        persistir();
      }
    };
    return api;
  };
})();
