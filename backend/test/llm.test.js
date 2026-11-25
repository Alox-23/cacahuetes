import test from 'node:test';
import assert from 'node:assert/strict';
import { chatInput, chatReply, chatTurn } from '../lib/chat.js';
import { createNarrator } from '../lib/llm.js';

const turn = chatInput({ profile: { minutes: 90, start: 'alameda', interests: ['historia'] }, message: '¿Qué puedo ver?' });
const template = chatTurn(turn, false);
const success = () => Response.json({ choices: [{ message: { content: 'Soy Cacahuete.' } }] });

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
  const generate = createNarrator({ timeout: 5, fetchImpl: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  assert.deepEqual(await chatReply(turn, false, generate), template);
});

test('Si Ollama está caído o responde con error se mantiene el turno', async () => {
  for (const fetchImpl of [async () => { throw new Error('ECONNREFUSED'); }, async () => new Response(null, { status: 503 })]) {
    assert.deepEqual(await chatReply(turn, false, createNarrator({ fetchImpl })), template);
  }
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
  assert.equal(await generate('Hola', {}, null), null);
  assert.equal(releases.length, 2);
  releases.forEach(release => release());
  assert.deepEqual(await Promise.all([first, second]), ['Soy Cacahuete.', 'Soy Cacahuete.']);
});
