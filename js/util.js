/* Utilidades generales: fechas, textos, geometría, almacenamiento local. */
(function () {
  'use strict';
  const IZ = (window.IZ = window.IZ || {});
  const u = {};

  // ---------- DOM ----------
  u.$ = (sel, raiz) => (raiz || document).querySelector(sel);
  u.$$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
  u.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- Fechas ----------
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  u.pad = (n) => String(n).padStart(2, '0');
  u.fechaISO = (d) => {
    d = d || new Date();
    return `${d.getFullYear()}-${u.pad(d.getMonth() + 1)}-${u.pad(d.getDate())}`;
  };
  u.hoyISO = () => u.fechaISO(new Date());
  u.isoADate = (iso) => {
    const p = String(iso || '').split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  };
  u.sumarDias = (iso, dias) => {
    const d = u.isoADate(iso) || new Date();
    d.setDate(d.getDate() + dias);
    return u.fechaISO(d);
  };
  u.esFechaISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !!u.isoADate(s);
  /** "domingo 27 de septiembre de 2026" */
  u.fechaLarga = (iso) => {
    const d = u.isoADate(iso);
    if (!d) return iso || '';
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  };
  /** "dom 27 sep" */
  u.fechaCorta = (iso) => {
    const d = u.isoADate(iso);
    if (!d) return iso || '';
    const hoy = u.hoyISO();
    if (iso === hoy) return 'hoy';
    if (iso === u.sumarDias(hoy, -1)) return 'ayer';
    const anio = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
    return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}${anio}`;
  };
  /** "27/09/2026" */
  u.fechaNumerica = (iso) => {
    const d = u.isoADate(iso);
    return d ? `${u.pad(d.getDate())}/${u.pad(d.getMonth() + 1)}/${d.getFullYear()}` : iso || '';
  };
  u.hora = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    let h = d.getHours();
    const m = u.pad(d.getMinutes());
    const ampm = h >= 12 ? 'p. m.' : 'a. m.';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };
  u.fechaHora = (ts) => (ts ? `${u.fechaNumerica(u.fechaISO(new Date(ts)))} ${u.hora(ts)}` : '');
  u.haceCuanto = (ts, ahora) => {
    if (!ts) return '';
    const s = Math.max(0, Math.round(((ahora || Date.now()) - ts) / 1000));
    if (s < 10) return 'ahora';
    if (s < 60) return `hace ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  };
  u.edadDesdeTexto = (s) => {
    const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
  };

  // ---------- Textos y usuarios ----------
  u.sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  u.capitalizar = (s) =>
    String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const PARTICULAS = ['de', 'del', 'la', 'las', 'los', 'y', 'da', 'di', 'van', 'von'];
  const soloLetras = (s) => u.sinAcentos(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  /** Primer nombre: "José Luis" → "jose". */
  u.parteNombre = (nombre) => soloLetras(String(nombre || '').trim().split(/\s+/)[0] || '');
  /** Primer apellido, uniendo partículas: "De León Pérez" → "deleon". */
  u.parteApellido = (apellido) => {
    const palabras = String(apellido || '').trim().split(/\s+/).filter(Boolean);
    let res = '';
    for (const p of palabras) {
      const limpio = soloLetras(p);
      res += limpio;
      if (!PARTICULAS.includes(limpio)) break;
    }
    return res;
  };
  /** Usuario a partir del primer nombre y el apellido: "efrain.martinez". */
  u.usuarioBase = (nombre, apellido) => [u.parteNombre(nombre), u.parteApellido(apellido)].filter(Boolean).join('.');
  /** Normaliza lo que la persona escribe al entrar: "Efraín Martínez" → "efrain.martinez". */
  u.normalizarUsuario = (s) =>
    u
      .sinAcentos(String(s || ''))
      .toLowerCase()
      .trim()
      .replace(/@.*$/, '')
      .replace(/[\s_\-,]+/g, '.')
      .replace(/[^a-z0-9.]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
  u.nombreCompleto = (m) => [m && m.nombre, m && m.apellido].filter(Boolean).join(' ').trim();
  /** "Efraín M." */
  u.nombreCorto = (m) => {
    if (!m) return '';
    const n = String(m.nombre || '').trim().split(/\s+/)[0] || '';
    const a = String(m.apellido || '').trim();
    return a ? `${n} ${a[0].toUpperCase()}.` : n;
  };
  /** "Efraín M., Juan L. y Ana P." a partir de la lista de miembros */
  u.nombreEquipo = (miembros) => {
    const lista = (miembros || []).filter(Boolean).map(u.nombreCorto).filter(Boolean);
    if (lista.length <= 1) return lista[0] || '';
    return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
  };
  u.iniciales = (texto) => {
    const p = String(texto || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
  };
  u.colorDeTexto = (texto) => {
    let h = 0;
    const s = String(texto || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360}, 62%, 40%)`;
  };
  /** "1 círculo", "3 círculos" */
  u.plural = (n, singular, plural) => `${n} ${n === 1 ? singular : plural || singular + 's'}`;
  u.recortar = (s, max) => {
    s = String(s || '').trim();
    return s.length > max ? s.slice(0, max) : s;
  };

  // ---------- Identificadores ----------
  u.idAleatorio = (n) => {
    n = n || 16;
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(n);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < n; i++) s += abc[bytes[i] % abc.length];
    return s;
  };
  u.idDispositivo = () => {
    let id = u.leerLocal('izalco.dispositivo', null);
    if (!id) {
      id = 'd' + u.idAleatorio(12);
      u.guardarLocal('izalco.dispositivo', id);
    }
    return id;
  };

  // ---------- Almacenamiento local (con protección) ----------
  u.leerLocal = (clave, porDefecto) => {
    try {
      const v = localStorage.getItem(clave);
      return v == null ? porDefecto : JSON.parse(v);
    } catch (e) {
      return porDefecto;
    }
  };
  u.guardarLocal = (clave, valor) => {
    try {
      if (valor === undefined || valor === null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {
      /* almacenamiento no disponible */
    }
  };

  // ---------- Hash (solo para el modo demostración) ----------
  u.sha256 = async (texto) => {
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {
      /* sigue con el respaldo */
    }
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(16, '0');
  };

  // ---------- Geometría ----------
  u.redondear = (n, dec) => {
    const f = Math.pow(10, dec == null ? 6 : dec);
    return Math.round(n * f) / f;
  };
  u.distancia = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  u.textoDistancia = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
  /** ¿El punto está dentro del polígono? puntos = [[lat, lng], ...] */
  u.puntoEnPoligono = (lat, lng, puntos) => {
    if (!puntos || puntos.length < 3) return false;
    let dentro = false;
    for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
      const yi = puntos[i][0], xi = puntos[i][1];
      const yj = puntos[j][0], xj = puntos[j][1];
      const cruza = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (cruza) dentro = !dentro;
    }
    return dentro;
  };
  u.centroide = (puntos) => {
    if (!puntos || !puntos.length) return null;
    let lat = 0, lng = 0;
    for (const p of puntos) {
      lat += p[0];
      lng += p[1];
    }
    return [lat / puntos.length, lng / puntos.length];
  };
  u.enlaceMapa = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${u.redondear(lat, 6)},${u.redondear(lng, 6)}`;

  // ---------- Varios ----------
  /** Ejecuta fn como máximo una vez cada `ms` (la última llamada pendiente se ejecuta al final). */
  u.limitar = (fn, ms) => {
    let t = null, pendientes = null;
    const lanzar = (args) => {
      fn(...args);
      t = setTimeout(() => {
        t = null;
        if (pendientes) {
          const a = pendientes;
          pendientes = null;
          lanzar(a);
        }
      }, ms);
    };
    return (...args) => {
      if (t) pendientes = args;
      else lanzar(args);
    };
  };
  u.enCuadro = (fn) => {
    let pedido = false;
    return () => {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(() => {
        pedido = false;
        fn();
      });
    };
  };
  u.copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e2) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  };
  u.vibrar = (ms) => {
    try {
      if (navigator.vibrate) navigator.vibrate(ms || 30);
    } catch (e) {
      /* sin vibración */
    }
  };
  u.error = (codigo, mensaje) => {
    const e = new Error(mensaje || codigo);
    e.codigo = codigo;
    return e;
  };

  IZ.util = u;
})();
