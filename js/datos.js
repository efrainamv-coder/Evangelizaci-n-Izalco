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
   * Zonas iniciales, trazadas a partir de las capturas enviadas (27/09/2026):
   *  - Verde: al oriente de la Av. Morazán y al norte de la Calle La Libertad (visitada hoy).
   *  - Naranja: al poniente de la Av. Morazán y al norte de la Calle La Unión (próximo domingo).
   * Son APROXIMADAS: el administrador puede ajustarlas en "Zonas → Editar forma".
   */
  IZ.ZONAS_INICIALES = [
    {
      id: 'zona-1-noreste',
      nombre: 'Zona 1 · Noreste',
      estado: 'visitada',
      fecha: '2026-09-27',
      nota: 'Oriente de la Av. Morazán, norte de la Calle La Libertad',
      puntos: [
        [13.748286, -89.671497], [13.748286, -89.665498], [13.738845, -89.665498], [13.738845, -89.66971],
        [13.740353, -89.674124], [13.744876, -89.672773], [13.745001, -89.672422]
      ]
    },
    {
      id: 'zona-2-noroeste',
      nombre: 'Zona 2 · Noroeste',
      estado: 'proxima',
      fecha: '2026-10-04',
      nota: 'Poniente de la Av. Morazán, norte de la Calle La Unión',
      puntos: [
        [13.748411, -89.680132], [13.74837, -89.671869], [13.740436, -89.674262], [13.742744, -89.681887]
      ]
    }
  ];

  /** Casas de ejemplo (puntos amarillos de la captura). Solo se cargan en el modo demostración. */
  IZ.MARCAS_EJEMPLO = [
    [13.742891, -89.673145], [13.742548, -89.673265], [13.741946, -89.673447], [13.741556, -89.67364], [13.740894, -89.672347]
  ];
})();
