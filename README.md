# Evangelización Izalco

App web para el celular que lleva el **registro de los hermanos enviados** y el **mapa en tiempo real** de la evangelización en Izalco (Camino Neocatecumenal · Parroquia Nuestra Señora de los Dolores).

- **Registro de enviados:** fecha, nombre y apellido de cada hermano; al escribirlos se habilitan edad, parroquia y comunidad. Se indica si fue solo o con 1 o 2 hermanos más. Al terminar se crea el usuario con el **primer nombre y apellido** del hermano 1 (por ejemplo `efrain.martinez`).
- **Barra de círculos:** en el mapa de Izalco se elige el tipo de círculo y se toca **Agregar** para marcar dónde pasaron:
  🟡 casa visitada · 🔵 persona contactada · 🟣 volver a visitar · ⚪ no había nadie · 🔴 no quiso recibir.
  Cada círculo guarda cuántas personas escucharon y una nota opcional; quien lo puso puede editarlo, moverlo o borrarlo.
- **En vivo:** todos ven al instante los círculos que van poniendo los demás y **dónde está cada hermano** que tiene la app abierta.
- **Modo visualizador:** para quien solo quiere observar el mapa en vivo, sin registrarse.
- **Zonas:** la zona verde (ya visitada) y la naranja (próxima) del 27/09/2026 ya vienen dibujadas; el administrador puede ajustarlas o crear más.
- **Administrador:** ve todo (equipos, hermanos con sus datos, historial de salidas, círculos, zonas y quién está en línea) y **descarga toda la información**: Excel, mapa para Google Earth / My Maps (KML), CSV, GeoJSON y respaldo JSON.

---

## Probarla ahora (modo demostración)

Mientras no se configure Firebase, la app funciona en **modo demostración**: todo se guarda solo en el teléfono o computadora donde se usa. Sirve para conocerla:

- Abre `index.html` con un servidor web (o publícala en GitHub Pages, ver paso 6).
- Administrador de la demostración: usuario **admin**, contraseña **izalco** (se cambia en `config.js`).
- Si abres la app en dos pestañas del mismo navegador y entras con usuarios distintos, verás cómo se actualiza en tiempo real.

Para que **todos los teléfonos** compartan los datos hay que conectar Firebase (gratis). Son unos 15 minutos:

## Puesta en marcha con Firebase (tiempo real entre todos)

### 1. Crear el proyecto
1. Entra a <https://console.firebase.google.com> con una cuenta de Google de la parroquia.
2. **Agregar proyecto** → nombre, por ejemplo `evangelizacion-izalco` → puedes desactivar Google Analytics → **Crear proyecto**. El plan gratuito (Spark) alcanza de sobra.

### 2. Activar el acceso de usuarios
1. Menú de la izquierda: **Seguridad → Authentication → Comenzar** (en consolas más antiguas está en *Compilación*).
2. Pestaña **Método de acceso**:
   - **Correo electrónico/contraseña** → Habilitar (solo el primer interruptor) → Guardar. *(Los usuarios `nombre.apellido` usan este método por dentro.)*
   - **Agregar proveedor nuevo → Anónimo** → Habilitar → Guardar. *(Lo usa el modo visualizador.)*
3. Si Firebase muestra el aviso *«Se recomienda Acceder con Google…»*, ignóralo: la app no usa el acceso con Google. Al final la lista debe mostrar solo **Correo electrónico/contraseña** y **Anónimo**, los dos *Habilitado*.

### 3. Crear la base de datos en tiempo real
1. Menú de la izquierda: **Bases de datos y almacenamiento → Realtime Database → Crear base de datos** (en consolas más antiguas está en *Compilación*).
2. Ubicación: **Estados Unidos (us-central1)** → **Comenzar en modo bloqueado** → Habilitar.
3. Copia la dirección que aparece arriba en la pestaña **Datos** (algo como `https://evangelizacion-izalco-default-rtdb.firebaseio.com`).

### 4. Publicar las reglas de seguridad
1. En Realtime Database abre la pestaña **Reglas**.
2. Borra lo que hay y pega **todo** el contenido del archivo [`database.rules.json`](database.rules.json) de este repositorio.
3. **Publicar**.

Las reglas hacen que: cada equipo solo pueda editar o borrar sus propios círculos; el visualizador solo pueda mirar; los datos personales de los hermanos (edad, parroquia, comunidad) solo los vean su propio equipo y el administrador; y nadie pueda hacerse administrador desde la app.

### 5. Conectar la app con Firebase
1. En Firebase: ⚙️ **Configuración del proyecto → General → Tus apps → `</>` (Web)** → apodo `app` → **Registrar app** (no hace falta Firebase Hosting).
2. Copia el objeto `firebaseConfig` que aparece.
3. En este repositorio abre [`config.js`](config.js) y reemplaza `firebase: null` por esa configuración. Debe incluir `databaseURL`; si no aparece, agrégala con la dirección del paso 3:

```js
firebase: {
  apiKey: "AIza...",
  authDomain: "evangelizacion-izalco.firebaseapp.com",
  databaseURL: "https://evangelizacion-izalco-default-rtdb.firebaseio.com",
  projectId: "evangelizacion-izalco",
  storageBucket: "evangelizacion-izalco.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
},
```

> Estos datos no son secretos: Firebase está hecho para que vayan en la página. La protección la dan las reglas del paso 4.

### 6. Publicar la app (GitHub Pages, gratis)
1. Une esta rama a `main` (o sube los archivos a `main`).
2. Si el repositorio es **privado**, GitHub Pages gratis no está disponible: hazlo público en **Settings → General → Danger Zone → Change repository visibility → Change to public**. Solo se verá el código de la app; los datos de los hermanos quedan en Firebase, protegidos por las reglas.
3. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En uno o dos minutos la app queda en `https://<tu-usuario>.github.io/<nombre-del-repositorio>/`. Ese es el enlace para compartir por WhatsApp.
5. En Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio** → `<tu-usuario>.github.io`.

### 7. Crear el administrador
1. Abre la app → **Administrador**.
2. Escribe un correo y una contraseña (mínimo 6 caracteres) → toca **Crear la cuenta del administrador** (no el botón azul «Entrar», porque la cuenta todavía no existe).
3. La app muestra un código (UID) → toca **Copiar**.
4. En Firebase → **Realtime Database → Datos**: pasa el ratón sobre la raíz, toca **+** y agrega:
   - Clave: `admins` → dentro, otro **+** con clave = *el UID copiado* y valor = `true`.
5. Vuelve a la app → **Ya lo agregué, reintentar**. Listo: entras como administrador.

La primera vez que entra el administrador se cargan las dos zonas del 27/09/2026 (verde: noreste, visitada; naranja: noroeste, próxima).

> ⚠️ **Las zonas iniciales son aproximadas:** se trazaron a partir de las capturas de Google Maps. En **Zonas → Editar forma** se arrastran las esquinas a las calles correctas, o se arrastra el botón del centro para mover toda la zona.

### 8. (Opcional) Código de acceso
En **Descargar → Código de acceso** el administrador puede poner un código (por ejemplo `dolores2026`). Desde ese momento, para registrarse o usar el modo visualizador hay que escribirlo. Los que ya entraron siguen entrando.

---

## Cómo se usa

**Hermanos que salen a evangelizar**
1. *Registrar enviados* → fecha y hermanos → crea una contraseña → se muestra el usuario (`nombre.apellido`). Los demás del equipo pueden entrar con el mismo usuario desde su celular.
2. Permite la **ubicación** cuando el teléfono la pida: así los demás ven dónde están.
3. Pestaña **Marcar**: elige el tipo de círculo → **Agregar círculo** → toca en el mapa la casa o el lugar (o **Mi ubicación**) → **Guardar**. Si se equivocaron, toca el círculo para editarlo, moverlo o borrarlo.
4. Pestaña **En vivo**: quién está en línea, a qué distancia, y lo último que se marcó.
5. Pestaña **Mi equipo**: la salida del día, sus círculos, compartir ubicación (sí/no) y **mantener la pantalla encendida**.
6. El domingo siguiente, al entrar, la app pregunta **«¿Salen hoy?»** para registrar la nueva salida con los mismos hermanos o con otros.

**Solo observar:** *Solo ver el mapa en vivo* (o el enlace `…/#/ver`).

**Administrador:** pestañas **Mapa**, **Equipos** (hermanos con edad, parroquia, comunidad e historial de salidas), **Visitas** (filtros por fecha, tipo y equipo), **Zonas** (crear, editar, cambiar a *visitada*/*próxima*) y **Descargar**.

### Qué trae cada descarga
| Archivo | Contenido |
|---|---|
| **Excel (.xlsx)** | Resumen · Visitas (fecha, hora, tipo, personas, nota, usuario, enviados, zona, latitud, longitud y enlace a Google Maps) · Hermanos enviados (nombre, apellido, edad, parroquia, comunidad, fecha) · Grupos por salida · Equipos · Zonas · En línea ahora |
| **KML** | Zonas y círculos con sus colores. Se abre en Google Earth o se importa en Google My Maps (*Crear mapa → Importar*). |
| **CSV** | Visitas y hermanos, para cualquier hoja de cálculo. |
| **GeoJSON** | Puntos y zonas para programas de mapas (QGIS, etc.). |
| **JSON** | Respaldo completo de la base de datos. |

## Bueno saber
- La ubicación se comparte **solo mientras la app está abierta**. Con la pantalla apagada el teléfono deja de enviarla (por eso existe *Mantener la pantalla encendida*). Si alguien no se actualiza en 3 minutos aparece en gris; a los 15 minutos desaparece del mapa.
- Si se va la señal, lo que marquen se envía solo cuando vuelva (mientras no cierren la app).
- En Android (Chrome) y iPhone (Safari → Compartir) se puede **agregar a la pantalla de inicio** para abrirla como una app.
- Mapas: satélite de Esri y calles de OpenStreetMap (gratuitos, sin clave).
- Plan gratuito de Firebase: hasta 100 personas conectadas al mismo tiempo y 1 GB de datos; para una parroquia alcanza de sobra.
- ¿Olvidaron la contraseña? Se registra el equipo otra vez (se creará `nombre.apellido2`) o el administrador borra el usuario en *Firebase → Authentication* para volver a crearlo.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app (pantallas). |
| `config.js` | **Lo único que se edita:** configuración de Firebase, textos y centro del mapa. |
| `database.rules.json` | Reglas de seguridad para pegar en Firebase. |
| `css/app.css` | Diseño. |
| `js/app.js` | Pantallas y funcionamiento. |
| `js/mapa.js` | Mapa: círculos, zonas, hermanos en vivo, edición de zonas. |
| `js/backend-firebase.js` | Conexión con Firebase (tiempo real). |
| `js/backend-local.js` | Modo demostración (sin Firebase). |
| `js/exportar.js` | Descargas: Excel, KML, CSV, GeoJSON y JSON. |
| `js/datos.js` | Tipos de círculos, zonas iniciales y capas del mapa. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Para instalarla en el celular y abrirla con poca señal. |
| `vendor/leaflet/` | Librería de mapas Leaflet 1.9.4 (licencia BSD-2). |
| `pruebas/` | Pruebas automáticas (para desarrolladores). |

## Para desarrolladores: pruebas automáticas
Requieren Node.js 20+ y Java 11+ (para el emulador de Firebase):

```bash
cd pruebas
npm install
npx playwright install chromium
npm run demo       # modo demostración: registro, círculos, tiempo real, visualizador, administrador y descargas
npm run firebase   # emuladores de Firebase: reglas de seguridad y varios teléfonos a la vez
```

Las capturas de pantalla de las pruebas quedan en `pruebas/capturas/`.
