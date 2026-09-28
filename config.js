/*
 * ⚙️  CONFIGURACIÓN DE LA APP — Evangelización Izalco
 *
 * Este es el ÚNICO archivo que necesitas editar.
 *
 * `firebase` conecta la app con el proyecto de Firebase «ubicaciones-6cdfd», para que los
 * hermanos compartan los círculos y las ubicaciones EN TIEMPO REAL entre todos los teléfonos.
 * Si se pone `firebase: null`, la app vuelve al MODO DEMOSTRACIÓN (datos solo en ese teléfono).
 *
 * Estos datos no son secretos: Firebase está hecho para que vayan en la página.
 * La seguridad la dan las reglas de database.rules.json (ver README.md).
 */
window.APP_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyBTo0ok42y1dja442Tz0FKq4WWA5vrwaeQ',
    authDomain: 'ubicaciones-6cdfd.firebaseapp.com',
    databaseURL: 'https://ubicaciones-6cdfd-default-rtdb.firebaseio.com',
    projectId: 'ubicaciones-6cdfd',
    storageBucket: 'ubicaciones-6cdfd.firebasestorage.app',
    messagingSenderId: '341087017545',
    appId: '1:341087017545:web:404155cbe5c4723045fd98'
  },

  // Textos que aparecen en la pantalla de inicio
  titulo: 'Evangelización Izalco',
  subtitulo: 'Camino Neocatecumenal · Parroquia Nuestra Señora de los Dolores',

  // Punto donde abre el mapa (la parroquia, en Izalco) y nivel de acercamiento
  centro: [13.75071, -89.67377],
  zoom: 16,

  // Acceso del administrador SOLO en modo demostración.
  // (Con Firebase, el administrador se crea en la consola de Firebase; ver README.md)
  adminDemo: { usuario: 'admin', clave: 'izalco' }
};
