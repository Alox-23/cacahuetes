import test from 'node:test';
import assert from 'node:assert/strict';
import { chatInput, chatReply, chatTurn } from '../lib/chat.js';
import { createHandler } from '../lib/handler.js';
import { createLlmProbe, createNarrator } from '../lib/llm.js';

const turn = chatInput({ profile: { minutes: 90, start: 'alameda', interests: ['historia'] }, message: '¿Qué puedo ver?' });
const template = chatTurn(turn, false);
const success = () => Response.json({ choices: [{ message: { content: 'Soy Cacahuete.' } }] });
const hang = (_, { signal }) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

// Captures console.warn so tests can assert on the fallback reasons (and keep the output clean).
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

// Sets environment variables for one test and restores the previous values afterwards.
async function withEnv(vars, run) {
  const previous = Object.fromEntries(Object.keys(vars).map(name => [name, process.env[name]]));
  const assign = values => Object.entries(values).forEach(([name, value]) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
  assign(vars);
  try {
    await run();
  } finally {
    assign(previous);
  }
}

test('Ollama redacta a partir del recorrido calculado y del catálogo', async () => {
  let payload;
  const generate = createNarrator({ fetchImpl: async (url, init) => {
    payload = JSON.parse(init.body);
    assert.ok(url.endsWith('/chat/completions'));
    return success();
  } });
  assert.deepEqual(await chatReply(turn, false, generate), { ...template, message: 'Soy Cacahuete.' });
  assert.equal(payload.max_tokens, 300);
  assert.equal(payload.temperature, 0.3);
  const data = JSON.parse(payload.messages[1].content);
  assert.deepEqual(data.route, JSON.parse(JSON.stringify(template.route)));
  assert.ok(data.stops.length && data.stops.every(stop => stop.description));
});

test('El timeout aborta la generación y devuelve la plantilla', async () => {
  const generate = createNarrator({ timeout: 5, fetchImpl: hang });
  const logged = await warnings(async () => assert.deepEqual(await chatReply(turn, false, generate), template));
  assert.deepEqual(logged, [['Cacahuete narrator fallback:', 'timeout']]);
});

test('Si Ollama está caído o responde con error se mantiene el turno', async () => {
  const logged = await warnings(async () => {
    for (const fetchImpl of [async () => { throw new Error('ECONNREFUSED'); }, async () => new Response(null, { status: 503 })]) {
      assert.deepEqual(await chatReply(turn, false, createNarrator({ fetchImpl })), template);
    }
  });
  assert.deepEqual(logged.map(args => args[1]), ['unreachable', 'http 503']);
});

test('El límite admite 500 caracteres y rechaza 501', () => {
  assert.doesNotThrow(() => chatInput({ message: 'a'.repeat(500) }));
  assert.throws(() => chatInput({ message: 'a'.repeat(501) }), /500/);
});

test('Dos generaciones ocupan las plazas y la espera caduca sin llamar a Ollama', async () => {
  const releases = [];
  const generate = createNarrator({ wait: 10, fetchImpl: () => new Promise(resolve => releases.push(() => resolve(success()))) });
  const first = generate('Hola', {}, null);
  const second = generate('Hola', {}, null);
  const logged = await warnings(async () => assert.equal(await generate('Hola', {}, null), null));
  assert.deepEqual(logged, [['Cacahuete narrator fallback:', 'queue']]);
  assert.equal(releases.length, 2);
  releases.forEach(release => release());
  assert.deepEqual(await Promise.all([first, second]), ['Soy Cacahuete.', 'Soy Cacahuete.']);
});

test('OLLAMA_TIMEOUT_MS, OLLAMA_QUEUE_MS y OLLAMA_CONCURRENCY configuran el narrador', () => withEnv(
  { OLLAMA_TIMEOUT_MS: '5', OLLAMA_QUEUE_MS: '5', OLLAMA_CONCURRENCY: '1' }, async () => {
    let calls = 0;
    const generate = createNarrator({ fetchImpl: (...args) => {
      calls++;
      return hang(...args);
    } });
    const started = Date.now();
    const logged = await warnings(async () => {
      assert.deepEqual(await Promise.all([generate('Hola', {}, null), generate('Hola', {}, null)]), [null, null]);
    });
    // One slot: the second request waits 5 ms and gives up; the first is aborted after 5 ms.
    assert.ok(Date.now() - started < 1000);
    assert.equal(calls, 1);
    assert.deepEqual(logged.map(args => args[1]).sort(), ['queue', 'timeout']);
  }));

test('Los valores no válidos mantienen los límites por defecto', async () => {
  for (const value of ['abc', '0', '-5', '1.5', '', 'Infinity', '9999999999']) {
    await withEnv({ OLLAMA_TIMEOUT_MS: value, OLLAMA_CONCURRENCY: value }, async () => {
      const releases = [];
      const generate = createNarrator({ wait: 5, fetchImpl: (url, init) => {
        const aborted = hang(url, init);
        return new Promise((resolve, reject) => {
          releases.push(() => resolve(success()));
          aborted.catch(reject);
        });
      } });
      const pending = [generate('Hola', {}, null), generate('Hola', {}, null)];
      // Two slots by default: the third request waits and its queue expires.
      const logged = await warnings(async () => assert.equal(await generate('Hola', {}, null), null));
      assert.deepEqual(logged, [['Cacahuete narrator fallback:', 'queue']], value);
      await new Promise(resolve => setTimeout(resolve, 20));
      // With the 20 s default timeout the first two are still running.
      assert.equal(releases.length, 2, value);
      releases.forEach(release => release());
      assert.deepEqual(await Promise.all(pending), ['Soy Cacahuete.', 'Soy Cacahuete.'], value);
    });
  }
});

test('Cada plan B deja un único aviso con el motivo y sin contenido', async () => {
  const secret = 'Mensaje privado del visitante';
  const answer = (content, extra = {}) => async () => Response.json({ choices: [{ ...extra, message: { content } }] });
  const cases = [
    ['unreachable', async () => { throw new Error('ECONNREFUSED'); }],
    ['http 500', async () => new Response(secret, { status: 500 })],
    ['length', answer(secret, { finish_reason: 'length' })],
    ['empty', answer('   ')],
    ['too-long', answer(Array.from({ length: 7 }, (_, i) => `${secret} ${i}.`).join(' '))],
    ['invalid', async () => new Response('no es json', { status: 200 })]
  ];
  for (const [reason, fetchImpl] of cases) {
    const logged = await warnings(async () => {
      assert.equal(await createNarrator({ fetchImpl })(secret, {}, null), null);
    });
    assert.deepEqual(logged, [['Cacahuete narrator fallback:', reason]]);
  }
  const logged = await warnings(async () => {
    assert.equal(await createNarrator({ fetchImpl: answer('Hola, soy Cacahuete.') })(secret, {}, null),
      'Hola, soy Cacahuete.');
  });
  assert.deepEqual(logged, []);
});

test('La sonda de Ollama consulta /api/tags, se cachea 30 s y nunca falla', () => withEnv(
  { OLLAMA_BASE_URL: 'http://ollama.test:11434/v1/', OLLAMA_MODEL: 'qwen2.5:3b' }, async () => {
    let clock = 0;
    const urls = [];
    const probe = createLlmProbe({ now: () => clock, fetchImpl: async url => {
      urls.push(url);
      return Response.json({ models: [] });
    } });
    assert.deepEqual(await probe(), { model: 'qwen2.5:3b', reachable: true });
    clock = 29_999;
    await probe();
    assert.deepEqual(urls, ['http://ollama.test:11434/api/tags']);
    clock = 30_000;
    await probe();
    assert.equal(urls.length, 2);

    const down = createLlmProbe({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    assert.deepEqual(await down(), { model: 'qwen2.5:3b', reachable: false });
    const failing = createLlmProbe({ fetchImpl: async () => new Response(null, { status: 500 }) });
    assert.equal((await failing()).reachable, false);
    // A hung Ollama that even ignores the abort signal still answers within the probe timeout.
    const hung = createLlmProbe({ timeout: 20, fetchImpl: () => new Promise(() => {}) });
    const started = Date.now();
    assert.equal((await hung()).reachable, false);
    assert.ok(Date.now() - started < 1000);
  }));

test('health informa del modelo y de Ollama caído sin dejar de responder', () => withEnv(
  { OLLAMA_MODEL: 'qwen2.5:3b', OLLAMA_AGENT_MODEL: 'qwen2.5:1.5b' }, async () => {
    const database = () => ({ query: async () => ({ rows: [] }) });
    const health = async handler => {
      const response = await handler(new Request('https://api.example.test/api/cacahuete?action=health'), '127.0.0.1');
      assert.equal(response.status, 200);
      return response.json();
    };
    const down = createHandler(database, {
      llmStatus: createLlmProbe({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } })
    });
    assert.deepEqual(await health(down),
      { ok: true, service: 'cacahuete', city: 'Marbella', llm: { model: 'qwen2.5:3b', agentModel: 'qwen2.5:1.5b', reachable: false } });
    const broken = createHandler(database, { llmStatus: () => { throw new Error('boom'); } });
    assert.deepEqual((await health(broken)).llm, { model: 'qwen2.5:3b', agentModel: 'qwen2.5:1.5b', reachable: false });
  }));
