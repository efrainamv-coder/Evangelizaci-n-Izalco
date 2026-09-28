/*
 * Mapa (Leaflet): capas satélite/calles, zonas, círculos, hermanos en vivo, mi ubicación,
 * colocación de círculos y edición de zonas (dibujar, mover vértices, mover toda la zona).
 */
(function () {
  'use strict';
  const IZ = window.IZ;
  const u = IZ.util;

  const icono = (clase, html, tam) =>
    L.divIcon({ className: clase, html: html || '', iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] });

  class Mapa {
    constructor(elemento, opciones) {
      opciones = opciones || {};
      this.el = elemento;
      this.map = L.map(elemento, {
        center: opciones.centro || [13.75071, -89.67377],
        zoom: opciones.zoom || 16,
        maxZoom: 21,
        zoomSnap: 0.25,
        zoomDelta: 1,
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: false
      });
      this.map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');

      // Paneles para ordenar lo que se dibuja (zonas abajo, círculos encima, edición arriba).
      const panel = (nombre, z) => {
        const p = this.map.createPane(nombre);
        p.style.zIndex = z;
        return p;
      };
      panel('zonas', 380);
      panel('marcas', 450);
      panel('seleccion', 460);
      panel('yo', 620);
      panel('edicion', 640);
      panel('edicionMarcadores', 660);
      this.svgZonas = L.svg({ pane: 'zonas' });
      this.lienzo = L.canvas({ pane: 'marcas', tolerance: 10, padding: 0.4 });

      this.capaZonas = L.featureGroup().addTo(this.map);
      this.capaMarcas = L.featureGroup().addTo(this.map);
      this.capaSeleccion = L.layerGroup().addTo(this.map);
      this.capaPersonas = L.layerGroup().addTo(this.map);
      this.capaYo = L.layerGroup().addTo(this.map);
      this.capaEdicion = L.layerGroup().addTo(this.map);

      this._capasBase = {};
      this._marcas = new Map();
      this._personas = new Map();
      this._zonas = new Map();
      this.modo = 'normal';
      this.rellenoInferior = 0;
      this.cambiarCapa(opciones.capa || 'satelite');

      this.map.on('click', (ev) => this._tocar(ev.latlng));
    }

    // ---------- Capas base ----------
    cambiarCapa(nombre) {
      if (!IZ.CAPAS[nombre]) nombre = 'satelite';
      if (this._capaBase) this.map.removeLayer(this._capaBase);
      if (!this._capasBase[nombre]) {
        this._capasBase[nombre] = L.layerGroup(IZ.CAPAS[nombre].capas.map((c) => L.tileLayer(c.url, c.opciones)));
      }
      this._capaBase = this._capasBase[nombre].addTo(this.map);
      this.capaActual = nombre;
      this.el.classList.toggle('mapa-satelite', nombre === 'satelite');
      return nombre;
    }

    // ---------- Eventos hacia la app ----------
    alTocarMarca(cb) { this._cbMarca = cb; }
    alTocarZona(cb) { this._cbZona = cb; }
    alTocarPersona(cb) { this._cbPersona = cb; }
    alTocarMapa(cb) { this._cbMapa = cb; }

    _tocar(latlng) {
      if (this.modo === 'colocar') return this._alColocar && this._alColocar(latlng);
      if (this.modo === 'dibujar') return this._agregarPuntoDibujo(latlng);
      if (this.modo === 'editarZona') return;
      if (this._cbMapa) this._cbMapa(latlng);
    }
    _clic(tipo, id, ev) {
      if (ev && ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      if (this.modo !== 'normal') return this._tocar(ev.latlng);
      const cb = tipo === 'marca' ? this._cbMarca : tipo === 'zona' ? this._cbZona : this._cbPersona;
      if (cb) cb(id);
    }

    // ---------- Zonas ----------
    setZonas(lista, opciones) {
      opciones = opciones || {};
      this.capaZonas.clearLayers();
      this._zonas.clear();
      for (const z of lista) {
        if (opciones.ocultarId === z.id || !Array.isArray(z.puntos) || z.puntos.length < 3) continue;
        const est = IZ.ESTADOS_ZONA[z.estado] || IZ.ESTADOS_ZONA.pendiente;
        const pol = L.polygon(z.puntos, {
          renderer: this.svgZonas,
          color: est.color,
          weight: 3,
          opacity: 0.95,
          fillColor: est.color,
          fillOpacity: 0.17,
          dashArray: z.estado === 'proxima' ? '10 7' : null,
          bubblingMouseEvents: false
        });
        pol.bindTooltip(u.esc(z.nombre), { permanent: true, direction: 'center', className: 'zona-etiqueta zona-' + est.id, opacity: 1 });
        pol.on('click', (ev) => this._clic('zona', z.id, ev));
        pol.addTo(this.capaZonas);
        this._zonas.set(z.id, pol);
      }
    }
    limitesZonas() {
      const b = this.capaZonas.getBounds();
      return b.isValid() ? b : null;
    }

    // ---------- Círculos (marcas) ----------
    setMarcas(lista, opciones) {
      opciones = opciones || {};
      const vistos = new Set();
      for (const m of lista) {
        vistos.add(m.id);
        const tipo = IZ.TIPO[m.tipo] || IZ.TIPOS[0];
        const propia = !!opciones.miUid && m.uid === opciones.miUid;
        const discreta = opciones.resaltarPropias && !propia;
        const estilo = {
          radius: discreta ? 7 : 9,
          weight: discreta ? 1.5 : propia && opciones.resaltarPropias ? 3 : 2,
          color: '#ffffff',
          opacity: 1,
          fillColor: tipo.color,
          fillOpacity: discreta ? 0.8 : 1
        };
        let r = this._marcas.get(m.id);
        if (!r) {
          const capa = L.circleMarker([m.lat, m.lng], Object.assign({ renderer: this.lienzo, bubblingMouseEvents: false }, estilo));
          capa.on('click', (ev) => this._clic('marca', m.id, ev));
          r = { capa, firma: '' };
          this._marcas.set(m.id, r);
        }
        const firma = `${m.lat}|${m.lng}|${estilo.radius}|${estilo.weight}|${estilo.fillColor}|${estilo.fillOpacity}`;
        if (firma !== r.firma) {
          r.capa.setLatLng([m.lat, m.lng]);
          r.capa.setStyle(estilo);
          r.firma = firma;
        }
        const oculta = opciones.ocultarId === m.id;
        const esta = this.capaMarcas.hasLayer(r.capa);
        if (oculta && esta) this.capaMarcas.removeLayer(r.capa);
        if (!oculta && !esta) r.capa.addTo(this.capaMarcas);
      }
      for (const [id, r] of this._marcas) {
        if (!vistos.has(id)) {
          this.capaMarcas.removeLayer(r.capa);
          this._marcas.delete(id);
        }
      }
      if (this._seleccionId && !vistos.has(this._seleccionId)) this.seleccionar(null);
    }
    seleccionar(id, latlng) {
      this.capaSeleccion.clearLayers();
      this._seleccionId = id || null;
      if (!id || !latlng) return;
      L.circleMarker(latlng, { pane: 'seleccion', radius: 16, color: '#0b2545', weight: 3, fill: false, interactive: false, dashArray: '4 4' }).addTo(this.capaSeleccion);
    }

    // ---------- Hermanos en vivo ----------
    setPersonas(lista) {
      const vistos = new Set();
      for (const p of lista) {
        vistos.add(p.clave);
        const color = p.color || u.colorDeTexto(p.uid);
        const html =
          `<div class="persona-marca${p.inactivo ? ' inactiva' : ''}${p.mismoEquipo ? ' companero' : ''}" style="--c:${color}">` +
          `<span class="persona-ini">${u.esc(p.iniciales)}</span>` +
          `<span class="persona-nombre">${u.esc(p.etiqueta)}</span></div>`;
        let r = this._personas.get(p.clave);
        if (!r) {
          const capa = L.marker([p.lat, p.lng], { icon: icono('icono-persona', html, 34), zIndexOffset: 800, keyboard: false, bubblingMouseEvents: false });
          capa.on('click', (ev) => this._clic('persona', p.clave, ev));
          capa.addTo(this.capaPersonas);
          r = { capa, html };
          this._personas.set(p.clave, r);
        } else {
          r.capa.setLatLng([p.lat, p.lng]);
          if (r.html !== html) {
            r.capa.setIcon(icono('icono-persona', html, 34));
            r.html = html;
          }
        }
      }
      for (const [clave, r] of this._personas) {
        if (!vistos.has(clave)) {
          this.capaPersonas.removeLayer(r.capa);
          this._personas.delete(clave);
        }
      }
    }

    // ---------- Mi ubicación ----------
    setMiUbicacion(pos) {
      if (!pos) {
        this.capaYo.clearLayers();
        this._yo = this._yoPrec = null;
        return;
      }
      const ll = [pos.lat, pos.lng];
      const prec = Math.max(5, Math.min(pos.prec || 20, 500));
      if (!this._yo) {
        this._yoPrec = L.circle(ll, { pane: 'yo', radius: prec, color: '#1a73e8', weight: 1, opacity: 0.6, fillColor: '#1a73e8', fillOpacity: 0.12, interactive: false }).addTo(this.capaYo);
        this._yo = L.marker(ll, { pane: 'yo', icon: icono('icono-yo', '<span class="yo-pulso"></span><span class="yo-punto"></span>', 22), interactive: false, keyboard: false }).addTo(this.capaYo);
      } else {
        this._yo.setLatLng(ll);
        this._yoPrec.setLatLng(ll);
        this._yoPrec.setRadius(prec);
      }
    }

    // ---------- Colocar un círculo ----------
    iniciarColocar(alColocar) {
      this.terminarModos();
      this.modo = 'colocar';
      this._alColocar = alColocar;
      this.el.classList.add('modo-colocar');
    }
    ponerBorrador(latlng, tipoId) {
      const t = IZ.TIPO[tipoId] || IZ.TIPOS[0];
      const html = `<span class="borrador-anillo" style="--c:${t.color}"></span><span class="borrador-punto" style="--c:${t.color}"></span>`;
      if (!this._borrador) {
        this._borrador = L.marker(latlng, { pane: 'edicionMarcadores', icon: icono('icono-borrador', html, 34), interactive: false, keyboard: false }).addTo(this.capaEdicion);
      } else {
        this._borrador.setLatLng(latlng);
        this._borrador.setIcon(icono('icono-borrador', html, 34));
      }
    }
    posicionBorrador() {
      return this._borrador ? this._borrador.getLatLng() : null;
    }

    // ---------- Dibujar una zona nueva ----------
    iniciarDibujo(alCambiar) {
      this.terminarModos();
      this.modo = 'dibujar';
      this.el.classList.add('modo-dibujo');
      this._dib = {
        puntos: [],
        alCambiar,
        poligono: L.polygon([], { pane: 'edicion', color: '#0d47a1', weight: 3, dashArray: '6 6', fillColor: '#0d47a1', fillOpacity: 0.12, interactive: false }).addTo(this.capaEdicion),
        vertices: L.layerGroup().addTo(this.capaEdicion)
      };
    }
    _agregarPuntoDibujo(latlng) {
      if (!this._dib) return;
      this._dib.puntos.push([u.redondear(latlng.lat), u.redondear(latlng.lng)]);
      this._redibujarDibujo();
    }
    deshacerPunto() {
      if (!this._dib) return;
      this._dib.puntos.pop();
      this._redibujarDibujo();
    }
    _redibujarDibujo() {
      const d = this._dib;
      d.poligono.setLatLngs(d.puntos);
      d.vertices.clearLayers();
      d.puntos.forEach((p, i) =>
        L.marker(p, { pane: 'edicionMarcadores', icon: icono('manija manija-vertice' + (i === 0 ? ' primera' : ''), '', 20), interactive: false, keyboard: false }).addTo(d.vertices)
      );
      if (d.alCambiar) d.alCambiar(d.puntos.length);
    }
    puntosDibujo() {
      return this._dib ? this._dib.puntos.map((p) => p.slice()) : [];
    }

    // ---------- Editar la forma de una zona ----------
    iniciarEdicionZona(puntos, color, alCambiar) {
      this.terminarModos();
      this.modo = 'editarZona';
      this.el.classList.add('modo-edicion');
      const ed = (this._ed = { puntos: puntos.map((p) => [p[0], p[1]]), color, alCambiar });
      ed.poligono = L.polygon(ed.puntos, { pane: 'edicion', color, weight: 3, fillColor: color, fillOpacity: 0.18, interactive: false }).addTo(this.capaEdicion);
      ed.manijas = L.layerGroup().addTo(this.capaEdicion);
      this._dibujarManijas();
      this.ajustar(ed.poligono.getBounds());
    }
    _dibujarManijas() {
      const ed = this._ed;
      if (!ed) return;
      ed.manijas.clearLayers();
      ed.poligono.setLatLngs(ed.puntos);
      ed.mkVertices = [];
      ed.mkMedias = [];
      const n = ed.puntos.length;
      ed.puntos.forEach((p, i) => {
        const mk = L.marker(p, { pane: 'edicionMarcadores', draggable: true, autoPan: true, keyboard: false, icon: icono('manija manija-vertice', '', 24) });
        mk.on('drag', (ev) => {
          const ll = ev.target.getLatLng();
          ed.puntos[i] = [ll.lat, ll.lng];
          this._actualizarManijas(i);
        });
        mk.on('dragend', () => this._cambioEdicion());
        mk.on('click', () => this._menuVertice(i, mk));
        mk.addTo(ed.manijas);
        ed.mkVertices.push(mk);
      });
      ed.puntos.forEach((p, i) => {
        const q = ed.puntos[(i + 1) % n];
        const mk = L.marker([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], { pane: 'edicionMarcadores', draggable: true, keyboard: false, icon: icono('manija manija-media', '+', 22) });
        const insertar = () => {
          const ll = mk.getLatLng();
          ed.puntos.splice(i + 1, 0, [ll.lat, ll.lng]);
        };
        mk.on('click', () => {
          insertar();
          this._cambioEdicion();
        });
        mk.on('dragstart', () => {
          insertar();
          mk._izIndice = i + 1;
        });
        mk.on('drag', (ev) => {
          const ll = ev.target.getLatLng();
          ed.puntos[mk._izIndice] = [ll.lat, ll.lng];
          ed.poligono.setLatLngs(ed.puntos);
        });
        mk.on('dragend', () => this._cambioEdicion());
        mk.addTo(ed.manijas);
        ed.mkMedias.push(mk);
      });
      const c = u.centroide(ed.puntos);
      ed.mkCentro = L.marker(c, { pane: 'edicionMarcadores', draggable: true, keyboard: false, icon: icono('manija manija-mover', '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2l3 3h-2v4h-2V5H9l3-3zm0 20l-3-3h2v-4h2v4h2l-3 3zM2 12l3-3v2h4v2H5v2l-3-3zm20 0l-3 3v-2h-4v-2h4V9l3 3z" fill="currentColor"/></svg>', 36) });
      ed.mkCentro.on('dragstart', (ev) => {
        ed.inicio = ev.target.getLatLng();
        ed.base = ed.puntos.map((p) => p.slice());
      });
      ed.mkCentro.on('drag', (ev) => {
        const ll = ev.target.getLatLng();
        const dLat = ll.lat - ed.inicio.lat;
        const dLng = ll.lng - ed.inicio.lng;
        ed.puntos = ed.base.map((p) => [p[0] + dLat, p[1] + dLng]);
        this._actualizarManijas(-1);
      });
      ed.mkCentro.on('dragend', () => this._cambioEdicion());
      ed.mkCentro.addTo(ed.manijas);
    }
    _actualizarManijas(excepto) {
      const ed = this._ed;
      ed.poligono.setLatLngs(ed.puntos);
      const n = ed.puntos.length;
      ed.mkVertices.forEach((mk, i) => {
        if (i !== excepto && ed.puntos[i]) mk.setLatLng(ed.puntos[i]);
      });
      ed.mkMedias.forEach((mk, i) => {
        const p = ed.puntos[i], q = ed.puntos[(i + 1) % n];
        if (p && q) mk.setLatLng([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
      });
      if (excepto !== -1 && ed.mkCentro) ed.mkCentro.setLatLng(u.centroide(ed.puntos));
    }
    _cambioEdicion() {
      this._dibujarManijas();
      if (this._ed && this._ed.alCambiar) this._ed.alCambiar(this._ed.puntos.length);
    }
    _menuVertice(i, mk) {
      const ed = this._ed;
      if (!ed || ed.puntos.length <= 3) return;
      const cont = document.createElement('div');
      cont.className = 'popup-vertice';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-peligro btn-chico';
      b.textContent = 'Quitar este punto';
      b.addEventListener('click', () => {
        this.map.closePopup();
        ed.puntos.splice(i, 1);
        this._cambioEdicion();
      });
      cont.appendChild(b);
      L.popup({ closeButton: true, offset: [0, -8] }).setLatLng(mk.getLatLng()).setContent(cont).openOn(this.map);
    }
    puntosEdicion() {
      return this._ed ? this._ed.puntos.map((p) => [u.redondear(p[0]), u.redondear(p[1])]) : [];
    }

    terminarModos() {
      this.modo = 'normal';
      this._alColocar = null;
      this._dib = null;
      this._ed = null;
      this._borrador = null;
      this.capaEdicion.clearLayers();
      this.map.closePopup();
      this.el.classList.remove('modo-colocar', 'modo-dibujo', 'modo-edicion');
    }

    // ---------- Vista ----------
    setRellenoInferior(px) {
      this.rellenoInferior = px || 0;
    }
    ajustar(limites, zoomMax) {
      if (!limites) return;
      const b = limites.isValid ? limites : L.latLngBounds(limites);
      if (!b.isValid()) return;
      this.map.fitBounds(b, { paddingTopLeft: [24, 72], paddingBottomRight: [24, this.rellenoInferior + 24], maxZoom: zoomMax || 18 });
    }
    centrar(lat, lng, zoom) {
      const z = zoom || Math.max(this.map.getZoom(), 17);
      // Centra dejando espacio para los paneles de abajo.
      const punto = this.map.project([lat, lng], z).add([0, this.rellenoInferior / 2]);
      this.map.setView(this.map.unproject(punto, z), z, { animate: true });
    }
    /** Deja el punto a la altura `y` (en píxeles de la pantalla), p. ej. entre un aviso y una hoja. */
    centrarEnAltura(lat, lng, zoom, y) {
      const z = zoom || this.map.getZoom();
      const caja = this.el.getBoundingClientRect();
      const desplazamiento = caja.top + caja.height / 2 - y;
      const punto = this.map.project([lat, lng], z).add([0, desplazamiento]);
      this.map.setView(this.map.unproject(punto, z), z, { animate: true });
    }
    invalidar() {
      this.map.invalidateSize({ pan: false });
    }
  }

  IZ.Mapa = Mapa;
})();
