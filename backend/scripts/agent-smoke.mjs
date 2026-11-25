// Manual check on the event laptop (not part of npm test): three canned agent turns against the real Ollama,
// with the latency of every model call. Uses an in-memory database, so nothing is stored.
//   node backend/scripts/agent-smoke.mjs
// Each turn must stay under 45 s; otherwise try OLLAMA_AGENT_MODEL=qwen2.5:1.5b.
import { PGlite } from '@electric-sql/pglite';
import { runAgentTurn } from '../lib/agent.js';
import { createOllamaClient } from '../lib/ollama.js';
import { applySchema } from '../lib/schema.js';

const budgetMs = 45_000;
const db = new PGlite();
await applySchema(db);
let timings = [];
const ollama = createOllamaClient({
  fetchImpl: async (url, init) => {
    const kind = JSON.parse(init.body).tools ? 'decide ' : 'narrate';
    const started = performance.now();
    try {
      return await fetch(url, init);
    } finally {
      timings.push(`${kind} ${Math.round(performance.now() - started)} ms`);
    }
  }
});
console.log('Modelos:', ollama.status());

const owner = 'guest:agent-smoke';
let routeId;
let failed = false;
for (const text of ['Tengo 3 horas y me gusta la historia', 'Quita el museo', 'Acaba a las 14:00']) {
  timings = [];
  const started = performance.now();
  const reply = await runAgentTurn({ db, owner, text, routeId, ollama });
  const total = Math.round(performance.now() - started);
  routeId = reply.routeId ?? routeId;
  failed ||= total > budgetMs;
  console.log(`\n> ${text}`);
  console.log(`  ${total} ms en total (${timings.join(', ')}) · source ${reply.source}${total > budgetMs ? ' · DEMASIADO LENTO' : ''}`);
  console.log(`  eventos: ${reply.events.map(e => e.change ?? e.reason ?? e.type).join(', ')}`);
  console.log(`  ${reply.text}`);
  console.log(`  sugerencias: ${reply.suggestions.join(' | ')}`);
}
await db.close();
process.exitCode = failed ? 1 : 0;
