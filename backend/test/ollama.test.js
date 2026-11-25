import test from 'node:test';
import assert from 'node:assert/strict';
import { createOllamaClient, OllamaFailure } from '../lib/ollama.js';

const tools = [{ type: 'function', function: { name: 'undo', parameters: { type: 'object', properties: {} } } }];
const reply = message => Response.json({ message: { role: 'assistant', content: '', ...message }, done_reason: 'stop' });
const hang = (_, { signal }) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

async function warnings(run) {
  const original = console.warn;
  const logged = [];
  console.warn = (...args) => logged.push(args);
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return logged;
}

test('decide usa /api/chat nativo con herramientas, keep_alive y opciones del modelo pequeño', async () => {
  const calls = [];
  const client = createOllamaClient({
    baseUrl: 'http://ollama.test:11434/v1/', agentModel: 'qwen2.5:3b', model: 'qwen2.5:7b',
    fetchImpl: async (url, init) => {
      calls.push([url, JSON.parse(init.body)]);
      return reply({ content: 'texto que nadie ve', tool_calls: [
        { function: { name: 'undo', arguments: { times: 1 } } },
        { function: { name: 'undo', arguments: '{"times":2}' } }
      ] });
    }
  });
  const decision = await client.decide([{ role: 'user', content: 'Deshaz' }], tools);
  assert.deepEqual(decision.toolCalls, [{ name: 'undo', arguments: { times: 1 } }, { name: 'undo', arguments: { times: 2 } }]);
  const [url, body] = calls[0];
  assert.equal(url, 'http://ollama.test:11434/api/chat');
  assert.equal(body.model, 'qwen2.5:3b');
  assert.equal(body.stream, false);
  assert.equal(body.keep_alive, '1h');
  assert.deepEqual(body.options, { num_ctx: 4096, temperature: 0.1, num_predict: 192 });
  assert.deepEqual(body.tools, tools);
  assert.deepEqual(client.status(), { model: 'qwen2.5:7b', agentModel: 'qwen2.5:3b' });
});

test('decide reconoce una llamada escrita como JSON en el texto y rechaza argumentos rotos', async () => {
  const text = createOllamaClient({ fetchImpl: async () => reply({ content: '<tool_call>{"name":"undo","arguments":{}}</tool_call>' }) });
  assert.deepEqual((await text.decide([], tools)).toolCalls, [{ name: 'undo', arguments: {} }]);
  const prose = createOllamaClient({ fetchImpl: async () => reply({ content: 'Hola' }) });
  assert.deepEqual((await prose.decide([], tools)).toolCalls, []);
  const broken = createOllamaClient({ fetchImpl: async () => reply({ tool_calls: [{ function: { name: 'undo', arguments: '{rot' } }] }) });
  const logged = await warnings(() => assert.rejects(broken.decide([], tools), error =>
    error instanceof OllamaFailure && error.stage === 'decide' && error.reason === 'invalid'));
  assert.deepEqual(logged, [['Cacahuete agent fallback:', 'decide invalid']]);
});

test('narrate pide JSON con esquema al narrador y devuelve el objeto', async () => {
  let body;
  const schema = { type: 'object', properties: { text: { type: 'string' } } };
  const client = createOllamaClient({ model: 'qwen2.5:7b', fetchImpl: async (url, init) => {
    body = JSON.parse(init.body);
    return reply({ content: '{"text":"Hola","suggestions":[]}' });
  } });
  assert.deepEqual(await client.narrate([{ role: 'user', content: '{}' }], schema), { text: 'Hola', suggestions: [] });
  assert.equal(body.model, 'qwen2.5:7b');
  assert.deepEqual(body.format, schema);
  assert.deepEqual(body.options, { num_ctx: 4096, temperature: 0.3, num_predict: 320 });
  assert.equal(body.tools, undefined);
});

test('cada fallo se convierte en OllamaFailure con un único aviso sin contenido', async () => {
  const secret = 'mensaje privado';
  const cases = [
    ['narrate unreachable', 'narrate', async () => { throw new Error('ECONNREFUSED'); }],
    ['narrate http 500', 'narrate', async () => new Response(secret, { status: 500 })],
    ['narrate length', 'narrate', async () => Response.json({ message: { content: secret }, done_reason: 'length' })],
    ['narrate invalid', 'narrate', async () => reply({ content: secret })],
    ['decide invalid', 'decide', async () => new Response('no es json')],
    ['decide timeout', 'decide', hang]
  ];
  for (const [expected, method, fetchImpl] of cases) {
    const client = createOllamaClient({ fetchImpl, agentTimeoutMs: 5, timeoutMs: 5 });
    const logged = await warnings(() => assert.rejects(client[method]([{ role: 'user', content: secret }], tools),
      error => error.message === expected));
    assert.deepEqual(logged, [['Cacahuete agent fallback:', expected]]);
  }
});

test('un único limitador para los dos modelos: la cola caduca sin llamar a Ollama', async () => {
  const releases = [];
  const client = createOllamaClient({ concurrency: 1, queueMs: 10,
    fetchImpl: () => new Promise(resolve => releases.push(() => resolve(reply({ content: '{"text":"Hola"}' })))) });
  const first = client.narrate([], {});
  const logged = await warnings(() => assert.rejects(client.decide([], tools), error => error.reason === 'queue'));
  assert.deepEqual(logged, [['Cacahuete agent fallback:', 'decide queue']]);
  assert.equal(releases.length, 1);
  releases[0]();
  assert.deepEqual(await first, { text: 'Hola' });
  // The slot is free again.
  const second = client.decide([], tools);
  await new Promise(setImmediate);
  releases[1]();
  assert.deepEqual((await second).toolCalls, []);
});

test('el plazo del turno limita el tiempo de cada llamada y la espera en la cola', async () => {
  let fetches = 0;
  const slow = createOllamaClient({ agentTimeoutMs: 60_000, timeoutMs: 60_000, fetchImpl: (url, init) => {
    fetches++;
    return hang(url, init);
  } });
  const started = Date.now();
  const late = await warnings(() => assert.rejects(slow.decide([], tools, { deadline: Date.now() + 30 }),
    error => error.reason === 'timeout'));
  assert.ok(Date.now() - started < 5000);
  assert.deepEqual(late, [['Cacahuete agent fallback:', 'decide timeout']]);
  // A deadline already gone: no request at all.
  const gone = await warnings(() => assert.rejects(slow.narrate([], {}, { deadline: Date.now() - 1 }),
    error => error.reason === 'timeout'));
  assert.deepEqual(gone, [['Cacahuete agent fallback:', 'narrate timeout']]);
  assert.equal(fetches, 1);

  const releases = [];
  const busy = createOllamaClient({ concurrency: 1, queueMs: 60_000,
    fetchImpl: () => new Promise(resolve => releases.push(() => resolve(reply({ content: '{"text":"Hola"}' })))) });
  const first = busy.narrate([], {});
  const waited = Date.now();
  const queued = await warnings(() => assert.rejects(busy.decide([], tools, { deadline: Date.now() + 30 }),
    error => error.reason === 'queue'));
  assert.ok(Date.now() - waited < 5000);
  assert.deepEqual(queued, [['Cacahuete agent fallback:', 'decide queue']]);
  releases[0]();
  await first;
});
