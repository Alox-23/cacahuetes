import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../lib/handler.js';

let handle;
if (process.env.DATABASE_URL) {
  handle = createHandler();
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  process.env.FRONTEND_ORIGINS ??= 'http://localhost:5173,http://127.0.0.1:5173';
  process.env.QUOTA_SECRET ??= 'local-dev-quota-secret-key-32chars-minimum';
  process.env.DEMO_SCENARIOS ??= 'true';
  const migration = await readFile(new URL('../db/001_init.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  handle = createHandler(() => db);
  console.log('PostgreSQL embebido (PGlite) inicializado con el esquema de Cacahuete.');
}

const port = Number(process.env.PORT || 3000);

createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url, `http://127.0.0.1:${port}`);
  if (url.pathname !== '/api/cacahuete') {
    outgoing.writeHead(404).end();
    return;
  }
  try {
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
}).listen(port, '127.0.0.1', () => console.log(`Cacahuete escucha en http://127.0.0.1:${port}/api/cacahuete`));
