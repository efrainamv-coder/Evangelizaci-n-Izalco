/*
 * Service worker: guarda la app en el teléfono para que abra aunque la señal sea débil.
 * Siempre intenta primero la versión más nueva (red) y, si no hay señal, usa la copia guardada.
 * Al cambiar archivos de la app, sube el número de VERSION.
 */
const VERSION = 'izalco-v2';
const ARCHIVOS = [
  './',
  'index.html',
  'config.js',
  'css/app.css',
  'js/util.js',
  'js/datos.js',
  'js/backend-local.js',
  'js/backend-firebase.js',
  'js/mapa.js',
  'js/exportar.js',
  'js/app.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('izalco-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function guardar(req, res) {
  if (res && res.ok && res.type !== 'opaque') {
    const copia = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copia));
  }
  return res;
}

/** Red primero; si tarda más de 4 s o no hay señal, la copia guardada. */
function redPrimero(req) {
  const deCache = () =>
    caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  return new Promise((resolver) => {
    let listo = false;
    const responder = (r) => {
      if (!listo && r) {
        listo = true;
        resolver(r);
      }
    };
    const espera = setTimeout(() => deCache().then(responder), 4000);
    fetch(req)
      .then((res) => {
        clearTimeout(espera);
        responder(guardar(req, res));
      })
      .catch(() => {
        clearTimeout(espera);
        deCache().then((r) => {
          if (!listo) {
            listo = true;
            resolver(r || Response.error());
          }
        });
      });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(redPrimero(req));
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    // Librerías de Firebase (versión fija): primero la copia guardada.
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => guardar(req, res))));
  }
  // Mapas, Firebase (datos en vivo), etc.: pasan directo a internet.
});
