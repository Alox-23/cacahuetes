import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Script } from 'node:vm';
import {
  MESSAGES, ensureModels, installShutdownHandlers, modelList, parseStopMode, startOllamaIfNeeded, stopOllama,
  stopOllamaSync, warmModels
} from '../../scripts/ollama-lifecycle.mjs';

const endpoint = new URL('http://127.0.0.1:11434/v1');
const model = 'qwen2.5:7b';
const agentModel = 'qwen2.5:3b';
const models = [model, agentModel];

// Records every side effect so each test can assert exactly what the shutdown did.
function fakes({ aliveChecks = 0, execStatus = () => 0, fetchOk = true } = {}) {
  const calls = { kill: [], exec: [], fetch: [], sleep: [] };
  let checks = 0;
  return {
    calls,
    killImpl(pid, signal) {
      calls.kill.push([pid, signal]);
      if (signal === 0 && checks++ >= aliveChecks) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    },
    execImpl(command, args) {
      calls.exec.push([command, ...args]);
      return execStatus(command, args);
    },
    async fetchImpl(url, init) {
      const body = init && JSON.parse(init.body);
      calls.fetch.push([String(url), body]);
      return { ok: typeof fetchOk === 'function' ? fetchOk(body) : fetchOk, status: 500, json: async () => ({}) };
    },
    async sleepImpl(ms) { calls.sleep.push(ms); }
  };
}

test('OLLAMA_STOP_ON_EXIT defaults to started and rejects unknown values', () => {
  assert.equal(parseStopMode(undefined), 'started');
  assert.equal(parseStopMode(''), 'started');
  assert.equal(parseStopMode(' Always '), 'always');
  assert.equal(parseStopMode('never'), 'never');
  assert.equal(parseStopMode('sometimes'), null);
});

test('startOllamaIfNeeded leaves an answering Ollama alone', async () => {
  let spawned = false;
  const handle = await startOllamaIfNeeded({ endpoint, fetchImpl: async () => ({ ok: true }),
    spawnImpl: () => { spawned = true; } });
  assert.equal(spawned, false);
  assert.equal(handle.startedByUs, false);
});

test('startOllamaIfNeeded spawns a detached daemon and keeps its pid in the handle', async () => {
  let answers = 0;
  let spawnArgs;
  const handle = {};
  const result = await startOllamaIfNeeded({
    endpoint, handle, sleepImpl: async () => {},
    fetchImpl: async () => ({ ok: answers++ >= 2 }),
    spawnImpl: (...args) => {
      spawnArgs = args;
      const child = Object.assign(new EventEmitter(), { pid: 4321, unref() {} });
      setImmediate(() => {
        assert.deepEqual(handle, { startedByUs: true, pid: 4321 }); // filled before 'spawn'
        child.emit('spawn');
      });
      return child;
    }
  });
  assert.equal(result, handle);
  assert.deepEqual(handle, { startedByUs: true, pid: 4321 });
  assert.deepEqual(spawnArgs.slice(0, 2), ['ollama', ['serve']]);
  assert.equal(spawnArgs[2].detached, true);
  assert.equal(spawnArgs[2].env.OLLAMA_HOST, '127.0.0.1:11434');
});

test('started by us on POSIX: SIGTERM to the process group, SIGKILL if it outlives the grace period', async () => {
  const fake = fakes({ aliveChecks: Infinity });
  const message = await stopOllama({ handle: { startedByUs: true, pid: 4321 }, mode: 'started',
    platform: 'linux', model, endpoint, graceMs: 300, ...fake });
  assert.equal(message, MESSAGES.stopped);
  const signals = fake.calls.kill.filter(([, signal]) => signal !== 0);
  assert.deepEqual(signals, [[-4321, 'SIGTERM'], [-4321, 'SIGKILL']]);
  assert.ok(fake.calls.kill.every(([pid]) => pid === -4321));
  assert.deepEqual(fake.calls.sleep, [100, 100, 100]);
  assert.deepEqual(fake.calls.fetch, []);
  assert.deepEqual(fake.calls.exec, []);
});

test('started by us on POSIX: no SIGKILL when the daemon exits after SIGTERM', async () => {
  const fake = fakes({ aliveChecks: 1 });
  await stopOllama({ handle: { startedByUs: true, pid: 77 }, mode: 'always', platform: 'darwin',
    model, endpoint, ...fake });
  assert.deepEqual(fake.calls.kill.filter(([, signal]) => signal !== 0), [[-77, 'SIGTERM']]);
  assert.deepEqual(fake.calls.exec, []);
});

test('started by us on Windows: taskkill the daemon tree', async () => {
  const fake = fakes();
  const message = await stopOllama({ handle: { startedByUs: true, pid: 4321 }, mode: 'started',
    platform: 'win32', model, endpoint, ...fake });
  assert.equal(message, MESSAGES.stopped);
  assert.deepEqual(fake.calls.exec, [['taskkill', '/pid', '4321', '/t', '/f']]);
  assert.deepEqual(fake.calls.kill, []);
  assert.deepEqual(fake.calls.fetch, []);
});

test('external daemon, mode started: unload the model with keep_alive 0 and kill nothing', async () => {
  const fake = fakes();
  const message = await stopOllama({ handle: { startedByUs: false }, mode: 'started', platform: 'linux',
    model, endpoint, ...fake });
  assert.equal(message, MESSAGES.unloaded);
  assert.deepEqual(fake.calls.fetch, [['http://127.0.0.1:11434/api/generate', { model, keep_alive: 0 }]]);
  assert.deepEqual(fake.calls.kill, []);
  assert.deepEqual(fake.calls.exec, []);
});

test('macOS menu-bar app already serving, mode started: unload only, the app keeps running', async () => {
  const fake = fakes();
  const message = await stopOllama({ handle: { startedByUs: false }, mode: 'started', platform: 'darwin',
    model, endpoint, ...fake });
  assert.equal(message, MESSAGES.unloaded);
  assert.equal(fake.calls.fetch.length, 1);
  assert.deepEqual(fake.calls.kill, []);
  assert.deepEqual(fake.calls.exec, []);
});

test('external daemon, mode started: says so when the unload fails', async () => {
  const fake = fakes({ fetchOk: false });
  const message = await stopOllama({ handle: { startedByUs: false }, mode: 'started', platform: 'linux',
    model, endpoint, ...fake });
  assert.equal(message, MESSAGES.notUnloaded);
});

test('external daemon, mode always: platform-specific stop command after the unload', async () => {
  const linux = fakes();
  assert.equal(await stopOllama({ handle: {}, mode: 'always', platform: 'linux', model, endpoint, ...linux }),
    MESSAGES.stopped);
  assert.equal(linux.calls.fetch.length, 1);
  assert.deepEqual(linux.calls.exec, [['pkill', '-x', 'ollama']]);

  const mac = fakes();
  await stopOllama({ handle: {}, mode: 'always', platform: 'darwin', model, endpoint, ...mac });
  assert.deepEqual(mac.calls.exec, [['pgrep', '-x', 'Ollama'], ['osascript', '-e', 'quit app "Ollama"']]);

  const macCli = fakes({ execStatus: command => (command === 'pgrep' ? 1 : 0) });
  await stopOllama({ handle: {}, mode: 'always', platform: 'darwin', model, endpoint, ...macCli });
  assert.deepEqual(macCli.calls.exec, [['pgrep', '-x', 'Ollama'], ['pkill', '-x', 'ollama']]);

  const windows = fakes();
  await stopOllama({ handle: {}, mode: 'always', platform: 'win32', model, endpoint, ...windows });
  assert.deepEqual(windows.calls.exec, [
    ['taskkill', '/im', 'ollama app.exe', '/t', '/f'], ['taskkill', '/im', 'ollama.exe', '/t', '/f']
  ]);

  const denied = fakes({ execStatus: () => 1 });
  assert.equal(await stopOllama({ handle: {}, mode: 'always', platform: 'linux', model, endpoint, ...denied }),
    MESSAGES.unloaded);
});

test('mode never: nothing is called', async () => {
  for (const startedByUs of [true, false]) {
    const fake = fakes();
    const message = await stopOllama({ handle: { startedByUs, pid: 4321 }, mode: 'never', platform: 'linux',
      model, endpoint, ...fake });
    assert.equal(message, MESSAGES.never);
    assert.deepEqual(fake.calls, { kill: [], exec: [], fetch: [], sleep: [] });
  }
});

test('stop is idempotent across the async and sync paths', async () => {
  const fake = fakes();
  const options = { handle: { startedByUs: true, pid: 4321 }, mode: 'started', platform: 'win32',
    model, endpoint, ...fake };
  assert.equal(await stopOllama(options), MESSAGES.stopped);
  assert.equal(await stopOllama(options), null);
  assert.equal(stopOllamaSync(options), null);
  assert.equal(fake.calls.exec.length, 1);
});

test('the sync exit path kills the daemon it started without async work', () => {
  const fake = fakes();
  const message = stopOllamaSync({ handle: { startedByUs: true, pid: 99 }, mode: 'started', platform: 'linux',
    model, endpoint, graceMs: 10, ...fake });
  assert.equal(message, MESSAGES.stopped);
  assert.deepEqual(fake.calls.kill, [[-99, 'SIGTERM'], [-99, 'SIGKILL']]);
  assert.deepEqual(fake.calls.sleep, []);
});

test('the sync exit path unloads an external model through a child process', () => {
  const fake = fakes();
  const message = stopOllamaSync({ handle: { startedByUs: false }, mode: 'started', platform: 'linux',
    model, endpoint, ...fake });
  assert.equal(message, MESSAGES.unloaded);
  assert.equal(fake.calls.exec.length, 1);
  const [command, flag, script] = fake.calls.exec[0];
  assert.equal(command, process.execPath);
  assert.equal(flag, '-e');
  assert.match(script, /api\/generate/);
  assert.match(script, /keep_alive/);
});

test('shutdown handlers run once and exit with 130 after Ctrl+C', async () => {
  const proc = new EventEmitter();
  const exits = [];
  proc.exit = code => exits.push(code);
  const logged = [];
  let stops = 0;
  let syncStops = 0;
  installShutdownHandlers({ proc, platform: 'linux', log: message => logged.push(message),
    stop: async () => { stops++; return MESSAGES.stopped; }, stopSync: () => { syncStops++; return null; } });
  assert.deepEqual(proc.eventNames().sort(), ['SIGHUP', 'SIGINT', 'SIGTERM', 'exit']);
  proc.emit('SIGINT');
  proc.emit('SIGINT');
  proc.emit('SIGTERM');
  await new Promise(setImmediate);
  proc.emit('exit');
  assert.equal(stops, 1);
  assert.equal(syncStops, 0);
  assert.deepEqual(exits, [130]);
  assert.deepEqual(logged, [MESSAGES.stopped]);
});

test('shutdown handlers listen to SIGBREAK on Windows and fall back to the sync path on exit', () => {
  const proc = new EventEmitter();
  proc.exit = () => {};
  let syncStops = 0;
  installShutdownHandlers({ proc, platform: 'win32', log: () => {},
    stop: async () => null, stopSync: () => { syncStops++; return MESSAGES.stopped; } });
  assert.ok(proc.eventNames().includes('SIGBREAK'));
  proc.emit('exit');
  proc.emit('exit');
  assert.equal(syncStops, 1);
});

test('modelList accepts the array or the single model and drops duplicates', () => {
  assert.deepEqual(modelList({ model }), [model]);
  assert.deepEqual(modelList({ models }), models);
  assert.deepEqual(modelList({ models: [model, model, ''] }), [model]);
  assert.deepEqual(modelList({ models, model: 'ignored' }), models);
});

test('ensureModels pulls both models when they are missing', () => {
  const fake = fakes({ execStatus: (command, args) => (args[0] === 'show' ? 1 : 0) });
  const pulled = ensureModels({ models, execImpl: fake.execImpl, log: () => {} });
  assert.deepEqual(pulled, models);
  assert.deepEqual(fake.calls.exec, [
    ['ollama', 'show', model], ['ollama', 'pull', model],
    ['ollama', 'show', agentModel], ['ollama', 'pull', agentModel]
  ]);
});

test('ensureModels only pulls the missing model and throws when a pull fails', () => {
  const partial = fakes({ execStatus: (command, args) => (args[0] === 'show' && args[1] === agentModel ? 1 : 0) });
  assert.deepEqual(ensureModels({ models, execImpl: partial.execImpl, log: () => {} }), [agentModel]);
  assert.deepEqual(partial.calls.exec, [['ollama', 'show', model], ['ollama', 'show', agentModel],
    ['ollama', 'pull', agentModel]]);

  const offline = fakes({ execStatus: () => 1 });
  assert.throws(() => ensureModels({ models, execImpl: offline.execImpl, log: () => {} }),
    /Falló ollama pull qwen2\.5:7b/);
});

test('warmModels loads both models for an hour, one after the other', async () => {
  const fake = fakes();
  const logged = [];
  const warmed = await warmModels({ models, endpoint, fetchImpl: fake.fetchImpl, log: line => logged.push(line),
    warn: () => assert.fail('no warning expected') });
  assert.deepEqual(warmed, models);
  assert.deepEqual(fake.calls.fetch, models.map(name =>
    ['http://127.0.0.1:11434/api/generate', { model: name, stream: false, keep_alive: '1h' }]));
  assert.equal(logged.length, 2);
});

test('warmModels warns and keeps going when one model does not load', async () => {
  const fake = fakes({ fetchOk: body => body.model === agentModel });
  const warnings = [];
  const warmed = await warmModels({ models, endpoint, fetchImpl: fake.fetchImpl, log: () => {},
    warn: (...args) => warnings.push(args.join(' ')) });
  assert.deepEqual(warmed, [agentModel]);
  assert.equal(fake.calls.fetch.length, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /qwen2\.5:7b.*HTTP 500/);
});

test('external daemon: both models are unloaded on stop', async () => {
  const fake = fakes();
  const message = await stopOllama({ handle: { startedByUs: false }, mode: 'started', platform: 'linux',
    models, endpoint, ...fake });
  assert.equal(message, MESSAGES.unloaded);
  assert.deepEqual(fake.calls.fetch, models.map(name =>
    ['http://127.0.0.1:11434/api/generate', { model: name, keep_alive: 0 }]));
  assert.deepEqual(fake.calls.kill, []);
});

test('external daemon: one model that does not unload is reported, the other is still unloaded', async () => {
  const fake = fakes({ fetchOk: body => body.model === model });
  const message = await stopOllama({ handle: { startedByUs: false }, mode: 'started', platform: 'linux',
    models, endpoint, ...fake });
  assert.equal(message, MESSAGES.notUnloaded);
  assert.equal(fake.calls.fetch.length, 2);
});

test('external daemon, mode always: both models are unloaded before the daemon is stopped', async () => {
  const fake = fakes();
  assert.equal(await stopOllama({ handle: {}, mode: 'always', platform: 'linux', models, endpoint, ...fake }),
    MESSAGES.stopped);
  assert.deepEqual(fake.calls.fetch.map(([, body]) => body.model), models);
  assert.deepEqual(fake.calls.exec, [['pkill', '-x', 'ollama']]);
});

test('the sync exit path unloads both models in one child process', () => {
  const fake = fakes();
  const message = stopOllamaSync({ handle: { startedByUs: false }, mode: 'started', platform: 'linux',
    models, endpoint, ...fake });
  assert.equal(message, MESSAGES.unloaded);
  assert.equal(fake.calls.exec.length, 1);
  const [, , script] = fake.calls.exec[0];
  for (const name of models) assert.ok(script.includes(name), `script unloads ${name}`);
  assert.match(script, /keep_alive/);
  assert.doesNotThrow(() => new Script(script)); // the generated code parses
});
