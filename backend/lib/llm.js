import { readFileSync } from 'node:fs';
import { places } from './catalog.js';

const system = readFileSync(new URL('./prompts/cacahuete.es.txt', import.meta.url), 'utf8');
const sentences = new Intl.Segmenter('es', { granularity: 'sentence' });

export function createNarrator({ fetchImpl = fetch, timeout = 20_000, wait = 30_000 } = {}) {
  let active = 0;
  const queue = new Set();

  async function acquire() {
    if (active < 2) {
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
    if (!await acquire()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const ids = new Set(route?.stops.map(stop => stop.placeId ?? stop.id));
      const mentioned = message?.toLocaleLowerCase('es') ?? '';
      const stops = places.filter(p => ids.has(p.id) || [p.name, ...p.aliases].some(
        alias => mentioned.includes(alias.toLocaleLowerCase('es'))));
      const data = { message, preferences, route, stops, pending };
      const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
      const response = await fetchImpl(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST', signal: controller.signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
          temperature: 0.3, max_tokens: 300, stream: false,
          messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(data) }] })
      });
      if (!response.ok) return null;
      const choice = (await response.json()).choices?.[0];
      const text = choice?.message?.content;
      if (choice?.finish_reason === 'length' || typeof text !== 'string' || !text.trim() ||
          [...sentences.segment(text.trim())].length > 6) return null;
      return text.trim();
    } catch {
      return null;
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
