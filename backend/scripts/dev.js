import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHandler } from '../lib/handler.js';

const handle = createHandler();
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
