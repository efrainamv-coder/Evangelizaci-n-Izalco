// Servidor estático mínimo: sirve la app (carpeta de arriba) en http://127.0.0.1:PUERTO
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

export function iniciarServidor(puerto = 8080) {
  return new Promise((resolver, rechazar) => {
    const servidor = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const archivo = path.join(RAIZ, p);
      if (!archivo.startsWith(RAIZ)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(archivo, (err, datos) => {
        if (err) {
          res.writeHead(404);
          return res.end('no encontrado');
        }
        res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(datos);
      });
    });
    servidor.on('error', rechazar);
    servidor.listen(puerto, '127.0.0.1', () => resolver(servidor));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PUERTO || 8080);
  iniciarServidor(puerto).then(() => console.log(`App en http://127.0.0.1:${puerto}/`));
}
