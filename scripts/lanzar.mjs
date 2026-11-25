import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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
const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
async function available() {
  try { return (await fetch(new URL('/api/tags', endpoint), { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
}
if (!await available()) {
  process.env.OLLAMA_HOST = endpoint.host;
  const daemon = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((ok, fail) => { daemon.once('spawn', ok); daemon.once('error', fail); });
  daemon.unref();
  for (let i = 0; i < 45 && !await available(); i++) await sleep(1000);
  if (!await available()) throw new Error(`Ollama no responde en ${endpoint.origin}`);
}
process.env.OLLAMA_HOST = endpoint.origin;
if (spawnSync('ollama', ['show', model], { stdio: 'ignore' }).status !== 0) run('ollama', ['pull', model]);
console.log(`Cargando ${model} en memoria…`);
try {
  const warm = await fetch(new URL('/api/generate', endpoint), { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model, stream: false, keep_alive: '1h' }) });
  if (!warm.ok) throw new Error(`HTTP ${warm.status}`);
  await warm.json();
} catch (error) { console.warn('Ollama aún no está listo. El chat dispone de plantillas.', error.message); }
await import('../backend/scripts/dev.js');
