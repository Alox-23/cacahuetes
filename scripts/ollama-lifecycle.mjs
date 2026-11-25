// Starts `ollama serve` when nothing answers and shuts Ollama down again when the launcher ends.
// Every side effect (spawn, fetch, kill, external commands, sleeps) is injectable so the tests never
// touch a real Ollama.
import { spawn, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

export const STOP_MODES = ['started', 'always', 'never'];
export const MESSAGES = {
  stopped: 'Ollama detenido.',
  unloaded: 'Modelo descargado de memoria; Ollama sigue en ejecución.',
  notUnloaded: 'Ollama sigue en ejecución; no se pudo descargar el modelo de memoria.',
  never: 'Ollama se deja en ejecución (OLLAMA_STOP_ON_EXIT=never).'
};
const UNLOAD_TIMEOUT_MS = 3000;
const POLL_MS = 100;

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
  // Someone else's daemon (menu-bar app, systemd, container…): free the model's memory first.
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

// Async shutdown, used from the signal handlers. Returns the status line, or null if already stopped.
export async function stopOllama(options) {
  const context = prepare(options, { graceMs: 5000 });
  if (!context) return null;
  const { model, endpoint, fetchImpl = fetch, sleepImpl = sleep } = context;
  const steps = shutdownSteps(context);
  let step = steps.next();
  while (!step.done) {
    const [effect, value] = step.value;
    if (effect === 'sleep') {
      await sleepImpl(value);
      step = steps.next();
      continue;
    }
    let ok = false;
    try {
      const response = await fetchImpl(new URL('/api/generate', endpoint), { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: unloadBody(model),
        signal: AbortSignal.timeout(UNLOAD_TIMEOUT_MS) });
      ok = response.ok;
    } catch { /* Ollama not answering */ }
    step = steps.next(ok);
  }
  return step.value;
}

// Synchronous shutdown for the 'exit' event (uncaught error, process.exit), where async work never runs.
// The unload request runs in a short-lived child Node process.
export function stopOllamaSync(options) {
  const context = prepare(options, { graceMs: 1000 });
  if (!context) return null;
  context.pollAlive = false;
  const { model, endpoint, execImpl } = context;
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
    const script = `fetch(${JSON.stringify(url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: ${JSON.stringify(unloadBody(model))}, signal: AbortSignal.timeout(${UNLOAD_TIMEOUT_MS}) })
      .then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1));`;
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
