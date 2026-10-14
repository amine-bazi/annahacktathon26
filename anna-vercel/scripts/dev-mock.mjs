// Serveur local de démonstration, sans Vercel ni base : sert public/ et imite l'API en mémoire
// (même backend de démo que le prototype autonome). Les données repartent de zéro à chaque redémarrage.
// Usage : npm run dev:mock  →  http://localhost:3000/?cle=demo
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoBackend } from '../lib/demo-backend.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = fileURLToPath(new URL('../public/', import.meta.url));   // décodé : le chemin peut contenir des espaces
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const backend = createDemoBackend();

const readBody = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = await backend.request(req.method, url.pathname + url.search, body, { key: req.headers['x-device-key'] });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
      return;
    }
    const file = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(ROOT)) throw Object.assign(new Error('Interdit'), { status: 403 });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(data);
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : 500);
    if (status === 500) console.error(e);
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ error: status === 404 && e.code === 'ENOENT' ? 'Introuvable' : e.message }));
  }
}).listen(PORT, () => console.log(`Démo locale : http://localhost:${PORT}/?cle=demo`));
