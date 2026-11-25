// Native Ollama /api/chat client for the conversational agent (feature 5): a small model decides
// (tool calls), the narrator model writes the reply as JSON. One limiter is shared by both.
import { envNumber, ollamaBase } from './llm.js';

export const defaultAgentModel = () => process.env.OLLAMA_AGENT_MODEL || 'qwen2.5:3b';
const defaultModel = () => process.env.OLLAMA_MODEL || 'qwen2.5:7b';

/** A failed model call. `stage` is decide | narrate, `reason` the short cause that is logged. */
export class OllamaFailure extends Error {
  constructor(stage, reason) {
    super(`${stage} ${reason}`);
    this.stage = stage;
    this.reason = reason;
  }
}

// Only the stage and the reason are logged: prompts and answers contain visitor messages.
export function logFallback(stage, reason) {
  console.warn('Cacahuete agent fallback:', `${stage} ${reason}`);
}

// Same semantics as the narrator's queue: `concurrency` calls at once, the rest wait up to `wait` ms.
function createLimiter(concurrency, wait) {
  let active = 0;
  const queue = new Set();
  return {
    acquire() {
      if (active < concurrency()) {
        active++;
        return Promise.resolve(true);
      }
      return new Promise(resolve => {
        const admit = () => {
          clearTimeout(timer);
          resolve(true);
        };
        const timer = setTimeout(() => {
          queue.delete(admit);
          resolve(false);
        }, wait());
        queue.add(admit);
      });
    },
    release() {
      const next = queue.values().next().value;
      if (next) {
        queue.delete(next);
        next();
      } else active--;
    }
  };
}

// Tool arguments arrive as an object (native API) or, from some models, as a JSON string.
function toolCall(raw) {
  const name = raw?.function?.name;
  let args = raw?.function?.arguments ?? {};
  if (typeof args === 'string') args = JSON.parse(args || '{}');
  if (typeof name !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('tool call');
  return { name, arguments: args };
}

// Small models sometimes print the call as JSON text instead of using tool_calls.
function callsInText(content, tools) {
  const names = new Set(tools.map(tool => tool.function?.name));
  const text = content.replace(/<\/?tool_call>/g, '').trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return [];
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  return [value].flat().filter(item => names.has(item?.name))
    .map(item => toolCall({ function: { name: item.name, arguments: item.arguments ?? item.parameters ?? {} } }));
}

export function createOllamaClient({
  fetchImpl = fetch, baseUrl, agentModel, model, timeoutMs, agentTimeoutMs, concurrency, queueMs
} = {}) {
  // Read lazily so the shared default client follows the environment of the running server.
  const base = () => (baseUrl ?? ollamaBase()).replace(/\/+$/, '').replace(/\/v1$/, '');
  const limiter = createLimiter(() => concurrency ?? envNumber('OLLAMA_CONCURRENCY', 2),
    () => queueMs ?? envNumber('OLLAMA_QUEUE_MS', 30_000));

  async function chat(stage, body, timeout) {
    const fail = reason => {
      logFallback(stage, reason);
      return new OllamaFailure(stage, reason);
    };
    if (!await limiter.acquire()) throw fail('queue');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let step = 'fetch';
    try {
      const response = await fetchImpl(base() + '/api/chat', {
        method: 'POST', signal: controller.signal, redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: false, keep_alive: '1h' })
      });
      if (!response.ok) {
        response.body?.cancel().catch(() => {});
        throw fail(`http ${response.status}`);
      }
      step = 'body';
      const result = await response.json();
      if (result?.done_reason === 'length') throw fail('length');
      if (!result?.message || typeof result.message !== 'object') throw fail('invalid');
      return result.message;
    } catch (error) {
      if (error instanceof OllamaFailure) throw error;
      if (controller.signal.aborted) throw fail('timeout');
      throw fail(step === 'fetch' ? 'unreachable' : 'invalid');
    } finally {
      clearTimeout(timer);
      limiter.release();
    }
  }

  return {
    /** One decision round: the visible text (discarded by the agent) and the tool calls, in order. */
    async decide(messages, tools) {
      const message = await chat('decide', {
        model: agentModel ?? defaultAgentModel(), messages, tools,
        options: { num_ctx: 4096, temperature: 0.1 }
      }, agentTimeoutMs ?? envNumber('OLLAMA_AGENT_TIMEOUT_MS', 15_000));
      const content = typeof message.content === 'string' ? message.content : '';
      let toolCalls;
      try {
        toolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length
          ? message.tool_calls.map(toolCall)
          : callsInText(content, tools);
      } catch {
        logFallback('decide', 'invalid');
        throw new OllamaFailure('decide', 'invalid');
      }
      return { content, toolCalls };
    },
    /** The narrator's reply, constrained by a JSON schema; returns the parsed object. */
    async narrate(messages, schema) {
      const message = await chat('narrate', {
        model: model ?? defaultModel(), messages, format: schema,
        options: { num_ctx: 4096, temperature: 0.3, num_predict: 320 }
      }, timeoutMs ?? envNumber('OLLAMA_TIMEOUT_MS', 20_000));
      try {
        return JSON.parse(message.content);
      } catch {
        logFallback('narrate', 'invalid');
        throw new OllamaFailure('narrate', 'invalid');
      }
    },
    status: () => ({ model: model ?? defaultModel(), agentModel: agentModel ?? defaultAgentModel() })
  };
}

export const ollamaClient = createOllamaClient();
