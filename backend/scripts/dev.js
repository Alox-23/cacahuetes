import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createHandler } from '../lib/handler.js';
import { intranetUrls } from './intranet.js';

let handle;
if (process.env.CACAHUETE_DATA_DIR && !process.env.DATABASE_URL) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { applySchema } = await import('../lib/schema.js');
  const db = new PGlite(process.env.CACAHUETE_DATA_DIR);
  await applySchema(db);
  handle = createHandler(() => db);
} else {
  handle = createHandler();
}
const port = Number(process.env.PORT || 3000);
const adapters = intranetUrls(networkInterfaces(), port);
const localhost = `http://localhost:${port}`;
const origins = (process.env.FRONTEND_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
const localUrls = [...adapters.map(adapter => adapter.url), localhost, `http://127.0.0.1:${port}`];
process.env.FRONTEND_ORIGINS = [...new Set([...origins, ...localUrls])].join(',');
process.env.APP_URL ||= origins[0] || localUrls[0];
process.env.PUBLIC_API_URL ||= (adapters[0]?.url || localhost) + '/api/cacahuete';

const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };

async function serveFrontend(pathname, incoming, outgoing) {
  if (!['GET', 'HEAD'].includes(incoming.method)) return outgoing.writeHead(405).end();
  const path = resolve(dist, '.' + decodeURIComponent(pathname));
  const root = resolve(dist);
  if (path !== root && !path.startsWith(root + sep)) return outgoing.writeHead(404).end();
  const file = extname(path) ? path : resolve(root, 'index.html');
  try {
    const bytes = await readFile(file);
    outgoing.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    outgoing.end(incoming.method === 'HEAD' ? undefined : bytes);
  } catch {
    outgoing.writeHead(404).end();
  }
}

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://127.0.0.1:${port}`);
    if (url.pathname !== '/api/cacahuete') return await serveFrontend(url.pathname, incoming, outgoing);
    const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(incoming.method);
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      ...(hasBody ? { body: Readable.toWeb(incoming), duplex: 'half' } : {})
    });
    const response = await handle(request, incoming.socket.remoteAddress);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch {
    outgoing.writeHead(400).end();
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`En este portátil: ${localhost}`);
  for (const { name, url } of adapters) console.log(`Intranet (${name}): ${url}`);
  if (!adapters.length) console.log('Conecta el portátil a la intranet y vuelve a arrancar Cacahuete.');
});
