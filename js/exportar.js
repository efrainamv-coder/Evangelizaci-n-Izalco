/*
 * Descargas del administrador: Excel (.xlsx), CSV, KML (Google Earth / My Maps), GeoJSON y respaldo JSON.
 * El archivo Excel se genera aquí mismo (sin librerías externas).
 */
(function () {
  'use strict';
  const IZ = window.IZ;
  const u = IZ.util;

  // ============ Tablas con toda la información ============
  function zonaDe(m, zonas) {
    for (const z of zonas) if (u.puntoEnPoligono(m.lat, m.lng, z.puntos)) return z.nombre;
    return '';
  }
  const siNo = (b) => (b ? 'Sí' : 'No');
  const ordenarPor = (lista, f) => lista.slice().sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0));

  /**
   * datos = { marcas: {id: m}, equipos: {uid: e}, salidas: {id: s}, zonas: {id: z}, ubicaciones: {uid: {disp: p}}, ahora }
   */
  function construirTablas(datos) {
    const zonas = Object.entries(datos.zonas || {}).map(([id, z]) => Object.assign({ id }, z));
    const marcas = ordenarPor(Object.entries(datos.marcas || {}).map(([id, m]) => Object.assign({ id }, m)), (m) => m.creado || 0);
    const equipos = Object.entries(datos.equipos || {}).map(([uid, e]) => Object.assign({ uid }, e));
    const salidas = ordenarPor(Object.entries(datos.salidas || {}).map(([id, s]) => Object.assign({ id }, s)), (s) => `${s.fecha}|${s.creado || 0}`);
    const tipoNombre = (t) => (IZ.TIPO[t] ? IZ.TIPO[t].nombre : t);

    const visitas = [['Fecha', 'Hora', 'Tipo', 'Personas', 'Nota', 'Usuario', 'Enviados', 'Zona', 'Latitud', 'Longitud', 'Ver en mapa']];
    for (const m of marcas) {
      visitas.push([
        u.fechaNumerica(m.fecha), u.hora(m.creado), tipoNombre(m.tipo), typeof m.personas === 'number' ? m.personas : '',
        m.nota || '', m.usuario || '', m.equipo || '', zonaDe(m, zonas), u.redondear(m.lat), u.redondear(m.lng),
        { enlace: u.enlaceMapa(m.lat, m.lng), texto: 'Abrir mapa' }
      ]);
    }

    const conteoPorSalida = {};
    for (const m of marcas) {
      const k = `${m.uid}|${m.fecha}`;
      conteoPorSalida[k] = (conteoPorSalida[k] || 0) + 1;
    }

    const hermanos = [['Fecha de salida', 'Usuario', 'N.º', 'Nombre', 'Apellido', 'Edad', 'Parroquia', 'Comunidad', 'Fue solo']];
    const grupos = [['Fecha de salida', 'Usuario', 'N.º de enviados', 'Enviados', 'Fue solo', 'Círculos marcados ese día', 'Registrado']];
    for (const s of salidas) {
      const miembros = (s.miembros || []).filter(Boolean);
      miembros.forEach((h, i) =>
        hermanos.push([u.fechaNumerica(s.fecha), s.usuario || '', i + 1, h.nombre || '', h.apellido || '', typeof h.edad === 'number' ? h.edad : '', h.parroquia || '', h.comunidad || '', siNo(s.solo)])
      );
      grupos.push([
        u.fechaNumerica(s.fecha), s.usuario || '', miembros.length, miembros.map(u.nombreCompleto).join(', '), siNo(s.solo),
        conteoPorSalida[`${s.uid}|${s.fecha}`] || 0, u.fechaHora(s.creado)
      ]);
    }

    const tablaEquipos = [['Usuario', 'Última salida', 'Enviados actuales', 'Parroquias', 'Comunidades', 'Círculos (total)', 'Registrado']];
    for (const e of ordenarPor(equipos, (e) => e.usuario || '')) {
      const miembros = (e.miembros || []).filter(Boolean);
      tablaEquipos.push([
        e.usuario || '', u.fechaNumerica(e.fecha), miembros.map(u.nombreCompleto).join(', '),
        Array.from(new Set(miembros.map((h) => h.parroquia).filter(Boolean))).join(', '),
        Array.from(new Set(miembros.map((h) => h.comunidad).filter(Boolean))).join(', '),
        marcas.filter((m) => m.uid === e.uid).length, u.fechaHora(e.creado)
      ]);
    }

    const tablaZonas = [['Zona', 'Estado', 'Fecha', 'Nota', 'Círculos dentro', 'Casas visitadas', 'Personas contactadas', 'Puntos del contorno (lat lng)']];
    for (const z of zonas) {
      const dentro = marcas.filter((m) => u.puntoEnPoligono(m.lat, m.lng, z.puntos));
      tablaZonas.push([
        z.nombre, (IZ.ESTADOS_ZONA[z.estado] || {}).nombre || z.estado, u.fechaNumerica(z.fecha), z.nota || '', dentro.length,
        dentro.filter((m) => m.tipo === 'casa').length, dentro.filter((m) => m.tipo === 'persona').length,
        (z.puntos || []).map((p) => `${u.redondear(p[0])} ${u.redondear(p[1])}`).join('; ')
      ]);
    }

    const enLinea = [['Usuario', 'Enviados', 'Última actualización', 'Latitud', 'Longitud', 'Precisión (m)', 'Ver en mapa']];
    for (const [, disps] of Object.entries(datos.ubicaciones || {})) {
      for (const [, p] of Object.entries(disps || {})) {
        if (!p || typeof p.lat !== 'number') continue;
        enLinea.push([p.usuario || '', p.equipo || '', u.fechaHora(p.t), u.redondear(p.lat), u.redondear(p.lng), p.prec || '', { enlace: u.enlaceMapa(p.lat, p.lng), texto: 'Abrir mapa' }]);
      }
    }

    // Resumen
    const personasUnicas = new Set();
    salidas.forEach((s) => (s.miembros || []).forEach((h) => h && personasUnicas.add(u.sinAcentos(u.nombreCompleto(h)).toLowerCase())));
    const resumen = [['Dato', 'Valor'], ['Generado', u.fechaHora(datos.ahora || Date.now())], ['Equipos (usuarios)', equipos.length], ['Salidas registradas (grupos)', salidas.length], ['Hermanos distintos enviados', personasUnicas.size], ['Círculos marcados (total)', marcas.length]];
    IZ.TIPOS.forEach((t) => resumen.push(['  ' + t.nombre, marcas.filter((m) => m.tipo === t.id).length]));
    resumen.push(['Personas alcanzadas (suma)', marcas.reduce((a, m) => a + (typeof m.personas === 'number' ? m.personas : 0), 0)]);
    Object.values(IZ.ESTADOS_ZONA).forEach((e) => resumen.push(['Zonas: ' + e.nombre.toLowerCase(), zonas.filter((z) => z.estado === e.id).length]));
    resumen.push(['', '']);
    resumen.push(['Círculos por fecha', 'Total']);
    const porFecha = {};
    marcas.forEach((m) => (porFecha[m.fecha] = (porFecha[m.fecha] || 0) + 1));
    Object.keys(porFecha).sort().forEach((f) => resumen.push([u.fechaNumerica(f), porFecha[f]]));

    return { resumen, visitas, hermanos, grupos, equipos: tablaEquipos, zonas: tablaZonas, enLinea, marcas, zonasLista: zonas };
  }

  // ============ ZIP + XLSX (sin librerías) ============
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(archivos) {
    const enc = new TextEncoder();
    const ahora = new Date();
    const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    const partes = [];
    const central = [];
    let desplazamiento = 0;
    for (const a of archivos) {
      const nombre = enc.encode(a.nombre);
      const datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos;
      const crc = crc32(datos);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, hora, true);
      local.setUint16(12, fecha, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, datos.length, true);
      local.setUint32(22, datos.length, true);
      local.setUint16(26, nombre.length, true);
      local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), nombre, datos);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, hora, true);
      cd.setUint16(14, fecha, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, datos.length, true);
      cd.setUint32(24, datos.length, true);
      cd.setUint16(28, nombre.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, 0, true);
      cd.setUint32(42, desplazamiento, true);
      central.push(new Uint8Array(cd.buffer), nombre);
      desplazamiento += 30 + nombre.length + datos.length;
    }
    const tamCentral = central.reduce((a, b) => a + b.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(4, 0, true);
    fin.setUint16(6, 0, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, desplazamiento, true);
    fin.setUint16(20, 0, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
  }

  const xmlEsc = (s) =>
    String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  function letraColumna(i) {
    let s = '';
    i += 1;
    while (i > 0) {
      const m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }
  function hojaXML(filas) {
    const ncol = Math.max(1, ...filas.map((f) => f.length));
    const anchos = [];
    for (let c = 0; c < ncol; c++) {
      let max = 6;
      for (const f of filas) {
        const v = f[c];
        const largo = v && typeof v === 'object' ? String(v.texto || '').length : String(v == null ? '' : v).length;
        max = Math.max(max, Math.min(60, largo + 2));
      }
      anchos.push(max);
    }
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    x += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    x += '<cols>' + anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    x += '<sheetData>';
    filas.forEach((fila, r) => {
      x += `<row r="${r + 1}">`;
      fila.forEach((v, c) => {
        if (v === null || v === undefined || v === '') return;
        const celda = letraColumna(c) + (r + 1);
        const estilo = r === 0 ? ' s="1"' : '';
        if (typeof v === 'number' && isFinite(v)) x += `<c r="${celda}"${estilo}><v>${v}</v></c>`;
        else if (typeof v === 'object' && v.enlace) {
          const f = `HYPERLINK("${String(v.enlace).replace(/"/g, '""')}","${String(v.texto || v.enlace).replace(/"/g, '""')}")`;
          x += `<c r="${celda}" s="2" t="str"><f>${xmlEsc(f)}</f><v>${xmlEsc(v.texto || v.enlace)}</v></c>`;
        } else x += `<c r="${celda}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
      });
      x += '</row>';
    });
    x += '</sheetData></worksheet>';
    return x;
  }
  function libroExcel(hojas) {
    const n = hojas.length;
    const tipos =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';
    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';
    const libro =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + hojas.map((h, i) => `<sheet name="${xmlEsc(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    const librorels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>';
    const estilos =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><u/><sz val="11"/><color rgb="FF1155CC"/><name val="Calibri"/><family val="2"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF123C69"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>Evangelización Izalco</dc:title><dc:creator>Evangelización Izalco</dc:creator>' +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
    const appXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Evangelización Izalco</Application></Properties>';
    const archivos = [
      { nombre: '[Content_Types].xml', datos: tipos },
      { nombre: '_rels/.rels', datos: rels },
      { nombre: 'docProps/core.xml', datos: core },
      { nombre: 'docProps/app.xml', datos: appXml },
      { nombre: 'xl/workbook.xml', datos: libro },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: librorels },
      { nombre: 'xl/styles.xml', datos: estilos }
    ];
    hojas.forEach((h, i) => archivos.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: hojaXML(h.filas) }));
    return new Blob([zip(archivos)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ============ CSV ============
  function csv(filas) {
    const celda = (v) => {
      if (v && typeof v === 'object') v = v.enlace || '';
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return new Blob(['﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  }

  // ============ KML (Google Earth, Google My Maps) ============
  const colorKML = (hex, alfa) => {
    const h = hex.replace('#', '');
    return (alfa || 'ff') + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
  };
  function kml(datos) {
    const t = construirTablas(datos);
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>';
    x += `<name>Evangelización Izalco (${xmlEsc(u.fechaNumerica(u.hoyISO()))})</name>`;
    IZ.TIPOS.forEach((tp) => {
      x += `<Style id="tipo-${tp.id}"><IconStyle><color>${colorKML(tp.color)}</color><scale>0.9</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>`;
    });
    Object.values(IZ.ESTADOS_ZONA).forEach((e) => {
      x += `<Style id="zona-${e.id}"><LineStyle><color>${colorKML(e.color)}</color><width>3</width></LineStyle><PolyStyle><color>${colorKML(e.color, '44')}</color></PolyStyle></Style>`;
    });
    x += '<Folder><name>Zonas</name>';
    for (const z of t.zonasLista) {
      if (!z.puntos || z.puntos.length < 3) continue;
      const anillo = z.puntos.concat([z.puntos[0]]).map((p) => `${p[1]},${p[0]},0`).join(' ');
      const est = IZ.ESTADOS_ZONA[z.estado] || IZ.ESTADOS_ZONA.pendiente;
      x += `<Placemark><name>${xmlEsc(z.nombre)}</name><description>${xmlEsc(`${est.nombre}${z.fecha ? ' · ' + u.fechaNumerica(z.fecha) : ''}${z.nota ? '\n' + z.nota : ''}`)}</description><styleUrl>#zona-${est.id}</styleUrl>`;
      x += `<Polygon><outerBoundaryIs><LinearRing><coordinates>${anillo}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    }
    x += '</Folder><Folder><name>Círculos (visitas)</name>';
    IZ.TIPOS.forEach((tp) => {
      const lista = t.marcas.filter((m) => m.tipo === tp.id);
      if (!lista.length) return;
      x += `<Folder><name>${xmlEsc(tp.nombre)} (${lista.length})</name>`;
      for (const m of lista) {
        const desc = [`${u.fechaNumerica(m.fecha)} ${u.hora(m.creado)}`, m.equipo ? `Enviados: ${m.equipo}` : '', m.usuario ? `Usuario: ${m.usuario}` : '', typeof m.personas === 'number' && m.personas ? `Personas: ${m.personas}` : '', m.nota ? `Nota: ${m.nota}` : ''].filter(Boolean).join('\n');
        x += `<Placemark><name>${xmlEsc(tp.nombre)}</name><description>${xmlEsc(desc)}</description><TimeStamp><when>${xmlEsc(m.fecha)}</when></TimeStamp><styleUrl>#tipo-${tp.id}</styleUrl><Point><coordinates>${m.lng},${m.lat},0</coordinates></Point></Placemark>`;
      }
      x += '</Folder>';
    });
    x += '</Folder></Document></kml>';
    return new Blob([x], { type: 'application/vnd.google-earth.kml+xml' });
  }

  // ============ GeoJSON y respaldo ============
  function geojson(datos) {
    const t = construirTablas(datos);
    const features = [];
    for (const z of t.zonasLista) {
      if (!z.puntos || z.puntos.length < 3) continue;
      features.push({
        type: 'Feature',
        properties: { clase: 'zona', id: z.id, nombre: z.nombre, estado: z.estado, fecha: z.fecha || '', nota: z.nota || '' },
        geometry: { type: 'Polygon', coordinates: [z.puntos.concat([z.puntos[0]]).map((p) => [p[1], p[0]])] }
      });
    }
    for (const m of t.marcas) {
      features.push({
        type: 'Feature',
        properties: { clase: 'circulo', id: m.id, tipo: m.tipo, tipoNombre: (IZ.TIPO[m.tipo] || {}).nombre || m.tipo, fecha: m.fecha, hora: u.hora(m.creado), usuario: m.usuario || '', enviados: m.equipo || '', personas: typeof m.personas === 'number' ? m.personas : null, nota: m.nota || '', color: (IZ.TIPO[m.tipo] || {}).color || '' },
        geometry: { type: 'Point', coordinates: [m.lng, m.lat] }
      });
    }
    return new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 1)], { type: 'application/geo+json' });
  }
  function respaldo(datos) {
    const copia = {
      app: 'evangelizacion-izalco',
      version: 1,
      generado: new Date(datos.ahora || Date.now()).toISOString(),
      equipos: datos.equipos || {},
      salidas: datos.salidas || {},
      marcas: datos.marcas || {},
      zonas: datos.zonas || {},
      ubicaciones: datos.ubicaciones || {}
    };
    return new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' });
  }

  function excel(datos) {
    const t = construirTablas(datos);
    const hojas = [
      { nombre: 'Resumen', filas: t.resumen },
      { nombre: 'Visitas (círculos)', filas: t.visitas },
      { nombre: 'Hermanos enviados', filas: t.hermanos },
      { nombre: 'Grupos por salida', filas: t.grupos },
      { nombre: 'Equipos (usuarios)', filas: t.equipos },
      { nombre: 'Zonas', filas: t.zonas }
    ];
    if (t.enLinea.length > 1) hojas.push({ nombre: 'En línea ahora', filas: t.enLinea });
    return libroExcel(hojas);
  }

  // ============ Descargar / compartir ============
  function descargar(nombre, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 4000);
  }
  async function compartir(nombre, blob) {
    try {
      const archivo = new File([blob], nombre, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: nombre });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return true;
    }
    return false;
  }

  IZ.exportar = { construirTablas, excel, csv, kml, geojson, respaldo, descargar, compartir, _zip: zip, _crc32: crc32 };
})();
