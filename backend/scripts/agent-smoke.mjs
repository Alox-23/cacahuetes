// Manual check on the event laptop (not part of npm test): three canned agent turns against the real Ollama,
// with the latency of every model call. Uses an in-memory database, so nothing is stored. From the repo root:
//   node --env-file-if-exists=backend/.env backend/scripts/agent-smoke.mjs
// Fails when a turn takes longer than the turn budget, when a turn was decided by the rules (source "rules") or
// when any model call fell back ("Cacahuete agent fallback" warning). If it is too slow, try
// OLLAMA_AGENT_MODEL=qwen2.5:1.5b.
import { PGlite } from '@electric-sql/pglite';
import { runAgentTurn } from '../lib/agent.js';
import { envNumber } from '../lib/llm.js';
import { createOllamaClient } from '../lib/ollama.js';
import { applySchema } from '../lib/schema.js';

const budgetMs = envNumber('OLLAMA_AGENT_BUDGET_MS', 45_000);
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
// Every fallback is a failure of the smoke test, even when the turn still produced a reply.
let fallbacks = [];
const warn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).startsWith('Cacahuete agent fallback')) fallbacks.push(args.slice(1).join(' '));
  warn(...args);
};
console.log('Modelos:', ollama.status(), `· presupuesto ${budgetMs} ms por turno`);

const owner = 'guest:agent-smoke';
// A fixed morning clock, so "Acaba a las 14:00" means the same at any hour the check runs.
const day = new Date();
const client = { today: [day.getFullYear(), day.getMonth() + 1, day.getDate()].map(n => String(n).padStart(2, '0')).join('-'),
  now: '10:00' };
let routeId;
let failed = false;
// Turn 1 asks for museums so that turn 2 has a museum to remove.
for (const text of ['Tengo 3 horas y me gustan la historia y los museos', 'Quita el museo', 'Acaba a las 14:00']) {
  timings = [];
  fallbacks = [];
  const started = performance.now();
  const reply = await runAgentTurn({ db, owner, text, routeId, client, ollama });
  const total = Math.round(performance.now() - started);
  routeId = reply.routeId ?? routeId;
  const problems = [
    ...(total > budgetMs ? ['DEMASIADO LENTO'] : []),
    ...(reply.source === 'rules' ? ['DECIDIDO POR REGLAS'] : []),
    ...fallbacks.map(reason => `FALLBACK ${reason}`)
  ];
  failed ||= problems.length > 0;
  console.log(`\n> ${text}`);
  console.log(`  ${total} ms en total (${timings.join(', ')}) · source ${reply.source}${problems.length ? ' · ' + problems.join(' · ') : ''}`);
  console.log('  eventos:');
  for (const event of reply.events) console.log(`    ${JSON.stringify(event)}`);
  if (reply.route) console.log(`  ruta: ${reply.route.name}: ${reply.route.stops.map(s => `${s.arrive} ${s.name}`).join(' · ')}`);
  console.log(`  ${reply.text}`);
  console.log(`  sugerencias: ${reply.suggestions.join(' | ')}`);
}
console.warn = warn;
await db.close();
console.log(failed ? '\nFALLO: revisa los avisos de arriba.' : '\nOK');
process.exitCode = failed ? 1 : 0;
