import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createHandler } from '../lib/handler.js';

const handle = createHandler();
const port = Number(process.env.PORT || 3000);

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
}).listen(port, '0.0.0.0', () => console.log(`Cacahuete escucha en http://0.0.0.0:${port}/api/cacahuete`));
