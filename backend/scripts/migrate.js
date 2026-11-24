import { getPool } from '../lib/db.js';
import { applySchema } from '../lib/schema.js';

const db = getPool();
try {
  await applySchema(db);
  console.log('Esquema de Cacahuete aplicado.');
} finally {
  await db.end();
}
