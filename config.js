/*
 * ⚙️  CONFIGURACIÓN DE LA APP — Evangelización Izalco
 *
 * Este es el ÚNICO archivo que necesitas editar.
 *
 * 1) Mientras `firebase` sea null, la app funciona en MODO DEMOSTRACIÓN:
 *    todo se guarda solo en el teléfono/navegador donde se usa (sirve para probar).
 *
 * 2) Para que los hermanos compartan los círculos y las ubicaciones EN TIEMPO REAL
 *    entre todos los teléfonos, crea un proyecto gratuito de Firebase y pega aquí
 *    su configuración (los pasos están en el archivo README.md).
 */
window.APP_CONFIG = {
  // Pega aquí la configuración de Firebase (reemplaza null por el objeto completo). Ejemplo:
  //
  // firebase: {
  //   apiKey: "AIzaSy...",
  //   authDomain: "evangelizacion-izalco.firebaseapp.com",
  //   databaseURL: "https://evangelizacion-izalco-default-rtdb.firebaseio.com",
  //   projectId: "evangelizacion-izalco",
  //   storageBucket: "evangelizacion-izalco.appspot.com",
  //   messagingSenderId: "123456789",
  //   appId: "1:123456789:web:abcdef123456"
  // },
  firebase: null,

  // Textos que aparecen en la pantalla de inicio
  titulo: 'Evangelización Izalco',
  subtitulo: 'Camino Neocatecumenal · Parroquia Nuestra Señora de los Dolores',

  // Punto donde abre el mapa (Izalco, Sonsonate) y nivel de acercamiento
  centro: [13.74472, -89.67306],
  zoom: 16,

  // Acceso del administrador SOLO en modo demostración.
  // (Con Firebase, el administrador se crea en la consola de Firebase; ver README.md)
  adminDemo: { usuario: 'admin', clave: 'izalco' }
};
