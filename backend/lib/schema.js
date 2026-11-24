import { readdir, readFile } from 'node:fs/promises';

const directory = new URL('../db/', import.meta.url);

/** Every `db/*.sql` file, in name order (001_init.sql, 002_auth.sql, ...). */
export async function schemaFiles() {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  return names.map((name) => new URL(name, directory));
}

/**
 * Applies every schema file in order. Each file is idempotent, so running this twice is a no-op.
 * PGlite needs `exec` for multi-statement scripts; node-postgres runs them through `query`.
 */
export async function applySchema(db) {
  for (const file of await schemaFiles()) {
    const sql = await readFile(file, 'utf8');
    if (typeof db.exec === 'function') await db.exec(sql);
    else await db.query(sql);
  }
}
