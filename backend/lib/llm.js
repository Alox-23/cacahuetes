import { readFileSync } from 'node:fs';
import { places } from './catalog.js';

const system = readFileSync(new URL('./prompts/cacahuete.es.txt', import.meta.url), 'utf8');
const sentences = new Intl.Segmenter('es', { granularity: 'sentence' });
// setTimeout fires immediately for delays above this, so larger values count as invalid.
const maxDelay = 2_147_483_647;

// Reads a positive whole number from the environment; anything missing or invalid keeps the default.
export function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 && value <= maxDelay ? value : fallback;
}

export function ollamaBase() {
  return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, '');
}

function ollamaModel() {
  return process.env.OLLAMA_MODEL || 'qwen2.5:7b';
}

// Only the reason is logged: prompts and answers can contain visitor messages.
function fallback(reason) {
  console.warn('Cacahuete narrator fallback:', reason);
  return null;
}

export function createNarrator({
  fetchImpl = fetch,
  timeout = envNumber('OLLAMA_TIMEOUT_MS', 20_000),
  wait = envNumber('OLLAMA_QUEUE_MS', 30_000),
  concurrency = envNumber('OLLAMA_CONCURRENCY', 2)
} = {}) {
  let active = 0;
  const queue = new Set();

  async function acquire() {
    if (active < concurrency) {
      active++;
      return true;
    }
    return new Promise(resolve => {
      const admit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        queue.delete(admit);
        resolve(false);
      }, wait);
      queue.add(admit);
    });
  }

  return async function narrate(message, preferences, route, pending = null) {
    if (!await acquire()) return fallback('queue');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let stage = 'fetch';
    try {
      const ids = new Set(route?.stops.map(stop => stop.placeId ?? stop.id));
      const mentioned = message?.toLocaleLowerCase('es') ?? '';
      const stops = places.filter(p => ids.has(p.id) || [p.name, ...p.aliases].some(
        alias => mentioned.includes(alias.toLocaleLowerCase('es'))));
      const data = { message, preferences, route, stops, pending };
      const response = await fetchImpl(ollamaBase() + '/chat/completions', {
        method: 'POST', signal: controller.signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ollamaModel(),
          temperature: 0.3, max_tokens: 300, stream: false,
          messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(data) }] })
      });
      if (!response.ok) return fallback(`http ${response.status}`);
      stage = 'body';
      const choice = (await response.json()).choices?.[0];
      const text = choice?.message?.content;
      if (choice?.finish_reason === 'length') return fallback('length');
      if (typeof text !== 'string' || !text.trim()) return fallback('empty');
      if ([...sentences.segment(text.trim())].length > 6) return fallback('too-long');
      return text.trim();
    } catch {
      if (controller.signal.aborted) return fallback('timeout');
      return fallback(stage === 'fetch' ? 'unreachable' : 'invalid');
    } finally {
      clearTimeout(timer);
      const next = queue.values().next().value;
      if (next) {
        queue.delete(next);
        next();
      } else active--;
    }
  };
}

export const narrate = createNarrator();

// Health probe: is Ollama answering? Cached so health stays cheap, bounded so it stays fast, never throws.
export function createLlmProbe({ fetchImpl = fetch, timeout = 1500, ttl = 30_000, now = Date.now } = {}) {
  let cached = null;
  let expires = 0;

  async function probe() {
    const model = ollamaModel();
    const controller = new AbortController();
    let timer;
    const expired = new Promise(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, timeout);
    });
    const request = (async () => {
      const response = await fetchImpl(ollamaBase().replace(/\/v1$/, '') + '/api/tags',
        { signal: controller.signal, redirect: 'error' });
      response.body?.cancel().catch(() => {});
      return response.ok;
    })().catch(() => false);
    try {
      return { model, reachable: await Promise.race([request, expired]) };
    } finally {
      clearTimeout(timer);
    }
  }

  return function llmStatus() {
    if (!cached || now() >= expires) {
      expires = now() + ttl;
      cached = probe();
    }
    return cached;
  };
}

export const llmStatus = createLlmProbe();
