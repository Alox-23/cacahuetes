// Starts `ollama serve` when nothing answers, pulls and warms the models, and shuts Ollama down again
// (or unloads the models) when the launcher ends.
// Every side effect (spawn, fetch, kill, external commands, sleeps) is injectable so the tests never
// touch a real Ollama.
import { spawn, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

export const STOP_MODES = ['started', 'always', 'never'];
export const MESSAGES = {
  stopped: 'Ollama detenido.',
  unloaded: 'Modelos descargados de memoria; Ollama sigue en ejecución.',
  notUnloaded: 'Ollama sigue en ejecución; no se pudieron descargar los modelos de memoria.',
  never: 'Ollama se deja en ejecución (OLLAMA_STOP_ON_EXIT=never).'
};
const UNLOAD_TIMEOUT_MS = 3000;
const WARM_TIMEOUT_MS = 180000;
// The context size of every agent call: a warm-up with another num_ctx would load the model again on the first turn.
const NUM_CTX = 4096;
const POLL_MS = 100;

// `models` (array) or the older single `model`; empty names and duplicates are dropped.
export function modelList({ models, model } = {}) {
  return [...new Set((models ?? [model]).filter(Boolean))];
}

// '' or undefined → 'started'; an unknown value → null (the caller warns and uses 'started').
export function parseStopMode(value) {
  const mode = String(value ?? '').trim().toLowerCase() || 'started';
  return STOP_MODES.includes(mode) ? mode : null;
}

// Runs an external command synchronously and returns its exit status (1 when it cannot run).
export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'ignore', windowsHide: true, timeout: 10000, ...options });
  return result.error ? 1 : result.status ?? 1;
}

export async function ollamaAvailable(endpoint, fetchImpl = fetch) {
  try { return (await fetchImpl(new URL('/api/tags', endpoint), { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}

// Fills `handle` and returns it ({ startedByUs, pid }). Create the handle before installing the exit
// handlers so that a daemon spawned during a failed start is still stopped.
export async function startOllamaIfNeeded({ endpoint, handle = {}, spawnImpl = spawn, fetchImpl = fetch,
  sleepImpl = sleep, attempts = 45, env = process.env }) {
  handle.startedByUs ??= false;
  if (await ollamaAvailable(endpoint, fetchImpl)) return handle;
  // detached: its own process group on POSIX (Ctrl+C in the terminal does not reach it and the whole
  // group can be signalled), its own console on Windows.
  const daemon = spawnImpl('ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true,
    env: { ...env, OLLAMA_HOST: endpoint.host } });
  // The pid exists as soon as spawn() returns; record it now so a Ctrl+C before 'spawn' still stops it.
  if (daemon.pid) Object.assign(handle, { startedByUs: true, pid: daemon.pid });
  await new Promise((ok, fail) => { daemon.once('spawn', ok); daemon.once('error', fail); });
  handle.startedByUs = true;
  handle.pid = daemon.pid;
  daemon.unref(); // the pid stays in `handle`; unref only lets Node exit without waiting for the daemon
  for (let i = 0; i < attempts && !await ollamaAvailable(endpoint, fetchImpl); i++) await sleepImpl(1000);
  if (!await ollamaAvailable(endpoint, fetchImpl)) throw new Error(`Ollama no responde en ${endpoint.origin}`);
  return handle;
}

// `ollama show` each model and `ollama pull` the ones that are missing (a failed pull throws).
export function ensureModels({ models, execImpl = runCommand, log = console.log }) {
  const pulled = [];
  for (const name of modelList({ models })) {
    // No timeout: a busy daemon must not turn an installed model into a pull, which fails offline.
    if (execImpl('ollama', ['show', name], { timeout: undefined }) === 0) continue;
    log(`Falta ${name}; se descarga con ollama pull.`);
    if (execImpl('ollama', ['pull', name], { stdio: 'inherit', timeout: undefined }) !== 0) {
      throw new Error(`Falló ollama pull ${name}`);
    }
    pulled.push(name);
  }
  return pulled;
}

// Loads each model into memory for an hour, one after the other, with the agent's num_ctx. `prefixes` maps a
// model to the fixed start of its requests ({ messages, tools }, e.g. the decision system prompt): that model is
// warmed through /api/chat with it, generating one token, so Ollama keeps the prompt prefix cached. A failure only
// warns: the chat falls back to its templates. Returns the models that loaded.
export async function warmModels({ models, endpoint, prefixes = {}, fetchImpl = fetch, log = console.log,
  warn = console.warn }) {
  const warmed = [];
  for (const name of modelList({ models })) {
    log(`Cargando ${name} en memoria…`);
    const prefix = Object.hasOwn(prefixes, name) ? prefixes[name] : null;
    const body = prefix
      ? { model: name, messages: prefix.messages, tools: prefix.tools, stream: false, keep_alive: '1h',
        options: { num_ctx: NUM_CTX, num_predict: 1 } }
      : { model: name, stream: false, keep_alive: '1h', options: { num_ctx: NUM_CTX } };
    try {
      const response = await fetchImpl(new URL(prefix ? '/api/chat' : '/api/generate', endpoint), { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
        body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json();
      warmed.push(name);
    } catch (error) { warn(`Ollama aún no está listo para ${name}. El chat dispone de plantillas.`, error.message); }
  }
  return warmed;
}

// The shutdown steps, shared by the async (signals) and sync ('exit' event) paths. Yields
// ['sleep', ms] and ['unload'] effects and returns the status line.
function* shutdownSteps({ handle, mode, platform, killImpl, execImpl, graceMs, pollAlive = true }) {
  if (mode === 'never') return MESSAGES.never;
  if (handle.startedByUs) {
    if (platform === 'win32') {
      execImpl('taskkill', ['/pid', String(handle.pid), '/t', '/f']);
      return MESSAGES.stopped;
    }
    const group = -handle.pid;
    const alive = () => {
      try { killImpl(group, 0); return true; } catch (error) { return error.code === 'EPERM'; }
    };
    try { killImpl(group, 'SIGTERM'); } catch { return MESSAGES.stopped; } // already gone
    if (pollAlive) {
      for (let waited = 0; waited < graceMs && alive(); waited += POLL_MS) yield ['sleep', POLL_MS];
      if (alive()) try { killImpl(group, 'SIGKILL'); } catch { /* exited meanwhile */ }
    } else {
      // Sync path: the event loop is blocked, so Node cannot reap the daemon and its zombie keeps the
      // group "alive". Wait a fixed short time and SIGKILL whatever is left (ESRCH is fine).
      yield ['sleep', graceMs];
      try { killImpl(group, 'SIGKILL'); } catch { /* already gone */ }
    }
    return MESSAGES.stopped;
  }
  // Someone else's daemon (menu-bar app, systemd, container…): free the models' memory first.
  const unloaded = yield ['unload'];
  if (mode === 'always' && stopExternalDaemon(platform, execImpl)) return MESSAGES.stopped;
  return unloaded ? MESSAGES.unloaded : MESSAGES.notUnloaded;
}

function stopExternalDaemon(platform, execImpl) {
  if (platform === 'win32') {
    const app = execImpl('taskkill', ['/im', 'ollama app.exe', '/t', '/f']);
    const daemon = execImpl('taskkill', ['/im', 'ollama.exe', '/t', '/f']);
    return app === 0 || daemon === 0;
  }
  if (platform === 'darwin' && execImpl('pgrep', ['-x', 'Ollama']) === 0) {
    return execImpl('osascript', ['-e', 'quit app "Ollama"']) === 0;
  }
  return execImpl('pkill', ['-x', 'ollama']) === 0;
}

const unloadBody = model => JSON.stringify({ model, keep_alive: 0 });

function prepare(options, defaults) {
  const { handle } = options;
  if (!handle || handle.stopped) return null; // idempotent: a second call does nothing
  handle.stopped = true;
  return {
    platform: process.platform, killImpl: process.kill.bind(process), execImpl: runCommand,
    ...defaults, ...options, mode: parseStopMode(options.mode) ?? 'started'
  };
}

// Async shutdown, used from the signal handlers. Unloads every model in `models` (or the single
// `model`). Returns the status line, or null if already stopped.
export async function stopOllama(options) {
  const context = prepare(options, { graceMs: 5000 });
  if (!context) return null;
  const { endpoint, fetchImpl = fetch, sleepImpl = sleep } = context;
  const models = modelList(context);
  const steps = shutdownSteps(context);
  let step = steps.next();
  while (!step.done) {
    const [effect, value] = step.value;
    if (effect === 'sleep') {
      await sleepImpl(value);
      step = steps.next();
      continue;
    }
    // In parallel, so two models cost one timeout at most; the unload counts only if every model went.
    const results = await Promise.all(models.map(async name => {
      try {
        const response = await fetchImpl(new URL('/api/generate', endpoint), { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: unloadBody(name),
          signal: AbortSignal.timeout(UNLOAD_TIMEOUT_MS) });
        return response.ok;
      } catch { return false; } // Ollama not answering
    }));
    step = steps.next(results.every(Boolean));
  }
  return step.value;
}

// Synchronous shutdown for the 'exit' event (uncaught error, process.exit), where async work never runs.
// The unload requests (one per model, in parallel) run in a single short-lived child Node process.
export function stopOllamaSync(options) {
  const context = prepare(options, { graceMs: 1000 });
  if (!context) return null;
  context.pollAlive = false;
  const { endpoint, execImpl } = context;
  const bodies = modelList(context).map(unloadBody);
  const steps = shutdownSteps(context);
  let step = steps.next();
  while (!step.done) {
    const [effect, value] = step.value;
    if (effect === 'sleep') {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, value);
      step = steps.next();
      continue;
    }
    const url = new URL('/api/generate', endpoint).href;
    const script = `Promise.all(${JSON.stringify(bodies)}.map(body => fetch(${JSON.stringify(url)}, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      signal: AbortSignal.timeout(${UNLOAD_TIMEOUT_MS}) }).then(r => r.ok, () => false)))
      .then(all => process.exit(all.every(Boolean) ? 0 : 1));`;
    step = steps.next(execImpl(process.execPath, ['-e', script], { timeout: UNLOAD_TIMEOUT_MS + 2000 }) === 0);
  }
  return step.value;
}

// Registers the shutdown for SIGINT, SIGTERM, SIGHUP (on Windows also sent when the console window
// closes), SIGBREAK (Windows Ctrl+Break) and 'exit'. Only the first event does the work; after a
// signal the process exits with 128 + the signal number (130 for Ctrl+C).
export function installShutdownHandlers({ stop, stopSync, log = console.log, proc = process,
  platform = process.platform }) {
  let done = false;
  const report = message => { if (message) log(message); };
  const failed = error => console.error('No se pudo detener Ollama:', error.message);
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', ...(platform === 'win32' ? ['SIGBREAK'] : [])];
  for (const signal of signals) {
    proc.on(signal, async () => {
      if (done) return;
      done = true;
      try { report(await stop()); } catch (error) { failed(error); }
      proc.exit(128 + (constants.signals[signal] ?? 0));
    });
  }
  proc.on('exit', () => {
    if (done) return;
    done = true;
    try { report(stopSync()); } catch (error) { failed(error); }
  });
}
