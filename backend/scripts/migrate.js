import { readFile } from 'node:fs/promises';
import { getPool } from '../lib/db.js';

const db = getPool();
try {
  await db.query(await readFile(new URL('../db/001_init.sql', import.meta.url), 'utf8'));
  console.log('Esquema de Cacahuete aplicado.');
} finally {
  await db.end();
}
