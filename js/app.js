/*
 * App principal: pantallas, registro de enviados, mapa con barra de círculos,
 * ubicaciones en vivo, modo visualizador y panel del administrador.
 */
(function () {
  'use strict';
  const IZ = window.IZ;
  const u = IZ.util;
  const { $, $$, esc } = u;

  const CONFIG = Object.assign(
    {
      titulo: 'Evangelización Izalco',
      subtitulo: 'Camino Neocatecumenal · Parroquia Nuestra Señora de los Dolores',
      centro: [13.75071, -89.67377],
      zoom: 16,
      adminDemo: { usuario: 'admin', clave: 'izalco' }
    },
    window.APP_CONFIG || {}
  );
  const firebaseConfigurado = () => {
    const f = CONFIG.firebase;
    return !!(f && typeof f === 'object' && f.apiKey && !/^(tu|pega|xxx|aiza\.\.\.)/i.test(String(f.apiKey)));
  };

  const ROLES_APP = ['equipo', 'visor', 'admin'];
  const MIN = 60000;
  const INACTIVO_MS = 3 * MIN;
  const OCULTO_MS = 15 * MIN;

  const est = {
    backend: null,
    sesion: undefined,
    ocupado: false,
    marcas: {},
    ubicaciones: {},
    zonas: {},
    equipos: {},
    salidas: {},
    equipo: null,
    conectado: true,
    tab: null,
    filtro: u.leerLocal('izalco.filtro', 'todo'),
    tipoSel: 'casa',
    capa: u.leerLocal('izalco.capa', 'satelite'),
    compartir: u.leerLocal('izalco.compartir', true) !== false,
    pantallaEncendida: false,
    wakeLock: null,
    miPos: null,
    gpsEstado: 'apagado',
    gpsWatch: null,
    ultimaPublicada: null,
    dispositivo: u.idDispositivo(),
    subs: [],
    relojes: [],
    mapa: null,
    vivoAbierto: false,
    colocando: null,
    adminEquipo: '',
    adminTipo: '',
    adminBusqueda: '',
    adminLimite: 150,
    zonaModo: null,
    preguntoSalida: false,
    usuarioCreado: null,
    firmaZonas: ''
  };
  IZ.estado = est; // útil para depurar desde la consola

  // =====================================================================
  //  Hojas, ventanas y el botón "atrás" del celular
  // =====================================================================
  const pila = [];
  let popsPropios = 0;
  const esperasPop = [];
  function abrirCapa(op) {
    op = op || {};
    const clase = op.clase || 'hoja';
    const envoltura = document.createElement('div');
    envoltura.className = 'capa';
    if (op.fondo !== false) {
      const f = document.createElement('div');
      f.className = 'fondo-capa';
      f.addEventListener('click', () => cerrarCapa());
      envoltura.appendChild(f);
    }
    const caja = document.createElement('div');
    caja.className = clase;
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', op.fondo === false ? 'false' : 'true');
    caja.innerHTML = (clase === 'hoja' ? '<div class="hoja-asa" aria-hidden="true"></div>' : '') + op.html;
    envoltura.appendChild(caja);
    $('#capas-flotantes').appendChild(envoltura);
    const capa = { envoltura, caja, alCerrar: op.alCerrar, cerrarAlTocarMapa: !!op.cerrarAlTocarMapa, nombre: op.nombre || '' };
    pila.push(capa);
    history.pushState({ izCapa: pila.length }, '');
    caja.addEventListener('click', (e) => {
      if (e.target.closest('[data-cerrar]')) cerrarCapa();
    });
    if (op.alMontar) op.alMontar(caja, capa);
    const foco = caja.querySelector('[autofocus]');
    if (foco) setTimeout(() => foco.focus(), 80);
    return caja;
  }
  /** Modo sin ventana (p. ej. colocar un círculo): el botón "atrás" lo cancela. */
  function abrirModo(alCerrar, nombre) {
    const capa = { envoltura: null, caja: null, alCerrar, nombre: nombre || 'modo' };
    pila.push(capa);
    history.pushState({ izCapa: pila.length }, '');
    return capa;
  }
  function cerrarCapa(desdeHistorial) {
    const capa = pila.pop();
    if (!capa) return Promise.resolve();
    if (capa.envoltura) capa.envoltura.remove();
    let promesa = Promise.resolve();
    if (!desdeHistorial) {
      popsPropios++;
      promesa = new Promise((resolver) => {
        esperasPop.push(resolver);
        setTimeout(resolver, 600);
      });
      history.back();
    }
    if (capa.alCerrar) {
      try {
        capa.alCerrar();
      } catch (e) {
        console.error(e);
      }
    }
    return promesa;
  }
  async function cerrarHasta(capa) {
    while (pila.includes(capa)) await cerrarCapa();
  }
  const capaSuperior = () => pila[pila.length - 1] || null;
  window.addEventListener('popstate', () => {
    if (popsPropios > 0) {
      popsPropios--;
      const r = esperasPop.shift();
      if (r) r();
      return;
    }
    if (pila.length) cerrarCapa(true);
  });

  function toast(mensaje, op) {
    op = op || {};
    const t = document.createElement('div');
    t.className = 'toast ' + (op.tipo || '');
    t.setAttribute('role', op.tipo === 'error' ? 'alert' : 'status');
    t.innerHTML = `<span>${esc(mensaje)}</span>` + (op.accion ? `<button type="button">${esc(op.accion)}</button>` : '');
    const quitar = () => t.remove();
    if (op.accion) {
      t.querySelector('button').addEventListener('click', () => {
        quitar();
        if (op.alAccion) op.alAccion();
      });
    }
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
    setTimeout(quitar, op.ms || (op.accion ? 6000 : 3200));
  }

  function confirmar(titulo, texto, op) {
    op = op || {};
    return new Promise((resolver) => {
      let respondido = false;
      const caja = abrirCapa({
        clase: 'modal',
        html:
          `<h3>${esc(titulo)}</h3>${texto ? `<p>${esc(texto)}</p>` : ''}` +
          `<div class="acciones"><button type="button" class="btn btn-sec" data-r="no">${esc(op.no || 'Cancelar')}</button>` +
          `<button type="button" class="btn ${op.peligro ? 'btn-peligro' : ''}" data-r="si">${esc(op.si || 'Aceptar')}</button></div>`,
        alCerrar: () => {
          if (!respondido) resolver(false);
        }
      });
      caja.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        respondido = true;
        cerrarCapa().then(() => resolver(b.dataset.r === 'si'));
      });
    });
  }

  const MENSAJES = {
    'usuario-existe': 'Ese usuario ya existe.',
    credenciales: 'Usuario o contraseña incorrectos.',
    'usuario-invalido': 'El usuario no es válido.',
    'muchos-intentos': 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
    'sin-red': 'Sin conexión a internet. Revisa tus datos o el Wi-Fi.',
    'clave-debil': 'La contraseña debe tener al menos 6 caracteres.',
    'metodo-desactivado': 'Falta activar este tipo de acceso en Firebase (Authentication → Método de acceso). Avísale al administrador.',
    'cuenta-desactivada': 'Esta cuenta fue desactivada.',
    'codigo-incorrecto': 'El código de acceso no es correcto.',
    'sin-permiso': 'No tienes permiso para hacer esto.',
    'solo-firebase': 'Esto solo funciona con Firebase configurado.',
    'no-existe': 'Ese dato ya no existe.',
    'registro-denegado':
      'No se pudo completar el registro. Si la comunidad usa código de acceso, vuelve a abrir esta página y escríbelo. (Administrador: revisa que las reglas de Firebase estén publicadas.)',
    'reglas-faltantes': 'Firebase todavía no tiene publicadas las reglas de seguridad (database.rules.json). Ver README, paso 4.'
  };
  const mensajeError = (e) => MENSAJES[e && e.codigo] || (e && e.message) || 'Ocurrió un error.';

  /** Cambia el contenido solo si es distinto (evita parpadeos) y conserva los «historiales» abiertos. */
  function ponerHTML(el, html) {
    if (!el || el._izHTML === html) return;
    const abiertos = new Set(Array.from(el.querySelectorAll('details[open][data-clave]')).map((d) => d.dataset.clave));
    el.innerHTML = html;
    el._izHTML = html;
    abiertos.forEach((k) => {
      const d = el.querySelector(`details[data-clave="${CSS.escape(k)}"]`);
      if (d) d.open = true;
    });
  }

  // =====================================================================
  //  Navegación entre pantallas
  // =====================================================================
  const rutaActual = () => (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  function ir(ruta, reemplazar) {
    const h = '#/' + ruta;
    if (location.hash === h) return enrutar();
    if (reemplazar) {
      history.replaceState(history.state, '', h);
      enrutar();
    } else location.hash = h;
  }
  function mostrarPantalla(id) {
    $$('.pantalla').forEach((p) => (p.hidden = p.id !== 'p-' + id));
    if (id !== 'app') document.documentElement.style.setProperty('--panel-alto', '0px');
    if (id !== 'app') window.scrollTo(0, 0);
  }
  const tieneRolApp = (s) => !!s && ROLES_APP.includes(s.rol);

  function enrutar() {
    while (pila.length) cerrarCapa(true);
    const s = est.sesion;
    if (s === undefined) return mostrarPantalla('cargando');
    const ruta = rutaActual();
    if (s && s.rol === 'error') {
      $('#error-texto').textContent = mensajeError(s.error) + ' Vuelve a intentar cuando tengas señal.';
      return mostrarPantalla('error');
    }
    if (s && s.rol === 'incompleto' && ruta !== 'completar') return mostrarIncompleto();
    switch (ruta) {
      case 'registro':
        return mostrarRegistro('nuevo');
      case 'salida':
        return s && s.rol === 'equipo' ? mostrarRegistro('salida') : ir('', true);
      case 'completar':
        return s && s.rol === 'incompleto' ? mostrarRegistro('completar') : ir('', true);
      case 'listo':
        return est.usuarioCreado ? mostrarListo() : ir(tieneRolApp(s) ? 'mapa' : '', true);
      case 'entrar':
        return mostrarEntrar();
      case 'ver':
        return entrarComoVisor();
      case 'admin':
        return mostrarAdminLogin();
      case 'mapa':
        return tieneRolApp(s) ? mostrarApp() : ir('', true);
      default:
        return mostrarInicio();
    }
  }

  function alCambiarSesion(s) {
    const antes = est.sesion;
    est.sesion = s || null;
    const clave = (x) => (x ? `${x.uid}|${x.rol}` : '');
    if (clave(antes) !== clave(est.sesion)) {
      detenerDatos();
      if (tieneRolApp(est.sesion)) iniciarDatos();
      if (!est.ocupado && antes !== undefined) enrutar();
    }
  }

  // =====================================================================
  //  Inicio
  // =====================================================================
  function mostrarInicio() {
    mostrarPantalla('inicio');
    const s = est.sesion;
    const activa = tieneRolApp(s);
    $('#inicio-sesion').hidden = !activa;
    if (activa) {
      $('#inicio-sesion-nombre').textContent = s.rol === 'admin' ? 'administrador' : s.rol === 'visor' ? 'visualizador' : s.usuario || '';
    }
  }

  // =====================================================================
  //  Registro de enviados (nuevo equipo, nueva salida o completar)
  // =====================================================================
  const BORRADOR = 'izalco.borradorRegistro';
  function mostrarRegistro(modo) {
    est.modoRegistro = modo;
    mostrarPantalla('registro');
    const titulos = { nuevo: 'Registro de enviados', salida: 'Nueva salida', completar: 'Completar registro' };
    const intros = {
      nuevo: 'Anota la fecha y a los hermanos que fueron enviados. Al terminar se crea tu usuario para entrar al mapa.',
      salida: 'Actualiza la fecha y los hermanos enviados en esta salida.',
      completar: 'Tu usuario ya existe; solo falta registrar a los hermanos del equipo.'
    };
    $('#registro-titulo').textContent = titulos[modo];
    $('#registro-intro').textContent = intros[modo];
    $('#reg-caja-usuario').hidden = modo !== 'nuevo';
    $('#registro-volver').setAttribute('href', modo === 'salida' ? '#/mapa' : '#/');
    $('#reg-enviar').textContent = modo === 'nuevo' ? 'Registrar y crear usuario' : 'Guardar';
    $('#reg-error').textContent = '';
    $('#reg-clave').value = '';
    $('#reg-clave2').value = '';
    $$('#form-registro .campo.invalido').forEach((c) => c.classList.remove('invalido'));

    let miembros = [{}, {}];
    let fecha = u.hoyISO();
    if (modo === 'salida' && est.equipo) {
      miembros = (est.equipo.miembros || []).filter(Boolean).map((m) => Object.assign({}, m));
    } else if (modo === 'nuevo') {
      const b = u.leerLocal(BORRADOR, null);
      if (b && Array.isArray(b.miembros) && b.miembros.length) {
        miembros = b.miembros;
        if (u.esFechaISO(b.fecha)) fecha = b.fecha;
      }
    }
    $('#reg-fecha').value = fecha;
    est.regMiembros = miembros;
    dibujarHermanos(miembros.length || 1, miembros);

    $('#reg-caja-codigo').hidden = true;
    if (modo !== 'salida') {
      est.backend
        .configPublica()
        .then((c) => ($('#reg-caja-codigo').hidden = !c.requiereCodigo))
        .catch(() => {});
    }
    actualizarVistaUsuario();
  }

  function tarjetaHermano(i, h) {
    h = h || {};
    return (
      `<fieldset class="tarjeta hermano" data-i="${i}">` +
      `<legend><span class="num-hermano">${i + 1}</span><span>Hermano ${i + 1}${i === 0 ? '<small>Con su nombre se crea el usuario</small>' : ''}</span></legend>` +
      `<div class="fila2">` +
      `<label class="campo"><span>Nombre</span><input name="nombre" autocomplete="off" autocapitalize="words" maxlength="60" value="${esc(h.nombre || '')}"></label>` +
      `<label class="campo"><span>Apellido</span><input name="apellido" autocomplete="off" autocapitalize="words" maxlength="60" value="${esc(h.apellido || '')}"></label>` +
      `</div>` +
      `<div class="detalles">` +
      `<p class="pista-bloqueo"><svg class="ico"><use href="#i-info"/></svg>Escribe el nombre y el apellido para continuar</p>` +
      `<div class="fila-edad">` +
      `<label class="campo"><span>Edad</span><input name="edad" type="number" inputmode="numeric" min="5" max="110" value="${esc(h.edad || '')}"></label>` +
      `<label class="campo"><span>Comunidad</span><input name="comunidad" list="lista-comunidades" maxlength="60" placeholder="Ej.: 1ª Comunidad" value="${esc(h.comunidad || '')}"></label>` +
      `</div>` +
      `<label class="campo"><span>Parroquia a la que pertenece</span><input name="parroquia" list="lista-parroquias" maxlength="100" value="${esc(h.parroquia || '')}"></label>` +
      `</div></fieldset>`
    );
  }
  function leerHermanosDelFormulario() {
    return $$('#reg-hermanos .hermano').map((card) => {
      const v = (n) => card.querySelector(`[name="${n}"]`).value;
      return { nombre: v('nombre'), apellido: v('apellido'), edad: v('edad'), parroquia: v('parroquia'), comunidad: v('comunidad') };
    });
  }
  function dibujarHermanos(n, valores) {
    const actuales = valores || leerHermanosDelFormulario();
    const primero = actuales[0] || {};
    const lista = [];
    for (let i = 0; i < n; i++) {
      const h = Object.assign({}, actuales[i] || {});
      if (i > 0 && !actuales[i]) {
        h.parroquia = primero.parroquia || '';
        h.comunidad = primero.comunidad || '';
      }
      lista.push(h);
    }
    $('#reg-hermanos').innerHTML = lista.map((h, i) => tarjetaHermano(i, h)).join('');
    $$('#reg-cuantos button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.n) === n)));
    actualizarBloqueos();
  }
  function actualizarBloqueos() {
    $$('#reg-hermanos .hermano').forEach((card) => {
      const ok = card.querySelector('[name="nombre"]').value.trim().length >= 2 && card.querySelector('[name="apellido"]').value.trim().length >= 2;
      const det = card.querySelector('.detalles');
      det.classList.toggle('bloqueado', !ok);
      det.classList.toggle('bloqueado-no', ok);
      det.querySelectorAll('input').forEach((inp) => (inp.disabled = !ok));
    });
  }
  function actualizarVistaUsuario() {
    const card = $('#reg-hermanos .hermano');
    if (!card) return;
    const base = u.usuarioBase(card.querySelector('[name="nombre"]').value, card.querySelector('[name="apellido"]').value);
    const listo = !!base && base.includes('.');
    $('#reg-usuario-vista').textContent = listo ? base : 'Escribe el nombre y el apellido del hermano 1';
    $('#reg-usuario-vista').classList.toggle('vacia', !listo);
  }
  function guardarBorrador() {
    if (est.modoRegistro !== 'nuevo') return;
    u.guardarLocal(BORRADOR, { fecha: $('#reg-fecha').value, miembros: leerHermanosDelFormulario() });
  }
  function marcarInvalido(input, mensaje) {
    const campo = input.closest('.campo');
    if (!campo) return;
    campo.classList.add('invalido');
    let msg = campo.querySelector('.msg');
    if (!msg) {
      msg = document.createElement('span');
      msg.className = 'msg';
      campo.appendChild(msg);
    }
    msg.textContent = mensaje;
  }
  function limpiarInvalido(input) {
    const campo = input.closest('.campo');
    if (!campo) return;
    campo.classList.remove('invalido');
    const msg = campo.querySelector('.msg');
    if (msg) msg.remove();
  }
  function validarRegistro() {
    $$('#form-registro .campo.invalido input').forEach(limpiarInvalido);
    let primero = null;
    const error = (input, msg) => {
      marcarInvalido(input, msg);
      if (!primero) primero = input;
    };
    const fechaInp = $('#reg-fecha');
    if (!u.esFechaISO(fechaInp.value)) error(fechaInp, 'Elige la fecha de la salida');
    const miembros = $$('#reg-hermanos .hermano').map((card) => {
      const inp = (n) => card.querySelector(`[name="${n}"]`);
      const h = {
        nombre: u.recortar(u.capitalizar(inp('nombre').value), 60),
        apellido: u.recortar(u.capitalizar(inp('apellido').value), 60),
        edad: u.edadDesdeTexto(inp('edad').value),
        parroquia: u.recortar(inp('parroquia').value.replace(/\s+/g, ' '), 100),
        comunidad: u.recortar(inp('comunidad').value.replace(/\s+/g, ' '), 60)
      };
      if (h.nombre.length < 2) error(inp('nombre'), 'Escribe el nombre');
      if (h.apellido.length < 2) error(inp('apellido'), 'Escribe el apellido');
      if (h.nombre.length >= 2 && h.apellido.length >= 2) {
        if (!h.edad || h.edad < 5 || h.edad > 110) error(inp('edad'), 'Edad no válida');
        if (!h.parroquia) error(inp('parroquia'), 'Escribe la parroquia');
        if (!h.comunidad) error(inp('comunidad'), 'Escribe la comunidad');
      }
      return h;
    });
    const datos = { fecha: fechaInp.value, solo: miembros.length === 1, miembros };
    if (est.modoRegistro === 'nuevo') {
      const base = u.usuarioBase(miembros[0].nombre, miembros[0].apellido);
      if (!base.includes('.') && miembros[0].nombre.length >= 2 && miembros[0].apellido.length >= 2) error($('#reg-hermanos [name="nombre"]'), 'Usa letras en el nombre y el apellido');
      const c1 = $('#reg-clave'), c2 = $('#reg-clave2');
      if (c1.value.length < 6) error(c1, 'Mínimo 6 caracteres');
      else if (c1.value !== c2.value) error(c2, 'Las contraseñas no coinciden');
      datos.usuarioBase = base;
      datos.clave = c1.value;
    }
    if (!$('#reg-caja-codigo').hidden) {
      datos.codigo = $('#reg-codigo').value.trim();
      if (!datos.codigo) error($('#reg-codigo'), 'Escribe el código');
    }
    if (primero) {
      $('#reg-error').textContent = 'Revisa los campos marcados en rojo.';
      primero.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => primero.focus({ preventScroll: true }), 300);
      return null;
    }
    $('#reg-error').textContent = '';
    return datos;
  }
  function preguntarUsuarioExistente(base) {
    return new Promise((resolver) => {
      let respondido = false;
      const caja = abrirCapa({
        clase: 'modal',
        html:
          `<h3>El usuario «${esc(base)}» ya existe</h3>` +
          `<p>Si es tuyo, entra con tu contraseña. Si es de otra persona con el mismo nombre, se creará un usuario con un número.</p>` +
          `<div class="acciones" style="flex-direction:column">` +
          `<button type="button" class="btn" data-r="entrar">Es mío: entrar con ${esc(base)}</button>` +
          `<button type="button" class="btn btn-sec" data-r="otro">No es mío: crear ${esc(base)}2</button>` +
          `<button type="button" class="btn btn-texto" data-r="no">Cancelar</button></div>`,
        alCerrar: () => {
          if (!respondido) resolver(null);
        }
      });
      caja.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        respondido = true;
        cerrarCapa().then(() => resolver(b.dataset.r));
      });
    });
  }
  async function enviarRegistro(e) {
    e.preventDefault();
    const datos = validarRegistro();
    if (!datos) return;
    const btn = $('#reg-enviar');
    const textoBtn = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    const equipo = { fecha: datos.fecha, solo: datos.solo, miembros: datos.miembros };
    try {
      if (est.modoRegistro === 'salida') {
        await est.backend.guardarEquipo(est.sesion.uid, equipo, { nuevaSalida: true });
        toast('Salida guardada', { tipo: 'ok' });
        return ir('mapa', true);
      }
      est.ocupado = true;
      if (est.modoRegistro === 'completar') {
        await est.backend.completarRegistro({ codigo: datos.codigo, equipo });
        est.ocupado = false;
        return ir('mapa', true);
      }
      let usuario = datos.usuarioBase;
      for (let intento = 1; ; intento++) {
        try {
          await est.backend.registrar({ usuario, clave: datos.clave, codigo: datos.codigo, equipo });
          break;
        } catch (err) {
          if (err.codigo !== 'usuario-existe' || intento > 40) throw err;
          if (intento === 1) {
            const r = await preguntarUsuarioExistente(datos.usuarioBase);
            if (r === 'entrar') {
              est.ocupado = false;
              ir('entrar');
              setTimeout(() => {
                $('#ent-usuario').value = datos.usuarioBase;
                $('#ent-clave').focus();
              }, 50);
              return;
            }
            if (r !== 'otro') return;
          }
          usuario = datos.usuarioBase + (intento + 1);
        }
      }
      u.guardarLocal(BORRADOR, null);
      est.usuarioCreado = usuario;
      est.ocupado = false;
      ir('listo', true);
    } catch (err) {
      $('#reg-error').textContent = mensajeError(err);
      if (err.codigo === 'codigo-incorrecto') marcarInvalido($('#reg-codigo'), 'Código incorrecto');
    } finally {
      est.ocupado = false;
      btn.disabled = false;
      btn.textContent = textoBtn;
    }
  }
  function mostrarListo() {
    mostrarPantalla('listo');
    const usuario = est.usuarioCreado;
    $('#listo-usuario').textContent = usuario;
    const texto = `${CONFIG.titulo}\nMi usuario es: ${usuario}\nEntra aquí: ${urlApp()}`;
    $('#listo-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
  }
  const urlApp = () => location.origin + location.pathname;

  // =====================================================================
  //  Entrar / visualizador / administrador
  // =====================================================================
  function mostrarEntrar() {
    mostrarPantalla('entrar');
    $('#ent-error').textContent = '';
  }
  async function enviarEntrar(e) {
    e.preventDefault();
    const usuario = u.normalizarUsuario($('#ent-usuario').value);
    const clave = $('#ent-clave').value;
    if (!usuario || !clave) {
      $('#ent-error').textContent = 'Escribe tu usuario y tu contraseña.';
      return;
    }
    $('#ent-usuario').value = usuario;
    const btn = $('#form-entrar button[type="submit"]');
    btn.disabled = true;
    est.ocupado = true;
    try {
      const s = await est.backend.entrar(usuario, clave);
      $('#ent-clave').value = '';
      est.ocupado = false;
      if (tieneRolApp(s)) ir('mapa', true);
      else enrutar();
    } catch (err) {
      $('#ent-error').textContent = mensajeError(err);
    } finally {
      est.ocupado = false;
      btn.disabled = false;
    }
  }

  async function entrarComoVisor() {
    if (tieneRolApp(est.sesion)) return ir('mapa', true);
    mostrarPantalla('cargando');
    let requiere = false;
    try {
      requiere = !!(await est.backend.configPublica()).requiereCodigo;
    } catch (err) {
      mostrarPantalla('visor');
      $('#vis-error').textContent = mensajeError(err);
      return;
    }
    if (requiere) {
      mostrarPantalla('visor');
      $('#vis-error').textContent = '';
      setTimeout(() => $('#vis-codigo').focus(), 50);
      return;
    }
    await entrarVisorCon('');
  }
  async function entrarVisorCon(codigo) {
    est.ocupado = true;
    try {
      await est.backend.entrarVisor(codigo);
      est.ocupado = false;
      ir('mapa', true);
    } catch (err) {
      mostrarPantalla('visor');
      $('#vis-error').textContent = mensajeError(err);
    } finally {
      est.ocupado = false;
    }
  }

  function mostrarAdminLogin() {
    if (est.sesion && est.sesion.rol === 'admin') return ir('mapa', true);
    mostrarPantalla('admin-login');
    const demo = est.backend.modo === 'demo';
    $('#adm-usuario-etq').textContent = demo ? 'Usuario' : 'Correo del administrador';
    $('#adm-usuario').setAttribute('inputmode', demo ? 'text' : 'email');
    $('#adm-pista-demo').hidden = !demo;
    $('#adm-clave-demo').textContent = (CONFIG.adminDemo && CONFIG.adminDemo.clave) || '';
    $('#adm-crear-caja').hidden = demo;
    $('#adm-error').textContent = '';
  }
  async function enviarAdmin(e) {
    e.preventDefault();
    const usuario = $('#adm-usuario').value.trim();
    const clave = $('#adm-clave').value;
    if (!usuario || !clave) {
      $('#adm-error').textContent = 'Escribe el usuario (o correo) y la contraseña.';
      return;
    }
    est.ocupado = true;
    $('#adm-enviar').disabled = true;
    try {
      const s = await est.backend.entrarAdmin(usuario, clave);
      $('#adm-clave').value = '';
      est.ocupado = false;
      if (s && s.rol === 'admin') ir('mapa', true);
      else enrutar();
    } catch (err) {
      $('#adm-error').textContent =
        err.codigo === 'credenciales' && est.backend.modo === 'firebase'
          ? 'Correo o contraseña incorrectos. Si todavía no creaste la cuenta del administrador, toca «Crear la cuenta del administrador» aquí abajo.'
          : mensajeError(err);
    } finally {
      est.ocupado = false;
      $('#adm-enviar').disabled = false;
    }
  }
  async function crearCuentaAdmin() {
    const correo = $('#adm-usuario').value.trim();
    const clave = $('#adm-clave').value;
    if (!correo.includes('@') || clave.length < 6) {
      $('#adm-error').textContent = 'Escribe arriba un correo y una contraseña de al menos 6 caracteres; luego toca «Crear la cuenta del administrador».';
      return;
    }
    const ok = await confirmar('¿Crear la cuenta del administrador?', `Se creará la cuenta ${correo}. Después tendrás que darle permiso de administrador en la consola de Firebase (te mostraremos cómo).`, { si: 'Crear cuenta' });
    if (!ok) return;
    est.ocupado = true;
    try {
      await est.backend.crearAdmin(correo, clave);
      est.ocupado = false;
      enrutar();
    } catch (err) {
      $('#adm-error').textContent = err.codigo === 'usuario-existe' ? 'Esa cuenta ya existe: entra con su contraseña.' : mensajeError(err);
    } finally {
      est.ocupado = false;
    }
  }
  function mostrarIncompleto() {
    mostrarPantalla('incompleto');
    $('#inc-cuenta').textContent = (est.sesion && (est.sesion.email || est.sesion.usuario)) || '';
    $('#inc-uid').textContent = (est.sesion && est.sesion.uid) || '';
  }

  async function salir(preguntar) {
    if (preguntar !== false) {
      const ok = await confirmar('¿Cerrar sesión?', est.sesion && est.sesion.rol === 'equipo' ? 'Dejarás de compartir tu ubicación con los hermanos.' : '', { si: 'Cerrar sesión' });
      if (!ok) return;
    }
    if (est.sesion && est.sesion.rol === 'equipo') est.backend.quitarUbicacion(est.dispositivo);
    detenerGPS();
    est.ocupado = true;
    try {
      await est.backend.salir();
    } catch (e) {
      console.warn(e);
    } finally {
      est.ocupado = false;
    }
    est.tab = null;
    ir('', true);
  }

  // =====================================================================
  //  App principal (mapa)
  // =====================================================================
  const TABS = {
    equipo: [
      { id: 'marcar', nombre: 'Marcar', ico: 'i-lapiz' },
      { id: 'vivo', nombre: 'En vivo', ico: 'i-vivo' },
      { id: 'equipo', nombre: 'Mi equipo', ico: 'i-grupo' }
    ],
    visor: [{ id: 'vivo', nombre: 'En vivo', ico: 'i-vivo' }],
    admin: [
      { id: 'mapa', nombre: 'Mapa', ico: 'i-mapa' },
      { id: 'equipos', nombre: 'Equipos', ico: 'i-grupo' },
      { id: 'visitas', nombre: 'Visitas', ico: 'i-lista' },
      { id: 'zonas', nombre: 'Zonas', ico: 'i-zona' },
      { id: 'mas', nombre: 'Descargar', ico: 'i-descargar' }
    ]
  };
  const VISTAS = { equipo: 'vista-equipo', equipos: 'vista-equipos', visitas: 'vista-visitas', zonas: 'vista-zonas', mas: 'vista-mas' };

  function crearMapa() {
    est.mapa = new IZ.Mapa($('#mapa'), { centro: CONFIG.centro, zoom: CONFIG.zoom, capa: est.capa });
    est.mapa.alTocarMarca(abrirDetalleMarca);
    est.mapa.alTocarZona(abrirDetalleZona);
    est.mapa.alTocarPersona(abrirDetallePersona);
    est.mapa.alTocarMapa(() => {
      const c = capaSuperior();
      if (c && c.cerrarAlTocarMapa) cerrarCapa();
    });
    est.primerEncuadre = true;
    if (window.ResizeObserver) {
      const obs = new ResizeObserver(() => actualizarRelleno());
      ['#barra-marcar', '#panel-vivo', '#panel-edicion'].forEach((s) => obs.observe($(s)));
    }
  }
  function mostrarApp() {
    mostrarPantalla('app');
    const s = est.sesion;
    if (!est.mapa) crearMapa();
    const tabs = TABS[s.rol];
    $('#tabs').hidden = tabs.length < 2;
    $('#tabs').innerHTML = tabs
      .map((t) => `<button type="button" class="tab" role="tab" data-tab="${t.id}" aria-selected="false"><span class="tab-ico"><svg class="ico"><use href="#${t.ico}"/></svg></span>${esc(t.nombre)}</button>`)
      .join('');
    $('#btn-salir-visor').hidden = s.rol !== 'visor';
    renderCabecera();
    if (!est.tab || !tabs.some((t) => t.id === est.tab)) est.tab = tabs[0].id;
    cambiarTab(est.tab);
    setTimeout(() => {
      est.mapa.invalidar();
      actualizarRelleno();
      if (est.primerEncuadre) encuadrarInicial();
    }, 60);
    if (s.rol === 'equipo') {
      if (est.compartir) iniciarGPS();
      preguntarSalidaSiCorresponde();
    }
  }
  /** Zonas que interesan ahora: la de hoy; si no hay, la próxima a visitar; si no, todas. */
  function zonasDeInteres() {
    const zonas = listaZonas();
    if (est.sesion && est.sesion.rol === 'admin') return zonas;
    const hoy = u.hoyISO();
    const deHoy = zonas.filter((z) => z.fecha === hoy);
    if (deHoy.length) return deHoy;
    const proximas = zonas.filter((z) => z.estado === 'proxima').sort((a, b) => String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')));
    return proximas.length ? [proximas[0]] : zonas;
  }
  function limitesDe(zonas) {
    const puntos = [];
    zonas.forEach((z) => (z.puntos || []).forEach((p) => puntos.push(p)));
    return puntos.length ? L.latLngBounds(puntos) : null;
  }
  function encuadrarInicial() {
    const b = limitesDe(zonasDeInteres());
    if (b) {
      est.primerEncuadre = false;
      est.mapa.ajustar(b, 17);
    }
  }
  function renderCabecera() {
    const s = est.sesion;
    if (!s || $('#p-app').hidden) return;
    let titulo = '', sub = '';
    if (s.rol === 'equipo') {
      titulo = s.usuario || 'Mi equipo';
      sub = est.equipo ? u.nombreEquipo(est.equipo.miembros) : '';
    } else if (s.rol === 'visor') {
      titulo = 'Modo visualizador';
      sub = 'Observas el mapa en vivo';
    } else {
      titulo = 'Administrador';
      sub = s.email || s.usuario || '';
    }
    $('#app-titulo').textContent = titulo;
    $('#app-sub').textContent = sub;
    actualizarIndicadorRed();
    actualizarIndicadorGPS();
  }
  function cambiarTab(id) {
    if (est.colocando) cerrarHasta(est.colocando.capaModo);
    if (est.zonaModo) cancelarModoZona();
    est.tab = id;
    $$('#tabs .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
    $$('.vista').forEach((v) => (v.hidden = v.id !== VISTAS[id]));
    $('#barra-marcar').hidden = id !== 'marcar';
    $('#panel-vivo').hidden = !(id === 'vivo' || id === 'mapa');
    $('#panel-edicion').hidden = true;
    if (!VISTAS[id]) {
      est.mapa.invalidar();
      actualizarRelleno();
    }
    renderTodo();
    if (VISTAS[id]) renderVista(id);
  }
  function actualizarRelleno() {
    if ($('#p-app').hidden) return;
    const alto = ['#barra-marcar', '#panel-vivo', '#panel-edicion'].map((s) => $(s)).filter((p) => !p.hidden).reduce((m, p) => Math.max(m, p.offsetHeight), 0);
    document.documentElement.style.setProperty('--panel-alto', alto + 'px');
    if (est.mapa) est.mapa.setRellenoInferior(alto);
  }

  // ---------- Datos en tiempo real ----------
  function iniciarDatos() {
    const b = est.backend, s = est.sesion;
    const alError = (e) => toast(mensajeError(e), { tipo: 'error' });
    est.subs.push(b.escucharMarcas((v) => { est.marcas = v || {}; programarRender(); }, alError));
    est.subs.push(b.escucharUbicaciones((v) => { est.ubicaciones = v || {}; programarRender(); }, alError));
    est.subs.push(b.escucharZonas((v) => { est.zonas = v || {}; programarRender(); }, alError));
    if (s.rol === 'equipo') {
      est.subs.push(
        b.escucharEquipo(s.uid, (v) => {
          const nombreAntes = nombreEquipoActual();
          est.equipo = v;
          // Si cambió el nombre del equipo, se actualiza la etiqueta de la ubicación en vivo.
          if (nombreEquipoActual() !== nombreAntes && est.ultimaPublicada) publicarUbicacion(true);
          renderCabecera();
          if (est.tab === 'equipo') renderVista('equipo');
          preguntarSalidaSiCorresponde();
        })
      );
    }
    if (s.rol === 'admin') {
      est.subs.push(b.escucharEquipos((v) => { est.equipos = v || {}; programarRender(); }, alError));
      est.subs.push(b.escucharSalidas((v) => { est.salidas = v || {}; programarRender(); }, alError));
      if (b.inicializarZonas) {
        b.inicializarZonas()
          .then((r) => {
            if (r === 'cargadas') toast('Se cargaron las zonas iniciales.');
            if (r === 'corregidas') toast('Se actualizaron las zonas iniciales: Av. Morazán, de la iglesia a La Unión / La Libertad.', { tipo: 'ok' });
          })
          .catch(() => {});
      }
    }
    est.relojes.push(setInterval(() => programarRender(), 15000));
    est.relojes.push(setInterval(() => publicarUbicacion(false), 20000));
  }
  function detenerDatos() {
    est.subs.forEach((f) => {
      try {
        if (typeof f === 'function') f();
      } catch (e) {
        /* nada */
      }
    });
    est.subs = [];
    est.relojes.forEach(clearInterval);
    est.relojes = [];
    detenerGPS();
    liberarPantalla();
    est.pantallaEncendida = false;
    est.marcas = {};
    est.ubicaciones = {};
    est.zonas = {};
    est.equipos = {};
    est.salidas = {};
    est.equipo = null;
    est.preguntoSalida = false;
    est.ultimaPublicada = null;
    est.colocando = null;
    est.zonaModo = null;
    est.adminEquipo = '';
    est.firmaZonas = '';
    est.primerEncuadre = true;
    ['#vista-equipos', '#vista-visitas', '#vista-mas'].forEach((s) => {
      const v = $(s);
      if (v) {
        v.innerHTML = '';
        delete v.dataset.montado;
      }
    });
    if (est.mapa) {
      est.mapa.terminarModos();
      est.mapa.setMarcas([]);
      est.mapa.setPersonas([]);
      est.mapa.setZonas([]);
      est.mapa.setMiUbicacion(null);
      est.mapa.seleccionar(null);
    }
  }
  const programarRender = u.enCuadro(() => renderTodo());

  function renderTodo() {
    if (!est.mapa || !tieneRolApp(est.sesion) || $('#p-app').hidden) return;
    renderZonasMapa();
    renderMarcasMapa();
    renderPersonasMapa();
    renderResumenVivo();
    renderChipEquipo();
    if (VISTAS[est.tab]) renderVista(est.tab, true);
  }
  function listaZonas() {
    return Object.entries(est.zonas || {})
      .filter(([, z]) => z && Array.isArray(z.puntos))
      .map(([id, z]) => Object.assign({ id }, z))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }));
  }
  function renderZonasMapa() {
    const ocultar = est.zonaModo && est.zonaModo.id;
    const firma = JSON.stringify(est.zonas) + '|' + (ocultar || '');
    if (firma === est.firmaZonas) return;
    est.firmaZonas = firma;
    est.mapa.setZonas(listaZonas(), { ocultarId: ocultar });
    if (est.primerEncuadre && !$('#p-app').hidden) encuadrarInicial();
  }
  function marcasFiltradas(ignorarEquipo) {
    const hoy = u.hoyISO();
    const desde = est.filtro === 'hoy' ? hoy : est.filtro === '7dias' ? u.sumarDias(hoy, -6) : null;
    const lista = [];
    for (const [id, m] of Object.entries(est.marcas || {})) {
      if (!m || typeof m.lat !== 'number' || typeof m.lng !== 'number') continue;
      if (desde && String(m.fecha || '') < desde) continue;
      if (!ignorarEquipo && est.adminEquipo && m.uid !== est.adminEquipo) continue;
      lista.push(Object.assign({ id }, m));
    }
    return lista;
  }
  function renderMarcasMapa() {
    const s = est.sesion;
    est.mapa.setMarcas(marcasFiltradas(), {
      miUid: s && s.uid,
      resaltarPropias: s && s.rol === 'equipo' && est.tab === 'marcar',
      ocultarId: est.colocando && est.colocando.moverId
    });
  }
  function personasEnLinea() {
    const ahora = est.backend.ahora();
    const s = est.sesion;
    const lista = [];
    for (const [uid, disps] of Object.entries(est.ubicaciones || {})) {
      for (const [disp, p] of Object.entries(disps || {})) {
        if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
        const edad = ahora - (p.t || 0);
        if (edad > OCULTO_MS) continue;
        const propio = !!s && uid === s.uid && disp === est.dispositivo;
        lista.push({
          clave: uid + '/' + disp, uid, disp, lat: p.lat, lng: p.lng, prec: p.prec, t: p.t,
          usuario: p.usuario || '', equipo: p.equipo || p.usuario || 'Hermano',
          inactivo: edad > INACTIVO_MS, propio, mismoEquipo: !!s && uid === s.uid && !propio
        });
      }
    }
    lista.sort((a, b) => (b.t || 0) - (a.t || 0));
    return lista;
  }
  const etiquetaCorta = (equipo) => {
    const partes = String(equipo || '').split(/,\s*|\s+y\s+/).filter(Boolean);
    return partes.length > 1 ? `${partes[0]} +${partes.length - 1}` : partes[0] || '';
  };
  function renderPersonasMapa() {
    const lista = personasEnLinea().filter((p) => !p.propio);
    est.mapa.setPersonas(lista.map((p) => Object.assign({}, p, { iniciales: u.iniciales(p.equipo), etiqueta: etiquetaCorta(p.equipo), color: u.colorDeTexto(p.uid) })));
  }
  function renderResumenVivo() {
    const personas = personasEnLinea().filter((p) => !p.inactivo);
    const hoy = u.hoyISO();
    const marcas = Object.values(est.marcas || {}).filter(Boolean);
    $('#n-linea').textContent = personas.length;
    $('#n-hoy').textContent = marcas.filter((m) => m.fecha === hoy).length;
    $('#n-total').textContent = marcas.length;
    if (!$('#panel-vivo').hidden && est.vivoAbierto) renderListasVivo();
  }
  function renderListasVivo() {
    const ahora = est.backend.ahora();
    const personas = personasEnLinea();
    const yo = est.miPos;
    ponerHTML($('#lista-linea'), personas.length
      ? personas
          .map((p) => {
            const dist = yo && !p.propio ? ' · a ' + u.textoDistancia(u.distancia(yo.lat, yo.lng, p.lat, p.lng)) : '';
            return (
              `<li class="tocable" data-persona="${esc(p.clave)}">` +
              `<span class="avatar${p.inactivo ? ' inactivo' : ''}" style="--c:${u.colorDeTexto(p.uid)}">${esc(u.iniciales(p.equipo))}</span>` +
              `<span class="txt"><b>${esc(p.equipo)}${p.propio ? ' (tú)' : ''}</b><small>${esc(p.usuario)} · ${esc(u.haceCuanto(p.t, ahora))}${esc(dist)}</small></span>` +
              `<svg class="ico" aria-hidden="true"><use href="#i-pin"/></svg></li>`
            );
          })
          .join('')
      : '<li class="vacio">Nadie está compartiendo su ubicación en este momento.</li>');
    const recientes = Object.entries(est.marcas || {})
      .filter(([, m]) => m)
      .map(([id, m]) => Object.assign({ id }, m))
      .sort((a, b) => (b.creado || 0) - (a.creado || 0))
      .slice(0, 12);
    ponerHTML($('#lista-actividad'), recientes.length
      ? recientes
          .map((m) => {
            const t = IZ.TIPO[m.tipo] || IZ.TIPOS[0];
            return (
              `<li class="tocable" data-marca="${esc(m.id)}"><span class="bolita" style="--c:${t.color}"></span>` +
              `<span class="txt"><b>${esc(t.nombre)}</b><small>${esc(m.equipo || m.usuario || '')} · ${esc(u.fechaCorta(m.fecha))} ${esc(u.hora(m.creado))}</small></span></li>`
            );
          })
          .join('')
      : '<li class="vacio">Todavía no hay círculos.</li>');
  }
  function renderLeyenda() {
    $('#leyenda').innerHTML =
      IZ.TIPOS.map((t) => `<span><span class="bolita" style="--c:${t.color}"></span>${esc(t.nombre)}</span>`).join('') +
      Object.values(IZ.ESTADOS_ZONA).map((z) => `<span><span class="zona-muestra" style="--c:${z.color}"></span>Zona ${esc(z.nombre.toLowerCase())}</span>`).join('') +
      `<span><span class="avatar" style="--c:#6d4c41;width:18px;height:18px;font-size:0;border-width:1px"></span>Hermano en vivo</span>`;
  }
  function renderChipEquipo() {
    let chip = $('#chip-equipo');
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.id = 'chip-equipo';
      chip.className = 'chips chip-filtro';
      chip.addEventListener('click', () => {
        est.adminEquipo = '';
        programarRender();
      });
      $('.mapa-arriba').appendChild(chip);
    }
    const eq = est.adminEquipo && est.equipos[est.adminEquipo];
    chip.hidden = !est.adminEquipo;
    if (est.adminEquipo) chip.innerHTML = `<span>Solo: <b>${esc((eq && eq.usuario) || 'equipo')}</b></span><svg class="ico"><use href="#i-x"/></svg>`;
  }

  // ---------- Detalles al tocar el mapa ----------
  function zonaDeMarca(m) {
    return listaZonas().find((z) => u.puntoEnPoligono(m.lat, m.lng, z.puntos)) || null;
  }
  const puedeEditarMarca = (m) => !!est.sesion && (est.sesion.rol === 'admin' || (est.sesion.rol === 'equipo' && m.uid === est.sesion.uid));

  function abrirDetalleMarca(id) {
    const m = est.marcas[id];
    if (!m) return;
    while (pila.length && capaSuperior().cerrarAlTocarMapa) cerrarCapa();
    const t = IZ.TIPO[m.tipo] || IZ.TIPOS[0];
    const editable = puedeEditarMarca(m);
    const zona = zonaDeMarca(m);
    est.mapa.seleccionar(id, [m.lat, m.lng]);
    const fila = (a, b) => `<div class="detalle-fila"><span>${a}</span><span>${b}</span></div>`;
    const html =
      `<h3><span class="bolita" style="--c:${t.color}"></span>${esc(t.nombre)}` +
      `<button type="button" class="btn-icono cerrar-hoja" data-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-x"/></svg></button></h3>` +
      fila('Enviados', esc(m.equipo || '—')) +
      fila('Usuario', esc(m.usuario || '—')) +
      fila('Fecha', esc(u.fechaLarga(m.fecha)) + (m.creado ? ', ' + esc(u.hora(m.creado)) : '')) +
      (typeof m.personas === 'number' && m.personas > 0 ? fila('Personas', String(m.personas)) : '') +
      (m.nota ? fila('Nota', esc(m.nota)) : '') +
      (zona ? fila('Zona', esc(zona.nombre)) : '') +
      `<div class="acciones-detalle">` +
      (editable
        ? `<button type="button" class="btn btn-sec" data-accion="editar-marca"><svg class="ico"><use href="#i-lapiz"/></svg>Editar</button>` +
          `<button type="button" class="btn btn-sec" data-accion="mover-marca"><svg class="ico"><use href="#i-mover"/></svg>Mover</button>` +
          `<button type="button" class="btn btn-peligro-sec" data-accion="borrar-marca"><svg class="ico"><use href="#i-basura"/></svg>Borrar</button>`
        : '') +
      `<a class="btn btn-sec" style="grid-column:1/-1;flex-direction:row" href="${esc(u.enlaceMapa(m.lat, m.lng))}" target="_blank" rel="noopener"><svg class="ico"><use href="#i-ruta"/></svg>Cómo llegar (Google Maps)</a>` +
      `</div>`;
    abrirCapa({
      html,
      fondo: false,
      cerrarAlTocarMapa: true,
      nombre: 'detalle',
      alCerrar: () => est.mapa.seleccionar(null),
      alMontar: (caja) => {
        caja.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-accion]');
          if (!b) return;
          const accion = b.dataset.accion;
          if (accion === 'editar-marca') {
            await cerrarCapa();
            abrirEditarMarca(id);
          } else if (accion === 'mover-marca') {
            await cerrarCapa();
            if (est.sesion.rol === 'equipo' && est.tab !== 'marcar') cambiarTab('marcar');
            iniciarColocacion({ moverId: id });
          } else if (accion === 'borrar-marca') {
            await cerrarCapa();
            const ok = await confirmar('¿Borrar este círculo?', `${t.nombre} · ${u.fechaLarga(m.fecha)}`, { si: 'Borrar', peligro: true });
            if (!ok) return;
            try {
              await est.backend.borrarMarca(id);
              toast('Círculo borrado');
            } catch (err) {
              toast(mensajeError(err), { tipo: 'error' });
            }
          }
        });
      }
    });
  }

  function abrirDetallePersona(clave) {
    const p = personasEnLinea().find((x) => x.clave === clave);
    if (!p) return;
    while (pila.length && capaSuperior().cerrarAlTocarMapa) cerrarCapa();
    const ahora = est.backend.ahora();
    const yo = est.miPos;
    const fila = (a, b) => `<div class="detalle-fila"><span>${a}</span><span>${b}</span></div>`;
    abrirCapa({
      fondo: false,
      cerrarAlTocarMapa: true,
      html:
        `<h3><span class="avatar" style="--c:${u.colorDeTexto(p.uid)}">${esc(u.iniciales(p.equipo))}</span>${esc(p.equipo)}` +
        `<button type="button" class="btn-icono cerrar-hoja" data-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-x"/></svg></button></h3>` +
        fila('Usuario', esc(p.usuario)) +
        fila('Actualizado', esc(u.haceCuanto(p.t, ahora)) + (p.inactivo ? ' (sin moverse o sin señal)' : '')) +
        (p.prec ? fila('Precisión', `± ${Math.round(p.prec)} m`) : '') +
        (yo ? fila('Distancia', esc(u.textoDistancia(u.distancia(yo.lat, yo.lng, p.lat, p.lng)))) : '') +
        `<div class="acciones"><a class="btn btn-sec" href="${esc(u.enlaceMapa(p.lat, p.lng))}" target="_blank" rel="noopener"><svg class="ico"><use href="#i-ruta"/></svg>Cómo llegar</a></div>`
    });
  }

  function abrirDetalleZona(id) {
    const z = est.zonas[id];
    if (!z) return;
    while (pila.length && capaSuperior().cerrarAlTocarMapa) cerrarCapa();
    const e = IZ.ESTADOS_ZONA[z.estado] || IZ.ESTADOS_ZONA.pendiente;
    const dentro = Object.values(est.marcas || {}).filter((m) => m && u.puntoEnPoligono(m.lat, m.lng, z.puntos));
    const esAdmin = est.sesion && est.sesion.rol === 'admin';
    abrirCapa({
      fondo: false,
      cerrarAlTocarMapa: true,
      html:
        `<h3><span class="zona-barra" style="--c:${e.color};height:24px"></span>${esc(z.nombre)}` +
        `<button type="button" class="btn-icono cerrar-hoja" data-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-x"/></svg></button></h3>` +
        `<p><span class="etiqueta ${claseEstado(z.estado)}">${esc(e.nombre)}</span> ${z.fecha ? esc(u.fechaLarga(z.fecha)) : ''}</p>` +
        (z.nota ? `<p class="suave">${esc(z.nota)}</p>` : '') +
        `<p><b>${u.plural(dentro.length, 'círculo')}</b> dentro de la zona:</p>` +
        `<div class="tipos-resumen">${IZ.TIPOS.map((t) => `<span><span class="bolita" style="--c:${t.color}"></span>${esc(t.corto)}: <b>${dentro.filter((m) => m.tipo === t.id).length}</b></span>`).join('')}</div>` +
        (esAdmin
          ? `<div class="acciones"><button type="button" class="btn btn-sec" data-accion="zona-datos">Editar datos</button><button type="button" class="btn btn-sec" data-accion="zona-forma">Editar forma</button></div>`
          : ''),
      alMontar: (caja) =>
        caja.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-accion]');
          if (!b) return;
          await cerrarCapa();
          if (b.dataset.accion === 'zona-datos') abrirFormZona(id);
          if (b.dataset.accion === 'zona-forma') iniciarEdicionForma(id);
        })
    });
  }
  const claseEstado = (estado) => ({ visitada: 'verde', proxima: 'naranja' })[estado] || 'gris';

  // ---------- Barra de círculos y colocación ----------
  function renderBarraCirculos() {
    $('#circulos').innerHTML = IZ.TIPOS.map(
      (t) =>
        `<button type="button" class="circulo" role="radio" data-tipo="${t.id}" aria-checked="${t.id === est.tipoSel}" title="${esc(t.nombre)}">` +
        `<span class="punto" style="--c:${t.color}"></span>${esc(t.corto)}</button>`
    ).join('');
  }
  function elegirTipo(tipo) {
    if (!IZ.TIPO[tipo]) return;
    est.tipoSel = tipo;
    $$('#circulos .circulo').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tipo === tipo)));
  }
  function mostrarAvisoMapa(texto, botones) {
    const aviso = $('#aviso-mapa');
    $('#aviso-mapa-texto').textContent = texto;
    const cont = $('#aviso-mapa-botones');
    cont.innerHTML = '';
    (botones || []).forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn ' + (b.clase || '');
      el.innerHTML = (b.ico ? `<svg class="ico"><use href="#${b.ico}"/></svg>` : '') + esc(b.texto);
      el.addEventListener('click', b.accion);
      cont.appendChild(el);
    });
    aviso.hidden = false;
  }
  const ocultarAvisoMapa = () => ($('#aviso-mapa').hidden = true);

  function iniciarColocacion(op) {
    op = op || {};
    const s = est.sesion;
    if (!s || !(s.rol === 'equipo' || (s.rol === 'admin' && op.moverId))) return;
    if (est.colocando) return;
    while (pila.length) cerrarCapa();
    const moviendo = op.moverId ? est.marcas[op.moverId] : null;
    est.colocando = {
      moverId: op.moverId || null,
      tipo: moviendo ? moviendo.tipo : est.tipoSel,
      personas: moviendo && typeof moviendo.personas === 'number' ? moviendo.personas : 0,
      nota: '',
      latlng: null,
      formAbierto: false
    };
    est.colocando.capaModo = abrirModo(terminarColocacion, 'colocar');
    est.mapa.iniciarColocar((latlng) => colocarEn(latlng));
    mostrarAvisoMapa(moviendo ? 'Toca el mapa en el nuevo lugar del círculo' : 'Toca el mapa en el lugar que visitaron', [
      { texto: 'Mi ubicación', ico: 'i-ubicar', clase: 'btn-sec', accion: colocarEnMiUbicacion },
      { texto: 'Cancelar', clase: 'btn-sec', accion: () => cerrarHasta(est.colocando && est.colocando.capaModo) }
    ]);
    $('#barra-marcar').hidden = true;
    actualizarRelleno();
    renderMarcasMapa();
  }
  function terminarColocacion() {
    const c = est.colocando;
    est.colocando = null;
    est.colocarAlTenerGPS = false;
    est.mapa.terminarModos();
    ocultarAvisoMapa();
    $('#barra-marcar').hidden = est.tab !== 'marcar';
    actualizarRelleno();
    renderMarcasMapa();
    if (c && c.formCapa && pila.includes(c.formCapa)) cerrarCapa();
  }
  function colocarEn(latlng) {
    const c = est.colocando;
    if (!c) return;
    c.latlng = latlng;
    est.mapa.ponerBorrador(latlng, c.tipo);
    u.vibrar(20);
    if (!c.formAbierto) abrirFormColocacion();
    else {
      // Si el punto quedó detrás de la hoja, se vuelve a centrar
      const hoja = c.formCapa && c.formCapa.caja;
      const y = est.mapa.map.latLngToContainerPoint(latlng).y + $('#mapa').getBoundingClientRect().top;
      if (hoja && y > hoja.getBoundingClientRect().top - 20) centrarBorrador();
    }
  }
  function colocarEnMiUbicacion() {
    if (!est.miPos) {
      est.colocarAlTenerGPS = true;
      iniciarGPS();
      toast(est.gpsEstado === 'denegado' ? 'La ubicación está bloqueada: actívala en el navegador.' : 'Buscando tu ubicación…');
      return;
    }
    const ll = L.latLng(est.miPos.lat, est.miPos.lng);
    colocarEn(ll);
    centrarBorrador();
  }
  function chipsTipo(sel) {
    return IZ.TIPOS.map(
      (t) => `<button type="button" class="chip-tipo" role="radio" data-tipo="${t.id}" aria-checked="${t.id === sel}"><span class="bolita" style="--c:${t.color}"></span>${esc(t.nombre)}</button>`
    ).join('');
  }
  function htmlCamposMarca(tipo, personas, nota) {
    return (
      `<div class="chips-tipo" role="radiogroup" aria-label="Tipo de círculo">${chipsTipo(tipo)}</div>` +
      `<div class="fila-contador"><span>¿Cuántas personas escucharon?<br><small class="suave">(opcional)</small></span>` +
      `<div class="contador"><button type="button" data-contar="-1" aria-label="Menos"><svg class="ico"><use href="#i-menos"/></svg></button>` +
      `<output id="f-personas">${personas || 0}</output>` +
      `<button type="button" data-contar="1" aria-label="Más"><svg class="ico"><use href="#i-mas"/></svg></button></div></div>` +
      `<label class="campo"><span>Nota (opcional)</span><textarea id="f-nota" maxlength="500" rows="1" placeholder="Ej.: familia Pérez, piden oración">${esc(nota || '')}</textarea></label>`
    );
  }
  function conectarCamposMarca(caja, estadoForm, alCambiarTipo) {
    caja.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-tipo');
      if (chip) {
        estadoForm.tipo = chip.dataset.tipo;
        caja.querySelectorAll('.chip-tipo').forEach((b) => b.setAttribute('aria-checked', String(b === chip)));
        if (alCambiarTipo) alCambiarTipo(estadoForm.tipo);
      }
      const cont = e.target.closest('[data-contar]');
      if (cont) {
        estadoForm.personas = Math.max(0, Math.min(500, (estadoForm.personas || 0) + Number(cont.dataset.contar)));
        caja.querySelector('#f-personas').textContent = estadoForm.personas;
      }
    });
  }
  function abrirFormColocacion() {
    const c = est.colocando;
    c.formAbierto = true;
    const moviendo = !!c.moverId;
    const html = moviendo
      ? `<h3>Mover círculo</h3><p class="suave">Si no quedó en el lugar correcto, toca otra parte del mapa.</p>` +
        `<div class="acciones"><button type="button" class="btn btn-sec" data-accion="cancelar">Cancelar</button>` +
        `<button type="button" class="btn" data-accion="guardar"><svg class="ico"><use href="#i-check"/></svg>Guardar aquí</button></div>`
      : `<h3>Nuevo círculo</h3>` +
        htmlCamposMarca(c.tipo, c.personas, c.nota) +
        `<p class="pista">¿Quedó en otro lugar? Toca el mapa para moverlo.</p>` +
        `<div class="acciones"><button type="button" class="btn btn-sec" data-accion="cancelar">Cancelar</button>` +
        `<button type="button" class="btn" data-accion="guardar"><svg class="ico"><use href="#i-check"/></svg>Guardar</button></div>`;
    const caja = abrirCapa({
      html,
      clase: 'hoja hoja-compacta',
      fondo: false,
      nombre: 'form-colocar',
      alCerrar: () => {
        if (est.colocando) {
          est.colocando.formAbierto = false;
          $('#aviso-mapa').hidden = false;
        }
        actualizarRelleno();
      },
      alMontar: (caja) => {
        if (!moviendo) {
          conectarCamposMarca(caja, c, (tipo) => {
            if (c.latlng) est.mapa.ponerBorrador(c.latlng, tipo);
          });
          caja.querySelector('#f-nota').addEventListener('input', (e) => (c.nota = e.target.value));
        }
        caja.addEventListener('click', (e) => {
          const b = e.target.closest('[data-accion]');
          if (!b) return;
          if (b.dataset.accion === 'guardar') guardarColocacion();
          if (b.dataset.accion === 'cancelar') cerrarHasta(c.capaModo);
        });
      }
    });
    c.formCapa = capaSuperior();
    $('#aviso-mapa').hidden = true;
    requestAnimationFrame(() => centrarBorrador());
  }
  /** Deja el círculo nuevo a la vista, entre la barra superior del mapa y la hoja del formulario. */
  function centrarBorrador() {
    const c = est.colocando;
    if (!c || !c.latlng) return;
    const hoja = c.formCapa && c.formCapa.caja;
    const arriba = $('#mapa').getBoundingClientRect().top + 60;
    const abajo = hoja ? hoja.getBoundingClientRect().top : window.innerHeight;
    est.mapa.centrarEnAltura(c.latlng.lat, c.latlng.lng, Math.max(est.mapa.map.getZoom(), 17.5), (arriba + abajo) / 2);
  }
  async function guardarColocacion() {
    const c = est.colocando;
    if (!c || !c.latlng) return;
    const lat = u.redondear(c.latlng.lat);
    const lng = u.redondear(c.latlng.lng);
    try {
      if (c.moverId) {
        await est.backend.editarMarca(c.moverId, { lat, lng });
        toast('Círculo movido', { tipo: 'ok' });
      } else {
        const datos = { tipo: c.tipo, lat, lng, fecha: u.hoyISO(), equipo: nombreEquipoActual(), personas: c.personas || 0 };
        const nota = u.recortar(c.nota, 500);
        if (nota) datos.nota = nota;
        const id = await est.backend.agregarMarca(datos);
        elegirTipo(c.tipo);
        toast(`${IZ.TIPO[c.tipo].nombre}: guardado`, {
          tipo: 'ok',
          accion: 'Deshacer',
          alAccion: () => est.backend.borrarMarca(id).catch((e) => toast(mensajeError(e), { tipo: 'error' }))
        });
      }
      u.vibrar(40);
      cerrarHasta(c.capaModo);
    } catch (err) {
      toast(mensajeError(err), { tipo: 'error' });
    }
  }
  function abrirEditarMarca(id) {
    const m = est.marcas[id];
    if (!m) return;
    const f = { tipo: m.tipo, personas: typeof m.personas === 'number' ? m.personas : 0 };
    abrirCapa({
      html:
        `<h3>Editar círculo<button type="button" class="btn-icono cerrar-hoja" data-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-x"/></svg></button></h3>` +
        htmlCamposMarca(m.tipo, f.personas, m.nota) +
        `<div class="acciones"><button type="button" class="btn btn-sec" data-cerrar>Cancelar</button>` +
        `<button type="button" class="btn" data-accion="guardar"><svg class="ico"><use href="#i-check"/></svg>Guardar</button></div>`,
      alMontar: (caja) => {
        conectarCamposMarca(caja, f);
        caja.addEventListener('click', async (e) => {
          if (!e.target.closest('[data-accion="guardar"]')) return;
          const nota = u.recortar(caja.querySelector('#f-nota').value, 500);
          try {
            await est.backend.editarMarca(id, { tipo: f.tipo, personas: f.personas || 0, nota: nota || null });
            await cerrarCapa();
            toast('Cambios guardados', { tipo: 'ok' });
          } catch (err) {
            toast(mensajeError(err), { tipo: 'error' });
          }
        });
      }
    });
  }
  function nombreEquipoActual() {
    return u.recortar((est.equipo && u.nombreEquipo(est.equipo.miembros)) || (est.sesion && est.sesion.usuario) || '', 200);
  }

  // ---------- "¿Salen hoy?" ----------
  function preguntarSalidaSiCorresponde() {
    if (est.preguntoSalida || !est.equipo || !est.sesion || est.sesion.rol !== 'equipo') return;
    if (rutaActual() !== 'mapa' || $('#p-app').hidden || pila.length) return;
    const hoy = u.hoyISO();
    if (est.equipo.fecha === hoy) return;
    est.preguntoSalida = true;
    const miembros = (est.equipo.miembros || []).filter(Boolean);
    const caja = abrirCapa({
      clase: 'modal',
      html:
        `<h3>¿Salen hoy a evangelizar?</h3>` +
        `<p>Tu último registro es del <b>${esc(u.fechaLarga(est.equipo.fecha))}</b> con: ${esc(miembros.map(u.nombreCompleto).join(', '))}.</p>` +
        `<div class="acciones" style="flex-direction:column">` +
        `<button type="button" class="btn" data-r="mismo">Sí, con los mismos hermanos</button>` +
        `<button type="button" class="btn btn-sec" data-r="cambiar">Sí, pero cambiar hermanos</button>` +
        `<button type="button" class="btn btn-texto" data-r="no">Ahora no</button></div>`
    });
    caja.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      await cerrarCapa();
      if (b.dataset.r === 'mismo') {
        try {
          await est.backend.guardarEquipo(est.sesion.uid, { fecha: hoy, solo: miembros.length === 1, miembros }, { nuevaSalida: true });
          toast('Salida de hoy registrada', { tipo: 'ok' });
        } catch (err) {
          toast(mensajeError(err), { tipo: 'error' });
        }
      } else if (b.dataset.r === 'cambiar') ir('salida');
    });
  }

  // =====================================================================
  //  GPS, ubicación en vivo y pantalla encendida
  // =====================================================================
  function iniciarGPS() {
    if (est.gpsWatch != null) return;
    if (!('geolocation' in navigator)) {
      est.gpsEstado = 'no-soportado';
      return actualizarIndicadorGPS();
    }
    est.gpsEstado = est.miPos ? 'ok' : 'buscando';
    actualizarIndicadorGPS();
    est.gpsWatch = navigator.geolocation.watchPosition(alPosicion, alErrorGPS, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  function detenerGPS() {
    if (est.gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(est.gpsWatch);
    est.gpsWatch = null;
  }
  function alPosicion(pos) {
    const c = pos.coords;
    est.miPos = { lat: c.latitude, lng: c.longitude, prec: Math.round(c.accuracy || 0), t: Date.now() };
    est.gpsEstado = 'ok';
    if (est.mapa) est.mapa.setMiUbicacion(est.miPos);
    actualizarIndicadorGPS();
    publicarUbicacion(false);
    if (est.centrarAlTenerGPS) {
      est.centrarAlTenerGPS = false;
      est.mapa.centrar(est.miPos.lat, est.miPos.lng, 18);
    }
    if (est.colocarAlTenerGPS && est.colocando) {
      est.colocarAlTenerGPS = false;
      colocarEnMiUbicacion();
    }
  }
  function alErrorGPS(err) {
    if (err && err.code === 1) {
      est.gpsEstado = 'denegado';
      detenerGPS();
      if (!est.avisoGPS) {
        est.avisoGPS = true;
        toast('La ubicación está bloqueada. Actívala en los permisos del navegador para compartir dónde estás.', { tipo: 'error', ms: 7000 });
      }
    } else est.gpsEstado = est.miPos ? 'ok' : 'buscando';
    actualizarIndicadorGPS();
  }
  function textoGPS() {
    return (
      {
        ok: est.miPos ? `activo (± ${est.miPos.prec} m)` : 'activo',
        buscando: 'buscando señal…',
        denegado: 'bloqueado en el navegador',
        'no-soportado': 'este teléfono no lo permite',
        apagado: 'apagado'
      }[est.gpsEstado] || est.gpsEstado
    );
  }
  function actualizarIndicadorGPS() {
    const ind = $('#ind-gps');
    const s = est.sesion;
    ind.hidden = !(s && s.rol === 'equipo');
    ind.className = 'indicador ' + ({ ok: 'gps-ok', buscando: 'gps-buscando', denegado: 'gps-error', 'no-soportado': 'gps-error' }[est.gpsEstado] || '');
    ind.title = 'GPS: ' + textoGPS() + (est.compartir ? '' : ' · no compartes tu ubicación');
    const sw = $('#txt-gps');
    if (sw) sw.textContent = 'GPS: ' + textoGPS();
  }
  function actualizarIndicadorRed() {
    const ind = $('#ind-red');
    const demo = est.backend && est.backend.modo === 'demo';
    ind.classList.toggle('sin-red', !est.conectado);
    ind.querySelector('.ind-texto').textContent = demo ? 'Demo' : est.conectado ? 'En línea' : 'Sin conexión';
    ind.title = demo ? 'Modo demostración: los datos se guardan solo en este teléfono' : est.conectado ? 'Conectado: todo se comparte en tiempo real' : 'Sin conexión: lo que marques se enviará al volver la señal';
  }
  function publicarUbicacion(forzar) {
    const s = est.sesion;
    if (!s || s.rol !== 'equipo' || !est.compartir || !est.miPos) return;
    const ahora = Date.now();
    const ult = est.ultimaPublicada;
    if (!forzar && ult) {
      const dt = ahora - ult.t;
      const dist = u.distancia(ult.lat, ult.lng, est.miPos.lat, est.miPos.lng);
      if (dist < 12 && dt < 60000) return;
      if (dt < 8000) {
        // Se movió, pero se acaba de enviar: se envía en cuanto pasen 8 segundos.
        if (!est.envioPendiente) est.envioPendiente = setTimeout(() => { est.envioPendiente = null; publicarUbicacion(false); }, 8000 - dt + 50);
        return;
      }
    }
    if (est.envioPendiente) {
      clearTimeout(est.envioPendiente);
      est.envioPendiente = null;
    }
    est.backend.publicarUbicacion(est.dispositivo, {
      lat: u.redondear(est.miPos.lat),
      lng: u.redondear(est.miPos.lng),
      prec: est.miPos.prec || 0,
      usuario: s.usuario || '',
      equipo: nombreEquipoActual()
    });
    est.ultimaPublicada = { lat: est.miPos.lat, lng: est.miPos.lng, t: ahora };
  }
  function cambiarCompartir(activo) {
    est.compartir = !!activo;
    u.guardarLocal('izalco.compartir', est.compartir);
    if (est.compartir) {
      iniciarGPS();
      publicarUbicacion(true);
      toast('Compartiendo tu ubicación con los hermanos');
    } else {
      est.backend.quitarUbicacion(est.dispositivo);
      est.ultimaPublicada = null;
      toast('Ya no compartes tu ubicación');
    }
    actualizarIndicadorGPS();
  }
  async function pedirPantalla() {
    try {
      if ('wakeLock' in navigator) {
        est.wakeLock = await navigator.wakeLock.request('screen');
        est.wakeLock.addEventListener('release', () => (est.wakeLock = null));
        return true;
      }
    } catch (e) {
      /* no disponible */
    }
    return false;
  }
  function liberarPantalla() {
    if (est.wakeLock) est.wakeLock.release().catch(() => {});
    est.wakeLock = null;
  }

  // =====================================================================
  //  Vistas de página (Mi equipo y administrador)
  // =====================================================================
  function renderVista(id, porDatos) {
    if (id === 'equipo') return porDatos ? actualizarConteosEquipo() : renderVistaEquipo();
    if (id === 'equipos') return renderVistaEquipos();
    if (id === 'visitas') return renderVistaVisitas();
    if (id === 'zonas') return renderVistaZonas();
    if (id === 'mas') return porDatos ? actualizarStatsDescarga() : renderVistaMas();
  }

  // ---------- Mi equipo ----------
  function renderVistaEquipo() {
    const s = est.sesion;
    const eq = est.equipo;
    const miembros = ((eq && eq.miembros) || []).filter(Boolean);
    $('#vista-equipo').innerHTML =
      `<div class="vista-contenido">` +
      `<div class="tarjeta"><div class="equipo-cab"><span class="avatar" style="--c:${u.colorDeTexto(s.uid)}">${esc(u.iniciales(u.nombreEquipo(miembros) || s.usuario))}</span>` +
      `<div class="txt"><b>${esc(s.usuario || '')}</b><small>Salida: ${esc(eq ? u.fechaLarga(eq.fecha) : '—')}</small></div></div>` +
      `<ul class="miembros">${miembros
        .map((h, i) => `<li><b>${i + 1}. ${esc(u.nombreCompleto(h))}</b>${h.edad ? ` · ${esc(h.edad)} años` : ''}<small>${esc(h.parroquia || '')}${h.comunidad ? ' · ' + esc(h.comunidad) : ''}</small></li>`)
        .join('')}</ul>` +
      (eq && eq.solo ? '<p class="pista">Fue enviado solo.</p>' : '') +
      `<div class="acciones-tarjeta"><a class="btn btn-sec" href="#/salida"><svg class="ico"><use href="#i-registro"/></svg>Nueva salida / cambiar hermanos</a></div></div>` +
      `<div class="tarjeta"><h2 class="subtitulo-tarjeta">Mis círculos</h2><div id="mis-conteos"></div></div>` +
      `<div class="tarjeta">` +
      `<label class="interruptor"><input type="checkbox" id="sw-compartir"${est.compartir ? ' checked' : ''}><span class="sw" aria-hidden="true"></span><span class="pista-sw">Compartir mi ubicación en vivo<small>Los hermanos ven dónde estás mientras la app está abierta.</small></span></label>` +
      `<label class="interruptor"><input type="checkbox" id="sw-pantalla"${est.pantallaEncendida ? ' checked' : ''}><span class="sw" aria-hidden="true"></span><span class="pista-sw">Mantener la pantalla encendida<small>Así tu ubicación se sigue actualizando mientras caminan.</small></span></label>` +
      `<p class="pista" id="txt-gps">GPS: ${esc(textoGPS())}</p></div>` +
      `<div class="tarjeta"><button type="button" class="btn btn-sec btn-grande" data-accion="compartir-app"><svg class="ico"><use href="#i-compartir"/></svg>Compartir el enlace de la app</button></div>` +
      `<button type="button" class="btn btn-texto" data-accion="salir"><svg class="ico"><use href="#i-salir"/></svg>Cerrar sesión</button>` +
      `</div>`;
    actualizarConteosEquipo();
    $('#sw-compartir').addEventListener('change', (e) => cambiarCompartir(e.target.checked));
    $('#sw-pantalla').addEventListener('change', async (e) => {
      est.pantallaEncendida = e.target.checked;
      if (est.pantallaEncendida) {
        const ok = await pedirPantalla();
        if (!ok) {
          toast('Este navegador no permite mantener la pantalla encendida.', { tipo: 'error' });
          e.target.checked = false;
          est.pantallaEncendida = false;
        }
      } else liberarPantalla();
    });
  }
  function actualizarConteosEquipo() {
    const cont = $('#mis-conteos');
    if (!cont || !est.sesion) return;
    const mias = Object.values(est.marcas || {}).filter((m) => m && m.uid === est.sesion.uid);
    const hoy = u.hoyISO();
    cont.innerHTML =
      `<div class="estadisticas" style="margin-bottom:8px"><div class="estadistica"><b>${mias.filter((m) => m.fecha === hoy).length}</b><span>hoy</span></div>` +
      `<div class="estadistica"><b>${mias.length}</b><span>en total</span></div></div>` +
      `<div class="tipos-resumen">${IZ.TIPOS.map((t) => `<span><span class="bolita" style="--c:${t.color}"></span>${esc(t.corto)}: <b>${mias.filter((m) => m.tipo === t.id).length}</b></span>`).join('')}</div>`;
  }

  // ---------- Administrador: equipos ----------
  function personasDistintas() {
    const set = new Set();
    Object.values(est.salidas || {}).forEach((s) => ((s && s.miembros) || []).forEach((h) => h && set.add(u.sinAcentos(u.nombreCompleto(h)).toLowerCase())));
    return set.size;
  }
  function renderVistaEquipos() {
    const cont = $('#vista-equipos');
    if (!cont.dataset.montado) {
      cont.innerHTML =
        `<div class="vista-contenido"><div class="estadisticas" id="adm-stats"></div>` +
        `<div class="buscador"><svg class="ico"><use href="#i-buscar"/></svg><input type="search" id="adm-buscar" placeholder="Buscar nombre, usuario, comunidad…" autocomplete="off"></div>` +
        `<div id="adm-equipos"></div></div>`;
      cont.dataset.montado = '1';
      $('#adm-buscar').value = est.adminBusqueda;
      $('#adm-buscar').addEventListener('input', (e) => {
        est.adminBusqueda = e.target.value;
        renderListaEquipos();
      });
    }
    const enLinea = personasEnLinea().filter((p) => !p.inactivo);
    ponerHTML($('#adm-stats'),
      `<div class="estadistica"><b>${Object.keys(est.equipos || {}).length}</b><span>equipos (usuarios)</span></div>` +
      `<div class="estadistica"><b>${personasDistintas()}</b><span>hermanos enviados</span></div>` +
      `<div class="estadistica"><b>${Object.keys(est.marcas || {}).length}</b><span>círculos marcados</span></div>` +
      `<div class="estadistica"><b>${enLinea.length}</b><span>en línea ahora</span></div>`);
    renderListaEquipos();
  }
  function renderListaEquipos() {
    const cont = $('#adm-equipos');
    if (!cont) return;
    const q = u.sinAcentos(est.adminBusqueda || '').toLowerCase().trim();
    const enLinea = new Set(personasEnLinea().filter((p) => !p.inactivo).map((p) => p.uid));
    const salidasPorUid = {};
    Object.entries(est.salidas || {}).forEach(([id, s]) => {
      if (!s) return;
      (salidasPorUid[s.uid] = salidasPorUid[s.uid] || []).push(Object.assign({ id }, s));
    });
    const conteo = {};
    Object.values(est.marcas || {}).forEach((m) => m && (conteo[m.uid] = (conteo[m.uid] || 0) + 1));
    const equipos = Object.entries(est.equipos || {})
      .map(([uid, e]) => Object.assign({ uid }, e))
      .filter((e) => {
        if (!q) return true;
        const texto = u.sinAcentos([e.usuario, ...((e.miembros || []).filter(Boolean).map((h) => [u.nombreCompleto(h), h.parroquia, h.comunidad].join(' ')))].join(' ')).toLowerCase();
        return texto.includes(q);
      })
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(a.usuario).localeCompare(String(b.usuario)));
    ponerHTML(cont, equipos.length
      ? equipos
          .map((e) => {
            const miembros = (e.miembros || []).filter(Boolean);
            const hist = (salidasPorUid[e.uid] || []).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
            return (
              `<div class="tarjeta"><div class="equipo-cab"><span class="avatar" style="--c:${u.colorDeTexto(e.uid)}">${esc(u.iniciales(u.nombreEquipo(miembros) || e.usuario))}</span>` +
              `<div class="txt"><b>${esc(e.usuario || '')}</b><small>Última salida: ${esc(u.fechaCorta(e.fecha))} · ${u.plural(conteo[e.uid] || 0, 'círculo')}</small></div>` +
              (enLinea.has(e.uid) ? '<span class="etiqueta verde">En línea</span>' : '') +
              `</div><ul class="miembros">${miembros
                .map((h) => `<li><b>${esc(u.nombreCompleto(h))}</b>${h.edad ? ` · ${esc(h.edad)} años` : ''}<small>${esc(h.parroquia || '—')} · ${esc(h.comunidad || '—')}</small></li>`)
                .join('')}</ul>` +
              (hist.length
                ? `<details class="historial" data-clave="${esc(e.uid)}"><summary>Historial de salidas (${hist.length})</summary><ul class="miembros">${hist
                    .map((s) => `<li><b>${esc(u.fechaLarga(s.fecha))}</b><small>${esc(((s.miembros || []).filter(Boolean)).map(u.nombreCompleto).join(', '))}${s.solo ? ' (solo)' : ''}</small></li>`)
                    .join('')}</ul></details>`
                : '') +
              `<div class="acciones-tarjeta"><button type="button" class="btn btn-sec btn-chico" data-ver-equipo="${esc(e.uid)}"><svg class="ico"><use href="#i-mapa"/></svg>Ver sus círculos en el mapa</button></div></div>`
            );
          })
          .join('')
      : `<p class="suave centro">${q ? 'No hay resultados.' : 'Todavía no hay equipos registrados.'}</p>`);
  }

  // ---------- Administrador: visitas ----------
  function renderVistaVisitas() {
    const cont = $('#vista-visitas');
    if (!cont.dataset.montado) {
      cont.innerHTML =
        `<div class="vista-contenido"><h2>Visitas (círculos)</h2>` +
        `<div class="chips" id="vis-fecha" role="radiogroup" style="margin-bottom:12px"><button type="button" role="radio" data-f="hoy">Hoy</button><button type="button" role="radio" data-f="7dias">7 días</button><button type="button" role="radio" data-f="todo">Todo</button></div>` +
        `<div class="filtros"><label class="campo"><span>Tipo</span><select id="vis-tipo"></select></label><label class="campo"><span>Equipo</span><select id="vis-equipo"></select></label></div>` +
        `<p class="suave" id="vis-cuenta"></p><ul class="lista tarjeta" id="vis-lista" style="padding:4px 14px"></ul>` +
        `<button type="button" class="btn btn-sec btn-grande" id="vis-mas" hidden>Mostrar más</button></div>`;
      cont.dataset.montado = '1';
      $('#vis-fecha').addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (b) ponerFiltroFecha(b.dataset.f);
      });
      $('#vis-tipo').addEventListener('change', (e) => {
        est.adminTipo = e.target.value;
        est.adminLimite = 150;
        renderListaVisitas();
      });
      $('#vis-equipo').addEventListener('change', (e) => {
        est.adminEquipo = e.target.value;
        est.adminLimite = 150;
        programarRender();
      });
      $('#vis-mas').addEventListener('click', () => {
        est.adminLimite += 150;
        renderListaVisitas();
      });
      $('#vis-lista').addEventListener('click', (e) => {
        const li = e.target.closest('[data-marca]');
        if (li) verMarcaEnMapa(li.dataset.marca);
      });
    }
    ponerHTML($('#vis-tipo'), `<option value="">Todos</option>` + IZ.TIPOS.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join(''));
    $('#vis-tipo').value = est.adminTipo;
    const equipos = Object.entries(est.equipos || {}).sort((a, b) => String(a[1].usuario).localeCompare(String(b[1].usuario)));
    ponerHTML($('#vis-equipo'), `<option value="">Todos</option>` + equipos.map(([uid, e]) => `<option value="${esc(uid)}">${esc(e.usuario || uid)}</option>`).join(''));
    $('#vis-equipo').value = est.adminEquipo;
    $$('#vis-fecha button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === est.filtro)));
    renderListaVisitas();
  }
  function renderListaVisitas() {
    const lista = marcasFiltradas()
      .filter((m) => !est.adminTipo || m.tipo === est.adminTipo)
      .sort((a, b) => (b.creado || 0) - (a.creado || 0));
    const personas = lista.reduce((a, m) => a + (typeof m.personas === 'number' ? m.personas : 0), 0);
    $('#vis-cuenta').textContent = `${u.plural(lista.length, 'círculo')} · ${u.plural(personas, 'persona alcanzada', 'personas alcanzadas')}`;
    const visibles = lista.slice(0, est.adminLimite);
    ponerHTML($('#vis-lista'), visibles.length
      ? visibles
          .map((m) => {
            const t = IZ.TIPO[m.tipo] || IZ.TIPOS[0];
            return (
              `<li class="tocable" data-marca="${esc(m.id)}"><span class="bolita" style="--c:${t.color}"></span><span class="txt"><b>${esc(t.nombre)} · ${esc(m.usuario || '')}</b>` +
              `<small>${esc(u.fechaCorta(m.fecha))} ${esc(u.hora(m.creado))}${m.personas ? ' · ' + m.personas + ' pers.' : ''}${m.nota ? ' · ' + esc(m.nota) : ''}</small></span>` +
              `<svg class="ico" aria-hidden="true"><use href="#i-pin"/></svg></li>`
            );
          })
          .join('')
      : '<li class="vacio">No hay círculos con estos filtros.</li>');
    $('#vis-mas').hidden = lista.length <= est.adminLimite;
  }
  function verMarcaEnMapa(id) {
    const m = est.marcas[id];
    if (!m) return;
    const tabMapa = est.sesion.rol === 'admin' ? 'mapa' : est.sesion.rol === 'equipo' ? 'marcar' : 'vivo';
    if (est.tab !== tabMapa) cambiarTab(tabMapa);
    setTimeout(() => {
      est.mapa.centrar(m.lat, m.lng, 18);
      abrirDetalleMarca(id);
    }, 80);
  }

  // ---------- Administrador: zonas ----------
  function renderVistaZonas() {
    const zonas = listaZonas();
    const marcas = Object.values(est.marcas || {}).filter(Boolean);
    ponerHTML($('#vista-zonas'),
      `<div class="vista-contenido"><h2>Zonas de evangelización</h2>` +
      `<div class="aviso aviso-info"><svg class="ico"><use href="#i-info"/></svg><div>Verde = ya se visitó · Naranja = próxima a visitar. Las dos zonas iniciales las divide la Av. Morazán y van desde la calle de la iglesia hasta la Calle La Unión / La Libertad. Si alguna esquina no coincide con la calle, usa <b>Editar forma</b> (también puedes arrastrar toda la zona desde el centro).</div></div>` +
      `<button type="button" class="btn btn-grande" data-accion="nueva-zona" style="margin-bottom:14px"><svg class="ico"><use href="#i-mas"/></svg>Nueva zona</button>` +
      (zonas.length
        ? zonas
            .map((z) => {
              const e = IZ.ESTADOS_ZONA[z.estado] || IZ.ESTADOS_ZONA.pendiente;
              const dentro = marcas.filter((m) => u.puntoEnPoligono(m.lat, m.lng, z.puntos));
              return (
                `<div class="tarjeta"><div class="equipo-cab"><span class="zona-barra" style="--c:${e.color}"></span><div class="txt"><b>${esc(z.nombre)}</b>` +
                `<small>${z.fecha ? esc(u.fechaLarga(z.fecha)) : 'Sin fecha'} · ${u.plural(dentro.length, 'círculo')}</small></div><span class="etiqueta ${claseEstado(z.estado)}">${esc(e.nombre)}</span></div>` +
                (z.nota ? `<p class="pista">${esc(z.nota)}</p>` : '') +
                `<div class="tipos-resumen">${IZ.TIPOS.map((t) => `<span><span class="bolita" style="--c:${t.color}"></span>${esc(t.corto)}: <b>${dentro.filter((m) => m.tipo === t.id).length}</b></span>`).join('')}</div>` +
                `<div class="acciones-tarjeta">` +
                `<button type="button" class="btn btn-sec btn-chico" data-zona-ver="${esc(z.id)}"><svg class="ico"><use href="#i-mapa"/></svg>Ver</button>` +
                `<button type="button" class="btn btn-sec btn-chico" data-zona-datos="${esc(z.id)}"><svg class="ico"><use href="#i-lapiz"/></svg>Editar datos</button>` +
                `<button type="button" class="btn btn-sec btn-chico" data-zona-forma="${esc(z.id)}"><svg class="ico"><use href="#i-zona"/></svg>Editar forma</button>` +
                `<button type="button" class="btn btn-peligro-sec btn-chico" data-zona-borrar="${esc(z.id)}"><svg class="ico"><use href="#i-basura"/></svg>Borrar</button>` +
                `</div></div>`
              );
            })
            .join('')
        : '<p class="suave centro">No hay zonas. Toca «Nueva zona» para dibujar una.</p>') +
      `</div>`);
  }
  function mostrarMapaParaZona() {
    $$('.vista').forEach((v) => (v.hidden = true));
    $('#panel-vivo').hidden = true;
    est.mapa.invalidar();
  }
  function iniciarDibujoZona() {
    mostrarMapaParaZona();
    est.zonaModo = { tipo: 'dibujar', id: null };
    est.zonaModo.capa = abrirModo(salirModoZona, 'zona');
    est.mapa.iniciarDibujo((n) => actualizarPanelEdicion(n));
    actualizarPanelEdicion(0);
  }
  function iniciarEdicionForma(id) {
    const z = est.zonas[id];
    if (!z) return;
    if (est.tab !== 'zonas' && est.tab !== 'mapa') cambiarTab('zonas');
    mostrarMapaParaZona();
    est.zonaModo = { tipo: 'editar', id };
    est.zonaModo.capa = abrirModo(salirModoZona, 'zona');
    est.firmaZonas = '';
    renderZonasMapa();
    const e = IZ.ESTADOS_ZONA[z.estado] || IZ.ESTADOS_ZONA.pendiente;
    est.mapa.iniciarEdicionZona(z.puntos, e.color, () => actualizarPanelEdicion());
    actualizarPanelEdicion();
  }
  function actualizarPanelEdicion(n) {
    const zm = est.zonaModo;
    if (!zm) return;
    const panel = $('#panel-edicion');
    panel.hidden = false;
    const botones = $('#edicion-botones');
    if (zm.tipo === 'dibujar') {
      $('#edicion-texto').textContent = n >= 3 ? `${n} puntos. Toca «Terminar» o sigue agregando esquinas.` : `Toca el mapa en cada esquina de la zona (${n || 0} de mínimo 3).`;
      botones.innerHTML =
        `<button type="button" class="btn btn-sec" data-ed="deshacer"${n ? '' : ' disabled'}><svg class="ico"><use href="#i-deshacer"/></svg>Deshacer</button>` +
        `<button type="button" class="btn btn-sec" data-ed="cancelar">Cancelar</button>` +
        `<button type="button" class="btn btn-verde" data-ed="terminar"${n >= 3 ? '' : ' disabled'}><svg class="ico"><use href="#i-check"/></svg>Terminar</button>`;
    } else {
      const inicial = zonaInicial(zm.id);
      const guardada = est.zonas[zm.id];
      const esInicial = !!inicial && u.mismosPuntos(est.mapa.puntosEdicion(), inicial.puntos);
      $('#edicion-texto').textContent =
        esInicial && guardada && !u.mismosPuntos(guardada.puntos, inicial.puntos)
          ? 'Esta es la forma inicial de la zona. Toca «Guardar forma» para conservarla.'
          : 'Arrastra los puntos blancos para ajustar. Toca «+» para agregar un punto y arrastra el centro para mover toda la zona.';
      botones.innerHTML =
        (inicial && !esInicial ? `<button type="button" class="btn btn-sec" data-ed="forma-inicial"><svg class="ico"><use href="#i-deshacer"/></svg>Forma inicial</button>` : '') +
        `<button type="button" class="btn btn-sec" data-ed="cancelar">Cancelar</button>` +
        `<button type="button" class="btn btn-verde" data-ed="guardar-forma"><svg class="ico"><use href="#i-check"/></svg>Guardar forma</button>`;
    }
    actualizarRelleno();
  }
  async function accionEdicion(accion) {
    const zm = est.zonaModo;
    if (!zm) return;
    if (accion === 'deshacer') return est.mapa.deshacerPunto();
    if (accion === 'cancelar') return cerrarHasta(zm.capa);
    if (accion === 'terminar') {
      const puntos = est.mapa.puntosDibujo();
      if (puntos.length < 3) return;
      await cerrarHasta(zm.capa);
      return abrirFormZona(null, puntos);
    }
    if (accion === 'forma-inicial') {
      const inicial = zonaInicial(zm.id);
      const z = est.zonas[zm.id];
      if (!inicial || !z) return;
      const e = IZ.ESTADOS_ZONA[z.estado] || IZ.ESTADOS_ZONA.pendiente;
      est.mapa.iniciarEdicionZona(inicial.puntos, e.color, () => actualizarPanelEdicion());
      return actualizarPanelEdicion();
    }
    if (accion === 'guardar-forma') {
      const z = est.zonas[zm.id];
      const puntos = est.mapa.puntosEdicion();
      try {
        await est.backend.guardarZona(zm.id, limpiarZona(Object.assign({}, z, { puntos })));
        toast('Forma de la zona guardada', { tipo: 'ok' });
        await cerrarHasta(zm.capa);
      } catch (err) {
        toast(mensajeError(err), { tipo: 'error' });
      }
    }
  }
  function salirModoZona() {
    est.zonaModo = null;
    est.mapa.terminarModos();
    $('#panel-edicion').hidden = true;
    est.firmaZonas = '';
    if (est.sesion && est.sesion.rol === 'admin') cambiarTab(est.tab || 'zonas');
  }
  function cancelarModoZona() {
    if (est.zonaModo && est.zonaModo.capa) {
      const capa = est.zonaModo.capa;
      est.zonaModo = null;
      est.mapa.terminarModos();
      $('#panel-edicion').hidden = true;
      est.firmaZonas = '';
      const i = pila.indexOf(capa);
      if (i >= 0) {
        pila.splice(i, 1);
        popsPropios++;
        esperasPop.push(() => {});
        history.back();
      }
    }
  }
  /** Zona inicial (ubicada con Google Maps) con ese id, si la hay. */
  function zonaInicial(id) {
    return (IZ.ZONAS_INICIALES || []).find((z) => z.id === id) || null;
  }
  function limpiarZona(z) {
    const r = { nombre: u.recortar(z.nombre, 80) || 'Zona', estado: IZ.ESTADOS_ZONA[z.estado] ? z.estado : 'pendiente', puntos: (z.puntos || []).map((p) => [u.redondear(p[0]), u.redondear(p[1])]) };
    if (z.fecha) r.fecha = String(z.fecha).slice(0, 10);
    if (z.nota) r.nota = u.recortar(z.nota, 300);
    return r;
  }
  function abrirFormZona(id, puntosNuevos) {
    const z = id ? est.zonas[id] : { nombre: `Zona ${listaZonas().length + 1}`, estado: 'proxima', fecha: '', nota: '', puntos: puntosNuevos };
    if (!z) return;
    const f = { estado: z.estado || 'pendiente' };
    abrirCapa({
      html:
        `<h3>${id ? 'Datos de la zona' : 'Nueva zona'}<button type="button" class="btn-icono cerrar-hoja" data-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-x"/></svg></button></h3>` +
        `<label class="campo"><span>Nombre</span><input id="z-nombre" maxlength="80" value="${esc(z.nombre || '')}"></label>` +
        `<div class="campo"><span>Estado</span><div class="segmentado" id="z-estado" role="radiogroup">${Object.values(IZ.ESTADOS_ZONA)
          .map((e) => `<button type="button" role="radio" data-estado="${e.id}" aria-checked="${e.id === f.estado}">${esc(e.id === 'proxima' ? 'Próxima' : e.nombre)}</button>`)
          .join('')}</div></div>` +
        `<label class="campo"><span>Fecha (visitada o programada)</span><input id="z-fecha" type="date" value="${esc(z.fecha || '')}"></label>` +
        `<label class="campo"><span>Nota (opcional)</span><textarea id="z-nota" maxlength="300" rows="2">${esc(z.nota || '')}</textarea></label>` +
        `<div class="acciones"><button type="button" class="btn btn-sec" data-cerrar>Cancelar</button><button type="button" class="btn" data-accion="guardar-zona"><svg class="ico"><use href="#i-check"/></svg>Guardar</button></div>`,
      alMontar: (caja) => {
        caja.addEventListener('click', async (e) => {
          const bEst = e.target.closest('[data-estado]');
          if (bEst) {
            f.estado = bEst.dataset.estado;
            caja.querySelectorAll('[data-estado]').forEach((b) => b.setAttribute('aria-checked', String(b === bEst)));
          }
          if (e.target.closest('[data-accion="guardar-zona"]')) {
            const datos = limpiarZona({
              nombre: caja.querySelector('#z-nombre').value.trim() || z.nombre,
              estado: f.estado,
              fecha: caja.querySelector('#z-fecha').value,
              nota: caja.querySelector('#z-nota').value.trim(),
              puntos: z.puntos
            });
            try {
              await est.backend.guardarZona(id, datos);
              await cerrarCapa();
              toast('Zona guardada', { tipo: 'ok' });
              if (est.tab === 'zonas') renderVistaZonas();
            } catch (err) {
              toast(mensajeError(err), { tipo: 'error' });
            }
          }
        });
      }
    });
  }
  async function borrarZona(id) {
    const z = est.zonas[id];
    if (!z) return;
    const ok = await confirmar(`¿Borrar «${z.nombre}»?`, 'Los círculos marcados no se borran.', { si: 'Borrar zona', peligro: true });
    if (!ok) return;
    try {
      await est.backend.borrarZona(id);
      toast('Zona borrada');
    } catch (err) {
      toast(mensajeError(err), { tipo: 'error' });
    }
  }
  function verZonaEnMapa(id) {
    const z = est.zonas[id];
    if (!z) return;
    cambiarTab('mapa');
    setTimeout(() => est.mapa.ajustar(L.latLngBounds(z.puntos), 18), 80);
  }

  // ---------- Administrador: descargas y ajustes ----------
  function datosExportar() {
    return { marcas: est.marcas, equipos: est.equipos, salidas: est.salidas, zonas: est.zonas, ubicaciones: est.ubicaciones, ahora: est.backend.ahora() };
  }
  function renderVistaMas() {
    const demo = est.backend.modo === 'demo';
    const url = urlApp();
    $('#vista-mas').innerHTML =
      `<div class="vista-contenido"><h2>Descargar la información</h2>` +
      `<p class="suave" id="descarga-resumen"></p>` +
      `<div class="descargas">` +
      `<button type="button" class="btn" data-descargar="excel"><svg class="ico"><use href="#i-descargar"/></svg><span class="txt">Todo en Excel (.xlsx)<small>Resumen, visitas con ubicación, hermanos, grupos, equipos y zonas</small></span></button>` +
      `<button type="button" class="btn btn-sec" data-descargar="kml"><svg class="ico"><use href="#i-mapa"/></svg><span class="txt">Mapa para Google Earth / My Maps (.kml)<small>Zonas y círculos con sus colores</small></span></button>` +
      `<button type="button" class="btn btn-sec" data-descargar="csv-visitas"><svg class="ico"><use href="#i-lista"/></svg><span class="txt">Visitas (.csv)<small>Un círculo por fila, con latitud y longitud</small></span></button>` +
      `<button type="button" class="btn btn-sec" data-descargar="csv-hermanos"><svg class="ico"><use href="#i-grupo"/></svg><span class="txt">Hermanos enviados (.csv)<small>Nombre, edad, parroquia, comunidad y fecha</small></span></button>` +
      `<button type="button" class="btn btn-sec" data-descargar="geojson"><svg class="ico"><use href="#i-pin"/></svg><span class="txt">Puntos y zonas (.geojson)<small>Para programas de mapas (QGIS, etc.)</small></span></button>` +
      `<button type="button" class="btn btn-sec" data-descargar="json"><svg class="ico"><use href="#i-copiar"/></svg><span class="txt">Respaldo completo (.json)<small>Copia de seguridad de todos los datos</small></span></button>` +
      `</div>` +
      `<h2 style="margin-top:22px">Código de acceso</h2>` +
      `<div class="tarjeta"><p class="suave" style="margin-top:0">Con un código, solo quien lo conozca podrá registrarse o usar el modo visualizador. Déjalo vacío para que cualquiera con el enlace pueda entrar.</p>` +
      `<label class="campo"><span>Código</span><input id="adm-codigo" autocomplete="off" autocapitalize="none" placeholder="Sin código" maxlength="40"></label>` +
      `<div class="fila-botones"><button type="button" class="btn" data-accion="guardar-codigo">Guardar código</button><button type="button" class="btn btn-sec" data-accion="quitar-codigo">Quitar código</button></div></div>` +
      `<h2 style="margin-top:22px">Compartir la app</h2>` +
      `<div class="tarjeta"><div class="detalle-fila"><span>App</span><span><code>${esc(url)}</code></span></div>` +
      `<div class="detalle-fila"><span>Solo ver</span><span><code>${esc(url)}#/ver</code></span></div>` +
      `<div class="fila-botones"><button type="button" class="btn btn-sec btn-chico" data-copiar="${esc(url)}"><svg class="ico"><use href="#i-copiar"/></svg>Copiar enlace</button>` +
      `<button type="button" class="btn btn-sec btn-chico" data-copiar="${esc(url)}#/ver"><svg class="ico"><use href="#i-ojo"/></svg>Copiar enlace «solo ver»</button></div></div>` +
      `<div class="tarjeta"><p style="margin:0"><b>Modo:</b> ${demo ? 'demostración (datos solo en este navegador)' : 'Firebase en tiempo real'}</p>` +
      (demo ? `<button type="button" class="btn btn-peligro-sec btn-grande" style="margin-top:12px" data-accion="reiniciar-demo"><svg class="ico"><use href="#i-basura"/></svg>Borrar los datos de demostración</button>` : '') +
      `</div><button type="button" class="btn btn-texto" data-accion="salir"><svg class="ico"><use href="#i-salir"/></svg>Cerrar sesión</button></div>`;
    actualizarStatsDescarga();
    est.backend
      .leerCodigo()
      .then((c) => {
        const inp = $('#adm-codigo');
        if (inp && !inp.value) inp.value = c || '';
      })
      .catch(() => {});
  }
  function actualizarStatsDescarga() {
    const el = $('#descarga-resumen');
    if (!el) return;
    el.textContent = [u.plural(Object.keys(est.equipos || {}).length, 'equipo'), u.plural(Object.keys(est.salidas || {}).length, 'salida'), u.plural(personasDistintas(), 'hermano'), u.plural(Object.keys(est.marcas || {}).length, 'círculo'), u.plural(Object.keys(est.zonas || {}).length, 'zona')].join(' · ') + '.';
  }
  async function descargar(tipo) {
    const d = datosExportar();
    const fecha = u.hoyISO();
    const base = `evangelizacion-izalco-${fecha}`;
    const X = IZ.exportar;
    let nombre, blob;
    try {
      if (tipo === 'excel') [nombre, blob] = [`${base}.xlsx`, X.excel(d)];
      else if (tipo === 'kml') [nombre, blob] = [`${base}.kml`, X.kml(d)];
      else if (tipo === 'csv-visitas') [nombre, blob] = [`${base}-visitas.csv`, X.csv(X.construirTablas(d).visitas)];
      else if (tipo === 'csv-hermanos') [nombre, blob] = [`${base}-hermanos.csv`, X.csv(X.construirTablas(d).hermanos)];
      else if (tipo === 'geojson') [nombre, blob] = [`${base}.geojson`, X.geojson(d)];
      else if (tipo === 'json') [nombre, blob] = [`${base}-respaldo.json`, X.respaldo(d)];
      else return;
      X.descargar(nombre, blob);
      toast(`Descargando ${nombre}`, { tipo: 'ok' });
    } catch (err) {
      console.error(err);
      toast('No se pudo generar el archivo: ' + (err.message || err), { tipo: 'error' });
    }
  }
  async function guardarCodigo(quitar) {
    const inp = $('#adm-codigo');
    const codigo = quitar ? '' : inp.value.trim();
    if (!quitar && codigo.length < 3) return toast('El código debe tener al menos 3 caracteres.', { tipo: 'error' });
    try {
      await est.backend.guardarCodigo(codigo);
      if (quitar) inp.value = '';
      toast(quitar ? 'Código quitado: cualquiera con el enlace puede entrar' : 'Código guardado', { tipo: 'ok' });
    } catch (err) {
      toast(mensajeError(err), { tipo: 'error' });
    }
  }
  async function compartirApp(url) {
    url = url || urlApp();
    try {
      if (navigator.share) {
        await navigator.share({ title: CONFIG.titulo, text: 'Mapa de evangelización en Izalco', url });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const ok = await u.copiar(url);
    toast(ok ? 'Enlace copiado' : url);
  }

  // =====================================================================
  //  Filtro de fecha y controles del mapa
  // =====================================================================
  function ponerFiltroFecha(f) {
    est.filtro = f;
    u.guardarLocal('izalco.filtro', f);
    est.adminLimite = 150;
    $$('#filtro-fecha button, #vis-fecha button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === f)));
    programarRender();
  }
  function ubicarme() {
    if (est.miPos) return est.mapa.centrar(est.miPos.lat, est.miPos.lng, Math.max(est.mapa.map.getZoom(), 17));
    est.centrarAlTenerGPS = true;
    iniciarGPS();
    toast(est.gpsEstado === 'denegado' ? 'La ubicación está bloqueada en el navegador.' : 'Buscando tu ubicación…');
  }

  // =====================================================================
  //  Eventos
  // =====================================================================
  function conectarEventos() {
    window.addEventListener('hashchange', () => enrutar());
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-accion]');
      if (el) {
        const a = el.dataset.accion;
        if (a === 'salir') return salir();
        if (a === 'compartir-app') return compartirApp();
        if (a === 'guardar-codigo') return guardarCodigo(false);
        if (a === 'quitar-codigo') return guardarCodigo(true);
        if (a === 'nueva-zona') return iniciarDibujoZona();
        if (a === 'reiniciar-demo') {
          return confirmar('¿Borrar los datos de demostración?', 'Se borran equipos, círculos y zonas de este navegador.', { si: 'Borrar', peligro: true }).then(async (ok) => {
            if (!ok) return;
            await est.backend.reiniciarDemo();
            await salir(false);
          });
        }
      }
      const ver = e.target.closest('[data-ver]');
      if (ver) {
        const inp = document.getElementById(ver.dataset.ver);
        inp.type = inp.type === 'password' ? 'text' : 'password';
        return;
      }
      const cop = e.target.closest('[data-copiar]');
      if (cop) return u.copiar(cop.dataset.copiar).then((ok) => toast(ok ? 'Copiado' : cop.dataset.copiar));
      const d = e.target.closest('[data-descargar]');
      if (d) return descargar(d.dataset.descargar);
      const ve = e.target.closest('[data-ver-equipo]');
      if (ve) {
        est.adminEquipo = ve.dataset.verEquipo;
        est.filtro = 'todo';
        ponerFiltroFecha('todo');
        cambiarTab('mapa');
        const ms = marcasFiltradas();
        if (ms.length) setTimeout(() => est.mapa.ajustar(L.latLngBounds(ms.map((m) => [m.lat, m.lng])), 18), 80);
        else toast('Este equipo todavía no tiene círculos.');
        return;
      }
      const zv = e.target.closest('[data-zona-ver]');
      if (zv) return verZonaEnMapa(zv.dataset.zonaVer);
      const zd = e.target.closest('[data-zona-datos]');
      if (zd) return abrirFormZona(zd.dataset.zonaDatos);
      const zf = e.target.closest('[data-zona-forma]');
      if (zf) return iniciarEdicionForma(zf.dataset.zonaForma);
      const zb = e.target.closest('[data-zona-borrar]');
      if (zb) return borrarZona(zb.dataset.zonaBorrar);
    });

    // Registro
    $('#form-registro').addEventListener('submit', enviarRegistro);
    $('#form-registro').addEventListener('input', (e) => {
      const inp = e.target;
      if (inp.closest('.campo.invalido')) limpiarInvalido(inp);
      if (inp.name === 'nombre' || inp.name === 'apellido') {
        actualizarBloqueos();
        actualizarVistaUsuario();
      }
      const card = inp.closest('.hermano');
      if (card && card.dataset.i === '0' && (inp.name === 'parroquia' || inp.name === 'comunidad')) {
        // Los demás hermanos suelen ser de la misma parroquia y comunidad
        $$('#reg-hermanos .hermano').slice(1).forEach((otra) => {
          const campo = otra.querySelector(`[name="${inp.name}"]`);
          if (!campo.dataset.tocado) campo.value = inp.value;
        });
      } else if (card && card.dataset.i !== '0') inp.dataset.tocado = '1';
      guardarBorrador();
    });
    $('#reg-cuantos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      dibujarHermanos(Number(b.dataset.n));
      guardarBorrador();
    });

    // Listo
    $('#listo-copiar').addEventListener('click', async () => toast((await u.copiar(est.usuarioCreado || '')) ? 'Usuario copiado' : est.usuarioCreado));
    $('#listo-continuar').addEventListener('click', (e) => {
      e.preventDefault();
      est.usuarioCreado = null;
      ir('mapa', true);
    });

    // Entrar / visor / admin
    $('#form-entrar').addEventListener('submit', enviarEntrar);
    $('#form-visor').addEventListener('submit', (e) => {
      e.preventDefault();
      const codigo = $('#vis-codigo').value.trim();
      if (!codigo) return ($('#vis-error').textContent = 'Escribe el código.');
      entrarVisorCon(codigo);
    });
    $('#form-admin').addEventListener('submit', enviarAdmin);
    $('#adm-crear').addEventListener('click', crearCuentaAdmin);
    $('#inc-copiar').addEventListener('click', async () => toast((await u.copiar($('#inc-uid').textContent)) ? 'UID copiado' : 'No se pudo copiar'));
    $('#inc-reintentar').addEventListener('click', async () => {
      est.ocupado = true;
      try {
        const s = await est.backend.reintentarSesion();
        est.ocupado = false;
        if (tieneRolApp(s)) ir('mapa', true);
        else toast('Todavía no aparece como administrador. Revisa que el valor sea true.', { tipo: 'error' });
      } finally {
        est.ocupado = false;
      }
    });
    $('#btn-salir-visor').addEventListener('click', () => salir());

    // App
    $('#tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (t) cambiarTab(t.dataset.tab);
    });
    $('#filtro-fecha').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) ponerFiltroFecha(b.dataset.f);
    });
    $('#circulos').addEventListener('click', (e) => {
      const b = e.target.closest('.circulo');
      if (b) elegirTipo(b.dataset.tipo);
    });
    $('#btn-agregar').addEventListener('click', () => iniciarColocacion());
    $('#btn-zoom-mas').addEventListener('click', () => est.mapa.map.zoomIn());
    $('#btn-zoom-menos').addEventListener('click', () => est.mapa.map.zoomOut());
    $('#btn-ubicarme').addEventListener('click', ubicarme);
    $('#btn-capas').addEventListener('click', () => {
      est.capa = est.mapa.cambiarCapa(est.mapa.capaActual === 'satelite' ? 'calles' : 'satelite');
      u.guardarLocal('izalco.capa', est.capa);
      toast('Mapa: ' + IZ.CAPAS[est.capa].nombre);
    });
    $('#btn-encuadrar').addEventListener('click', () => {
      const b = est.mapa.limitesZonas();
      if (b) est.mapa.ajustar(b, 17);
      else est.mapa.map.setView(CONFIG.centro, CONFIG.zoom);
    });
    $('#ind-gps').addEventListener('click', () => toast('GPS: ' + textoGPS()));
    $('#asa-vivo').addEventListener('click', () => {
      est.vivoAbierto = !est.vivoAbierto;
      $('#panel-vivo').classList.toggle('abierto', est.vivoAbierto);
      $('#asa-vivo').setAttribute('aria-expanded', String(est.vivoAbierto));
      if (est.vivoAbierto) renderListasVivo();
      setTimeout(actualizarRelleno, 280);
    });
    $('#lista-linea').addEventListener('click', (e) => {
      const li = e.target.closest('[data-persona]');
      if (!li) return;
      const p = personasEnLinea().find((x) => x.clave === li.dataset.persona);
      if (p) est.mapa.centrar(p.lat, p.lng, 18);
    });
    $('#lista-actividad').addEventListener('click', (e) => {
      const li = e.target.closest('[data-marca]');
      if (li) verMarcaEnMapa(li.dataset.marca);
    });
    $('#edicion-botones').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ed]');
      if (b && !b.disabled) accionEdicion(b.dataset.ed);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (est.pantallaEncendida && !est.wakeLock) pedirPantalla();
      publicarUbicacion(true);
      programarRender();
    });
    window.addEventListener('pagehide', () => {
      if (est.backend && est.sesion && est.sesion.rol === 'equipo' && est.backend.modo === 'demo') est.backend.quitarUbicacion(est.dispositivo);
    });
  }

  function llenarListas() {
    $('#lista-parroquias').innerHTML = IZ.PARROQUIAS.map((p) => `<option value="${esc(p)}"></option>`).join('');
    $('#lista-comunidades').innerHTML = IZ.COMUNIDADES.map((c) => `<option value="${esc(c)}"></option>`).join('');
  }

  // =====================================================================
  //  Arranque
  // =====================================================================
  async function arrancar() {
    document.title = CONFIG.titulo;
    $('#inicio-titulo').textContent = CONFIG.titulo;
    $('#inicio-subtitulo').textContent = CONFIG.subtitulo || '';
    llenarListas();
    renderBarraCirculos();
    renderLeyenda();
    $$('#filtro-fecha button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === est.filtro)));
    conectarEventos();
    mostrarPantalla('cargando');
    try {
      if (typeof L === 'undefined') throw new Error('No se pudo cargar el mapa.');
      if (firebaseConfigurado()) {
        $('#cargando-texto').textContent = 'Conectando…';
        est.backend = await IZ.crearBackendFirebase(CONFIG);
      } else est.backend = IZ.crearBackendLocal(CONFIG);
    } catch (e) {
      console.error(e);
      $('#error-texto').textContent = 'No se pudo conectar. Revisa tu conexión a internet y vuelve a intentar. (' + (e.message || e) + ')';
      return mostrarPantalla('error');
    }
    $('#aviso-demo').hidden = est.backend.modo !== 'demo';
    if (est.backend.modo === 'firebase') {
      // Revisa que las reglas de seguridad estén publicadas (config/publica siempre se puede leer).
      est.backend.configPublica().catch((e) => {
        if (e.codigo !== 'reglas-faltantes') return;
        $('#aviso-config-texto').textContent = mensajeError(e);
        $('#aviso-config').hidden = false;
      });
    }
    est.backend.alCambiarSesion(alCambiarSesion);
    if (est.backend.alFallarEscritura) est.backend.alFallarEscritura((e) => toast(mensajeError(e), { tipo: 'error' }));
    est.backend.escucharConexion((c) => {
      est.conectado = c;
      actualizarIndicadorRed();
    });
    est.ocupado = true;
    try {
      await est.backend.iniciar();
    } catch (e) {
      console.error(e);
    } finally {
      est.ocupado = false;
    }
    if (est.sesion === undefined) est.sesion = null;
    const ruta = rutaActual();
    if (tieneRolApp(est.sesion) && ['', 'entrar', 'admin'].includes(ruta)) ir('mapa', true);
    else enrutar();

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
