# Feature 5 · Agente conversacional: the LLM decides and changes the route

Date: 2026-11-25 · Branch: `feature/llm-agent` (forked from `dev` at `57f933a`) · Merges into: `dev` · Builds on: `feature-2-ruta-mis-rutas-perfil.md`, `feature-3-version-de-escritorio.md`, `merge-local-llm-into-dev.md` and the backend README.

Today the local model (Ollama, qwen2.5:7b) is a **narrator only**: `backend/lib/llm.js` is forbidden to touch routes, and every decision (what the visitor wants, which planner action to run) is taken by regex tables plus two tiny linear classifiers (`backend/lib/chat.js`, `frontend/src/assistant/parser.ts`, `frontend/src/lib/refineKeywords.ts`). After onboarding the visitor is driven through a scripted slot-filling flow (date → time → start → "Crear ruta" card) and then a "change" mode with four fixed chips (`quick:menos_caminar` …) that map one to one onto `refineTrip` actions.

This feature makes the model the decision maker. After the profile exists, the visitor **talks**; the model reads the conversation, chooses which planner action to call (create a route, change its time window, add / remove / replace / lock a stop, apply a quick change, undo, update preferences, or just answer), the backend executes that action deterministically with the existing planner, and the model then explains what it did. The deterministic planner stays the only thing that computes routes: the model never writes stops, times or prices itself.

Where this document is silent, the earlier specs, the package rules in `frontend/docs/` and `backend/README.md` apply.

## 1. Goal

1. **The model can change the route.** Every planner capability reachable through buttons today is reachable through conversation, chosen by the model: creation, time window, stops, quick changes, undo.
2. **One free-text chat after onboarding.** No scripted slot questions, no "Crear ruta" card, no fixed refine chips in the chat. The only chips the chat shows are suggestions the model proposes for *this* turn (tap = send that text).
3. **Two models for latency** (user decision, option 2 + 4): a small model decides (tool calls), the 7B narrates. The event laptop is CPU-only, so every design choice below optimises prompt size and number of calls.
4. **Degrades, never breaks.** Ollama down, queue full, timeout, invalid tool arguments: the visitor still gets a deterministic reply and the planner still works through a rules-only path. The demo without API (`mockData.ts`) is untouched.

## 2. Scope

### In scope

| Area | Change |
| --- | --- |
| Backend schema | `db/003_agent.sql`: table `agent_turns` (conversation memory per owner). `claimGuest` moves a guest's turns to the account like routes and preferences. |
| Backend modules | New `lib/agent.js` (turn orchestration: context, decision loop, tool execution, narration, fallback), `lib/agent-tools.js` (tool schemas + validators + executors over the planner), `lib/agent-texts.js` (Spanish templates for degraded mode and event summaries), `lib/ollama.js` (native `/api/chat` client with tools + JSON `format`, shared limiter, two models). `lib/trip-planner.js` gains two deterministic actions: `add_stop` and `reschedule`. |
| Backend actions | New `POST ?action=agent`. `health` reports both models. Existing actions (`interpretRequest`, `routeQuestion`, `refineConversation`, legacy `chat`) stay as they are for compatibility; the frontend stops calling the first three in API mode. |
| Launcher & env | `OLLAMA_AGENT_MODEL` (default `qwen2.5:3b`). `scripts/lanzar.mjs` pulls and warms both models and unloads both on exit. `.env.example`, `backend/README.md`, root `README.md` (hardware table: two models ≈ 7 GB). |
| Frontend contract | `AgentReply`, `AgentEvent`, `DataModule.agent?` (optional: the mock module does not implement it). `docs/contract/types.ts` and `src/contract/types.ts` stay byte-identical (feature 4 test). |
| Frontend data | `httpData.ts` implements `agent`. |
| Frontend assistant | New `src/assistant/agentAssistant.ts` used for `request` and `change` modes **when the API is configured**. Onboarding keeps `mockAssistant.ts`. Without API everything stays as today. |
| Frontend screens (API mode) | ChatPage / ChatDock: the three scripted suggestion buttons become tappable *examples* that prefill the input. ConversationPage: no SummaryCard; a reply that created a route hands over to the existing Creando screen (Peanut Run) and then opens the route. Change greeting: no `quick:*` chips; suggestions come from the model. A muted "modo sin IA" hint appears when the backend answered with rules. |
| Tests | New `backend/test/agent.test.js` (fake Ollama via `fetchImpl`), planner tests for `add_stop` / `reschedule`, API test for `?action=agent` on pglite, `frontend/src/agent.test.tsx` (agent assistant with a fake data module), launcher test for the two models. New `backend/scripts/agent-smoke.mjs`: runs three canned conversations against a real Ollama and prints latencies (not part of `npm test`). |

### Out of scope

Switching to another *saved* route by voice ("abre la ruta de ayer"), multi-route comparison, streaming replies, voice input, English, changing onboarding (it keeps its buttons: the user said the chat starts once the profile exists), the route-screen buttons (Menos caminar… on `RouteView`, quitar / fijar / alternativas on the stop screens stay as direct manipulation), premium alternatives UI, the legacy `/chat` and `/onboarding` actions (left untouched, still tested), training the interest classifiers.

## 3. Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Who decides | The **decision model** (`OLLAMA_AGENT_MODEL`, default `qwen2.5:3b`) chooses tools. Its text content is **never shown** to the visitor. | A 3B model is fast enough on CPU for a 1.2k-token prompt and tool arguments, but its prose and facts are not trustworthy. |
| Who talks | The **narrator** (`OLLAMA_MODEL`, default `qwen2.5:7b`) writes the reply from the tool results. | The existing narrator prompt and limits (6 sentences, data only) already encode the house rules. |
| Ollama API | New client in `lib/ollama.js` uses the **native** `POST /api/chat` (base = `OLLAMA_BASE_URL` with a trailing `/v1` removed, the same trick the health probe uses). Decision call: `tools`, `options.num_ctx 4096`, `options.temperature 0.1`, `options.num_predict 192` (a cut answer, `done_reason: 'length'`, is a failure), `keep_alive '1h'`. Narration call: `format` = JSON schema `{ text: string, suggestions: string[] }`, `options.temperature 0.3`, `num_predict 320`. | The native API supports `tools` and a JSON-schema `format` together with `keep_alive`; the OpenAI shim's `response_format` support varies by Ollama version. `llm.js` (legacy narrator) is left as is. |
| Loop bound | At most **2 decision rounds** per turn and **3 tool calls** per round, executed in order. A second round happens **only when at least one round-1 tool call returned `ok: false`** (so the model can fix the refused call) and at least 8 s of the turn budget remain. A round where every call succeeded, or with no call, goes straight to the narrator. | Bounded latency: the usual turn is 1 small call + 1 narration; worst case ≈ 2 small calls + 1 narration. |
| Latency budget | Decision call timeout `OLLAMA_AGENT_TIMEOUT_MS` (default 15 000), narration `OLLAMA_TIMEOUT_MS` (20 000). Per-turn deadline `OLLAMA_AGENT_BUDGET_MS` (45 000) from the start of the turn: every queue wait and every call's timeout is capped at the time left, and round 2 is skipped with less than 8 s left. One shared limiter for both models: `OLLAMA_CONCURRENCY` (2) and `OLLAMA_QUEUE_MS` (30 000) as in `llm.js`. Queue full → degraded turn, not an error. | Same knobs the operator already knows; two visitors never make a third one wait for ever. |
| Conversation memory | Server side, table `agent_turns(owner_key, route_id, role, content, created_at)`. The last **6** turns of the owner are sent to the decision model; older rows are pruned on insert (20 kept). The assistant turn is stored as one compact line per tool call, each with the route state right after that call (`[acción] create_route → Marbella en 3 horas (3 paradas)`, `[acción] remove_stop → error: <visitor reason>`), not raw JSON, followed by the reply cut to 200 characters. The per-turn context goes as a second `system` message (Ollama keeps system messages when it truncates the prompt), not as a user message. | Keeps the prompt within `num_ctx 4096` on CPU, survives reloads and the mobile/desktop switch, and the frontend stays thin. |
| Guest vs account | `owner_key` exactly as `travel_routes` (account id or `guest:` + sha256 of `X-Guest-Token`). `claimGuest` also `UPDATE agent_turns SET owner_key=$2 WHERE owner_key=$1`. | Same identity model as the rest of the trip API. |
| Date and time | The client sends `client: { today: 'AAAA-MM-DD', now: 'HH:MM' }` (validated by regex; server clock as fallback). The decision model sees them as "today" / "now". | The server laptop may have a different clock than the phone; the planner needs real wall-clock values. |
| Defaults when creating | Prompted behaviour: act with sensible defaults and **say which** (date = today, start = `now` rounded up to the next quarter hour, duration = 3 h, start point = Plaza de los Naranjos) **unless** the visitor's message is so vague that the model cannot tell they want a route; then ask one question. The assumptions are computed by the server (the model is not asked for them); a window cut at 23:59 says «hasta las 23:59» instead of the duration. The narrator always states the assumptions it was given (`assumptions` in its input). No route in the past: a date before `client.today`, or for today a `from` earlier than `client.now`, is a tool error the model can correct in round 2. | The user asked that the model makes the choice; assumptions made explicit are easy to correct in the next sentence. |
| No confirmation card | `create_route` creates immediately; no "Crear ruta" step. The reply carries the route; the mobile UI still plays the Creando screen (Peanut Run) for the usual four steps and then opens the route. | The game is part of feature 3; the creation just already happened when it starts. |
| Suggestions | Up to 3 short strings produced by the narrator in its JSON. When missing or invalid, the backend fills them from `agent-texts.js` by state (a route → "Menos caminar", "Añade una pausa para café", "Acabar media hora antes"; no route → "Tengo 3 horas y me gusta la historia", …). The frontend renders them as the existing option chips with value `say:<text>`; tapping sends that text. | Mobile stays one-tap friendly without a scripted dialogue; chips are per turn and come from the model. |
| Degraded mode (`source: 'rules'`) | When the decision call fails (unreachable, timeout, queue, HTTP error, unparsable tool call) the turn is handled by rules on the server: `applyMessage` (existing) extracts start / minutes / interests → `create_route` with defaults when no route is current and something was recognised; `quickText` regexes (planner) → `quick_change` when a route is current; "deshacer" → undo; otherwise the `agent-texts.notUnderstood` template with default suggestions. The reply text is a template from `agent-texts.js` built from the events. The narrator is still tried when it is the only thing that failed. | The event must keep working if Ollama dies; the regex engine already exists, so the fallback costs little. |
| Narration failure | Any narration failure (timeout, invalid JSON, > 6 sentences) → template text from the events (`agent-texts.describe(events, route)`), `source: 'agent'` still (the decision was the model's). | Same policy as today's narrator fallback. |
| Place names | Every tool argument naming a place is resolved server side with `normalize` against `id`, `name` and `aliases` of `marbella.json`, plus the pause place `marbella-cafe` ("pausa", "descanso", "pausa para café"; "café" alone is the catalog alias of Cafetería Parque Alameda). Unknown → tool error for the model listing the five closest names (shared-token count); the model may retry in round 2. If it never fixes it, the visitor sees a fixed reason ("No conozco ese lugar en Marbella."), never the model's label. | The model never sees or emits ids; the catalog is the source of truth. |
| Quota | `authorizeAgent` once per `agent` turn, before any model call. Errors `AGENT_TIME_EXPIRED` / `RATE_LIMITED` as today; the frontend's `errorReply` already maps them. | One turn = one agent use, whatever it executes. |
| Mock mode | `DataModule.agent` is optional. `App.tsx` builds `agentAssistant` for request and change only when the HTTP module exists; otherwise the scripted assistant runs as today. | The demo on `alex-frontend` and the 92 existing frontend tests keep working; no model exists without the API anyway. |
| Prompts language | Decision system prompt in English (tool-calling reliability of small models), with the catalog and the visitor's turns in Spanish. Narrator prompt in Spanish, derived from `cacahuete.es.txt`, stored as `prompts/cacahuete-agente.es.txt`. | Small models follow English instructions better; the visitor only ever reads the narrator. |
| Onboarding | Unchanged (buttons). | User decision. |

## 4. Backend

### 4.1 Schema · `backend/db/003_agent.sql`

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS agent_turns (
  id bigserial PRIMARY KEY,
  owner_key text NOT NULL,
  route_id uuid,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_turns_owner_idx ON agent_turns(owner_key, id DESC);
COMMIT;
```

`lib/schema.js` already applies every `db/*.sql` in order; nothing else to wire. Prune after each insert: `DELETE FROM agent_turns WHERE owner_key=$1 AND id NOT IN (SELECT id FROM agent_turns WHERE owner_key=$1 ORDER BY id DESC LIMIT 20)`.

### 4.2 Action · `POST ?action=agent`

Registered in `tripMethods` (it needs the owner key, the route row and the trip helpers). Request body:

```ts
{ text: string;                 // 1..500 chars, trimmed
  routeId?: string;             // uuid of the route the chat is about (current route); omitted = none
  client?: { today?: string; now?: string } }   // 'AAAA-MM-DD', 'HH:MM'
```

Response `200`:

```ts
{ text: string;                 // what Cacahuete says (≤ 6 sentences)
  suggestions: string[];        // 0..3 short replies the visitor may tap
  route?: Route;                // present when a route was created or changed this turn (full contract Route)
  routeId?: string;             // the current route after this turn (new or unchanged)
  events: AgentEvent[];         // what happened, in order
  source: 'agent' | 'rules';    // who decided
  quota: Quota }
```

```ts
type AgentEvent =
  | { type: 'route_created'; routeId: string; assumptions: string[] }
  | { type: 'route_changed'; routeId: string; change: string }       // 'add_stop' | 'remove_stop' | 'replace_stop' | 'lock_stop' | 'reschedule' | 'menos_caminar' | ...
  | { type: 'undone'; routeId: string }
  | { type: 'preferences_updated'; fields: string[] }
  | { type: 'rejected'; reason: string }                            // a planner refusal, in Spanish (badRequest message)
  | { type: 'answered' }                                            // no tool: the model only talked
```

Errors: `400 INVALID_INPUT` (text), `400 UNSUPPORTED_CITY` (via `asksForAnotherCity`, no model call), `404 ROUTE_NOT_FOUND` (routeId not owned), `403 AGENT_TIME_EXPIRED`, `429 RATE_LIMITED`. A route that another tab changed meanwhile is not an error here: the agent always works on the row's current `itinerary` and returns it.

### 4.3 Turn orchestration · `lib/agent.js`

```
runAgentTurn({ db, owner, premium, text, routeId, client, ollama = defaultClient, now = Date, budgetMs })
  0. deadline = now + budgetMs (OLLAMA_AGENT_BUDGET_MS, 45 000)   // caps every queue wait and call timeout below
  1. scope guard (asksForAnotherCity) → fixed reply, no model, events [rejected], not stored
  2. load: preferences (travel_preferences ∪ trip-contract.defaults), route row (if routeId), last 6 agent_turns
  3. store the user turn
  4. decision = await decide(context)          // may throw → degraded path (step 4b)
       round 1: ollama.chat(agentModel, [system (rules + catalog), system (context JSON), ...history, user], tools)
       execute tool_calls in order (max 3), collect events, tool results ({ ok, summary } | { ok: false, error, reason })
       if some round-1 call returned ok: false and ≥ 8 s remain: round 2 with the tool results appended
         (the model sees `error`); execute again (max 3); a round-2 OllamaFailure keeps round 1's events
       no tool call in round 1 → events [answered]
       an unfixed refusal → event rejected with its `reason` (fixed Spanish text, never model input)
     4b. degraded: events = rulesTurn(text, context)   // §4.6
  5. narration = await narrate(context, events, updatedRoute)   // JSON { text, suggestions }; failure → templates
       skipped when the decision (round 1 or 2) failed with unreachable / queue
  6. store the assistant turn (one action line per call with the state after it + reply cut to 200 chars), prune
  7. return { text, suggestions, route?, routeId?, events, source }
```

The context object given to the decision model (as a second `system` message, after the system prompt and before the history: Ollama keeps system messages when it truncates, and the system prompt before it stays cacheable). The static catalog is **not** in it: the `places` lines and the `starts` are appended to the decision system prompt once, at module load.

```json
{ "today": "2026-11-25", "now": "11:40", "plan": "free",
  "preferences": { "interests": ["historia","gastronomia"], "pace": "equilibrado", "budget": "medio", "company": "pareja", "transport": ["a_pie"] },
  "route": { "name": "Marbella en 3 horas", "date": "2026-11-25", "from": "12:00", "to": "15:00",
             "stops": [ { "n": 1, "name": "Plaza de los Naranjos", "arrive": "12:00", "minutes": 30, "locked": false, "next": "a pie 8 min" } ] },
}
```

(`route` is `null` when there is none.) The system prompt ends with `places:` (one line per catalog place plus the pause place, e.g. `- Plaza de los Naranjos (sight: historia, arquitectura)`) and `starts: Plaza de los Naranjos, Parque de la Alameda, Puerto Deportivo de Marbella, Puerto Banús`.

Decision system prompt (English; the implementer writes the final text, it must contain these rules): you are the planning brain of Cacahuete, a Marbella guide; you only act through tools; never write the answer yourself (your text is discarded); call `create_route` when the visitor wants a route and no route exists or they ask for a new one, using defaults (today, now rounded up to the quarter hour, 3 h, Plaza de los Naranjos), which the server reports; when a route exists prefer changing it over creating another; `reschedule` changes the date, start time, end time or duration, while a new starting place needs `create_route`; use place names exactly as they appear in `places`; if a tool returns an error, either fix the arguments once or stop and let the narrator explain; if the visitor only asks a question or chats, call no tool; everything outside Marbella is refused by the system already.

### 4.4 Tools · `lib/agent-tools.js`

Each tool = JSON schema (for Ollama `tools`) + `validate(args, context)` + `execute(args, context)`; executors call the planner and the database and return `{ ok: true, summary }` or `{ ok: false, error, reason }`. A refusal is a `ToolError(forModel, forVisitor)`: `error` goes back to the decision model and may quote its arguments and the closest catalog names; `reason` becomes the `rejected` event and is a fixed Spanish text without any model input ("No conozco ese lugar en Marbella.", "No he podido hacer ese cambio.", "Esa fecha u hora no es válida.", "Esa fecha u hora ya ha pasado.") or one built only from catalog data. Planner `ApiError` 400 messages only quote catalog names, so they are used as both. All writes go through the same SQL the trip API uses (`travel_routes` insert / revision-checked update with history, `travel_preferences` upsert), factored into small helpers that `trip-api.js` also calls so there is one implementation.

| Tool | Arguments | Executes |
| --- | --- | --- |
| `create_route` | `date?`, `from?`, `to?`, `durationMinutes?` (20..480), `start?` (place name), `mustInclude?: string[]`, `interests?`, `pace?`, `budget?`, `company?` (no `assumptions`: the server computes them) | Fills defaults (§3), resolves `start` with `localStart`, builds a `RouteRequest` through `tripRequest`, `createTrip(request, prefs ∪ overrides, premium)`, inserts the row. Becomes the current route. Event `route_created`. |
| `reschedule` | `date?`, `from?`, `to?`, `durationMinutes?` | New planner action (§4.5) on the current route. Event `route_changed: reschedule`. |
| `add_stop` | `place`, `position?` (1-based, default best fit) | New planner action (§4.5). |
| `remove_stop` | `place` | Resolves to the stop's `order`, `refineTrip({type:'remove_stop'})`. |
| `replace_stop` | `place`, `with?` | `alternatives(route, order, prefs)`; `with` must be among them (resolved by name) else the first alternative; `refineTrip({type:'swap_stop', placeId})`. |
| `lock_stop` | `place`, `locked: boolean` | `refineTrip({type:'lock_stop'})` only when the current state differs. |
| `quick_change` | `value: 'menos_caminar' \| 'mas_comida' \| 'mas_barato' \| 'anadir_pausa'` | `refineTrip({type:'quick', value})`. |
| `undo` | `times?` (1..3) | Same SQL as `?action=undo`, repeated. Event `undone`. |
| `update_preferences` | `interests?`, `pace?`, `budget?`, `company?`, `transport?` | Validated through `trip-contract.preferences(partial)`, merged, upserted. Event `preferences_updated`. Does not touch the current route. |

Rules: tools that need a route return the error `No hay ninguna ruta en marcha; crea una primero.` when none is current. A tool that changes the route reloads it from the database first (another tab may have changed it) and uses the optimistic `revision` update; a `ROUTE_CHANGED` conflict is retried once, and a second conflict inside the turn is a refusal (`{ ok: false }` with the reason "La ruta ha cambiado en otra pantalla mientras tanto; vuelve a pedírmelo."), not a 409, so the turn and its memory are still stored. All planner `ApiError`s with status 400 become `{ ok:false, error: message, reason: message }` and, if not fixed, the event `rejected`; anything else propagates. A round-1 refusal counts as fixed only when a round-2 call of the same tool on the same target (the resolved place, or the quick change; any target when the refused one was unknown) succeeded; a success in the same round never hides it.

### 4.5 Planner additions · `lib/trip-planner.js`

- `refineTrip(route, { type: 'add_stop', placeId, position? }, prefs)`: the place must not be in the route; inserts at `position - 1` or, when omitted, at the index that keeps `schedule()` valid with the smallest end time (try every index). Locked stops keep their index. Error `El cambio no cabe en la franja horaria.` when no index fits.
- `refineTrip(route, { type: 'reschedule', date?, timeWindow? }, prefs)`: validates like `tripRequest` (date, `from < to`), replaces `route.request.date` / `timeWindow`, re-runs `schedule`; when it does not fit, drops **unlocked** stops from the end one by one until it does (never below one stop); error if even one stop does not fit. `route.name` is recomputed with `routeName`.

Both bump `version` and go through `history` like every refine, so `undo` works on them. Export a `resolvePlace(label)` helper (id | name | alias, `normalize`d, `marbella-cafe` included) used by the tools, and export `quickText` for the rules path.

### 4.6 Degraded mode · rules path

`rulesTurn(text, context)` in `lib/agent.js`:

1. `normalize(text)` matches `/\bdesha(?:c|z)/` ("deshacer", "deshaz") → `undo`.
2. A route is current and a `quickText` regex matches → `quick_change` for each match, in text order (max 2).
3. No route is current, or the text contains a duration, a start (`localStart`) or an interest → `applyMessage(text, {})` (existing) → `create_route` with its minutes / start / interests mapped the way `interpretRequest` does today and the defaults of §3; `assumptions` list the defaults.
4. Otherwise event `rejected: 'No he entendido qué quieres cambiar.'` with default suggestions.

### 4.7 Texts · `lib/agent-texts.js`

Spanish templates, pure functions, unit tested: `describe(events, route)` (one sentence per event, e.g. `Ruta creada: Marbella en 3 horas, 3 paradas de 12:00 a 15:00. He supuesto: hoy, salida desde Plaza de los Naranjos.`), `suggestionsFor(events, route)` (defaults by state), `notUnderstood`, `noRoute`.

### 4.8 Ollama client · `lib/ollama.js`

`createOllamaClient({ fetchImpl, baseUrl, agentModel, model, timeoutMs, agentTimeoutMs, concurrency, queueMs })` → `{ decide(messages, tools, { deadline }), narrate(messages, schema, { deadline }), status() }`. One limiter (same semantics as `createNarrator`'s queue) shared by both methods; the optional `deadline` caps the queue wait and the call timeout at the time left (none left → `timeout` without a request). Logs reasons only (`Cacahuete agent fallback: <stage> <reason>`), never prompts or visitor text. `health` adds `agentModel` next to `model` and reports `reachable` from the existing probe.

### 4.9 Launcher and docs

- `scripts/lanzar.mjs`: `agentModel = process.env.OLLAMA_AGENT_MODEL || 'qwen2.5:3b'`; `ollama show` / `ollama pull` for both; warm both with `keep_alive: '1h'` and `options.num_ctx 4096` (the agent's context size, so the first turn does not reload them); the agent model is warmed through `/api/chat` with the real decision system prompt and the tools (`decisionPrefix()` from `lib/agent.js`, imported after `npm ci`) so Ollama caches that prefix; `stopOptions.models = [model, agentModel]` and `ollama-lifecycle.mjs` unloads every model in the list (keep the single-model signature working for the tests, add the array form).
- `backend/.env.example`: `OLLAMA_AGENT_MODEL=qwen2.5:3b`, `# OLLAMA_AGENT_TIMEOUT_MS=15000`, `# OLLAMA_AGENT_BUDGET_MS=45000`.
- `backend/README.md`: the `agent` action (request, response, events, degraded mode), the two models, the new env vars, `agent_turns`.
- Root `README.md`: the launcher downloads two models (≈ 4.7 GB + 1.9 GB); hardware table minimum RAM available ≈ 10 GB, recommended 16 GB; the "Cómo funciona" line for the model now says it decides *and* narrates, with the planner computing.

## 5. Frontend

### 5.1 Contract · `src/contract/types.ts` and `docs/contract/types.ts` (identical)

```ts
// Añadido en feature 5: agente conversacional.
export type AgentEvent =
  | { type: 'route_created'; routeId: string; assumptions: string[] }
  | { type: 'route_changed'; routeId: string; change: string }
  | { type: 'undone'; routeId: string }
  | { type: 'preferences_updated'; fields: string[] }
  | { type: 'rejected'; reason: string }
  | { type: 'answered' };
export type AgentReply = {
  text: string; suggestions: string[]; route?: Route; routeId?: string;
  events: AgentEvent[]; source: 'agent' | 'rules';
};
// DataModule:
  /** Feature 5: one conversational turn decided by the model. Absent in the demo without API. */
  agent?(input: { text: string; routeId?: string }): Promise<AgentReply>;
```

`httpData.ts`: `agent: ({ text, routeId }) => call('agent', 'POST', { text, routeId, client: { today, now } })`, where `today`/`now` come from `new Date()` in local time; applies `withFavorite` to `route` and `forgetRating(routeId)` when `events` contain `route_changed` / `undone`.

### 5.2 Agent assistant · `src/assistant/agentAssistant.ts`

Implements the same `MockAssistant` interface (`sendMessage`, `reset(mode, ctx)`) so `AppState` needs no new seam:

- `reset('request' | 'change', { route })` stores the route id (change) or clears it (request).
- `sendMessage({ text, option })`: `option` of the form `say:<text>` becomes `text`; empty input in change mode returns the local greeting (`agent.greetingRoute` i18n, no options) without calling the API. Otherwise `deps.agent({ text, routeId })`.
- Maps the reply to a `RichReply`:
  - `kind: 'change'` when any event is `route_created` / `route_changed` / `undone`, with `changes` = one bullet per such event (`describeEvent` in `src/assistant/agentFormat.ts`, Spanish via i18n) and `display.routeId`, `display.footer` = `change.endsAt` with the returned route's end; otherwise `kind: 'question'`.
  - `text` = reply text. `options` = suggestions → `{ label: s, value: 'say:' + s }`.
  - `display.hint = t('agent.degraded')` when `source === 'rules'`.
  - `display.created = route` (new field on `ReplyDisplay`) when `route_created`, so the provider can start the Creando hand-over.
  - when `events` contain `preferences_updated`, call `deps.preferencesChanged?.()` (AppState implements it by re-reading preferences).
- After a `route_created` the assistant switches itself to the new route id; after any event with a `routeId` it remembers that id.

### 5.3 Provider · `src/state/AppState.tsx`

- `App.tsx`: when `data` exists, `assistantFactory` returns `createAgentAssistant({...deps, agent: data.agent})` for modes `request` and `change` and the scripted one for `onboarding` (the factory receives the mode: change the signature to `(deps, mode)`; the mock path ignores `mode`).
- New `completeCreation(route)`: seeds `creation = { id, request: route.request, step: 0, status: 'running', route }` and `setPendingRequest(route.request)` so the existing step effect animates four steps and then runs the same finish code (`setCurrentRouteId`, `startChat('change', …)`, desktop notice). `send()` calls it when a reply carries `display.created`. Mobile `ConversationPage` navigates to `/creating` when the last reply has `display.created`; desktop shows the progress item as today.
- `useChat('request')` and `useChat('change')` are unchanged for callers.

### 5.4 Screens (API mode only; mock mode unchanged)

- **ChatPage / ChatDock**: the three `SUGGESTIONS` become examples (`chat.example1..3`, same texts) rendered as the same pills but **prefilling** the input instead of sending; `ChatInput` gets the smallest optional prop that allows prefilling and keeps the existing tests. Helper text `chat.helperAgent`: "Cuéntame tu plan con tus palabras: cuánto tiempo tienes, desde dónde sales y qué te apetece."
- **ConversationPage**: no `SummaryCard` branch is reached (the agent never returns `summary`); the `conversation.note` line is shown under question replies as today. Placeholder `conversation.placeholderAgent`.
- **ChangeChatPage** and desktop change mode: greeting from `agent.greetingRoute` ("Aquí tienes tu ruta. Dime qué cambio quieres, por ejemplo quitar una parada, acabar antes o añadir un café.") with no chips; subsequent chips are the model's suggestions.
- **ReplyView**: renders `display.hint` already; the chip value prefix is opaque to it.
- **Desktop saved-route notice**: keep the three quick buttons (two send text to the agent, one starts a new request).
- i18n keys added to `es.json` under `agent.*`, `chat.example*`, `chat.helperAgent`, `conversation.placeholderAgent`; `describeEvent` texts under `agent.event.*`.

## 6. Tests and verification

Backend (`npm test` in `backend/`, Node 22, `--experimental-strip-types`):

- `test/agent.test.js`: fake Ollama through `fetchImpl` that scripts responses by call order: (a) create with defaults → events, assumptions, stored turns and pruning; (b) remove a named stop → `refineTrip` applied, revision bumped; (c) unknown place → tool error → round 2 fixes it; (d) 4 tool calls in one round → only 3 run; (e) decision timeout → `source: 'rules'` and `quick_change` through regex; (f) narration invalid JSON → template text, `source: 'agent'`; (g) queue full → degraded; (h) `claimGuest` moves turns; (i) scope guard refuses Málaga without any fetch.
- Planner tests (next to the existing ones): `add_stop` best fit and overflow, `reschedule` shrink and name, `undo` after both.
- `test/api.test.js`: `?action=agent` on pglite with a scripted fake client: 200 shape, 404 for a foreign route, 403/429 from quota, `health.llm.agentModel`.
- `test/launcher.test.js`: two models pulled and warmed, both unloaded on exit.
- `test/frontend-contract.test.js`: the two `types.ts` files still identical; `AgentReply` shape round-trips.

Frontend (`npm run check`, `npm test`, `npm run build` in `frontend/`): `src/agent.test.tsx` renders the app with a fake HTTP-like data module exposing `agent`: free text → reply chips, tapping a chip sends its text, a `route_created` reply shows Creando and then the route, a `source: 'rules'` reply shows the hint, change mode greeting has no `quick:*` chips, mock mode (no `agent`) still shows the scripted flow (existing tests pass unchanged).

Manual, on the event laptop only (no Ollama on the dev machine), from the repo root: `node --env-file-if-exists=backend/.env backend/scripts/agent-smoke.mjs` prints per-call latency and the events of three turns ("Tengo 3 horas y me gustan la historia y los museos", "Quita el museo", "Acaba a las 14:00", with a fixed 10:00 clock). It fails when a turn exceeds `OLLAMA_AGENT_BUDGET_MS` (45 s), when a reply has `source: 'rules'` or when any `Cacahuete agent fallback` warning is logged; if it is too slow, set `OLLAMA_AGENT_MODEL=qwen2.5:1.5b`.

## 7. Implementation order

1. Planner: `resolvePlace`, `add_stop`, `reschedule`, exported `quickText`; tests.
2. `lib/ollama.js` client + tests with `fetchImpl`.
3. `db/003_agent.sql`, `agent-texts.js`, `agent-tools.js`, `agent.js`, `?action=agent`, `claimGuest`, `health`; tests.
4. Launcher, env, READMEs.
5. Frontend contract + `httpData.agent`.
6. `agentAssistant.ts`, `agentFormat.ts`, `App.tsx` factory by mode, `completeCreation`.
7. Screens and i18n (API mode), tests.
8. `npm run check && npm test && npm run build` (frontend), `npm test` (backend). Commit in logical steps on `feature/llm-agent`.

## 8. Deviations from the first draft

What the implementation does differently from the first version of this document, after the backend review. The sections above already describe the final behaviour.

- **Round 2 only on errors** (planner decision). The second decision round runs only when at least one round-1 tool call returned `ok: false`, and only with at least 8 s of the turn budget left (§3 "Loop bound", §4.3). A round where every call succeeded goes straight to the narrator, saving one small-model call on the usual turn.
- **"café" is not the pause.** "café" alone resolves to Cafetería Parque Alameda, whose catalog alias it is; only "pausa", "descanso", "pausa para café" and "parada para café" reach the pause place `marbella-cafe` (§3 "Place names"). A coffee break is still `quick_change anadir_pausa`.
- **Rules path and interests.** In degraded mode, with a route current, interests alone ("me gusta la historia") do not create a new route: only a new duration, a new start or "otra ruta" do. The rules path also understands "acaba a las 14:00", "acaba media hora antes", "quita el museo" and "deshaz" (§4.6).
- **Revision conflicts.** A `ROUTE_CHANGED` conflict is retried once; a second conflict inside the same turn is a refusal (`{ ok: false }` with a visitor reason) instead of escaping as HTTP 409, so the turn still answers and the assistant turn is still stored (§4.4).
- **Two limiters.** The legacy narrator (`llm.js`, used by `chat`, `routeQuestion`, `refineConversation`) keeps its own limiter; with the default `OLLAMA_CONCURRENCY=2` Ollama may receive up to 4 concurrent requests (2 from `agent`, 2 from the legacy actions). Documented in `backend/README.md`.
- **Visitor-safe refusals.** `ToolError(forModel, forVisitor)`: the model gets the precise error (its own label, the closest names); the `rejected` event, the narrator's `results` and the stored memory line only carry the fixed visitor reason (§4.4).
- **Prompt size.** The catalog moved into the decision system prompt (built once); the per-turn context is a second `system` message; 6 history turns are sent instead of 10, and the stored assistant turn is the action lines plus the reply cut to 200 characters (§3 "Conversation memory"). `create_route` has no `assumptions` argument: the server computes them, and a window cut at 23:59 says so.
- **Turn deadline.** `OLLAMA_AGENT_BUDGET_MS` (45 000) bounds the whole turn; a round-2 `unreachable` / `queue` failure skips the narrator like a round-1 one (§3 "Latency budget").
- **No routes in the past.** A date before `client.today`, or for today a start earlier than `client.now`, is a tool error the model can fix in round 2.
- **Narrator input.** `results` only lists the refused calls (with their visitor reasons), `preferences` are not sent, and place descriptions are sent only for a talk-only turn (`answered`) or for places the visitor named. The «Guardar» fact is sent only when the visitor mentions saving.
- **Default chips.** With a route, the fallback suggestions are "Menos caminar", "Añade una pausa para café" and "Acabar media hora antes" (no tool saves a route, so "Guardar la ruta" is gone).
- **Warm-up.** The launcher warms with `num_ctx 4096` and sends the decision system prompt and tools to the agent model. With the Qwen2.5 template the tool block is rendered after all system messages, so the cached prefix covers the decision prompt and catalog but not the tool schemas.
