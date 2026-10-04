/* Datos fijos de la app: tipos de círculos, estados de zona, capas del mapa y zonas iniciales. */
(function () {
  'use strict';
  const IZ = (window.IZ = window.IZ || {});

  /** Tipos de círculos que los hermanos pueden colocar en el mapa ("barra de círculos"). */
  IZ.TIPOS = [
    { id: 'casa', nombre: 'Casa visitada', corto: 'Casa', color: '#FFD600', texto: '#3d3200' },
    { id: 'persona', nombre: 'Persona contactada', corto: 'Persona', color: '#1E88E5', texto: '#ffffff' },
    { id: 'volver', nombre: 'Volver a visitar', corto: 'Volver', color: '#8E24AA', texto: '#ffffff' },
    { id: 'ausente', nombre: 'No había nadie', corto: 'Nadie', color: '#9E9E9E', texto: '#ffffff' },
    { id: 'rechazo', nombre: 'No quiso recibir', corto: 'No recibió', color: '#E53935', texto: '#ffffff' }
  ];
  IZ.TIPO = {};
  IZ.TIPOS.forEach((t) => (IZ.TIPO[t.id] = t));

  /** Estados de una zona de evangelización. */
  IZ.ESTADOS_ZONA = {
    visitada: { id: 'visitada', nombre: 'Visitada', color: '#1E9E4A' },
    proxima: { id: 'proxima', nombre: 'Próxima a visitar', color: '#F57C00' },
    pendiente: { id: 'pendiente', nombre: 'Pendiente', color: '#546E7A' }
  };

  IZ.PARROQUIAS = [
    'Nuestra Señora de los Dolores (Izalco)',
    'Nuestra Señora de la Asunción (Izalco)'
  ];
  IZ.COMUNIDADES = [
    '1ª Comunidad', '2ª Comunidad', '3ª Comunidad', '4ª Comunidad', '5ª Comunidad',
    '6ª Comunidad', '7ª Comunidad', '8ª Comunidad', '9ª Comunidad', '10ª Comunidad',
    'Equipo de catequistas'
  ];

  /** Capas del mapa (gratuitas, sin clave). */
  IZ.CAPAS = {
    satelite: {
      nombre: 'Satélite',
      capas: [
        {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          opciones: { maxNativeZoom: 18, maxZoom: 21, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' }
        },
        {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
          opciones: { maxNativeZoom: 18, maxZoom: 21, opacity: 0.85 }
        },
        {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          opciones: { maxNativeZoom: 18, maxZoom: 21 }
        }
      ]
    },
    calles: {
      nombre: 'Calles',
      capas: [
        {
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          opciones: { maxNativeZoom: 19, maxZoom: 21, attribution: '© colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
        }
      ]
    }
  };

  /*
   * Zonas iniciales (territorio de la parroquia de Dolores, al norte de la Calle La Unión / La Libertad).
   * La Av. Morazán las divide (al norte de la iglesia sigue por la calle del lado poniente de la iglesia).
   * Van desde unas tres cuadras arriba de la iglesia (hasta donde llegaba la primera captura) hasta la
   * Calle La Unión (poniente) / La Libertad (oriente). Las calles se tomaron de Google Maps y de las líneas
   * que marcaron los hermanos; los extremos poniente y oriente, de la primera captura.
   */
  IZ.ZONAS_INICIALES = [
    {
      id: 'zona-1-noreste',
      nombre: 'Zona 1 · Noreste',
      estado: 'visitada',
      fecha: '2026-09-27',
      nota: 'Oriente de la Av. Morazán, desde arriba de la iglesia hasta la Calle La Libertad',
      puntos: [
        [13.753183, -89.673143], [13.753183, -89.667641], [13.744084, -89.667641], [13.746427, -89.675117],
        [13.75057, -89.673918], [13.751167, -89.67371], [13.751334, -89.6735], [13.752334, -89.673306]
      ]
    },
    {
      id: 'zona-2-noroeste',
      nombre: 'Zona 2 · Noroeste',
      estado: 'proxima',
      fecha: '2026-10-04',
      nota: 'Poniente de la Av. Morazán, desde arriba de la iglesia hasta la Calle La Unión',
      puntos: [
        [13.753183, -89.680226], [13.753183, -89.673143], [13.752334, -89.673306], [13.751334, -89.6735],
        [13.751167, -89.67371], [13.75057, -89.673918], [13.746444, -89.675112], [13.748464, -89.681701]
      ]
    }
  ];

  /*
   * Formas y notas con que versiones anteriores de la app cargaron esas zonas.
   * Solo sirven para reconocerlas: si nadie cambió su forma, la app las pone al día sola.
   */
  IZ.ZONAS_INICIALES_ANTERIORES = {
    'zona-1-noreste': {
      notas: ['Oriente de la Av. Morazán, norte de la Calle La Libertad'],
      formas: [
        [[13.748286, -89.671497], [13.748286, -89.665498], [13.738845, -89.665498], [13.738845, -89.66971], [13.740353, -89.674124], [13.744876, -89.672773], [13.745001, -89.672422]],
        [[13.753183, -89.672801], [13.753183, -89.667641], [13.745137, -89.667641], [13.745137, -89.671002], [13.746415, -89.675048], [13.750265, -89.673897], [13.75038, -89.673614]]
      ]
    },
    'zona-2-noroeste': {
      notas: ['Poniente de la Av. Morazán, norte de la Calle La Unión'],
      formas: [
        [[13.748411, -89.680132], [13.74837, -89.671869], [13.740436, -89.674262], [13.742744, -89.681887]],
        [[13.753183, -89.680226], [13.753183, -89.673148], [13.746468, -89.675221], [13.748464, -89.681705]]
      ]
    }
  };

  /**
   * Si `guardada` es una zona inicial que conserva una forma anterior (nadie la editó),
   * devuelve los cambios para ponerla al día ({ puntos, nota? }); si no, null.
   */
  IZ.actualizacionZonaInicial = (id, guardada) => {
    const nueva = IZ.ZONAS_INICIALES.find((z) => z.id === id);
    const antes = IZ.ZONAS_INICIALES_ANTERIORES[id];
    if (!nueva || !antes || !guardada || !antes.formas.some((f) => IZ.util.mismosPuntos(guardada.puntos, f))) return null;
    const cambios = { puntos: nueva.puntos.map((p) => [p[0], p[1]]) };
    if (!guardada.nota || antes.notas.includes(guardada.nota)) cambios.nota = nueva.nota;
    return cambios;
  };

  /** Casas de ejemplo (puntos amarillos de la captura). Solo se cargan en el modo demostración. */
  IZ.MARCAS_EJEMPLO = [
    [13.74859, -89.674175], [13.748313, -89.674293], [13.747779, -89.674449], [13.747451, -89.674603], [13.746891, -89.673488]
  ];
})();
