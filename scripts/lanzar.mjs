import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureModels, installShutdownHandlers, modelList, parseStopMode, startOllamaIfNeeded, stopOllama,
  stopOllamaSync, warmModels } from './ollama-lifecycle.mjs';

const state = resolve('.cacahuete');
mkdirSync(state, { recursive: true });
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló ${command} ${args.join(' ')}`);
}
function npm(args, cwd) {
  if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'npm.cmd', ...args], cwd);
  else run('npm', args, cwd);
}
for (const project of ['backend', 'frontend']) {
  const hash = createHash('sha256').update(readFileSync(project + '/package-lock.json'))
    .update(process.platform + process.arch + process.versions.modules).digest('hex');
  const stamp = project + '/node_modules/.cacahuete-lock';
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== hash) {
    npm(['ci', '--include=dev', '--no-audit', '--no-fund'], project);
    writeFileSync(stamp, hash);
  }
}
process.env.VITE_CACAHUETE_API_URL = '/api/cacahuete';
npm(['run', 'build'], 'frontend');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe estar entre 1 y 65535.');
const secret = resolve(state, 'quota-secret');
if (!process.env.QUOTA_SECRET) {
  try { writeFileSync(secret, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  process.env.QUOTA_SECRET = readFileSync(secret, 'utf8');
}
if (process.env.DATABASE_URL) run(process.execPath, ['scripts/migrate.js'], 'backend');
else process.env.CACAHUETE_DATA_DIR = resolve(state, 'postgres');

const endpoint = new URL(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1');
process.env.OLLAMA_BASE_URL = endpoint.href;
const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b'; // narrates
const agentModel = process.env.OLLAMA_AGENT_MODEL || 'qwen2.5:3b'; // decides which planner action to run
const models = modelList({ models: [model, agentModel] });
let mode = parseStopMode(process.env.OLLAMA_STOP_ON_EXIT);
if (!mode) {
  console.warn('OLLAMA_STOP_ON_EXIT debe ser started, always o never. Se usa started.');
  mode = 'started';
}
// Created before the handlers so a daemon started during a failed start is stopped as well.
const ollama = { startedByUs: false };
const stopOptions = { handle: ollama, mode, models, endpoint };
installShutdownHandlers({ stop: () => stopOllama(stopOptions), stopSync: () => stopOllamaSync(stopOptions) });
await startOllamaIfNeeded({ endpoint, handle: ollama });
process.env.OLLAMA_HOST = endpoint.origin;
ensureModels({ models });
// Imported here, after `npm ci`: the decision prompt and tools are warmed with the agent model so Ollama caches them.
const { decisionPrefix } = await import('../backend/lib/agent.js');
await warmModels({ models, endpoint, prefixes: { [agentModel]: decisionPrefix() } });
await import('../backend/scripts/dev.js');
